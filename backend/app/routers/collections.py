from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db


router = APIRouter(prefix="/api/collections", tags=["collections"])


@router.get("", response_model=list[schemas.CollectionRead])
def list_collections(db: Session = Depends(get_db)):
    return list(db.scalars(crud.collection_query().order_by(models.Collection.updated_at.desc())).unique())


@router.get("/{collection_id}", response_model=schemas.CollectionRead)
def get_collection(collection_id: int, db: Session = Depends(get_db)):
    return crud.get_collection(db, collection_id)


@router.post("", response_model=schemas.CollectionRead, status_code=201)
def create_collection(data: schemas.CollectionCreate, db: Session = Depends(get_db)):
    collection = models.Collection(**data.model_dump())
    db.add(collection)
    db.commit()
    return crud.get_collection(db, collection.id)


@router.put("/{collection_id}", response_model=schemas.CollectionRead)
def update_collection(collection_id: int, data: schemas.CollectionUpdate, db: Session = Depends(get_db)):
    collection = crud.get_collection(db, collection_id)
    for key, value in data.model_dump().items():
        setattr(collection, key, value)
    db.commit()
    return crud.get_collection(db, collection_id)


@router.delete("/{collection_id}", status_code=204)
def delete_collection(collection_id: int, db: Session = Depends(get_db)):
    collection = crud.get_collection(db, collection_id)
    db.delete(collection)
    db.commit()
    return Response(status_code=204)


@router.post("/{collection_id}/reactions", response_model=schemas.CollectionRead)
def add_reaction(collection_id: int, data: schemas.CollectionReactionAdd, db: Session = Depends(get_db)):
    crud.get_collection(db, collection_id)
    crud.get_reaction(db, data.reaction_id)
    exists = db.scalar(select(models.CollectionReaction).where(
        models.CollectionReaction.collection_id == collection_id,
        models.CollectionReaction.reaction_id == data.reaction_id,
    ))
    if exists:
        raise HTTPException(409, "Reaction is already in this collection")
    next_order = db.scalar(select(func.coalesce(func.max(models.CollectionReaction.display_order), -1) + 1).where(
        models.CollectionReaction.collection_id == collection_id
    ))
    db.add(models.CollectionReaction(collection_id=collection_id, reaction_id=data.reaction_id,
                                     display_order=next_order, note=data.note))
    db.commit()
    return crud.get_collection(db, collection_id)


@router.delete("/{collection_id}/reactions/{reaction_id}", response_model=schemas.CollectionRead)
def remove_reaction(collection_id: int, reaction_id: int, db: Session = Depends(get_db)):
    link = db.scalar(select(models.CollectionReaction).where(
        models.CollectionReaction.collection_id == collection_id,
        models.CollectionReaction.reaction_id == reaction_id,
    ))
    if not link:
        raise HTTPException(404, "Reaction is not in this collection")
    db.delete(link)
    db.commit()
    return crud.get_collection(db, collection_id)


@router.put("/{collection_id}/reorder", response_model=schemas.CollectionRead)
def reorder_reactions(collection_id: int, data: schemas.ReorderRequest, db: Session = Depends(get_db)):
    collection = crud.get_collection(db, collection_id)
    current_ids = {link.reaction_id for link in collection.reaction_links}
    if set(data.reaction_ids) != current_ids or len(data.reaction_ids) != len(current_ids):
        raise HTTPException(400, "reaction_ids must contain every collection reaction exactly once")
    links = {link.reaction_id: link for link in collection.reaction_links}
    for position, reaction_id in enumerate(data.reaction_ids):
        links[reaction_id].display_order = position
    db.commit()
    return crud.get_collection(db, collection_id)
