from .database import Base, SessionLocal, engine
from .seed import seed_database


def main() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
    print("Reset data/reaction_atlas.db and loaded verified reaction data.")


if __name__ == "__main__":
    main()
