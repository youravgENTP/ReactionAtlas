#!/usr/bin/env python3
"""Download the curated Wikimedia structure image for every stable Drug record.

SVG is preferred at the source.  The existing Drug importer accepts raster images,
so Commons renders each SVG to a 1600 px PNG under drug-images/<slug>/.  The
tracked manifest records both the original file and the local derivative.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = "https://commons.wikimedia.org/w/api.php"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "ReactionAtlas/1.0 (Wikimedia drug image sync)"

# Stable Drug codes/slugs are deliberately repeated here so a changed database
# cannot silently redirect an image.  review_note documents intentional salt or
# naming differences between the record and the best Commons structure diagram.
SOURCES = [
    (1, "Salbutamol", "salbutamol", "Salbutamol.svg", "Racemic salbutamol structure."),
    (2, "Terazosin", "terazosin", "Terazosin.svg", "Free-base structure."),
    (3, "Phenylephrine HCl", "phenylephrine-hcl", "Phenylephrine structure.svg", "Commons diagram depicts phenylephrine without the hydrochloride counterion."),
    (4, "Carvedilol", "carvedilol", "Carvedilol.svg", "Racemic carvedilol structure."),
    (5, "Quetiapine", "quetiapine", "Quetiapine.svg", "Free-base structure."),
    (6, "Sumatriptan", "sumatriptan", "Sumatriptan.svg", "Free-base structure."),
    (7, "Sertraline", "sertraline", "Sertraline.svg", "Sertraline structure; marketed products commonly use the hydrochloride salt."),
    (8, "Paroxetine", "paroxetine", "Paroxetine-2D-skeletal.svg", "Paroxetine structure; marketed products may use salt/hydrate forms."),
    (9, "Dibucaine HCl", "dibucaine-hcl", "Cinchocaine.svg", "Cinchocaine is the INN synonym for dibucaine; diagram depicts the free base, not hydrochloride."),
    (10, "Sildenafil", "sildenafil", "Sildenafil structure.svg", "Free-base structure; marketed products commonly use citrate."),
    (11, "Vardenafil", "vardenafil", "Vardenafil structure.svg", "Free-base structure; marketed products commonly use hydrochloride."),
    (12, "Formoterol", "formoterol", "Formoterol.svg", "Formoterol stereochemical structure."),
    (13, "Tiotropium", "tiotropium", "Tiotropium bromide.svg", "Diagram includes bromide, the pharmaceutically used counterion."),
    (14, "Milrinone", "milrinone", "Milrinone.svg", "Milrinone structure."),
    (15, "Nifedipine", "nifedipine", "Nifedipine.svg", "Nifedipine structure."),
    (16, "Verapamil HCl", "verapamil-hcl", "Verapamil.svg", "Commons diagram depicts verapamil without the hydrochloride counterion."),
    (17, "Diltiazem", "diltiazem", "Diltiazem structure.svg", "Diltiazem stereochemical structure."),
    (18, "Amlodipine", "amlodipine", "Amlodipine.svg", "Free-base structure; marketed products commonly use besylate."),
    (19, "Valsartan", "valsartan", "Valsartan skeletal.svg", "Valsartan stereochemical structure."),
    (20, "Simvastatin", "simvastatin", "Simvastatin.svg", "Simvastatin stereochemical structure."),
    (21, "Atorvastatin", "atorvastatin", "Atorvastatin.svg", "Free-acid structure; marketed products commonly use the calcium salt."),
    (22, "Clopidogrel", "clopidogrel", "S-Clopidogrel structure.svg", "Active S-enantiomer structure; marketed products commonly use bisulfate."),
    (23, "Paracetamol", "paracetamol", "Paracetamol V2.svg", "Paracetamol (acetaminophen) structure."),
    (24, "Indomethacin", "indomethacin", "Indometacin.svg", "Indometacin is the INN spelling of indomethacin."),
]

WIKIPEDIA_ARTICLES = {
    "salbutamol": "Salbutamol", "terazosin": "Terazosin", "phenylephrine-hcl": "Phenylephrine",
    "carvedilol": "Carvedilol", "quetiapine": "Quetiapine", "sumatriptan": "Sumatriptan",
    "sertraline": "Sertraline", "paroxetine": "Paroxetine", "dibucaine-hcl": "Cinchocaine",
    "sildenafil": "Sildenafil", "vardenafil": "Vardenafil", "formoterol": "Formoterol",
    "tiotropium": "Tiotropium bromide", "milrinone": "Milrinone", "nifedipine": "Nifedipine",
    "verapamil-hcl": "Verapamil", "diltiazem": "Diltiazem", "amlodipine": "Amlodipine",
    "valsartan": "Valsartan", "simvastatin": "Simvastatin", "atorvastatin": "Atorvastatin",
    "clopidogrel": "Clopidogrel", "paracetamol": "Paracetamol", "indomethacin": "Indometacin",
}


def request_json(params: dict[str, str], attempts: int = 6, api: str = API) -> dict:
    url = api + "?" + urllib.parse.urlencode(params)
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)


def clean_metadata(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    text = value.get("value")
    if not text:
        return None
    plain = re.sub(r"<[^>]+>", "", str(text))
    return html.unescape(plain).strip() or None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata-only", action="store_true", help="verify sources and write the manifest without downloading PNG files")
    args = parser.parse_args()

    titles = "|".join(f"File:{filename}" for _, _, _, filename, _ in SOURCES)
    payload = request_json({
        "action": "query", "format": "json", "formatversion": "2",
        "prop": "imageinfo", "titles": titles,
        "iiprop": "url|mime|size|sha1|extmetadata", "iiurlwidth": "1600",
    })
    pages = {page["title"].removeprefix("File:"): page for page in payload["query"]["pages"]}
    article_payload = request_json({
        "action": "query", "format": "json", "formatversion": "2",
        "prop": "info", "inprop": "url", "titles": "|".join(WIKIPEDIA_ARTICLES.values()),
    }, api=WIKIPEDIA_API)
    articles = {page["title"].casefold(): page for page in article_payload["query"]["pages"]}
    manifest = {"version": 1, "source": "Wikimedia Commons", "images": []}

    for number, name, slug, filename, review_note in SOURCES:
        page = pages.get(filename)
        if not page or page.get("missing"):
            raise RuntimeError(f"Commons source is missing: {filename}")
        article = articles.get(WIKIPEDIA_ARTICLES[slug].casefold())
        if not article or article.get("missing"):
            raise RuntimeError(f"Wikipedia article is missing: {WIKIPEDIA_ARTICLES[slug]}")
        info = page["imageinfo"][0]
        original_url = info["url"]
        rendered_url = info.get("thumburl", original_url)
        extension = ".png" if info.get("thumburl") else Path(urllib.parse.urlparse(original_url).path).suffix.lower()
        relative_path = Path("drug-images") / slug / f"wikimedia-structure{extension}"
        destination = ROOT / relative_path
        if not args.metadata_only:
            download(rendered_url, destination)
        local_sha256 = hashlib.sha256(destination.read_bytes()).hexdigest() if destination.exists() else None
        metadata = info.get("extmetadata", {})
        form_note = "counterion" in review_note or "synonym" in review_note or "spelling" in review_note
        manifest["images"].append({
            "drug_code": f"Drug{number}", "drug_name": name, "slug": slug,
            "wikipedia_article_url": article["fullurl"],
            "commons_file": filename,
            "original_filename": filename,
            "commons_page_url": info["descriptionurl"],
            "original_file_url": original_url,
            "original_format": info["mime"],
            "original_dimensions": {"width": info["width"], "height": info["height"]},
            "local_import_path": relative_path.as_posix(),
            "local_sha256": local_sha256,
            "license": clean_metadata(metadata.get("LicenseShortName")),
            "license_url": clean_metadata(metadata.get("LicenseUrl")),
            "artist": clean_metadata(metadata.get("Artist")),
            "credit": clean_metadata(metadata.get("Credit")),
            "verification_status": "verified_with_form_note" if form_note else "verified",
            "verification_note": review_note,
            "discrepancy": review_note if form_note else None,
        })

    output = ROOT / "data" / "drug-image-sources.json"
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(manifest['images'])} Commons files and Wikipedia articles; wrote {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
