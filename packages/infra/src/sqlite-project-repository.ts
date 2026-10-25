import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { ProjectSchema } from "@shakespeare/shared";
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
} from "@shakespeare/shared";
import type { ProjectRepository } from "@shakespeare/domain";
import { ApplicationError } from "@shakespeare/domain";

interface ProjectRow {
  id: string;
  name: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

function mapProject(row: ProjectRow): Project {
  return ProjectSchema.parse({
    id: row.id,
    name: row.name,
    mode: row.mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly database: Database.Database) {}

  create(input: CreateProjectInput): Project {
    const timestamp = new Date().toISOString();
    const row: ProjectRow = {
      id: randomUUID(),
      name: input.name,
      mode: input.mode,
      created_at: timestamp,
      updated_at: timestamp,
    };

    this.database
      .prepare(
        `INSERT INTO projects (id, name, mode, created_at, updated_at)
         VALUES (@id, @name, @mode, @created_at, @updated_at)`,
      )
      .run(row);

    return mapProject(row);
  }

  findById(projectId: string): Project | undefined {
    const row = this.database
      .prepare(
        "SELECT id, name, mode, created_at, updated_at FROM projects WHERE id = ?",
      )
      .get(projectId) as ProjectRow | undefined;

    return row === undefined ? undefined : mapProject(row);
  }

  findAll(): Project[] {
    const rows = this.database
      .prepare(
        "SELECT id, name, mode, created_at, updated_at FROM projects ORDER BY updated_at DESC, id",
      )
      .all() as ProjectRow[];

    return rows.map(mapProject);
  }

  update(input: UpdateProjectInput): Project {
    const current = this.findById(input.projectId);
    if (current === undefined) {
      throw new ApplicationError("NOT_FOUND", "Project was not found.");
    }

    const updated: Project = {
      ...current,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      updatedAt: new Date().toISOString(),
    };

    this.database
      .prepare(
        "UPDATE projects SET name = ?, mode = ?, updated_at = ? WHERE id = ?",
      )
      .run(updated.name, updated.mode, updated.updatedAt, updated.id);

    return updated;
  }

  delete(projectId: string): void {
    const result = this.database
      .prepare("DELETE FROM projects WHERE id = ?")
      .run(projectId);

    if (result.changes === 0) {
      throw new ApplicationError("NOT_FOUND", "Project was not found.");
    }
  }
}
