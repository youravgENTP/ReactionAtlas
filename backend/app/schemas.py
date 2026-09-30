from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Role = Literal["reactant", "product", "reagent", "catalyst", "solvent", "condition", "other"]


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
    rxn_index: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    category: str | None = None
    description: str | None = None
    notes: str | None = None
    source_note: str | None = None


class ReactionCreate(ReactionBase):
    components: list[ReactionComponentInput] = Field(default_factory=list)


class ReactionRead(ReactionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime
    components: list[ReactionComponentRead]


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
