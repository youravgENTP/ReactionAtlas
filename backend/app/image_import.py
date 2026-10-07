import hashlib
import shutil
from pathlib import Path
from typing import Callable
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models
from .database import PROJECT_ROOT


MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def resolve_image_directory(source_root: Path, value: str | None, slug: str) -> Path:
    relative = Path(value or slug)
    if relative.is_absolute():
        raise HTTPException(400, "image_directory must be relative to the project root")
    if relative.parts and relative.parts[0] == source_root.name:
        relative = Path(*relative.parts[1:])
    directory = (source_root / relative).resolve()
    if not directory.is_relative_to(source_root.resolve()) or directory == source_root.resolve():
        raise HTTPException(400, f"image_directory must be inside {source_root.name}/")
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def sync_images(
    db: Session,
    owner_name: str,
    links: list,
    link_factory: Callable[..., object],
    directory: Path,
    media_dir: Path,
    new_files: list[Path],
    obsolete_files: list[Path],
    warnings: list[str],
) -> int:
    candidates = [
        path for path in sorted(directory.rglob("*"))
        if path.is_file()
        and path.resolve().is_relative_to(directory.resolve())
        and path.suffix.lower() in IMAGE_TYPES
    ]
    usable: list[Path] = []
    for path in candidates:
        if path.stat().st_size > MAX_IMAGE_BYTES:
            warnings.append(f"{owner_name}: skipped {path.name} because it is larger than 8 MB")
        elif path.stat().st_size == 0:
            warnings.append(f"{owner_name}: skipped empty image {path.name}")
        else:
            usable.append(path)
    if not usable:
        warnings.append(f"{owner_name}: no images found in {directory.relative_to(PROJECT_ROOT)}")
    existing = {link.source_path: link for link in links}
    desired_paths = {path.relative_to(PROJECT_ROOT).as_posix() for path in usable}
    for source_path, link in list(existing.items()):
        if source_path in desired_paths:
            continue
        obsolete_files.append(media_dir / link.asset.stored_filename)
        asset = link.asset
        db.delete(link)
        db.flush()
        db.delete(asset)
    uploaded = 0
    for position, source in enumerate(usable):
        source_path = source.relative_to(PROJECT_ROOT).as_posix()
        link = existing.get(source_path)
        if link and same_content(source, media_dir / link.asset.stored_filename):
            link.display_order = position
            continue
        asset, stored_path = copy_image(source, media_dir)
        new_files.append(stored_path)
        db.add(asset)
        if link:
            old_asset = link.asset
            obsolete_files.append(media_dir / old_asset.stored_filename)
            link.asset = asset
            link.media_asset_id = asset.id
            link.display_order = position
            db.flush()
            db.delete(old_asset)
        else:
            links.append(link_factory(asset=asset, source_path=source_path, display_order=position))
        uploaded += 1
    return uploaded


def copy_image(source: Path, media_dir: Path) -> tuple[models.MediaAsset, Path]:
    asset_id = str(uuid4())
    extension = source.suffix.lower()
    stored_path = media_dir / f"{asset_id}{extension if extension != '.jpeg' else '.jpg'}"
    shutil.copyfile(source, stored_path)
    return models.MediaAsset(
        id=asset_id,
        original_filename=source.name[:255],
        stored_filename=stored_path.name,
        mime_type=IMAGE_TYPES[extension],
        size_bytes=source.stat().st_size,
        width=None,
        height=None,
    ), stored_path


def same_content(left: Path, right: Path) -> bool:
    if not right.is_file() or left.stat().st_size != right.stat().st_size:
        return False
    return _sha256(left) == _sha256(right)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
