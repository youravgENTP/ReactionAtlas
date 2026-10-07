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

    @property
    def display_code(self) -> str:
        return f"Rxn{'*' if self.series == 'special' else ''}{self.number}"

    @property
    def image(self):
        return self.image_link.asset if self.image_link else None


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


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
