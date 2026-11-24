import json
import re
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db


router = APIRouter(prefix="/api/annotations", tags=["annotations"])


def _document(db: Session, source_type: str, entity_id: int, field: str):
    if source_type == "drug":
        record = db.get(models.Drug, entity_id)
        if not record:
            raise HTTPException(404, "Drug not found")
        if field != "description":
            raise HTTPException(400, "Drug annotations must target description")
        return record, record.display_code, record.name, record.description_document
    if source_type == "reaction":
        record = db.get(models.Reaction, entity_id)
        if not record:
            raise HTTPException(404, "Reaction not found")
        if field not in {"summary", "notes"}:
            raise HTTPException(400, "Reaction annotations must target summary or notes")
        return record, record.display_code, record.name, record.rich_text.get(f"{field}_document")
    record = db.get(models.Collection, entity_id)
    if not record:
        raise HTTPException(404, "Collection not found")
    if field != "document":
        raise HTTPException(400, "Collection annotations must target document")
    return record, str(record.id), record.title, record.markdown_content


def _find_item(source: str | None, item_id: str):
    try:
        blocks = json.loads(source or "").get("blocks", [])
    except (TypeError, ValueError, AttributeError):
        return None, None
    def visit(items):
        for item in items:
            if item.get("id") == item_id:
                return item
            found = visit(item.get("children") or [])
            if found:
                return found
        return None
    for block in blocks:
        if block.get("type") == "hierarchy" and (item := visit(block.get("items") or [])):
            return block.get("id"), item
    return None, None


def _source_state(db: Session, annotation: models.Annotation):
    try:
        _, code, name, source = _document(db, annotation.source_type, annotation.source_entity_id, annotation.document_field)
        _, item = _find_item(source, annotation.item_id)
        exists, text_value = item is not None, item.get("text") if item else None
    except HTTPException:
        code, name, exists, text_value = annotation.source_code, annotation.source_name, False, None
    root = f"/drugs/{quote(code)}" if annotation.source_type == "drug" else f"/reactions/{quote(code)}" if annotation.source_type == "reaction" else f"/collections/{annotation.source_entity_id}"
    field = annotation.document_field if annotation.source_type != "collection" else None
    href = f"{root}?{'field=' + quote(field) + '&' if field else ''}item={quote(annotation.item_id)}"
    return exists, href, text_value, code, name


def _read(db: Session, annotation: models.Annotation):
    exists, href, text_value, code, name = _source_state(db, annotation)
    data = {column.name: getattr(annotation, column.name) for column in models.Annotation.__table__.columns}
    return {**data, "source_exists": exists, "source_href": href, "source_item_text": text_value, "source_code": code, "source_name": name}


@router.get("", response_model=list[schemas.AnnotationRead])
def list_annotations(kind: str = "", status: str = "", source_type: str = "", source_entity_id: int | None = None, search: str = "", db: Session = Depends(get_db)):
    query = select(models.Annotation)
    if kind:
        query = query.where(models.Annotation.kind == kind)
    if status:
        query = query.where(models.Annotation.status == status)
    if source_type:
        query = query.where(models.Annotation.source_type == source_type)
    if source_entity_id is not None:
        query = query.where(models.Annotation.source_entity_id == source_entity_id)
    records = list(db.scalars(query.order_by(models.Annotation.updated_at.desc())))
    values = [_read(db, record) for record in records]
    term = search.strip().casefold()
    return [value for value in values if not term or term in " ".join(str(value.get(key) or "") for key in ("stable_code", "question_text", "source_code", "source_name", "source_item_text")).casefold()]


@router.post("", response_model=schemas.AnnotationRead, status_code=201)
def create_annotation(data: schemas.AnnotationCreate, db: Session = Depends(get_db)):
    _, code, name, source = _document(db, data.source_type, data.source_entity_id, data.document_field)
    block_id, item = _find_item(source, data.item_id)
    if not item:
        raise HTTPException(409, "Save the hierarchy item before annotating it")
    if data.block_id and data.block_id != block_id:
        raise HTTPException(400, "Hierarchy block does not match item")
    if data.kind == "drxn" and (data.source_type != "drug" or data.document_field != "description"):
        raise HTTPException(400, "DRxn annotations are only available in Drug descriptions")
    stable_code = None
    status = None
    question_text = None
    if data.kind == "drxn":
        existing = list(db.scalars(select(models.Annotation.stable_code).where(models.Annotation.kind == "drxn", models.Annotation.source_type == "drug", models.Annotation.source_entity_id == data.source_entity_id)))
        numbers = [int(match.group(1)) for value in existing if value and (match := re.search(r"-DRxn(\d+)$", value))]
        stable_code = f"{code}-DRxn{max(numbers, default=0) + 1}"
    else:
        status = "open"
        question_text = (data.question_text or item.get("text") or "Untitled question").strip()
    annotation = models.Annotation(kind=data.kind, source_type=data.source_type, source_entity_id=data.source_entity_id, source_code=code, source_name=name, document_field=data.document_field, block_id=block_id, item_id=data.item_id, stable_code=stable_code, question_text=question_text, status=status)
    db.add(annotation)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This hierarchy item already has that annotation")
    db.refresh(annotation)
    return _read(db, annotation)


@router.patch("/{annotation_id}", response_model=schemas.AnnotationRead)
def update_annotation(annotation_id: int, data: schemas.AnnotationUpdate, db: Session = Depends(get_db)):
    annotation = db.get(models.Annotation, annotation_id)
    if not annotation:
        raise HTTPException(404, "Annotation not found")
    if annotation.kind != "question":
        raise HTTPException(400, "Only Questions can be updated")
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(annotation, key, value)
    if "status" in changes:
        annotation.resolved_at = datetime.now() if data.status == "resolved" else None
    db.commit(); db.refresh(annotation)
    return _read(db, annotation)


@router.delete("/{annotation_id}", status_code=204)
def delete_annotation(annotation_id: int, db: Session = Depends(get_db)):
    annotation = db.get(models.Annotation, annotation_id)
    if not annotation:
        raise HTTPException(404, "Annotation not found")
    db.delete(annotation); db.commit()
    return Response(status_code=204)
