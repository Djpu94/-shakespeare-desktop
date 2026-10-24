import type Database from "better-sqlite3";
import type { Scene, SceneRepository } from "@shakespeare/domain";

export class SqliteSceneRepository implements SceneRepository {
  constructor(private readonly database: Database.Database) {}

  findById(id: string): Scene | undefined {
    const row = this.database
      .prepare(
        "SELECT id, title, synopsis, created_at FROM scenes WHERE id = ?",
      )
      .get(id) as SceneRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      title: row.title,
      ...(row.synopsis === null ? {} : { synopsis: row.synopsis }),
      createdAt: row.created_at,
    };
  }

  save(scene: Scene): void {
    this.database
      .prepare(
        "INSERT INTO scenes (id, title, synopsis, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(scene.id, scene.title, scene.synopsis ?? null, scene.createdAt);
  }
}

interface SceneRow {
  id: string;
  title: string;
  synopsis: string | null;
  created_at: string;
}
