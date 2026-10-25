import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationError } from "@shakespeare/domain";
import { migrateDatabase } from "./migrate-database.js";
import { SqliteBinderNodeRepository } from "./sqlite-binder-node-repository.js";
import { SqliteProjectRepository } from "./sqlite-project-repository.js";

describe("Binder integration", () => {
  const directories: string[] = [];
  const databases: Database.Database[] = [];

  function openDatabaseFile() {
    const directory = mkdtempSync(join(tmpdir(), "shakespeare-binder-"));
    directories.push(directory);
    const database = new Database(join(directory, "binder.db"));
    databases.push(database);
    migrateDatabase(database);
    return {
      database,
      projectRepository: new SqliteProjectRepository(database),
      binderNodeRepository: new SqliteBinderNodeRepository(database),
    };
  }

  function reopen(database: Database.Database) {
    const databasePath = database.name;
    database.close();
    const reopened = new Database(databasePath);
    databases.push(reopened);
    migrateDatabase(reopened);
    return {
      projectRepository: new SqliteProjectRepository(reopened),
      binderNodeRepository: new SqliteBinderNodeRepository(reopened),
    };
  }

  afterEach(() => {
    for (const database of databases.splice(0)) {
      if (database.open) {
        database.close();
      }
    }
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("persists CRUD, moves, and deletions across a database reopen", () => {
    const { database, projectRepository, binderNodeRepository } =
      openDatabaseFile();
    const project = projectRepository.create({
      name: "Persisted novel",
      mode: "fiction",
    });
    const chapter = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "folder",
      title: "Chapter one",
      content: null,
      metadata: {},
    });
    const opening = binderNodeRepository.create({
      projectId: project.id,
      parentId: chapter.id,
      kind: "scene",
      title: "Opening",
      content: "First line.",
      metadata: {},
    });
    const finale = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "scene",
      title: "Finale",
      content: "Last line.",
      metadata: {},
    });

    binderNodeRepository.move({
      nodeId: finale.id,
      parentId: chapter.id,
      position: 1,
    });
    binderNodeRepository.update({
      nodeId: opening.id,
      title: "Opening (revised)",
    });
    binderNodeRepository.delete(finale.id);

    const {
      projectRepository: reopenedProjects,
      binderNodeRepository: reopenedNodes,
    } = reopen(database);

    expect(reopenedProjects.findById(project.id)?.name).toBe("Persisted novel");
    expect(
      reopenedNodes
        .findByProjectId(project.id)
        .map(({ id, parentId, position, title }) => ({
          id,
          parentId,
          position,
          title,
        })),
    ).toEqual([
      { id: chapter.id, parentId: null, position: 0, title: "Chapter one" },
      {
        id: opening.id,
        parentId: chapter.id,
        position: 0,
        title: "Opening (revised)",
      },
    ]);
  });

  it("rejects invalid moves without altering the persisted hierarchy", () => {
    const { projectRepository, binderNodeRepository } = openDatabaseFile();
    const project = projectRepository.create({
      name: "Guarded binder",
      mode: "simple",
    });
    const folder = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "folder",
      title: "Folder",
      content: null,
      metadata: {},
    });
    const child = binderNodeRepository.create({
      projectId: project.id,
      parentId: folder.id,
      kind: "folder",
      title: "Child",
      content: null,
      metadata: {},
    });
    const scene = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "scene",
      title: "Scene",
      content: "",
      metadata: {},
    });
    const before = binderNodeRepository.findByProjectId(project.id);

    expect(() =>
      binderNodeRepository.move({
        nodeId: folder.id,
        parentId: child.id,
        position: 0,
      }),
    ).toThrowError(ApplicationError);
    expect(() =>
      binderNodeRepository.move({
        nodeId: scene.id,
        parentId: scene.id,
        position: 0,
      }),
    ).toThrowError(ApplicationError);
    expect(() =>
      binderNodeRepository.move({
        nodeId: scene.id,
        parentId: folder.id,
        position: 99,
      }),
    ).toThrowError(ApplicationError);
    expect(binderNodeRepository.findByProjectId(project.id)).toEqual(before);
  });
});
