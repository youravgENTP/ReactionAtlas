from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Role = Literal["reactant", "product", "reagent", "catalyst", "solvent", "condition", "other"]
ReactionSeries = Literal["general", "special"]
ReactionStatus = Literal["active", "deprecated"]
AliasType = Literal["deprecated_index", "alternate_name", "abbreviation"]
RelationType = Literal["subtype_of", "application_of", "method_for", "related_to"]


class ComponentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    aliases: str | None = None
    notes: str | None = None


class ComponentRead(ComponentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    normalized_name: str


class ReactionComponentInput(BaseModel):
    component_id: int | None = None
    name: str | None = None
    role: Role
    display_order: int = 0
    detail: str | None = None


class ReactionComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: Role
    display_order: int
    detail: str | None
    component: ComponentRead


class ReactionBase(BaseModel):
    series: ReactionSeries
    number: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    summary: str | None = None
    reaction_class: str | None = None
    status: ReactionStatus = "active"
    notes: str | None = None

    @field_validator("slug", mode="before")
    @classmethod
    def empty_slug_is_none(cls, value):
        return value or None


class ReactionCreate(ReactionBase):
    components: list[ReactionComponentInput] = Field(default_factory=list)


class ReactionAliasRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    alias: str
    alias_type: AliasType
    note: str | None


class ReactionRelationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source_reaction_id: int
    source_display_code: str
    source_name: str
    target_reaction_id: int
    target_display_code: str
    target_name: str
    relation_type: RelationType


class ReactionRead(ReactionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_code: str
    created_at: datetime
    updated_at: datetime
    components: list[ReactionComponentRead]
    aliases: list[ReactionAliasRead]
    outgoing_relations: list[ReactionRelationRead]
    incoming_relations: list[ReactionRelationRead]


class CollectionBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    markdown_content: str = ""


class CollectionCreate(CollectionBase):
    pass


class CollectionUpdate(CollectionBase):
    pass


class CollectionReactionAdd(BaseModel):
    reaction_id: int
    note: str | None = None


class CollectionReactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_order: int
    note: str | None
    reaction: ReactionRead


class CollectionRead(CollectionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime
    reaction_links: list[CollectionReactionRead]


class ReorderRequest(BaseModel):
    reaction_ids: list[int]


class ImportResult(BaseModel):
    created: int
    updated: int
