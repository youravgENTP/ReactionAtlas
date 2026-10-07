import hashlib
import json
import os
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from .database import DATABASE_PATH, DATA_DIR, PROJECT_ROOT


BACKUP_DIR = PROJECT_ROOT / "backups"
MEDIA_DIR = DATA_DIR / "media"
CANONICAL_DATA_PATH = DATA_DIR / "reactions.json"
BACKUP_INTERVAL = timedelta(hours=12)
BACKUP_PREFIX = "reaction-atlas-"
_backup_lock = threading.Lock()


def latest_backup() -> Path | None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    archives = sorted(BACKUP_DIR.glob(f"{BACKUP_PREFIX}*.zip"), key=lambda path: path.stat().st_mtime)
    return archives[-1] if archives else None


def backup_status() -> dict:
    archive = latest_backup()
    created_at = datetime.fromtimestamp(archive.stat().st_mtime, timezone.utc) if archive else None
    next_due = created_at + BACKUP_INTERVAL if created_at else datetime.now(timezone.utc)
    return {
        "directory": str(BACKUP_DIR),
        "interval_hours": int(BACKUP_INTERVAL.total_seconds() // 3600),
        "latest_filename": archive.name if archive else None,
        "latest_created_at": created_at.isoformat() if created_at else None,
        "latest_size_bytes": archive.stat().st_size if archive else None,
        "next_due_at": next_due.isoformat(),
    }


def backup_if_due() -> Path | None:
    archive = latest_backup()
    if archive:
        age = datetime.now(timezone.utc) - datetime.fromtimestamp(archive.stat().st_mtime, timezone.utc)
        if age < BACKUP_INTERVAL:
            return None
    return create_backup()


def seconds_until_backup() -> float:
    archive = latest_backup()
    if not archive:
        return 0
    created_at = datetime.fromtimestamp(archive.stat().st_mtime, timezone.utc)
    return max(0, (created_at + BACKUP_INTERVAL - datetime.now(timezone.utc)).total_seconds())


def create_backup() -> Path:
    with _backup_lock:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        created_at = datetime.now(timezone.utc)
        stamp = created_at.strftime("%Y%m%dT%H%M%SZ")
        final_path = BACKUP_DIR / f"{BACKUP_PREFIX}{stamp}.zip"
        counter = 1
        while final_path.exists():
            final_path = BACKUP_DIR / f"{BACKUP_PREFIX}{stamp}-{counter}.zip"
            counter += 1
        temp_db = BACKUP_DIR / f".{final_path.stem}.db.tmp"
        temp_archive = BACKUP_DIR / f".{final_path.name}.tmp"
        try:
            _snapshot_database(temp_db)
            sources: list[tuple[Path, str]] = [(temp_db, "data/reaction_atlas.db")]
            if CANONICAL_DATA_PATH.is_file():
                sources.append((CANONICAL_DATA_PATH, "data/reactions.json"))
            if MEDIA_DIR.is_dir():
                sources.extend((path, path.relative_to(PROJECT_ROOT).as_posix()) for path in sorted(MEDIA_DIR.rglob("*")) if path.is_file())
            files = [{"path": archive_name, "size_bytes": path.stat().st_size, "sha256": _sha256(path)} for path, archive_name in sources]
            manifest = {
                "version": 1,
                "created_at": created_at.isoformat(),
                "interval_hours": int(BACKUP_INTERVAL.total_seconds() // 3600),
                "files": files,
            }
            with ZipFile(temp_archive, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
                for path, archive_name in sources:
                    archive.write(path, archive_name)
                archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            os.replace(temp_archive, final_path)
            return final_path
        finally:
            temp_db.unlink(missing_ok=True)
            temp_archive.unlink(missing_ok=True)


def _snapshot_database(destination: Path) -> None:
    if not DATABASE_PATH.is_file():
        raise FileNotFoundError(f"Database not found: {DATABASE_PATH}")
    with sqlite3.connect(DATABASE_PATH) as source, sqlite3.connect(destination) as target:
        source.backup(target)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
