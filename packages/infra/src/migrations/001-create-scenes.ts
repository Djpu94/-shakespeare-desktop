import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  up(database: Database.Database): void;
}

export const MIGRATIONS = [
  {
    version: 1,
    name: "create-scenes",
    up(database: Database.Database): void {
      database.exec(`
        CREATE TABLE IF NOT EXISTS scenes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          synopsis TEXT,
          created_at TEXT NOT NULL
        )
      `);
    },
  },
] satisfies readonly Migration[];
