import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .database import PROJECT_ROOT


REACTION_DATA_PATH = PROJECT_ROOT / "data" / "reactions.json"


class SeedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ReactionReference(SeedModel):
    series: Literal["general", "special"]
    number: int = Field(gt=0, strict=True)

    @property
    def key(self) -> tuple[str, int]:
        return self.series, self.number


class ReactionSeed(ReactionReference):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    summary: str | None = None
    reaction_class: str | None = None
    status: Literal["active", "deprecated"] = "active"
    notes: str | None = None


class AliasSeed(SeedModel):
    alias: str = Field(min_length=1, max_length=255)
    alias_type: Literal["deprecated_index", "alternate_name", "abbreviation"]
    target: ReactionReference
    note: str | None = None


class RelationSeed(SeedModel):
    source: ReactionReference
    target: ReactionReference
    relation_type: Literal["subtype_of", "application_of", "method_for", "related_to"]


class ReactionDataset(SeedModel):
    schema_version: Literal[1]
    reactions: list[ReactionSeed]
    aliases: list[AliasSeed]
    relations: list[RelationSeed]


def load_reaction_dataset(path: Path = REACTION_DATA_PATH) -> ReactionDataset:
    try:
        raw_data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"Reaction seed file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Malformed reaction seed JSON at {path}:{exc.lineno}:{exc.colno}: {exc.msg}"
        ) from exc

    if not isinstance(raw_data, dict):
        raise ValueError("Invalid reaction dataset: the JSON root must be an object")
    schema_version = raw_data.get("schema_version")
    if schema_version != 1:
        raise ValueError(f"Unsupported reaction dataset schema_version: {schema_version!r}")

    try:
        dataset = ReactionDataset.model_validate(raw_data)
    except ValidationError as exc:
        raise ValueError(f"Invalid reaction dataset: {exc}") from exc

    reaction_keys: set[tuple[str, int]] = set()
    for reaction in dataset.reactions:
        if reaction.key in reaction_keys:
            raise ValueError(
                f"Duplicate reaction index in seed data: {reaction.series} {reaction.number}"
            )
        reaction_keys.add(reaction.key)

    for alias in dataset.aliases:
        if alias.target.key not in reaction_keys:
            raise ValueError(
                f"Missing alias target for {alias.alias!r}: "
                f"{alias.target.series} {alias.target.number}"
            )

    for relation in dataset.relations:
        if relation.source.key not in reaction_keys:
            raise ValueError(
                "Missing relation source: "
                f"{relation.source.series} {relation.source.number}"
            )
        if relation.target.key not in reaction_keys:
            raise ValueError(
                "Missing relation target: "
                f"{relation.target.series} {relation.target.number}"
            )
        if relation.source.key == relation.target.key:
            raise ValueError(
                "Self relation is not allowed: "
                f"{relation.source.series} {relation.source.number}"
            )

    return dataset


def seed_database(db: Session, dataset_path: Path = REACTION_DATA_PATH) -> dict[str, int] | None:
    if db.scalar(select(models.Reaction.id).limit(1)) is not None:
        return None

    dataset = load_reaction_dataset(dataset_path)
    reaction_lookup: dict[tuple[str, int], models.Reaction] = {}

    try:
        for item in dataset.reactions:
            reaction = models.Reaction(
                **item.model_dump(exclude={"series", "number"}),
                series=item.series,
                number=item.number,
            )
            reaction_lookup[item.key] = reaction
            db.add(reaction)

        for item in dataset.aliases:
            db.add(models.ReactionAlias(
                reaction=reaction_lookup[item.target.key],
                alias=item.alias,
                alias_type=item.alias_type,
                note=item.note,
            ))

        for item in dataset.relations:
            db.add(models.ReactionRelation(
                source_reaction=reaction_lookup[item.source.key],
                target_reaction=reaction_lookup[item.target.key],
                relation_type=item.relation_type,
            ))

        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "general": sum(item.series == "general" for item in dataset.reactions),
        "special": sum(item.series == "special" for item in dataset.reactions),
        "aliases": len(dataset.aliases),
        "relations": len(dataset.relations),
    }
