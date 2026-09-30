from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db


router = APIRouter(prefix="/api/components", tags=["components"])


@router.get("", response_model=list[schemas.ComponentRead])
def list_components(search: str | None = None, db: Session = Depends(get_db)):
    query = select(models.ChemicalComponent)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(models.ChemicalComponent.name.ilike(pattern), models.ChemicalComponent.aliases.ilike(pattern)))
    return list(db.scalars(query.order_by(models.ChemicalComponent.name).limit(100)))


@router.post("", response_model=schemas.ComponentRead, status_code=201)
def create_component(data: schemas.ComponentCreate, db: Session = Depends(get_db)):
    normalized = crud.normalize_name(data.name)
    existing = db.scalar(select(models.ChemicalComponent).where(models.ChemicalComponent.normalized_name == normalized))
    if existing:
        raise HTTPException(409, f"Component already exists as '{existing.name}'")
    component = models.ChemicalComponent(normalized_name=normalized, **data.model_dump())
    db.add(component)
    db.commit()
    db.refresh(component)
    return component
