import re
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import DATA_DIR, get_db


router = APIRouter(prefix="/api/media", tags=["media"])
MEDIA_DIR = DATA_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


@router.post("", response_model=schemas.MediaAssetRead, status_code=201)
async def upload_media(
    request: Request,
    x_filename: str | None = Header(default=None),
    x_image_width: int | None = Header(default=None),
    x_image_height: int | None = Header(default=None),
    db: Session = Depends(get_db),
):
    mime_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if mime_type not in ALLOWED_TYPES:
        raise HTTPException(415, "Upload a JPEG, PNG, GIF, or WebP image")
    content = await request.body()
    if not content:
        raise HTTPException(400, "Image file is empty")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image must be 8 MB or smaller")
    asset_id = str(uuid4())
    stored_filename = f"{asset_id}{ALLOWED_TYPES[mime_type]}"
    (MEDIA_DIR / stored_filename).write_bytes(content)
    original_name = unquote(x_filename or "image")
    safe_name = re.sub(r"[^\w.() -]+", "-", original_name, flags=re.UNICODE)[:255]
    asset = models.MediaAsset(
        id=asset_id,
        original_filename=safe_name or "image",
        stored_filename=stored_filename,
        mime_type=mime_type,
        size_bytes=len(content),
        width=x_image_width if x_image_width and x_image_width > 0 else None,
        height=x_image_height if x_image_height and x_image_height > 0 else None,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.get("/{asset_id}/content")
def media_content(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(models.MediaAsset, asset_id)
    if not asset:
        raise HTTPException(404, "Image not found")
    path = MEDIA_DIR / asset.stored_filename
    if not path.is_file():
        raise HTTPException(404, "Image file not found")
    return FileResponse(path, media_type=asset.mime_type, filename=asset.original_filename,
                        headers={"Cache-Control": "private, max-age=3600"})


@router.delete("/{asset_id}", status_code=204)
def delete_media(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(models.MediaAsset, asset_id)
    if not asset:
        raise HTTPException(404, "Image not found")
    if db.scalar(select(models.ReactionImage).where(models.ReactionImage.media_asset_id == asset_id)):
        raise HTTPException(409, "Image is still used by a reaction")
    if db.scalar(select(models.DrugImage).where(models.DrugImage.media_asset_id == asset_id)):
        raise HTTPException(409, "Image is still used by a drug")
    path = MEDIA_DIR / asset.stored_filename
    db.delete(asset)
    db.commit()
    path.unlink(missing_ok=True)
    return Response(status_code=204)
