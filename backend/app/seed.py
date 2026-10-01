from sqlalchemy import select

from . import crud, models, schemas


VERIFIED_REACTIONS = [
    ("general", 1, "Nitrile + Grignard → Ketone"),
    ("general", 2, "Nitrile Hydrolysis"),
    ("general", 4, "Imine Formation"),
    ("general", 5, "Transamidation"),
    ("general", 6, "Thionation / Thioamide Formation"),
    ("general", 7, "Nucleophilic Acyl Substitution"),
    ("general", 8, "Amidation"),
    ("general", 9, "Nitro Reduction"),
    ("general", 10, "Nitrile Reduction"),
    ("general", 11, "Metal-Catalyzed Hydrogenation"),
    ("general", 12, "Hydride-Donor Reduction"),
    ("special", 3, "Triazole Ring Formation"),
    ("special", 4, "Mannich Reaction"),
    ("special", 5, "Eschweiler–Clarke Reaction"),
    ("special", 6, "Michael Reaction"),
    ("special", 7, "Gewald Reaction"),
]


def seed_database(db):
    if db.scalar(select(models.Reaction.id).limit(1)) is not None:
        return

    reactions: dict[tuple[str, int], models.Reaction] = {}
    for series, number, name in VERIFIED_REACTIONS:
        reaction = crud.create_reaction(
            db,
            schemas.ReactionCreate(series=series, number=number, name=name),
        )
        reactions[(series, number)] = reaction

    nitrile_reduction = reactions[("general", 10)]
    db.add(models.ReactionAlias(
        reaction_id=nitrile_reduction.id,
        alias="Rxn3",
        alias_type="deprecated_index",
        note="Older reaction index corrected to Rxn10.",
    ))
    db.add_all([
        models.ReactionRelation(
            source_reaction_id=reactions[("general", 8)].id,
            target_reaction_id=reactions[("general", 7)].id,
            relation_type="subtype_of",
        ),
        models.ReactionRelation(
            source_reaction_id=reactions[("general", 11)].id,
            target_reaction_id=nitrile_reduction.id,
            relation_type="method_for",
        ),
        models.ReactionRelation(
            source_reaction_id=reactions[("general", 12)].id,
            target_reaction_id=nitrile_reduction.id,
            relation_type="method_for",
        ),
    ])
    db.commit()
