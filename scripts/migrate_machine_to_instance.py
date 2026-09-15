"""One-off migration: rename the Machine entity to Instance in an existing database.

The app has no migration framework — `db.create_all()` only creates tables that are
missing. After the rename that is exactly the problem: it would happily create a new,
empty `instances` table and leave every existing row stranded in `machines`, so the
lifter's history would look deleted while still sitting on disk.

Safe to run more than once; a database that is already migrated is left alone.

    python3 scripts/migrate_machine_to_instance.py [path/to/rattlesnake.db]
"""

import os
import shutil
import sqlite3
import sys
from datetime import datetime

DEFAULT_DB = os.path.join(os.path.dirname(__file__), "..", "rattlesnake.db")


def table_names(conn):
    return {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}


def column_names(conn, table):
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def migrate(db_path):
    if not os.path.exists(db_path):
        print(f"No database at {db_path} — nothing to migrate.")
        return 0

    conn = sqlite3.connect(db_path)
    tables = table_names(conn)

    if "machines" not in tables and "instances" in tables:
        print("Already migrated.")
        conn.close()
        return 0
    if "machines" not in tables:
        print("No `machines` table — nothing to migrate.")
        conn.close()
        return 0

    conn.close()
    backup = f"{db_path}.bak-{datetime.now():%Y%m%d-%H%M%S}"
    shutil.copy2(db_path, backup)
    print(f"Backup written to {backup}")

    conn = sqlite3.connect(db_path)
    try:
        # Foreign keys must be off for the rename; SQLite rewrites the references
        # in dependent tables itself, and we verify that below before committing.
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("BEGIN")

        conn.execute("ALTER TABLE machines RENAME TO instances")
        print("machines -> instances")

        if "machine_id" in column_names(conn, "session_entries"):
            conn.execute(
                "ALTER TABLE session_entries RENAME COLUMN machine_id TO instance_id"
            )
            print("session_entries.machine_id -> instance_id")

        violations = list(conn.execute("PRAGMA foreign_key_check"))
        if violations:
            raise RuntimeError(f"foreign key check failed: {violations}")

        conn.execute("COMMIT")
        conn.execute("PRAGMA foreign_keys=ON")
    except Exception:
        conn.execute("ROLLBACK")
        conn.close()
        shutil.copy2(backup, db_path)
        print(f"Migration failed — {db_path} restored from {backup}")
        raise

    counts = {
        t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        for t in ("exercises", "instances", "sessions", "session_entries", "session_sets")
    }
    conn.close()
    print("Migrated:", ", ".join(f"{k}={v}" for k, v in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(migrate(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB))
