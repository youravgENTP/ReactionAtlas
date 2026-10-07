import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db


router = APIRouter(prefix="/api/settings", tags=["settings"])
LATEX_KEY = "latex-shortcuts"
DEFAULT_SHORTCUTS = [
    ("rightarrow", "→"), ("leftarrow", "←"), ("leftrightarrow", "↔"),
    ("Rightarrow", "⇒"), ("Leftrightarrow", "⇔"), ("alpha", "α"),
    ("beta", "β"), ("gamma", "γ"), ("delta", "δ"), ("theta", "θ"),
    ("lambda", "λ"), ("mu", "μ"), ("pi", "π"), ("sigma", "σ"),
    ("phi", "φ"), ("omega", "ω"), ("infty", "∞"), ("approx", "≈"),
    ("neq", "≠"), ("leq", "≤"), ("geq", "≥"), ("times", "×"),
    ("pm", "±"), ("cdot", "·"), ("degree", "°"), ("equiv", "≡"),
]


def read_shortcuts(db: Session) -> list[schemas.LatexShortcut]:
    row = db.get(models.AppSetting, LATEX_KEY)
    if not row:
        return [schemas.LatexShortcut(id=f"builtin-{command}", command=command, replacement=replacement)
                for command, replacement in DEFAULT_SHORTCUTS]
    try:
        return [schemas.LatexShortcut.model_validate(item) for item in json.loads(row.value)]
    except (ValueError, TypeError):
        raise HTTPException(500, "Saved LaTeX shortcut settings are invalid")


def write_shortcuts(db: Session, items: list[schemas.LatexShortcut]):
    commands = [item.command.lstrip("\\₩") for item in items]
    if any(not command for command in commands):
        raise HTTPException(400, "LaTeX shortcut commands cannot be empty")
    if len(commands) != len(set(commands)):
        raise HTTPException(409, "LaTeX shortcut commands must be unique")
    cleaned = [item.model_copy(update={"command": command}) for item, command in zip(items, commands)]
    value = json.dumps([item.model_dump() for item in cleaned], ensure_ascii=False)
    row = db.get(models.AppSetting, LATEX_KEY)
    if row:
        row.value = value
    else:
        db.add(models.AppSetting(key=LATEX_KEY, value=value))
    db.commit()
    return cleaned


@router.get("/latex-shortcuts", response_model=list[schemas.LatexShortcut])
def get_latex_shortcuts(db: Session = Depends(get_db)):
    return read_shortcuts(db)


@router.put("/latex-shortcuts", response_model=list[schemas.LatexShortcut])
def update_latex_shortcuts(items: list[schemas.LatexShortcut], db: Session = Depends(get_db)):
    return write_shortcuts(db, items)


@router.post("/latex-shortcuts", response_model=schemas.LatexShortcut, status_code=201)
def create_latex_shortcut(item: schemas.LatexShortcut, db: Session = Depends(get_db)):
    items = read_shortcuts(db)
    created = item.model_copy(update={"id": item.id or str(uuid4())})
    write_shortcuts(db, [*items, created])
    return created
