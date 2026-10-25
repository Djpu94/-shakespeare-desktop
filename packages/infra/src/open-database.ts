import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { migrateDatabase } from "./migrate-database.js";

export function openDatabase(databasePath: string): Database.Database {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);

  try {
    database.pragma("journal_mode = WAL");
    migrateDatabase(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
