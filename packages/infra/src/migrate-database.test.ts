import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "./migrate-database.js";
import { SqliteSceneRepository } from "./sqlite-scene-repository.js";

describe("migrateDatabase", () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.close();
    }
  });

  it("applies migrations once and preserves existing data on rerun", () => {
    const database = new Database(":memory:");
    databases.push(database);

    migrateDatabase(database);
    database
      .prepare(
        "INSERT INTO scenes (id, title, synopsis, created_at) VALUES (?, ?, ?, ?)",
      )
      .run("scene-1", "Opening", null, "2026-01-01T00:00:00.000Z");

    migrateDatabase(database);

    expect(
      database.prepare("SELECT version, name FROM schema_migrations").all(),
    ).toEqual([
      { version: 1, name: "create-scenes" },
      { version: 2, name: "create-projects-and-binder" },
    ]);
    expect(new SqliteSceneRepository(database).findById("scene-1")).toEqual({
      id: "scene-1",
      title: "Opening",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("adopts the existing scenes table without losing its data", () => {
    const database = new Database(":memory:");
    databases.push(database);
    database.exec(`
      CREATE TABLE scenes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        synopsis TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO scenes (id, title, synopsis, created_at)
      VALUES ('scene-legacy', 'Legacy', NULL, '2026-01-01T00:00:00.000Z');
    `);

    migrateDatabase(database);

    expect(
      new SqliteSceneRepository(database).findById("scene-legacy"),
    ).toEqual({
      id: "scene-legacy",
      title: "Legacy",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("upgrades a version-one database and preserves its existing rows", () => {
    const database = new Database(":memory:");
    databases.push(database);
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO schema_migrations (version, name) VALUES (1, 'create-scenes');
      CREATE TABLE scenes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        synopsis TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO scenes (id, title, synopsis, created_at)
      VALUES ('scene-existing', 'Existing', 'Kept', '2026-01-01T00:00:00.000Z');
    `);

    migrateDatabase(database);
    migrateDatabase(database);

    expect(
      database
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: 1 }, { version: 2 }]);
    expect(
      database.prepare("SELECT id, title, synopsis FROM scenes").all(),
    ).toEqual([{ id: "scene-existing", title: "Existing", synopsis: "Kept" }]);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'binder_nodes'",
        )
        .get(),
    ).toEqual({ name: "binder_nodes" });
  });

  it("rejects databases created by a newer application", () => {
    const database = new Database(":memory:");
    databases.push(database);
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name) VALUES (999, 'future');
    `);

    expect(() => migrateDatabase(database)).toThrow(
      "Database contains a migration newer than this application",
    );
  });
});
