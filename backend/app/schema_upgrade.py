import json

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def upgrade_schema(engine: Engine) -> None:
    """Apply minimal additive SQLite upgrades before SQLAlchemy create_all()."""
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "reactions" in tables:
        _upgrade_reaction_series_constraint(engine)
    if "drugs" not in tables:
        return
    columns = {column["name"] for column in inspect(engine).get_columns("drugs")}
    with engine.begin() as connection:
        if "number" not in columns:
            connection.execute(text("ALTER TABLE drugs ADD COLUMN number INTEGER"))
        if "description_document" not in columns:
            connection.execute(text("ALTER TABLE drugs ADD COLUMN description_document TEXT"))
        order = "created_at, id" if "created_at" in columns else "id"
        rows = connection.execute(text(f"SELECT id, number FROM drugs ORDER BY {order}")).all()
        used = {number for _, number in rows if number is not None}
        next_number = 1
        for drug_id, number in rows:
            if number is not None:
                continue
            while next_number in used:
                next_number += 1
            connection.execute(
                text("UPDATE drugs SET number = :number WHERE id = :id"),
                {"number": next_number, "id": drug_id},
            )
            used.add(next_number)
            next_number += 1
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_drugs_number ON drugs(number)"
        ))


def _upgrade_reaction_series_constraint(engine: Engine) -> None:
    with engine.connect() as connection:
        create_sql = connection.execute(text(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reactions'"
        )).scalar_one_or_none()
    if not create_sql or "scaffold" in create_sql.casefold():
        return

    raw_connection = engine.raw_connection()
    cursor = raw_connection.cursor()
    foreign_keys_enabled = bool(cursor.execute("PRAGMA foreign_keys").fetchone()[0])
    try:
        raw_connection.rollback()
        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute("BEGIN IMMEDIATE")
        cursor.execute("DROP TABLE IF EXISTS reactions__series_upgrade")
        cursor.execute("""
            CREATE TABLE reactions__series_upgrade (
                id INTEGER NOT NULL,
                series VARCHAR(16) NOT NULL,
                number INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255),
                summary TEXT,
                reaction_class VARCHAR(255),
                status VARCHAR(16) NOT NULL,
                notes TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                CONSTRAINT uq_reaction_series_number UNIQUE (series, number),
                CONSTRAINT ck_reaction_series CHECK (
                    series IN ('general', 'special', 'scaffold')
                ),
                CONSTRAINT ck_reaction_status CHECK (
                    status IN ('active', 'deprecated')
                ),
                CONSTRAINT ck_reaction_number_positive CHECK (number > 0)
            )
        """)
        columns = (
            "id, series, number, name, slug, summary, reaction_class, status, "
            "notes, created_at, updated_at"
        )
        cursor.execute(
            f"INSERT INTO reactions__series_upgrade ({columns}) "
            f"SELECT {columns} FROM reactions"
        )
        old_count = cursor.execute("SELECT COUNT(*) FROM reactions").fetchone()[0]
        new_count = cursor.execute(
            "SELECT COUNT(*) FROM reactions__series_upgrade"
        ).fetchone()[0]
        if old_count != new_count:
            raise RuntimeError("Reaction series migration row count mismatch")
        cursor.execute("DROP TABLE reactions")
        cursor.execute("ALTER TABLE reactions__series_upgrade RENAME TO reactions")
        cursor.execute("CREATE INDEX ix_reactions_name ON reactions (name)")
        cursor.execute("CREATE INDEX ix_reactions_number ON reactions (number)")
        cursor.execute("CREATE INDEX ix_reactions_reaction_class ON reactions (reaction_class)")
        cursor.execute("CREATE INDEX ix_reactions_series ON reactions (series)")
        cursor.execute("CREATE UNIQUE INDEX ix_reactions_slug ON reactions (slug)")
        cursor.execute("CREATE INDEX ix_reactions_status ON reactions (status)")
        violations = cursor.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError(f"Reaction series migration broke foreign keys: {violations}")
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        try:
            cursor.execute(f"PRAGMA foreign_keys={'ON' if foreign_keys_enabled else 'OFF'}")
        finally:
            cursor.close()
            raw_connection.close()


def initialize_number_counters(engine: Engine) -> None:
    """Persist high-water marks so deleting the highest code never enables reuse."""
    tables = set(inspect(engine).get_table_names())
    if "app_settings" not in tables:
        return
    pairs = []
    if "drugs" in tables:
        pairs.append(("drug_number_high_water", "drug_used_numbers", "drugs"))
    if "structures" in tables:
        pairs.append(("structure_number_high_water", "structure_used_numbers", "structures"))
    with engine.begin() as connection:
        for key, used_key, table in pairs:
            current_numbers = set(connection.execute(text(
                f"SELECT number FROM {table} WHERE number IS NOT NULL"
            )).scalars())
            maximum = max(current_numbers, default=0)
            current = connection.execute(text(
                "SELECT value FROM app_settings WHERE key = :key"
            ), {"key": key}).scalar_one_or_none()
            recorded = int(current) if current and str(current).isdigit() else 0
            high_water = max(maximum, recorded)
            if current is None:
                connection.execute(text(
                    "INSERT INTO app_settings (key, value, updated_at) "
                    "VALUES (:key, :value, CURRENT_TIMESTAMP)"
                ), {"key": key, "value": str(high_water)})
            elif high_water > recorded:
                connection.execute(text(
                    "UPDATE app_settings SET value = :value, updated_at = CURRENT_TIMESTAMP "
                    "WHERE key = :key"
                ), {"key": key, "value": str(high_water)})
            used_value = connection.execute(text(
                "SELECT value FROM app_settings WHERE key = :key"
            ), {"key": used_key}).scalar_one_or_none()
            try:
                used_numbers = {int(value) for value in json.loads(used_value)} if used_value else set()
            except (TypeError, ValueError):
                used_numbers = set()
            encoded = json.dumps(sorted(used_numbers | current_numbers))
            if used_value is None:
                connection.execute(text(
                    "INSERT INTO app_settings (key, value, updated_at) "
                    "VALUES (:key, :value, CURRENT_TIMESTAMP)"
                ), {"key": used_key, "value": encoded})
            elif encoded != used_value:
                connection.execute(text(
                    "UPDATE app_settings SET value = :value, updated_at = CURRENT_TIMESTAMP "
                    "WHERE key = :key"
                ), {"key": used_key, "value": encoded})
