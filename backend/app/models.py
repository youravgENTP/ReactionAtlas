from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def now() -> datetime:
    return datetime.now()


class Reaction(Base):
    __tablename__ = "reactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    rxn_index: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    category: Mapped[str | None] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    source_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    components: Mapped[list["ReactionComponent"]] = relationship(
        back_populates="reaction", cascade="all, delete-orphan", order_by="ReactionComponent.display_order"
    )
    collection_links: Mapped[list["CollectionReaction"]] = relationship(
        back_populates="reaction", cascade="all, delete-orphan"
    )


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
