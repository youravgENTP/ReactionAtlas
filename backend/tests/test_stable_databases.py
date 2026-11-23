import tempfile
import unittest
import json
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from backend.app import crud, models, schemas
from backend.app.database import Base, PROJECT_ROOT
from backend.app.routers import drugs, media, structures
from backend.app.references import reaction_for_code
from backend.app.schema_upgrade import upgrade_schema
from backend.app.stable_codes import parse_stable_code


class StableDatabaseTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([
            models.Reaction(series="general", number=4, name="General reaction", status="active"),
            models.Reaction(series="special", number=3, name="Named reaction", status="active"),
            models.Reaction(series="scaffold", number=2, name="Scaffold reaction", status="active"),
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

    def test_19_reaction_display_codes_and_parser(self):
        reactions = list(self.db.scalars(select(models.Reaction).order_by(models.Reaction.series)))
        self.assertEqual(
            {reaction.series: reaction.display_code for reaction in reactions},
            {"general": "Rxn4", "scaffold": "SRxn2", "special": "Rxn*3"},
        )
        cases = {
            "Rxn4": ("general", 4),
            "rxn4": ("general", 4),
            "Rxn*5": ("special", 5),
            "rxn*5": ("special", 5),
            "SRxn3": ("scaffold", 3),
            "srxn3": ("scaffold", 3),
            "SRXN 12": ("scaffold", 12),
        }
        for code, expected in cases.items():
            parsed = parse_stable_code(code, "reaction")
            self.assertEqual((parsed.reaction_series, parsed.number), expected)
        self.assertEqual(parse_stable_code("Str2").namespace, "structure")
        self.assertEqual(parse_stable_code("Drug4").namespace, "drug")

    def test_20_malformed_stable_codes(self):
        for code in ("Str*2", "Drug*2", "Srxn*2", "Rxn**3"):
            with self.subTest(code=code), self.assertRaises(ValueError):
                parse_stable_code(code)

    def test_21_reaction_reference_resolution_all_series(self):
        warnings: list[str] = []
        resolved = [reaction_for_code(self.db, code, "test", warnings) for code in (
            "Rxn4", "Rxn*3", "SRxn2"
        )]
        self.assertEqual([reaction.series for reaction in resolved], ["general", "special", "scaffold"])
        self.assertEqual(warnings, [])

    def test_22_scaffold_crud_search_and_json_round_trip(self):
        created = crud.create_reaction(self.db, schemas.ReactionCreate(
            series="scaffold", number=7, name="Specific ring closure",
            slug="specific-ring-closure", components=[],
        ))
        self.assertEqual(created.display_code, "SRxn7")
        self.assertEqual([item.id for item in crud.list_reactions(self.db, "srxn7")], [created.id])
        exported_json = json.dumps(
            schemas.ReactionRead.model_validate(created).model_dump(mode="json")
        )
        exported = json.loads(exported_json)
        self.assertEqual(exported["series"], "scaffold")
        self.db.delete(crud.get_reaction(self.db, created.id)); self.db.commit()
        restored = crud.create_reaction(self.db, schemas.ReactionCreate(
            series=exported["series"], number=exported["number"], name=exported["name"],
            slug=exported["slug"], summary=exported["summary"],
            reaction_class=exported["reaction_class"], status=exported["status"],
            notes=exported["notes"], components=[], rich_text=exported["rich_text"],
        ))
        self.assertEqual((restored.series, restored.display_code), ("scaffold", "SRxn7"))

    def test_23_drug_and_structure_import_link_scaffold_reactions(self):
        drug_result, drug = self.import_drug(reaction_codes=["SRxn2"])
        structure_result, structure = self.import_structure(reaction_codes=["SRxn2"])
        self.assertEqual(drug_result["reactions_linked"], 1)
        self.assertEqual(structure_result["reactions_linked"], 1)
        self.assertEqual(drug.reaction_links[0].reaction.display_code, "SRxn2")
        self.assertEqual(structure.reaction_links[0].reaction.display_code, "SRxn2")

    def test_25_drug_import_reaction_mapping_omission_clear_and_replace(self):
        self.import_drug(reaction_codes=["Rxn4", "Rxn*3"])
        _, preserved = self.import_drug(description="reaction_codes omitted")
        self.assertEqual(
            [link.reaction.display_code for link in preserved.reaction_links],
            ["Rxn4", "Rxn*3"],
        )
        self.import_drug(reaction_codes=[])
        cleared = self.db.scalar(drugs.drug_query().where(models.Drug.slug == "drug-example"))
        self.assertEqual(cleared.reaction_links, [])
        _, replaced = self.import_drug(reaction_codes=["SRxn2", "Rxn4"])
        self.assertEqual(
            [link.reaction.display_code for link in replaced.reaction_links],
            ["SRxn2", "Rxn4"],
        )
        result, partially_replaced = self.import_drug(reaction_codes=["Rxn4", "Rxn999"])
        self.assertEqual([link.reaction.display_code for link in partially_replaced.reaction_links], ["Rxn4"])
        self.assertTrue(any("Rxn999" in warning for warning in result["warnings"]))

    def test_26_drug_reaction_link_endpoints_are_bidirectional_and_atomic(self):
        _, drug = self.import_drug()
        reactions = list(self.db.scalars(select(models.Reaction).order_by(models.Reaction.id)))
        first = drugs.add_reaction(drug.id, schemas.DrugReactionAdd(reaction_id=reactions[0].id), self.db)
        linked = drugs.add_reaction(drug.id, schemas.DrugReactionAdd(reaction_id=reactions[1].id), self.db)
        self.assertEqual([link.reaction_id for link in linked.reaction_links], [reactions[0].id, reactions[1].id])
        with self.assertRaisesRegex(HTTPException, "already linked"):
            drugs.add_reaction(drug.id, schemas.DrugReactionAdd(reaction_id=reactions[0].id), self.db)
        with self.assertRaisesRegex(HTTPException, "every linked reaction"):
            drugs.reorder_reactions(drug.id, schemas.ReorderRequest(reaction_ids=[reactions[0].id]), self.db)
        with self.assertRaisesRegex(HTTPException, "Reaction not found"):
            drugs.reorder_reactions(
                drug.id, schemas.ReorderRequest(reaction_ids=[reactions[0].id, 99999]), self.db
            )
        unchanged = drugs.get_drug(self.db, drug.id)
        self.assertEqual([link.reaction_id for link in unchanged.reaction_links], [reactions[0].id, reactions[1].id])
        reordered = drugs.reorder_reactions(
            drug.id, schemas.ReorderRequest(reaction_ids=[reactions[1].id, reactions[0].id]), self.db
        )
        self.assertEqual([link.reaction_id for link in reordered.reaction_links], [reactions[1].id, reactions[0].id])
        schemas.DrugRead.model_validate(reordered)
        reaction = crud.get_reaction(self.db, reactions[0].id)
        self.assertEqual(reaction.drug_links[0].drug.id, drug.id)
        schemas.ReactionRead.model_validate(reaction)
        remaining = drugs.remove_reaction(drug.id, reactions[1].id, self.db)
        self.assertEqual([link.reaction_id for link in remaining.reaction_links], [reactions[0].id])
        with self.assertRaisesRegex(HTTPException, "Reaction not found"):
            drugs.add_reaction(drug.id, schemas.DrugReactionAdd(reaction_id=99999), self.db)
        with self.assertRaisesRegex(HTTPException, "Drug not found"):
            drugs.add_reaction(99999, schemas.DrugReactionAdd(reaction_id=reactions[0].id), self.db)
        self.assertEqual(first.id, drug.id)

    def test_27_media_delete_refuses_reaction_notes_reference(self):
        reaction = self.db.scalar(select(models.Reaction).where(models.Reaction.series == "general"))
        asset = models.MediaAsset(
            id="12345678-1234-4234-8234-123456789abc",
            original_filename="notes.png", stored_filename="notes.png",
            mime_type="image/png", size_bytes=10, width=10, height=10,
        )
        reaction.rich_text_record = models.ReactionRichText(content=json.dumps({
            "notes": f'<img src="/api/media/{asset.id}/content" data-media-id="{asset.id}">'
        }))
        self.db.add(asset); self.db.commit()
        with self.assertRaisesRegex(HTTPException, "reaction rich text"):
            media.delete_media(asset.id, self.db)

    def test_28_hierarchical_documents_preserve_plain_text_and_relationships(self):
        _, drug = self.import_drug(description="Legacy searchable description", reaction_codes=["Rxn4"])
        document = json.dumps({
            "version": 1,
            "blocks": [{
                "id": "list", "type": "hierarchy",
                "items": [{"id": "one", "text": "개요", "children": [{"id": "two", "text": "세부"}]}],
            }],
        }, ensure_ascii=False)
        updated = drugs.update_description(
            drug.id,
            schemas.DrugDescriptionUpdate(
                description="개요\n세부", description_document=document,
            ),
            self.db,
        )
        self.assertEqual(updated.description, "개요\n세부")
        self.assertEqual(json.loads(updated.description_document)["version"], 1)
        self.assertEqual([link.reaction.display_code for link in updated.reaction_links], ["Rxn4"])
        reaction = crud.get_reaction(self.db, updated.reaction_links[0].reaction_id)
        crud.save_reaction_rich_text(reaction, {
            "summary_document": document, "notes_document": document,
        })
        self.db.commit()
        saved = crud.get_reaction(self.db, reaction.id)
        self.assertEqual(json.loads(saved.rich_text["notes_document"])["blocks"][0]["type"], "hierarchy")

    def test_29_media_delete_refuses_drug_description_reference(self):
        _, drug = self.import_drug()
        asset = models.MediaAsset(
            id="abcdefab-1234-4234-8234-123456789abc",
            original_filename="description.png", stored_filename="description.png",
            mime_type="image/png", size_bytes=10, width=10, height=10,
        )
        drug.description_document = json.dumps({
            "version": 1,
            "blocks": [{"id": "image", "type": "image", "media_asset_id": asset.id,
                        "content_url": f"/api/media/{asset.id}/content"}],
        })
        self.db.add(asset); self.db.commit()
        with self.assertRaisesRegex(HTTPException, "drug description"):
            media.delete_media(asset.id, self.db)

    def test_30_wikimedia_manifest_covers_every_stable_drug_code(self):
        manifest = json.loads((PROJECT_ROOT / "data" / "drug-image-sources.json").read_text())
        images = manifest["images"]
        self.assertEqual([item["drug_code"] for item in images], [f"Drug{i}" for i in range(1, 25)])
        self.assertEqual(len({item["slug"] for item in images}), 24)
        self.assertTrue(all(item["original_format"] == "image/svg+xml" for item in images))
        self.assertTrue(all(item["wikipedia_article_url"].startswith("https://en.wikipedia.org/wiki/") for item in images))
        self.assertTrue(all(item["commons_page_url"].startswith("https://commons.wikimedia.org/") for item in images))
        self.assertTrue(all(len(item["local_sha256"]) == 64 for item in images))


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
            columns = {row[1] for row in connection.execute(text("PRAGMA table_info(drugs)"))}
        self.assertEqual(rows, [(3, "Earlier", 1), (8, "Later", 2)])
        self.assertIn("description_document", columns)

    def test_24_old_reaction_constraint_upgrade_preserves_foreign_keys(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(text("PRAGMA foreign_keys=ON"))
            connection.execute(text("""
                CREATE TABLE reactions (
                    id INTEGER NOT NULL PRIMARY KEY,
                    series VARCHAR(16) NOT NULL,
                    number INTEGER NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(255), summary TEXT, reaction_class VARCHAR(255),
                    status VARCHAR(16) NOT NULL, notes TEXT,
                    created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
                    UNIQUE(series, number),
                    CHECK(series IN ('general', 'special')),
                    CHECK(status IN ('active', 'deprecated')),
                    CHECK(number > 0)
                )
            """))
            connection.execute(text("CREATE UNIQUE INDEX ix_reactions_slug ON reactions(slug)"))
            connection.execute(text("""
                INSERT INTO reactions VALUES
                (4, 'general', 4, 'General', 'general', NULL, NULL, 'active', NULL, '2026-01-01', '2026-01-01'),
                (5, 'special', 5, 'Named', 'named', NULL, NULL, 'active', NULL, '2026-01-01', '2026-01-01')
            """))
            child_tables = {
                "reaction_aliases": "reaction_id INTEGER REFERENCES reactions(id) ON DELETE CASCADE",
                "reaction_components": "reaction_id INTEGER REFERENCES reactions(id) ON DELETE CASCADE",
                "reaction_images": "reaction_id INTEGER REFERENCES reactions(id) ON DELETE CASCADE",
                "reaction_rich_text": "reaction_id INTEGER REFERENCES reactions(id) ON DELETE CASCADE",
                "collection_reactions": "reaction_id INTEGER REFERENCES reactions(id) ON DELETE CASCADE",
                "drug_reactions": "reaction_id INTEGER REFERENCES reactions(id) ON DELETE CASCADE",
                "structure_reactions": "reaction_id INTEGER REFERENCES reactions(id) ON DELETE CASCADE",
            }
            for table, definition in child_tables.items():
                connection.execute(text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, {definition})"))
                connection.execute(text(f"INSERT INTO {table} (id, reaction_id) VALUES (1, 4)"))
            connection.execute(text("""
                CREATE TABLE reaction_relations (
                    id INTEGER PRIMARY KEY,
                    source_reaction_id INTEGER REFERENCES reactions(id) ON DELETE CASCADE,
                    target_reaction_id INTEGER REFERENCES reactions(id) ON DELETE CASCADE
                )
            """))
            connection.execute(text(
                "INSERT INTO reaction_relations VALUES (1, 4, 5)"
            ))
        upgrade_schema(engine)
        upgrade_schema(engine)
        with engine.begin() as connection:
            connection.execute(text("""
                INSERT INTO reactions VALUES
                (6, 'scaffold', 1, 'Scaffold', 'scaffold', NULL, NULL, 'active', NULL, '2026-01-01', '2026-01-01')
            """))
            rows = connection.execute(text(
                "SELECT id, series, number FROM reactions ORDER BY id"
            )).all()
            violations = connection.execute(text("PRAGMA foreign_key_check")).all()
            child_counts = {
                table: connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
                for table in [*child_tables, "reaction_relations"]
            }
            create_sql = connection.execute(text(
                "SELECT sql FROM sqlite_master WHERE name='reactions'"
            )).scalar_one()
        self.assertEqual(rows, [(4, "general", 4), (5, "special", 5), (6, "scaffold", 1)])
        self.assertTrue(all(count == 1 for count in child_counts.values()))
        self.assertEqual(violations, [])
        self.assertIn("scaffold", create_sql)


if __name__ == "__main__":
    unittest.main()
