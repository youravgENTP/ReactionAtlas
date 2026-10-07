import re


def slugify(value: str) -> str:
    normalized = re.sub(r"\s+", "-", value.strip().casefold())
    return re.sub(r"[^\w-]+", "-", normalized, flags=re.UNICODE).strip("-")[:255]
