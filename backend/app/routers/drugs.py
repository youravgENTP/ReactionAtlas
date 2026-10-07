import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..database import DATA_DIR, PROJECT_ROOT, get_db
from ..image_import import resolve_image_directory, sync_images
from ..import_utils import slugify
from ..numbering import stable_number
from ..references import reaction_for_code, structure_for_code
from ..stable_codes import parse_stable_code


router = APIRouter(prefix="/api/drugs", tags=["drugs"])
DRUG_IMAGE_ROOT = PROJECT_ROOT / "drug-images"
MEDIA_DIR = DATA_DIR / "media"


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
        selectinload(models.Drug.structure_links)
        .selectinload(models.DrugStructure.structure)
        .selectinload(models.Structure.image_links)
        .selectinload(models.StructureImage.asset),
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
        conditions = [
            models.Drug.name.ilike(pattern),
            models.Drug.slug.ilike(pattern),
            models.Drug.description.ilike(pattern),
            models.Drug.aliases_json.ilike(pattern),
        ]
        try:
            parsed = parse_stable_code(search, "drug")
            conditions.append(models.Drug.number == parsed.number)
        except ValueError:
            pass
        query = query.where(or_(*conditions))
    if chapter.strip():
        query = query.where(models.Drug.chapters_json.ilike(f'%"{chapter.strip()}"%'))
    if function.strip():
        query = query.where(models.Drug.functions_json.ilike(f'%"{function.strip()}"%'))
    return list(db.scalars(query.order_by(models.Drug.number)).unique())


@router.get("/{drug_id}", response_model=schemas.DrugRead)
def read_drug(drug_id: int, db: Session = Depends(get_db)):
    return get_drug(db, drug_id)


@router.post("/import", response_model=schemas.DrugImportResult)
def import_drugs(payload: list[schemas.DrugImportItem] | schemas.DrugImportPayload, db: Session = Depends(get_db)):
    items = payload if isinstance(payload, list) else payload.drugs
    if not items:
        raise HTTPException(400, "JSON must contain at least one drug")
    DRUG_IMAGE_ROOT.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    created = updated = images_uploaded = reactions_linked = structures_linked = 0
    warnings: list[str] = []
    new_files: list[Path] = []
    obsolete_files: list[Path] = []
    seen_slugs: set[str] = set()
    try:
        for item in items:
            slug = slugify(item.slug or item.name)
            if not slug:
                raise HTTPException(400, f"Could not create a slug for {item.name!r}")
            if slug in seen_slugs:
                raise HTTPException(400, f"Duplicate drug slug in JSON: {slug}")
            seen_slugs.add(slug)
            drug = db.scalar(select(models.Drug).where(models.Drug.slug == slug))
            if drug:
                updated += 1
                stable_number(db, models.Drug, "drug_number_high_water", "Drug", item.number, drug)
            else:
                created += 1
                number = stable_number(
                    db, models.Drug, "drug_number_high_water", "Drug", item.number
                )
                drug = models.Drug(
                    number=number, name=item.name.strip(), slug=slug, image_directory=""
                )
                db.add(drug)
                db.flush()
            image_directory = resolve_image_directory(DRUG_IMAGE_ROOT, item.image_directory, slug)
            drug.name = item.name.strip()
            drug.description = item.description
            drug.chapters_json = json.dumps(item.chapters, ensure_ascii=False)
            drug.functions_json = json.dumps(item.functions, ensure_ascii=False)
            drug.aliases_json = json.dumps(item.aliases, ensure_ascii=False)
            drug.image_directory = image_directory.relative_to(PROJECT_ROOT).as_posix()
            images_uploaded += sync_images(
                db, drug.name, drug.image_links, models.DrugImage,
                image_directory, MEDIA_DIR, new_files, obsolete_files, warnings
            )
            reactions = [
                reaction for code in item.reaction_codes
                if (reaction := reaction_for_code(db, code, drug.name, warnings)) is not None
            ]
            drug.reaction_links.clear()
            db.flush()
            for position, reaction in enumerate(reactions):
                drug.reaction_links.append(models.DrugReaction(reaction=reaction, display_order=position))
            reactions_linked += len(reactions)
            if "structure_codes" in item.model_fields_set:
                linked_structures = [
                    structure for code in item.structure_codes
                    if (structure := structure_for_code(db, code, drug.name, warnings)) is not None
                ]
                drug.structure_links.clear()
                db.flush()
                for position, structure in enumerate(linked_structures):
                    drug.structure_links.append(models.DrugStructure(
                        structure=structure, display_order=position
                    ))
                structures_linked += len(linked_structures)
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
        "structures_linked": structures_linked,
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
