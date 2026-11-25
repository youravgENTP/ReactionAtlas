import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from backend.app import backup


class BackupRichTextTest(unittest.TestCase):
    def test_backup_export_and_restored_sqlite_preserve_color_markup(self):
        colored_document = json.dumps({
            "version": 1,
            "blocks": [{
                "id": "text",
                "type": "text",
                "content": {
                    "text": "colored highlight",
                    "html": '<span style="color: rgb(12, 34, 56); background-color: rgba(255, 241, 168, 0.8)">colored highlight</span>',
                },
            }],
        })
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source_database = root / "source.db"
            with sqlite3.connect(source_database) as database:
                database.execute("CREATE TABLE documents (content TEXT NOT NULL)")
                database.execute("INSERT INTO documents (content) VALUES (?)", (colored_document,))

            backup_directory = root / "backups"
            with (
                patch.object(backup, "DATABASE_PATH", source_database),
                patch.object(backup, "BACKUP_DIR", backup_directory),
                patch.object(backup, "CANONICAL_DATA_PATH", root / "missing-reactions.json"),
                patch.object(backup, "MEDIA_DIR", root / "missing-media"),
            ):
                archive_path = backup.create_backup()

            restored_database = root / "restored.db"
            with ZipFile(archive_path) as archive:
                restored_database.write_bytes(archive.read("data/reaction_atlas.db"))
                manifest = json.loads(archive.read("manifest.json"))

            with sqlite3.connect(restored_database) as database:
                restored_document = database.execute("SELECT content FROM documents").fetchone()[0]

            self.assertEqual(restored_document, colored_document)
            self.assertEqual(manifest["files"][0]["path"], "data/reaction_atlas.db")
            self.assertEqual(len(manifest["files"][0]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
