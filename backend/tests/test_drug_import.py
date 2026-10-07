import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.app import models, schemas
from backend.app.database import Base, PROJECT_ROOT
from backend.app.routers import drugs


class DrugImportTest(unittest.TestCase):
    def test_import_is_idempotent_and_links_reactions(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        root = PROJECT_ROOT / "drug-images"
        root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as temporary:
            temporary_path = Path(temporary)
            source_root = temporary_path / "sources"
            media_root = temporary_path / "media"
            image_dir = source_root / "example-drug"
            image_dir.mkdir(parents=True)
            media_root.mkdir()
            (image_dir / "structure.png").write_bytes(b"test-png-content")
            original_source_root, original_media_root = drugs.DRUG_IMAGE_ROOT, drugs.MEDIA_DIR
            drugs.DRUG_IMAGE_ROOT, drugs.MEDIA_DIR = source_root, media_root
            try:
                with Session(engine) as db:
                    db.add(models.Reaction(series="general", number=1, name="Test reaction", status="active"))
                    db.commit()
                    item = schemas.DrugImportItem(
                        name="Example drug",
                        slug="example-drug",
                        chapters=["Chapter 1"],
                        functions=["Example function"],
                        reaction_codes=["Rxn1"],
                    )
                    first = drugs.import_drugs([item], db)
                    second = drugs.import_drugs([item], db)
                    (image_dir / "structure.png").write_bytes(b"updated-png-content")
                    third = drugs.import_drugs([item], db)
                    self.assertEqual(first["created"], 1)
                    self.assertEqual(first["images_uploaded"], 1)
                    self.assertEqual(second["updated"], 1)
                    self.assertEqual(second["images_uploaded"], 0)
                    self.assertEqual(third["updated"], 1)
                    self.assertEqual(third["images_uploaded"], 1)
                    records = list(db.scalars(drugs.drug_query()).unique())
                    self.assertEqual(len(records), 1)
                    self.assertEqual(len(records[0].image_links), 1)
                    self.assertEqual(records[0].reaction_links[0].reaction.display_code, "Rxn1")
                    schemas.DrugRead.model_validate(records[0])
                    self.assertEqual(len(list(db.scalars(select(models.MediaAsset)))), 1)
            finally:
                drugs.DRUG_IMAGE_ROOT, drugs.MEDIA_DIR = original_source_root, original_media_root


if __name__ == "__main__":
    unittest.main()
