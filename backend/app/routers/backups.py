from fastapi import APIRouter

from ..backup import backup_status, create_backup


router = APIRouter(prefix="/api/backups", tags=["backups"])


@router.get("/status")
def get_backup_status():
    return backup_status()


@router.post("", status_code=201)
def run_backup():
    archive = create_backup()
    return {**backup_status(), "created_filename": archive.name}
