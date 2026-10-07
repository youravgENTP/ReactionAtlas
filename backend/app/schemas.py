from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


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
    image_asset_id: str | None = None
    rich_text: dict[str, str] = Field(default_factory=dict)


class MediaAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    original_filename: str
    mime_type: str
    size_bytes: int
    width: int | None
    height: int | None
    created_at: datetime
    content_url: str


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
    image: MediaAssetRead | None
    rich_text: dict[str, str]


class ReactionImageUpdate(BaseModel):
    media_asset_id: str | None = None


class ReactionRichTextUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    reaction_class: str | None = None
    summary: str | None = None
    notes: str | None = None
    rich_text: dict[str, str] = Field(default_factory=dict)


class LatexShortcut(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    command: str = Field(min_length=1, max_length=80)
    replacement: str = Field(min_length=1, max_length=80)


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


class DrugImportItem(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    number: int | None = Field(default=None, gt=0)
    slug: str | None = Field(default=None, max_length=255)
    description: str | None = None
    chapters: list[str] = Field(default_factory=list)
    functions: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    image_directory: str | None = Field(default=None, max_length=500)
    reaction_codes: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("reaction_codes", "reactions"),
    )
    structure_codes: list[str] = Field(default_factory=list)

    @field_validator("chapters", "functions", "aliases", "reaction_codes", "structure_codes")
    @classmethod
    def clean_string_lists(cls, values: list[str]):
        return list(dict.fromkeys(value.strip() for value in values if value and value.strip()))


class DrugImportPayload(BaseModel):
    drugs: list[DrugImportItem]


class DrugImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source_path: str
    display_order: int
    asset: MediaAssetRead


class DrugReactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_order: int
    reaction: ReactionRead


class StructureReferenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: int
    display_code: str
    name: str
    slug: str
    categories: list[str]
    image: MediaAssetRead | None


class DrugReferenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: int
    display_code: str
    name: str
    slug: str
    chapters: list[str]
    functions: list[str]
    image: MediaAssetRead | None


class DrugStructureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_order: int
    structure: StructureReferenceRead


class DrugRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: int
    display_code: str
    name: str
    slug: str
    description: str | None
    chapters: list[str]
    functions: list[str]
    aliases: list[str]
    image_directory: str
    created_at: datetime
    updated_at: datetime
    image_links: list[DrugImageRead]
    reaction_links: list[DrugReactionRead]
    structure_links: list[DrugStructureRead]


class DrugImportResult(BaseModel):
    created: int
    updated: int
    images_uploaded: int
    reactions_linked: int
    structures_linked: int
    warnings: list[str]


class StructureImportItem(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    number: int | None = Field(default=None, gt=0)
    slug: str | None = Field(default=None, max_length=255)
    description: str | None = None
    categories: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    image_directory: str | None = Field(default=None, max_length=500)
    reaction_codes: list[str] = Field(default_factory=list)
    drug_codes: list[str] = Field(default_factory=list)

    @field_validator("categories", "aliases", "reaction_codes", "drug_codes")
    @classmethod
    def clean_structure_lists(cls, values: list[str]):
        return list(dict.fromkeys(value.strip() for value in values if value and value.strip()))


class StructureImportPayload(BaseModel):
    structures: list[StructureImportItem]


class StructureImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source_path: str
    display_order: int
    asset: MediaAssetRead


class StructureReactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_order: int
    reaction: ReactionRead


class StructureDrugRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_order: int
    drug: DrugReferenceRead


class StructureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: int
    display_code: str
    name: str
    slug: str
    description: str | None
    categories: list[str]
    aliases: list[str]
    image_directory: str
    created_at: datetime
    updated_at: datetime
    image_links: list[StructureImageRead]
    reaction_links: list[StructureReactionRead]
    drug_links: list[StructureDrugRead]


class StructureImportResult(BaseModel):
    created: int
    updated: int
    images_uploaded: int
    reactions_linked: int
    drugs_linked: int
    warnings: list[str]
