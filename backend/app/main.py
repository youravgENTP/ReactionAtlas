import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import crud, models, schemas
from .database import Base, engine, get_db
from .backup import backup_if_due, seconds_until_backup
from .routers import backups, collections, components, drugs, media, reactions, settings, structures
from .schema_upgrade import initialize_number_counters, upgrade_schema
from .seed import seed_database


logger = logging.getLogger(__name__)


async def backup_loop():
    while True:
        try:
            await asyncio.sleep(max(1, await asyncio.to_thread(seconds_until_backup)))
            await asyncio.to_thread(backup_if_due)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Scheduled ReactionAtlas backup failed")
            await asyncio.sleep(300)


@asynccontextmanager
async def lifespan(_: FastAPI):
    upgrade_schema(engine)
    Base.metadata.create_all(bind=engine)
    initialize_number_counters(engine)
    from .database import SessionLocal
    with SessionLocal() as db:
        seed_database(db)
    try:
        await asyncio.to_thread(backup_if_due)
    except Exception:
        logger.exception("Startup ReactionAtlas backup failed")
    backup_task = asyncio.create_task(backup_loop())
    try:
        yield
    finally:
        backup_task.cancel()
        try:
            await backup_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="ReactionAtlas API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(reactions.router)
app.include_router(components.router)
app.include_router(collections.router)
app.include_router(media.router)
app.include_router(settings.router)
app.include_router(backups.router)
app.include_router(drugs.router)
app.include_router(structures.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/export")
def export_data(db: Session = Depends(get_db)):
    reaction_data = [schemas.ReactionRead.model_validate(item).model_dump(mode="json")
                     for item in crud.list_reactions(db)]
    collection_data = [schemas.CollectionRead.model_validate(item).model_dump(mode="json")
                       for item in db.scalars(crud.collection_query()).unique()]
    return {"version": 2, "reactions": reaction_data, "collections": collection_data}


@app.post("/api/import", response_model=schemas.ImportResult)
def import_data(items: list[schemas.ReactionCreate], db: Session = Depends(get_db)):
    created = updated = 0
    for item in items:
        existing = db.query(models.Reaction).filter(
            models.Reaction.series == item.series, models.Reaction.number == item.number
        ).first()
        if existing:
            crud.update_reaction(db, existing.id, item)
            updated += 1
        else:
            crud.create_reaction(db, item)
            created += 1
    return {"created": created, "updated": updated}
