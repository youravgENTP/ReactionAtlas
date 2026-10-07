import hashlib
import json
import re
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..database import DATA_DIR, PROJECT_ROOT, get_db


router = APIRouter(prefix="/api/drugs", tags=["drugs"])
DRUG_IMAGE_ROOT = PROJECT_ROOT / "drug-images"
MEDIA_DIR = DATA_DIR / "media"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def drug_query():
    reaction_loader = selectinload(models.Drug.reaction_links).selectinload(models.DrugReaction.reaction)
    return select(models.Drug).options(
        selectinload(models.Drug.image_links).selectinload(models.DrugImage.asset),
        reaction_loader.selectinload(models.Reaction.components).selectinload(models.ReactionComponent.component),
        reaction_loader.selectinload(models.Reaction.aliases),
        reaction_loader.selectinload(models.Reaction.image_link).selectinload(models.ReactionImage.asset),
        reaction_loader.selectinload(models.Reaction.rich_text_record),
        reaction_loader.selectinload(models.Reaction.outgoing_relations).selectinload(models.ReactionRelation.source_reaction),
        reaction_loader.selectinload(models.Reaction.outgoing_relations).selectinload(models.ReactionRelation.target_reaction),
        reaction_loader.selectinload(models.Reaction.incoming_relations).selectinload(models.ReactionRelation.source_reaction),
        reaction_loader.selectinload(models.Reaction.incoming_relations).selectinload(models.ReactionRelation.target_reaction),
    )


def get_drug(db: Session, drug_id: int) -> models.Drug:
    drug = db.scalar(drug_query().where(models.Drug.id == drug_id))
    if not drug:
        raise HTTPException(404, "Drug not found")
    return drug


@router.get("", response_model=list[schemas.DrugRead])
def list_drugs(search: str = "", chapter: str = "", function: str = "", db: Session = Depends(get_db)):
    query = drug_query()
    if search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(
            models.Drug.name.ilike(pattern),
            models.Drug.slug.ilike(pattern),
            models.Drug.description.ilike(pattern),
            models.Drug.aliases_json.ilike(pattern),
        ))
    if chapter.strip():
        query = query.where(models.Drug.chapters_json.ilike(f'%"{chapter.strip()}"%'))
    if function.strip():
        query = query.where(models.Drug.functions_json.ilike(f'%"{function.strip()}"%'))
    return list(db.scalars(query.order_by(models.Drug.name)).unique())


@router.get("/{drug_id}", response_model=schemas.DrugRead)
def read_drug(drug_id: int, db: Session = Depends(get_db)):
    return get_drug(db, drug_id)


@router.post("/import", response_model=schemas.DrugImportResult)
def import_drugs(items: list[schemas.DrugImportItem], db: Session = Depends(get_db)):
    if not items:
        raise HTTPException(400, "JSON must contain at least one drug")
    DRUG_IMAGE_ROOT.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    created = updated = images_uploaded = reactions_linked = 0
    warnings: list[str] = []
    new_files: list[Path] = []
    obsolete_files: list[Path] = []
    seen_slugs: set[str] = set()
    try:
        for item in items:
            slug = _slugify(item.slug or item.name)
            if not slug:
                raise HTTPException(400, f"Could not create a slug for {item.name!r}")
            if slug in seen_slugs:
                raise HTTPException(400, f"Duplicate drug slug in JSON: {slug}")
            seen_slugs.add(slug)
            drug = db.scalar(select(models.Drug).where(models.Drug.slug == slug))
            if drug:
                updated += 1
            else:
                created += 1
                drug = models.Drug(name=item.name.strip(), slug=slug, image_directory="")
                db.add(drug)
                db.flush()
            image_directory = _resolve_image_directory(item.image_directory, slug)
            drug.name = item.name.strip()
            drug.description = item.description
            drug.chapters_json = json.dumps(item.chapters, ensure_ascii=False)
            drug.functions_json = json.dumps(item.functions, ensure_ascii=False)
            drug.aliases_json = json.dumps(item.aliases, ensure_ascii=False)
            drug.image_directory = image_directory.relative_to(PROJECT_ROOT).as_posix()
            images_uploaded += _sync_images(
                db, drug, image_directory, new_files, obsolete_files, warnings
            )
            reactions = [_reaction_for_code(db, code, drug.name) for code in item.reaction_codes]
            drug.reaction_links.clear()
            db.flush()
            for position, reaction in enumerate(reactions):
                drug.reaction_links.append(models.DrugReaction(reaction=reaction, display_order=position))
            reactions_linked += len(reactions)
        db.commit()
    except Exception:
        db.rollback()
        for path in new_files:
            path.unlink(missing_ok=True)
        raise
    for path in obsolete_files:
        path.unlink(missing_ok=True)
    return {
        "created": created,
        "updated": updated,
        "images_uploaded": images_uploaded,
        "reactions_linked": reactions_linked,
        "warnings": warnings,
    }


@router.delete("/{drug_id}", status_code=204)
def delete_drug(drug_id: int, db: Session = Depends(get_db)):
    drug = get_drug(db, drug_id)
    assets = [(link.asset, MEDIA_DIR / link.asset.stored_filename) for link in drug.image_links]
    db.delete(drug)
    db.flush()
    for asset, _ in assets:
        db.delete(asset)
    db.commit()
    for _, path in assets:
        path.unlink(missing_ok=True)
    return Response(status_code=204)


def _slugify(value: str) -> str:
    normalized = re.sub(r"\s+", "-", value.strip().casefold())
    return re.sub(r"[^\w-]+", "-", normalized, flags=re.UNICODE).strip("-")[:255]


def _resolve_image_directory(value: str | None, slug: str) -> Path:
    relative = Path(value or slug)
    if relative.is_absolute():
        raise HTTPException(400, "image_directory must be relative to the project root")
    if relative.parts and relative.parts[0] == DRUG_IMAGE_ROOT.name:
        relative = Path(*relative.parts[1:])
    directory = (DRUG_IMAGE_ROOT / relative).resolve()
    if not directory.is_relative_to(DRUG_IMAGE_ROOT.resolve()) or directory == DRUG_IMAGE_ROOT.resolve():
        raise HTTPException(400, "image_directory must be inside drug-images/")
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _reaction_for_code(db: Session, code: str, drug_name: str) -> models.Reaction:
    match = re.fullmatch(r"rxn\s*(\*)?\s*(\d+)", code.strip(), re.IGNORECASE)
    if not match:
        raise HTTPException(400, f"Invalid reaction code {code!r} for {drug_name}")
    reaction = db.scalar(select(models.Reaction).where(
        models.Reaction.series == ("special" if match.group(1) else "general"),
        models.Reaction.number == int(match.group(2)),
    ))
    if not reaction:
        raise HTTPException(400, f"Reaction {code!r} for {drug_name} does not exist")
    return reaction


def _sync_images(
    db: Session,
    drug: models.Drug,
    directory: Path,
    new_files: list[Path],
    obsolete_files: list[Path],
    warnings: list[str],
) -> int:
    candidates = [path for path in sorted(directory.rglob("*")) if path.is_file() and path.suffix.lower() in IMAGE_TYPES]
    usable: list[Path] = []
    for path in candidates:
        if path.stat().st_size > MAX_IMAGE_BYTES:
            warnings.append(f"{drug.name}: skipped {path.name} because it is larger than 8 MB")
        elif path.stat().st_size == 0:
            warnings.append(f"{drug.name}: skipped empty image {path.name}")
        else:
            usable.append(path)
    if not usable:
        warnings.append(f"{drug.name}: no images found in {directory.relative_to(PROJECT_ROOT)}")
    existing = {link.source_path: link for link in drug.image_links}
    desired_paths = {path.relative_to(PROJECT_ROOT).as_posix() for path in usable}
    for source_path, link in list(existing.items()):
        if source_path in desired_paths:
            continue
        obsolete_files.append(MEDIA_DIR / link.asset.stored_filename)
        asset = link.asset
        db.delete(link)
        db.flush()
        db.delete(asset)
    uploaded = 0
    for position, source in enumerate(usable):
        source_path = source.relative_to(PROJECT_ROOT).as_posix()
        link = existing.get(source_path)
        if link and _same_content(source, MEDIA_DIR / link.asset.stored_filename):
            link.display_order = position
            continue
        asset, stored_path = _copy_image(source)
        new_files.append(stored_path)
        db.add(asset)
        if link:
            old_asset = link.asset
            obsolete_files.append(MEDIA_DIR / old_asset.stored_filename)
            link.asset = asset
            link.media_asset_id = asset.id
            link.display_order = position
            db.flush()
            db.delete(old_asset)
        else:
            drug.image_links.append(models.DrugImage(
                asset=asset, source_path=source_path, display_order=position
            ))
        uploaded += 1
    return uploaded


def _copy_image(source: Path) -> tuple[models.MediaAsset, Path]:
    asset_id = str(uuid4())
    extension = source.suffix.lower()
    stored_path = MEDIA_DIR / f"{asset_id}{extension if extension != '.jpeg' else '.jpg'}"
    shutil.copyfile(source, stored_path)
    return models.MediaAsset(
        id=asset_id,
        original_filename=source.name[:255],
        stored_filename=stored_path.name,
        mime_type=IMAGE_TYPES[extension],
        size_bytes=source.stat().st_size,
        width=None,
        height=None,
    ), stored_path


def _same_content(left: Path, right: Path) -> bool:
    if not right.is_file() or left.stat().st_size != right.stat().st_size:
        return False
    return _sha256(left) == _sha256(right)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
