import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from backend.app import models, schemas
from backend.app.database import Base, PROJECT_ROOT
from backend.app.routers import drugs, structures
from backend.app.schema_upgrade import upgrade_schema


class StableDatabaseTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([
            models.Reaction(series="general", number=4, name="General reaction", status="active"),
            models.Reaction(series="special", number=3, name="Named reaction", status="active"),
        ])
        self.db.commit()
        self.temporary = tempfile.TemporaryDirectory(dir=PROJECT_ROOT)
        temporary_path = Path(self.temporary.name)
        self.drug_root = temporary_path / "drug-images"
        self.structure_root = temporary_path / "structure-images"
        self.media_root = temporary_path / "media"
        self.drug_root.mkdir(); self.structure_root.mkdir(); self.media_root.mkdir()
        self.original_paths = (
            drugs.DRUG_IMAGE_ROOT, drugs.MEDIA_DIR,
            structures.STRUCTURE_IMAGE_ROOT, structures.MEDIA_DIR,
        )
        drugs.DRUG_IMAGE_ROOT, drugs.MEDIA_DIR = self.drug_root, self.media_root
        structures.STRUCTURE_IMAGE_ROOT, structures.MEDIA_DIR = self.structure_root, self.media_root

    def tearDown(self):
        self.db.close()
        drugs.DRUG_IMAGE_ROOT, drugs.MEDIA_DIR, structures.STRUCTURE_IMAGE_ROOT, structures.MEDIA_DIR = self.original_paths
        self.temporary.cleanup()

    def import_drug(self, name="Drug example", **values):
        item = schemas.DrugImportItem(name=name, slug=values.pop("slug", name.casefold().replace(" ", "-")), **values)
        result = drugs.import_drugs([item], self.db)
        record = self.db.scalar(select(models.Drug).where(models.Drug.slug == item.slug))
        return result, record

    def import_structure(self, name="Structure example", **values):
        item = schemas.StructureImportItem(name=name, slug=values.pop("slug", name.casefold().replace(" ", "-")), **values)
        result = structures.import_structures([item], self.db)
        record = self.db.scalar(select(models.Structure).where(models.Structure.slug == item.slug))
        return result, record

    def test_01_drug_auto_number_allocation(self):
        _, first = self.import_drug("First")
        _, second = self.import_drug("Second")
        self.assertEqual((first.number, second.number), (1, 2))

    def test_02_explicit_drug_number(self):
        _, drug = self.import_drug(number=3)
        self.assertEqual(drug.display_code, "Drug3")

    def test_03_drug_number_collision(self):
        self.import_drug("First", number=3)
        with self.assertRaisesRegex(HTTPException, "Drug3 is already used"):
            self.import_drug("Second", number=3)

    def test_04_drug_reimport_preserves_number(self):
        self.import_drug(number=3)
        _, updated = self.import_drug(description="updated")
        self.assertEqual(updated.number, 3)
        with self.assertRaisesRegex(HTTPException, "stable numbers cannot be changed"):
            self.import_drug(number=4)

    def test_05_structure_auto_number_allocation(self):
        _, first = self.import_structure("First")
        _, second = self.import_structure("Second")
        self.assertEqual((first.number, second.number), (1, 2))

    def test_06_explicit_structure_number(self):
        _, structure = self.import_structure(number=7)
        self.assertEqual(structure.display_code, "Str7")

    def test_07_structure_number_collision(self):
        self.import_structure("First", number=7)
        with self.assertRaisesRegex(HTTPException, "Str7 is already used"):
            self.import_structure("Second", number=7)

    def test_08_structure_reimport_preserves_number(self):
        self.import_structure(number=7)
        _, updated = self.import_structure(description="updated")
        self.assertEqual(updated.number, 7)

    def test_09_structure_reaction_linking(self):
        result, structure = self.import_structure(reaction_codes=["Rxn4", "Rxn*3"])
        self.assertEqual(result["reactions_linked"], 2)
        self.assertEqual([link.reaction.display_code for link in structure.reaction_links], ["Rxn4", "Rxn*3"])

    def test_10_drug_structure_linking_is_bidirectional(self):
        self.import_drug(number=3)
        self.import_structure(number=1, drug_codes=["Drug3"])
        drug = self.db.scalar(drugs.drug_query().where(models.Drug.number == 3))
        structure = self.db.scalar(structures.structure_query().where(models.Structure.number == 1))
        self.assertEqual(drug.structure_links[0].structure.display_code, "Str1")
        self.assertEqual(structure.drug_links[0].drug.display_code, "Drug3")
        schemas.DrugRead.model_validate(drug)
        schemas.StructureRead.model_validate(structure)
        self.import_drug(number=3, description="re-import without structure_codes")
        preserved = self.db.scalar(drugs.drug_query().where(models.Drug.number == 3))
        self.assertEqual(len(preserved.structure_links), 1)

    def test_11_missing_codes_produce_warnings(self):
        structure_result, _ = self.import_structure(reaction_codes=["Rxn999"], drug_codes=["Drug999"])
        drug_result, _ = self.import_drug(structure_codes=["Str999"], reaction_codes=["Rxn998"])
        warnings = structure_result["warnings"] + drug_result["warnings"]
        self.assertTrue(any("Rxn999" in warning for warning in warnings))
        self.assertTrue(any("Drug999" in warning for warning in warnings))
        self.assertTrue(any("Str999" in warning for warning in warnings))

    def test_12_duplicate_links_are_not_created(self):
        self.import_drug(number=3)
        _, structure = self.import_structure(
            number=1,
            reaction_codes=["Rxn4", "Rxn4"],
            drug_codes=["Drug3", "Drug3"],
        )
        self.assertEqual(len(structure.reaction_links), 1)
        self.assertEqual(len(structure.drug_links), 1)

    def test_13_display_codes(self):
        _, drug = self.import_drug(number=15)
        _, structure = self.import_structure(number=9)
        self.assertEqual((drug.display_code, structure.display_code), ("Drug15", "Str9"))

    def test_14_search_by_stable_code(self):
        self.import_drug(number=3)
        self.import_structure(number=1)
        self.assertEqual([item.display_code for item in drugs.list_drugs(search="drug3", db=self.db)], ["Drug3"])
        self.assertEqual([item.display_code for item in structures.list_structures(search="Str1", db=self.db)], ["Str1"])

    def test_16_shared_image_import_is_idempotent(self):
        drug_images = self.drug_root / "image-drug"
        structure_images = self.structure_root / "image-structure"
        drug_images.mkdir(); structure_images.mkdir()
        (drug_images / "drug.png").write_bytes(b"drug-image")
        (structure_images / "structure.webp").write_bytes(b"structure-image")
        first_drug, _ = self.import_drug("Image drug", number=1)
        second_drug, _ = self.import_drug("Image drug")
        first_structure, _ = self.import_structure("Image structure", number=1)
        second_structure, _ = self.import_structure("Image structure")
        self.assertEqual((first_drug["images_uploaded"], second_drug["images_uploaded"]), (1, 0))
        self.assertEqual((first_structure["images_uploaded"], second_structure["images_uploaded"]), (1, 0))
        self.assertEqual(len(list(self.db.scalars(select(models.MediaAsset)))), 2)

    def test_17_deleted_numbers_are_not_reused(self):
        _, first = self.import_drug("First")
        drugs.delete_drug(first.id, self.db)
        _, second = self.import_drug("Second")
        self.assertEqual(second.display_code, "Drug2")
        with self.assertRaisesRegex(HTTPException, "previously allocated"):
            self.import_drug("Third", number=1)

    def test_18_explicit_numbers_can_arrive_out_of_order(self):
        self.import_drug("Third", number=3)
        _, first = self.import_drug("First", number=1)
        _, automatic = self.import_drug("Automatic")
        self.assertEqual((first.display_code, automatic.display_code), ("Drug1", "Drug4"))


class SchemaUpgradeTest(unittest.TestCase):
    def test_15_old_drug_rows_are_backfilled_without_data_loss(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE drugs (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(255) NOT NULL,
                    created_at DATETIME
                )
            """))
            connection.execute(text("""
                INSERT INTO drugs (id, name, slug, created_at) VALUES
                (8, 'Later', 'later', '2026-02-01'),
                (3, 'Earlier', 'earlier', '2026-01-01')
            """))
        upgrade_schema(engine)
        with engine.connect() as connection:
            rows = connection.execute(text("SELECT id, name, number FROM drugs ORDER BY number")).all()
        self.assertEqual(rows, [(3, "Earlier", 1), (8, "Later", 2)])


if __name__ == "__main__":
    unittest.main()
