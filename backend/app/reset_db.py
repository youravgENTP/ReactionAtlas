from sqlalchemy import delete

from . import models
from .database import Base, SessionLocal, engine
from .seed import seed_database


def main() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # Reset canonical study data without removing user preferences or uploaded media.
        db.execute(delete(models.Collection))
        db.execute(delete(models.Reaction))
        db.execute(delete(models.ChemicalComponent))
        db.commit()
        counts = seed_database(db)
    if counts is None:
        raise RuntimeError("Database reset completed, but seed data was not loaded")
    print("Loaded:")
    print(f"{counts['general']} general reactions")
    print(f"{counts['special']} special reactions")
    print(f"{counts['aliases']} alias")
    print(f"{counts['relations']} relations")


if __name__ == "__main__":
    main()
