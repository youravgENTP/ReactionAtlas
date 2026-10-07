from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def now() -> datetime:
    return datetime.now()


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (
        UniqueConstraint("series", "number", name="uq_reaction_series_number"),
        CheckConstraint("series IN ('general', 'special')", name="ck_reaction_series"),
        CheckConstraint("status IN ('active', 'deprecated')", name="ck_reaction_status"),
        CheckConstraint("number > 0", name="ck_reaction_number_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    series: Mapped[str] = mapped_column(String(16), index=True)
    number: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    slug: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    summary: Mapped[str | None] = mapped_column(Text)
    reaction_class: Mapped[str | None] = mapped_column(String(255), index=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    components: Mapped[list["ReactionComponent"]] = relationship(
        back_populates="reaction", cascade="all, delete-orphan", order_by="ReactionComponent.display_order"
    )
    collection_links: Mapped[list["CollectionReaction"]] = relationship(
        back_populates="reaction", cascade="all, delete-orphan"
    )
    aliases: Mapped[list["ReactionAlias"]] = relationship(
        back_populates="reaction", cascade="all, delete-orphan", order_by="ReactionAlias.alias"
    )
    outgoing_relations: Mapped[list["ReactionRelation"]] = relationship(
        foreign_keys="ReactionRelation.source_reaction_id",
        back_populates="source_reaction",
        cascade="all, delete-orphan",
    )
    incoming_relations: Mapped[list["ReactionRelation"]] = relationship(
        foreign_keys="ReactionRelation.target_reaction_id",
        back_populates="target_reaction",
        cascade="all, delete-orphan",
    )
    image_link: Mapped["ReactionImage | None"] = relationship(
        back_populates="reaction", cascade="all, delete-orphan", uselist=False
    )
    rich_text_record: Mapped["ReactionRichText | None"] = relationship(
        back_populates="reaction", cascade="all, delete-orphan", uselist=False
    )
    drug_links: Mapped[list["DrugReaction"]] = relationship(
        back_populates="reaction", cascade="all, delete-orphan"
    )
    structure_links: Mapped[list["StructureReaction"]] = relationship(
        back_populates="reaction", cascade="all, delete-orphan"
    )

    @property
    def display_code(self) -> str:
        return f"Rxn{'*' if self.series == 'special' else ''}{self.number}"

    @property
    def image(self):
        return self.image_link.asset if self.image_link else None

    @property
    def rich_text(self) -> dict[str, str]:
        if not self.rich_text_record:
            return {}
        import json
        try:
            value = json.loads(self.rich_text_record.content)
            return value if isinstance(value, dict) else {}
        except (TypeError, ValueError):
            return {}


class ReactionAlias(Base):
    __tablename__ = "reaction_aliases"
    __table_args__ = (
        UniqueConstraint("reaction_id", "alias", "alias_type", name="uq_reaction_alias"),
        CheckConstraint(
            "alias_type IN ('deprecated_index', 'alternate_name', 'abbreviation')",
            name="ck_reaction_alias_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reaction_id: Mapped[int] = mapped_column(ForeignKey("reactions.id", ondelete="CASCADE"), index=True)
    alias: Mapped[str] = mapped_column(String(255), index=True)
    alias_type: Mapped[str] = mapped_column(String(32), index=True)
    note: Mapped[str | None] = mapped_column(Text)

    reaction: Mapped[Reaction] = relationship(back_populates="aliases")


class ReactionRelation(Base):
    __tablename__ = "reaction_relations"
    __table_args__ = (
        UniqueConstraint(
            "source_reaction_id", "target_reaction_id", "relation_type", name="uq_reaction_relation"
        ),
        CheckConstraint("source_reaction_id != target_reaction_id", name="ck_reaction_relation_not_self"),
        CheckConstraint(
            "relation_type IN ('subtype_of', 'application_of', 'method_for', 'related_to')",
            name="ck_reaction_relation_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_reaction_id: Mapped[int] = mapped_column(
        ForeignKey("reactions.id", ondelete="CASCADE"), index=True
    )
    target_reaction_id: Mapped[int] = mapped_column(
        ForeignKey("reactions.id", ondelete="CASCADE"), index=True
    )
    relation_type: Mapped[str] = mapped_column(String(32), index=True)

    source_reaction: Mapped[Reaction] = relationship(
        foreign_keys=[source_reaction_id], back_populates="outgoing_relations"
    )
    target_reaction: Mapped[Reaction] = relationship(
        foreign_keys=[target_reaction_id], back_populates="incoming_relations"
    )

    @property
    def source_display_code(self) -> str:
        return self.source_reaction.display_code

    @property
    def source_name(self) -> str:
        return self.source_reaction.name

    @property
    def target_display_code(self) -> str:
        return self.target_reaction.display_code

    @property
    def target_name(self) -> str:
        return self.target_reaction.name


class ChemicalComponent(Base):
    __tablename__ = "chemical_components"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    normalized_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    aliases: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    reactions: Mapped[list["ReactionComponent"]] = relationship(back_populates="component")


class ReactionComponent(Base):
    __tablename__ = "reaction_components"

    id: Mapped[int] = mapped_column(primary_key=True)
    reaction_id: Mapped[int] = mapped_column(ForeignKey("reactions.id", ondelete="CASCADE"), index=True)
    component_id: Mapped[int] = mapped_column(ForeignKey("chemical_components.id"), index=True)
    role: Mapped[str] = mapped_column(String(32), index=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    detail: Mapped[str | None] = mapped_column(Text)

    reaction: Mapped[Reaction] = relationship(back_populates="components")
    component: Mapped[ChemicalComponent] = relationship(back_populates="reactions")


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    markdown_content: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    reaction_links: Mapped[list["CollectionReaction"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan", order_by="CollectionReaction.display_order"
    )


class CollectionReaction(Base):
    __tablename__ = "collection_reactions"
    __table_args__ = (UniqueConstraint("collection_id", "reaction_id", name="uq_collection_reaction"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    collection_id: Mapped[int] = mapped_column(ForeignKey("collections.id", ondelete="CASCADE"), index=True)
    reaction_id: Mapped[int] = mapped_column(ForeignKey("reactions.id", ondelete="CASCADE"), index=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(Text)

    collection: Mapped[Collection] = relationship(back_populates="reaction_links")
    reaction: Mapped[Reaction] = relationship(back_populates="collection_links")


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(255), unique=True)
    mime_type: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    @property
    def content_url(self) -> str:
        return f"/api/media/{self.id}/content"


class ReactionImage(Base):
    __tablename__ = "reaction_images"

    reaction_id: Mapped[int] = mapped_column(
        ForeignKey("reactions.id", ondelete="CASCADE"), primary_key=True
    )
    media_asset_id: Mapped[str] = mapped_column(
        ForeignKey("media_assets.id", ondelete="CASCADE"), unique=True, index=True
    )

    reaction: Mapped[Reaction] = relationship(back_populates="image_link")
    asset: Mapped[MediaAsset] = relationship()


class ReactionRichText(Base):
    __tablename__ = "reaction_rich_text"

    reaction_id: Mapped[int] = mapped_column(
        ForeignKey("reactions.id", ondelete="CASCADE"), primary_key=True
    )
    content: Mapped[str] = mapped_column(Text, default="{}")

    reaction: Mapped[Reaction] = relationship(back_populates="rich_text_record")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Drug(Base):
    __tablename__ = "drugs"
    __table_args__ = (
        UniqueConstraint("number", name="uq_drug_number"),
        CheckConstraint("number > 0", name="ck_drug_number_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    chapters_json: Mapped[str] = mapped_column(Text, default="[]")
    functions_json: Mapped[str] = mapped_column(Text, default="[]")
    aliases_json: Mapped[str] = mapped_column(Text, default="[]")
    image_directory: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    reaction_links: Mapped[list["DrugReaction"]] = relationship(
        back_populates="drug", cascade="all, delete-orphan", order_by="DrugReaction.display_order"
    )
    image_links: Mapped[list["DrugImage"]] = relationship(
        back_populates="drug", cascade="all, delete-orphan", order_by="DrugImage.display_order"
    )
    structure_links: Mapped[list["DrugStructure"]] = relationship(
        back_populates="drug", cascade="all, delete-orphan", order_by="DrugStructure.display_order"
    )

    @property
    def display_code(self) -> str:
        return f"Drug{self.number}"

    @property
    def image(self):
        return self.image_links[0].asset if self.image_links else None

    @staticmethod
    def _decode_list(value: str) -> list[str]:
        import json
        try:
            decoded = json.loads(value)
            return [str(item) for item in decoded] if isinstance(decoded, list) else []
        except (TypeError, ValueError):
            return []

    @property
    def chapters(self) -> list[str]:
        return self._decode_list(self.chapters_json)

    @property
    def functions(self) -> list[str]:
        return self._decode_list(self.functions_json)

    @property
    def aliases(self) -> list[str]:
        return self._decode_list(self.aliases_json)


class DrugReaction(Base):
    __tablename__ = "drug_reactions"
    __table_args__ = (UniqueConstraint("drug_id", "reaction_id", name="uq_drug_reaction"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    drug_id: Mapped[int] = mapped_column(ForeignKey("drugs.id", ondelete="CASCADE"), index=True)
    reaction_id: Mapped[int] = mapped_column(ForeignKey("reactions.id", ondelete="CASCADE"), index=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    drug: Mapped[Drug] = relationship(back_populates="reaction_links")
    reaction: Mapped[Reaction] = relationship(back_populates="drug_links")


class DrugImage(Base):
    __tablename__ = "drug_images"
    __table_args__ = (UniqueConstraint("drug_id", "source_path", name="uq_drug_image_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    drug_id: Mapped[int] = mapped_column(ForeignKey("drugs.id", ondelete="CASCADE"), index=True)
    media_asset_id: Mapped[str] = mapped_column(
        ForeignKey("media_assets.id", ondelete="CASCADE"), unique=True, index=True
    )
    source_path: Mapped[str] = mapped_column(String(700))
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    drug: Mapped[Drug] = relationship(back_populates="image_links")
    asset: Mapped[MediaAsset] = relationship()


class Structure(Base):
    __tablename__ = "structures"
    __table_args__ = (
        UniqueConstraint("number", name="uq_structure_number"),
        CheckConstraint("number > 0", name="ck_structure_number_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    categories_json: Mapped[str] = mapped_column(Text, default="[]")
    aliases_json: Mapped[str] = mapped_column(Text, default="[]")
    image_directory: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    reaction_links: Mapped[list["StructureReaction"]] = relationship(
        back_populates="structure", cascade="all, delete-orphan", order_by="StructureReaction.display_order"
    )
    image_links: Mapped[list["StructureImage"]] = relationship(
        back_populates="structure", cascade="all, delete-orphan", order_by="StructureImage.display_order"
    )
    drug_links: Mapped[list["DrugStructure"]] = relationship(
        back_populates="structure", cascade="all, delete-orphan", order_by="DrugStructure.display_order"
    )

    @property
    def display_code(self) -> str:
        return f"Str{self.number}"

    @property
    def categories(self) -> list[str]:
        return Drug._decode_list(self.categories_json)

    @property
    def aliases(self) -> list[str]:
        return Drug._decode_list(self.aliases_json)

    @property
    def image(self):
        return self.image_links[0].asset if self.image_links else None


class StructureReaction(Base):
    __tablename__ = "structure_reactions"
    __table_args__ = (UniqueConstraint("structure_id", "reaction_id", name="uq_structure_reaction"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    structure_id: Mapped[int] = mapped_column(ForeignKey("structures.id", ondelete="CASCADE"), index=True)
    reaction_id: Mapped[int] = mapped_column(ForeignKey("reactions.id", ondelete="CASCADE"), index=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    structure: Mapped[Structure] = relationship(back_populates="reaction_links")
    reaction: Mapped[Reaction] = relationship(back_populates="structure_links")


class StructureImage(Base):
    __tablename__ = "structure_images"
    __table_args__ = (UniqueConstraint("structure_id", "source_path", name="uq_structure_image_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    structure_id: Mapped[int] = mapped_column(ForeignKey("structures.id", ondelete="CASCADE"), index=True)
    media_asset_id: Mapped[str] = mapped_column(
        ForeignKey("media_assets.id", ondelete="CASCADE"), unique=True, index=True
    )
    source_path: Mapped[str] = mapped_column(String(700))
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    structure: Mapped[Structure] = relationship(back_populates="image_links")
    asset: Mapped[MediaAsset] = relationship()


class DrugStructure(Base):
    __tablename__ = "drug_structures"
    __table_args__ = (UniqueConstraint("drug_id", "structure_id", name="uq_drug_structure"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    drug_id: Mapped[int] = mapped_column(ForeignKey("drugs.id", ondelete="CASCADE"), index=True)
    structure_id: Mapped[int] = mapped_column(ForeignKey("structures.id", ondelete="CASCADE"), index=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    drug: Mapped[Drug] = relationship(back_populates="structure_links")
    structure: Mapped[Structure] = relationship(back_populates="drug_links")
