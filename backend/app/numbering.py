import json

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models


def stable_number(
    db: Session,
    model,
    counter_key: str,
    label: str,
    explicit: int | None,
    existing=None,
) -> int:
    used_key = counter_key.replace("_number_high_water", "_used_numbers")
    used = _used_numbers(db, used_key)
    used.update(db.scalars(select(model.number)).all())
    if existing is not None:
        if explicit is None or explicit == existing.number:
            _raise_counter(db, counter_key, existing.number)
            _save_used_numbers(db, used_key, used | {existing.number})
            return existing.number
        collision = db.scalar(select(model).where(model.number == explicit))
        if collision:
            raise HTTPException(409, f"{label}{explicit} is already used by {collision.slug}")
        raise HTTPException(
            409,
            f"{existing.slug} is already {label}{existing.number}; stable numbers cannot be changed",
        )

    maximum = db.scalar(select(func.coalesce(func.max(model.number), 0))) or 0
    setting = db.get(models.AppSetting, counter_key)
    recorded = int(setting.value) if setting and setting.value.isdigit() else 0
    high_water = max(maximum, recorded)
    if explicit is not None:
        collision = db.scalar(select(model).where(model.number == explicit))
        if collision:
            raise HTTPException(409, f"{label}{explicit} is already used by {collision.slug}")
        if explicit in used:
            raise HTTPException(409, f"{label}{explicit} was previously allocated and cannot be reused")
        number = explicit
    else:
        number = high_water + 1
    _raise_counter(db, counter_key, max(high_water, number))
    _save_used_numbers(db, used_key, used | {number})
    return number


def _raise_counter(db: Session, key: str, value: int) -> None:
    setting = db.get(models.AppSetting, key)
    current = int(setting.value) if setting and setting.value.isdigit() else 0
    if value <= current:
        return
    if setting:
        setting.value = str(value)
    else:
        db.add(models.AppSetting(key=key, value=str(value)))


def _used_numbers(db: Session, key: str) -> set[int]:
    setting = db.get(models.AppSetting, key)
    if not setting:
        return set()
    try:
        values = json.loads(setting.value)
        return {int(value) for value in values if int(value) > 0} if isinstance(values, list) else set()
    except (TypeError, ValueError):
        return set()


def _save_used_numbers(db: Session, key: str, values: set[int]) -> None:
    encoded = json.dumps(sorted(values))
    setting = db.get(models.AppSetting, key)
    if setting:
        setting.value = encoded
    else:
        db.add(models.AppSetting(key=key, value=encoded))
