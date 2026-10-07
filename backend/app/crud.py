import re

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from . import models, schemas


def normalize_name(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def get_or_create_component(db: Session, data: schemas.ReactionComponentInput) -> models.ChemicalComponent:
    if data.component_id is not None:
        component = db.get(models.ChemicalComponent, data.component_id)
        if not component:
            raise HTTPException(400, f"Component {data.component_id} does not exist")
        return component
    if not data.name or not data.name.strip():
        raise HTTPException(400, "Each component needs component_id or name")
    normalized = normalize_name(data.name)
    component = db.scalar(
        select(models.ChemicalComponent).where(models.ChemicalComponent.normalized_name == normalized)
    )
    if component:
        return component
    component = models.ChemicalComponent(name=data.name.strip(), normalized_name=normalized)
    db.add(component)
    db.flush()
    return component


def reaction_query():
    return select(models.Reaction).options(
        selectinload(models.Reaction.components).selectinload(models.ReactionComponent.component),
        selectinload(models.Reaction.aliases),
        selectinload(models.Reaction.outgoing_relations).selectinload(models.ReactionRelation.source_reaction),
        selectinload(models.Reaction.outgoing_relations).selectinload(models.ReactionRelation.target_reaction),
        selectinload(models.Reaction.incoming_relations).selectinload(models.ReactionRelation.source_reaction),
        selectinload(models.Reaction.incoming_relations).selectinload(models.ReactionRelation.target_reaction),
        selectinload(models.Reaction.image_link).selectinload(models.ReactionImage.asset),
    )


def get_reaction(db: Session, reaction_id: int) -> models.Reaction:
    reaction = db.scalar(reaction_query().where(models.Reaction.id == reaction_id))
    if not reaction:
        raise HTTPException(404, "Reaction not found")
    return reaction


def list_reactions(db: Session, search: str | None = None, reaction_class: str | None = None):
    query = reaction_query().distinct()
    if search and search.strip():
        term = search.strip()
        pattern = f"%{term}%"
        code_match = re.fullmatch(r"rxn\s*(\*)?\s*(\d+)", term, re.IGNORECASE)
        code_condition = models.Reaction.id < 0
        if code_match:
            code_condition = (
                (models.Reaction.series == ("special" if code_match.group(1) else "general"))
                & (models.Reaction.number == int(code_match.group(2)))
            )
        query = (
            query.outerjoin(models.Reaction.aliases)
            .outerjoin(models.Reaction.components)
            .outerjoin(models.ReactionComponent.component)
            .where(or_(
                code_condition,
                models.Reaction.name.ilike(pattern),
                models.Reaction.slug.ilike(pattern),
                models.Reaction.summary.ilike(pattern),
                models.Reaction.reaction_class.ilike(pattern),
                models.Reaction.notes.ilike(pattern),
                models.ReactionAlias.alias.ilike(pattern),
                models.ReactionAlias.note.ilike(pattern),
                models.ChemicalComponent.name.ilike(pattern),
                models.ChemicalComponent.aliases.ilike(pattern),
                models.ReactionComponent.role.ilike(pattern),
                models.ReactionComponent.detail.ilike(pattern),
            ))
        )
    if reaction_class and reaction_class.strip():
        query = query.where(models.Reaction.reaction_class.ilike(f"%{reaction_class.strip()}%"))
    return list(db.scalars(query.order_by(models.Reaction.series, models.Reaction.number)).unique())


def save_components(db: Session, reaction: models.Reaction, items: list[schemas.ReactionComponentInput]):
    reaction.components.clear()
    db.flush()
    for position, item in enumerate(items):
        component = get_or_create_component(db, item)
        reaction.components.append(
            models.ReactionComponent(
                component=component,
                role=item.role,
                display_order=item.display_order if item.display_order else position,
                detail=item.detail,
            )
        )


def create_reaction(db: Session, data: schemas.ReactionCreate) -> models.Reaction:
    if db.scalar(select(models.Reaction).where(
        models.Reaction.series == data.series, models.Reaction.number == data.number
    )):
        raise HTTPException(409, f"Reaction {data.series} {data.number} already exists")
    fields = data.model_dump(exclude={"components", "image_asset_id"})
    reaction = models.Reaction(**fields)
    db.add(reaction)
    db.flush()
    save_components(db, reaction, data.components)
    save_reaction_image(db, reaction, data.image_asset_id)
    db.commit()
    return get_reaction(db, reaction.id)


def update_reaction(db: Session, reaction_id: int, data: schemas.ReactionCreate) -> models.Reaction:
    reaction = get_reaction(db, reaction_id)
    duplicate = db.scalar(
        select(models.Reaction).where(
            models.Reaction.series == data.series,
            models.Reaction.number == data.number,
            models.Reaction.id != reaction_id,
        )
    )
    if duplicate:
        raise HTTPException(409, f"Reaction {data.series} {data.number} already exists")
    for key, value in data.model_dump(exclude={"components", "image_asset_id"}).items():
        setattr(reaction, key, value)
    save_components(db, reaction, data.components)
    save_reaction_image(db, reaction, data.image_asset_id)
    db.commit()
    return get_reaction(db, reaction.id)


def save_reaction_image(db: Session, reaction: models.Reaction, media_asset_id: str | None):
    if not media_asset_id:
        reaction.image_link = None
        return
    asset = db.get(models.MediaAsset, media_asset_id)
    if not asset:
        raise HTTPException(400, "Image asset does not exist")
    used = db.scalar(select(models.ReactionImage).where(
        models.ReactionImage.media_asset_id == media_asset_id,
        models.ReactionImage.reaction_id != reaction.id,
    ))
    if used:
        raise HTTPException(409, "Image asset is already assigned to another reaction")
    if reaction.image_link:
        reaction.image_link.media_asset_id = media_asset_id
        reaction.image_link.asset = asset
    else:
        reaction.image_link = models.ReactionImage(asset=asset)


def collection_query():
    return select(models.Collection).options(
        selectinload(models.Collection.reaction_links)
        .selectinload(models.CollectionReaction.reaction)
        .selectinload(models.Reaction.components)
        .selectinload(models.ReactionComponent.component),
        selectinload(models.Collection.reaction_links)
        .selectinload(models.CollectionReaction.reaction)
        .selectinload(models.Reaction.aliases),
        selectinload(models.Collection.reaction_links)
        .selectinload(models.CollectionReaction.reaction)
        .selectinload(models.Reaction.outgoing_relations)
        .selectinload(models.ReactionRelation.source_reaction),
        selectinload(models.Collection.reaction_links)
        .selectinload(models.CollectionReaction.reaction)
        .selectinload(models.Reaction.outgoing_relations)
        .selectinload(models.ReactionRelation.target_reaction),
        selectinload(models.Collection.reaction_links)
        .selectinload(models.CollectionReaction.reaction)
        .selectinload(models.Reaction.image_link)
        .selectinload(models.ReactionImage.asset),
        selectinload(models.Collection.reaction_links)
        .selectinload(models.CollectionReaction.reaction)
        .selectinload(models.Reaction.incoming_relations)
        .selectinload(models.ReactionRelation.source_reaction),
        selectinload(models.Collection.reaction_links)
        .selectinload(models.CollectionReaction.reaction)
        .selectinload(models.Reaction.incoming_relations)
        .selectinload(models.ReactionRelation.target_reaction),
    )


def get_collection(db: Session, collection_id: int) -> models.Collection:
    collection = db.scalar(collection_query().where(models.Collection.id == collection_id))
    if not collection:
        raise HTTPException(404, "Collection not found")
    return collection
