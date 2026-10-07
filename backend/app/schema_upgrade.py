import json

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def upgrade_schema(engine: Engine) -> None:
    """Apply minimal additive SQLite upgrades before SQLAlchemy create_all()."""
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    if "drugs" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("drugs")}
    with engine.begin() as connection:
        if "number" not in columns:
            connection.execute(text("ALTER TABLE drugs ADD COLUMN number INTEGER"))
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
