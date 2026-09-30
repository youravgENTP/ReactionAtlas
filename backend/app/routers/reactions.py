from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db


router = APIRouter(prefix="/api/reactions", tags=["reactions"])


@router.get("", response_model=list[schemas.ReactionRead])
def list_reactions(search: str | None = None, category: str | None = None, db: Session = Depends(get_db)):
    return crud.list_reactions(db, search, category)


@router.get("/{reaction_id}", response_model=schemas.ReactionRead)
def get_reaction(reaction_id: int, db: Session = Depends(get_db)):
    return crud.get_reaction(db, reaction_id)


@router.post("", response_model=schemas.ReactionRead, status_code=201)
def create_reaction(data: schemas.ReactionCreate, db: Session = Depends(get_db)):
    return crud.create_reaction(db, data)


@router.put("/{reaction_id}", response_model=schemas.ReactionRead)
def update_reaction(reaction_id: int, data: schemas.ReactionCreate, db: Session = Depends(get_db)):
    return crud.update_reaction(db, reaction_id, data)


@router.delete("/{reaction_id}", status_code=204)
def delete_reaction(reaction_id: int, db: Session = Depends(get_db)):
    reaction = crud.get_reaction(db, reaction_id)
    db.delete(reaction)
    db.commit()
    return Response(status_code=204)
