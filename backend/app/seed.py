from sqlalchemy import select

from . import crud, models, schemas


SAMPLES = [
    schemas.ReactionCreate(
        rxn_index="RXN-001", name="Gabriel synthesis", category="Amine synthesis",
        description="Preparation of primary amines from alkyl halides.",
        notes="Useful for avoiding over-alkylation of ammonia.",
        components=[
            schemas.ReactionComponentInput(name="Potassium phthalimide", role="reactant"),
            schemas.ReactionComponentInput(name="Alkyl halide", role="reactant"),
            schemas.ReactionComponentInput(name="Hydrazine", role="reagent"),
            schemas.ReactionComponentInput(name="Primary amine", role="product"),
        ],
    ),
    schemas.ReactionCreate(
        rxn_index="RXN-002", name="Aldol condensation", category="C-C bond formation",
        description="Enolate addition followed by dehydration.",
        components=[
            schemas.ReactionComponentInput(name="Aldehyde or ketone", role="reactant"),
            schemas.ReactionComponentInput(name="α,β-Unsaturated carbonyl", role="product"),
            schemas.ReactionComponentInput(name="Base", role="catalyst"),
            schemas.ReactionComponentInput(name="Heat", role="condition"),
        ],
    ),
    schemas.ReactionCreate(
        rxn_index="RXN-003", name="Imine formation", category="Carbonyl chemistry",
        description="Condensation of a carbonyl compound with a primary amine.",
        notes="Mild acid catalysis; remove water to drive equilibrium.",
        components=[
            schemas.ReactionComponentInput(name="Aldehyde or ketone", role="reactant"),
            schemas.ReactionComponentInput(name="Primary amine", role="reactant"),
            schemas.ReactionComponentInput(name="Imine", role="product"),
            schemas.ReactionComponentInput(name="Acid", role="catalyst"),
            schemas.ReactionComponentInput(name="Water", role="product"),
        ],
    ),
]


def seed_database(db):
    if db.scalar(select(models.Reaction.id).limit(1)) is not None:
        return
    for sample in SAMPLES:
        crud.create_reaction(db, sample)
