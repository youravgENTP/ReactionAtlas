from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .stable_codes import parse_stable_code


def reaction_for_code(db: Session, code: str, context: str, warnings: list[str]):
    try:
        parsed = parse_stable_code(code, "reaction")
    except ValueError as error:
        warnings.append(f"{context}: {error}")
        return None
    reaction = db.scalar(select(models.Reaction).where(
        models.Reaction.series == ("special" if parsed.special else "general"),
        models.Reaction.number == parsed.number,
    ))
    if not reaction:
        warnings.append(f"{context}: reaction {code!r} does not exist")
    return reaction


def drug_for_code(db: Session, code: str, context: str, warnings: list[str]):
    try:
        parsed = parse_stable_code(code, "drug")
    except ValueError as error:
        warnings.append(f"{context}: {error}")
        return None
    drug = db.scalar(select(models.Drug).where(models.Drug.number == parsed.number))
    if not drug:
        warnings.append(f"{context}: drug {code!r} does not exist")
    return drug


def structure_for_code(db: Session, code: str, context: str, warnings: list[str]):
    try:
        parsed = parse_stable_code(code, "structure")
    except ValueError as error:
        warnings.append(f"{context}: {error}")
        return None
    structure = db.scalar(select(models.Structure).where(models.Structure.number == parsed.number))
    if not structure:
        warnings.append(f"{context}: structure {code!r} does not exist")
    return structure
