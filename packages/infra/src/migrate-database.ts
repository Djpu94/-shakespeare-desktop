import type Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations/001-create-scenes.js";
import { PROJECT_AND_BINDER_MIGRATION } from "./migrations/002-create-projects-and-binder.js";

const ALL_MIGRATIONS = [...MIGRATIONS, PROJECT_AND_BINDER_MIGRATION];

interface MigrationRow {
  version: number | null;
}

export function migrateDatabase(database: Database.Database): void {
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const appliedVersion = database
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get() as MigrationRow | undefined;
  const latestKnownVersion = ALL_MIGRATIONS.at(-1)?.version ?? 0;

  if ((appliedVersion?.version ?? 0) > latestKnownVersion) {
    throw new Error(
      "Database contains a migration newer than this application",
    );
  }

  const hasMigration = database.prepare(
    "SELECT 1 FROM schema_migrations WHERE version = ?",
  );
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
  );

  for (const migration of ALL_MIGRATIONS) {
    if (hasMigration.get(migration.version)) {
      continue;
    }

    database.transaction(() => {
      migration.up(database);
      recordMigration.run(migration.version, migration.name);
    })();
  }
}
