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
from ..references import drug_for_code, reaction_for_code
from ..stable_codes import parse_stable_code


router = APIRouter(prefix="/api/structures", tags=["structures"])
STRUCTURE_IMAGE_ROOT = PROJECT_ROOT / "structure-images"
MEDIA_DIR = DATA_DIR / "media"


def structure_query():
    reaction_loader = selectinload(models.Structure.reaction_links).selectinload(
        models.StructureReaction.reaction
    )
    return select(models.Structure).options(
        selectinload(models.Structure.image_links).selectinload(models.StructureImage.asset),
        reaction_loader.selectinload(models.Reaction.components).selectinload(models.ReactionComponent.component),
        reaction_loader.selectinload(models.Reaction.aliases),
        reaction_loader.selectinload(models.Reaction.image_link).selectinload(models.ReactionImage.asset),
        reaction_loader.selectinload(models.Reaction.rich_text_record),
        reaction_loader.selectinload(models.Reaction.outgoing_relations).selectinload(models.ReactionRelation.source_reaction),
        reaction_loader.selectinload(models.Reaction.outgoing_relations).selectinload(models.ReactionRelation.target_reaction),
        reaction_loader.selectinload(models.Reaction.incoming_relations).selectinload(models.ReactionRelation.source_reaction),
        reaction_loader.selectinload(models.Reaction.incoming_relations).selectinload(models.ReactionRelation.target_reaction),
        selectinload(models.Structure.drug_links)
        .selectinload(models.DrugStructure.drug)
        .selectinload(models.Drug.image_links)
        .selectinload(models.DrugImage.asset),
    )


def get_structure(db: Session, structure_id: int) -> models.Structure:
    structure = db.scalar(structure_query().where(models.Structure.id == structure_id))
    if not structure:
        raise HTTPException(404, "Structure not found")
    return structure


@router.get("", response_model=list[schemas.StructureRead])
def list_structures(search: str = "", category: str = "", db: Session = Depends(get_db)):
    query = structure_query()
    if search.strip():
        pattern = f"%{search.strip()}%"
        conditions = [
            models.Structure.name.ilike(pattern),
            models.Structure.slug.ilike(pattern),
            models.Structure.description.ilike(pattern),
            models.Structure.aliases_json.ilike(pattern),
            models.Structure.categories_json.ilike(pattern),
        ]
        try:
            parsed = parse_stable_code(search, "structure")
            conditions.append(models.Structure.number == parsed.number)
        except ValueError:
            pass
        query = query.where(or_(*conditions))
    if category.strip():
        query = query.where(models.Structure.categories_json.ilike(f'%"{category.strip()}"%'))
    return list(db.scalars(query.order_by(models.Structure.number)).unique())


@router.get("/{structure_id}", response_model=schemas.StructureRead)
def read_structure(structure_id: int, db: Session = Depends(get_db)):
    return get_structure(db, structure_id)


@router.post("/import", response_model=schemas.StructureImportResult)
def import_structures(payload: list[schemas.StructureImportItem] | schemas.StructureImportPayload, db: Session = Depends(get_db)):
    items = payload if isinstance(payload, list) else payload.structures
    if not items:
        raise HTTPException(400, "JSON must contain at least one structure")
    STRUCTURE_IMAGE_ROOT.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    created = updated = images_uploaded = reactions_linked = drugs_linked = 0
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
                raise HTTPException(400, f"Duplicate structure slug in JSON: {slug}")
            seen_slugs.add(slug)
            structure = db.scalar(select(models.Structure).where(models.Structure.slug == slug))
            if structure:
                updated += 1
                stable_number(
                    db, models.Structure, "structure_number_high_water", "Str",
                    item.number, structure,
                )
            else:
                created += 1
                number = stable_number(
                    db, models.Structure, "structure_number_high_water", "Str", item.number
                )
                structure = models.Structure(
                    number=number, name=item.name.strip(), slug=slug, image_directory=""
                )
                db.add(structure)
                db.flush()
            image_directory = resolve_image_directory(
                STRUCTURE_IMAGE_ROOT, item.image_directory, slug
            )
            structure.name = item.name.strip()
            structure.description = item.description
            structure.categories_json = json.dumps(item.categories, ensure_ascii=False)
            structure.aliases_json = json.dumps(item.aliases, ensure_ascii=False)
            structure.image_directory = image_directory.relative_to(PROJECT_ROOT).as_posix()
            images_uploaded += sync_images(
                db, structure.name, structure.image_links, models.StructureImage,
                image_directory, MEDIA_DIR, new_files, obsolete_files, warnings,
            )
            reactions = [
                reaction for code in item.reaction_codes
                if (reaction := reaction_for_code(
                    db, code, structure.name, warnings
                )) is not None
            ]
            structure.reaction_links.clear()
            db.flush()
            for position, reaction in enumerate(reactions):
                structure.reaction_links.append(models.StructureReaction(
                    reaction=reaction, display_order=position
                ))
            reactions_linked += len(reactions)
            if "drug_codes" in item.model_fields_set:
                linked_drugs = [
                    drug for code in item.drug_codes
                    if (drug := drug_for_code(db, code, structure.name, warnings)) is not None
                ]
                structure.drug_links.clear()
                db.flush()
                for position, drug in enumerate(linked_drugs):
                    structure.drug_links.append(models.DrugStructure(
                        drug=drug, display_order=position
                    ))
                drugs_linked += len(linked_drugs)
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
        "drugs_linked": drugs_linked,
        "warnings": warnings,
    }


@router.delete("/{structure_id}", status_code=204)
def delete_structure(structure_id: int, db: Session = Depends(get_db)):
    structure = get_structure(db, structure_id)
    assets = [(link.asset, MEDIA_DIR / link.asset.stored_filename) for link in structure.image_links]
    db.delete(structure)
    db.flush()
    for asset, _ in assets:
        db.delete(asset)
    db.commit()
    for _, path in assets:
        path.unlink(missing_ok=True)
    return Response(status_code=204)
