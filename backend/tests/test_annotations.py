import json
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from backend.app import models, schemas
from backend.app.database import Base
from backend.app.routers import annotations


def study_document(text="Original item", nested=False):
    item = {"id": "12345678-1234-4234-8234-123456789abc", "text": text}
    items = [{"id": "parent", "text": "Parent", "children": [item]}] if nested else [item]
    return json.dumps({"version": 1, "blocks": [{"id": "block-1", "type": "hierarchy", "items": items}]})


class AnnotationTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.drug = models.Drug(number=24, name="Indomethacin", slug="indomethacin", description_document=study_document(), chapters_json="[]", functions_json="[]", aliases_json="[]", image_directory="drug-images/indomethacin")
        self.reaction = models.Reaction(series="general", number=20, name="Example", status="active")
        self.reaction.rich_text_record = models.ReactionRichText(content=json.dumps({"notes_document": study_document()}))
        self.collection = models.Collection(title="Study", markdown_content=study_document())
        self.db.add_all([self.drug, self.reaction, self.collection]); self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def create(self, kind="drxn", source_type="drug", entity_id=None, field="description", question_text=None):
        return annotations.create_annotation(schemas.AnnotationCreate(kind=kind, source_type=source_type, source_entity_id=entity_id or self.drug.id, document_field=field, block_id="block-1", item_id="12345678-1234-4234-8234-123456789abc", question_text=question_text), self.db)

    def test_drxn_code_is_stable_through_text_edit_and_reindent(self):
        created = self.create()
        self.assertEqual(created["stable_code"], "Drug24-DRxn1")
        self.drug.description_document = study_document("Edited item", nested=True); self.db.commit()
        listed = annotations.list_annotations(kind="drxn", db=self.db)
        self.assertEqual(listed[0]["stable_code"], "Drug24-DRxn1")
        self.assertEqual(listed[0]["source_item_text"], "Edited item")
        annotations.delete_annotation(created["id"], self.db)
        self.assertIn("Edited item", self.drug.description_document)

    def test_questions_persist_status_and_survive_missing_source(self):
        created = self.create("question", "reaction", self.reaction.id, "notes", "Why this step?")
        updated = annotations.update_annotation(created["id"], schemas.AnnotationUpdate(status="resolved", resolution_memo="Because of selectivity"), self.db)
        self.assertEqual(updated["status"], "resolved")
        self.assertIsNotNone(updated["resolved_at"])
        self.reaction.rich_text_record.content = json.dumps({"notes_document": json.dumps({"version": 1, "blocks": []})}); self.db.commit()
        orphan = annotations.list_annotations(kind="question", db=self.db)[0]
        self.assertFalse(orphan["source_exists"])
        self.assertIn("/reactions/Rxn20", orphan["source_href"])

    def test_unsaved_or_duplicate_items_are_rejected(self):
        self.create()
        with self.assertRaisesRegex(HTTPException, "already has"):
            self.create()
        with self.assertRaisesRegex(HTTPException, "Save the hierarchy"):
            annotations.create_annotation(schemas.AnnotationCreate(kind="question", source_type="collection", source_entity_id=self.collection.id, document_field="document", item_id="missing"), self.db)

    def test_additive_schema_creation_is_idempotent(self):
        Base.metadata.create_all(self.engine)
        Base.metadata.create_all(self.engine)
        self.assertIn("annotations", inspect(self.engine).get_table_names())
        self.assertEqual(self.db.query(models.Drug).count(), 1)
        self.assertEqual(self.db.query(models.Reaction).count(), 1)
        self.assertEqual(self.db.query(models.Collection).count(), 1)


if __name__ == "__main__":
    unittest.main()
