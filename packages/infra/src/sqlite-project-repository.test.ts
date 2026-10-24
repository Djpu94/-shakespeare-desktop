import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationError } from "@shakespeare/domain";
import { migrateDatabase } from "./migrate-database.js";
import { SqliteBinderNodeRepository } from "./sqlite-binder-node-repository.js";
import { SqliteProjectRepository } from "./sqlite-project-repository.js";

describe("SQLite project and binder repositories", () => {
  const databases: Database.Database[] = [];

  function createRepositories() {
    const database = new Database(":memory:");
    databases.push(database);
    migrateDatabase(database);
    return {
      database,
      projectRepository: new SqliteProjectRepository(database),
      binderNodeRepository: new SqliteBinderNodeRepository(database),
    };
  }

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.close();
    }
  });

  it("creates, reads, updates, and deletes projects with cascade deletion", () => {
    const { projectRepository, binderNodeRepository } = createRepositories();
    const project = projectRepository.create({
      name: "  Novel  ",
      mode: "fiction",
    });

    expect(projectRepository.findById(project.id)).toEqual(project);
    expect(projectRepository.findAll()).toEqual([project]);

    const updated = projectRepository.update({
      projectId: project.id,
      name: "Revised novel",
      mode: "simple",
    });
    expect(updated).toMatchObject({
      id: project.id,
      name: "Revised novel",
      mode: "simple",
    });
    expect(updated.updatedAt).toBeTruthy();

    const node = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "scene",
      title: "Opening",
      content: "Once upon a time.",
      metadata: {},
    });

    projectRepository.delete(project.id);
    expect(projectRepository.findById(project.id)).toBeUndefined();
    expect(binderNodeRepository.findById(node.id)).toBeUndefined();
    expect(() => projectRepository.delete(project.id)).toThrowError(
      ApplicationError,
    );
  });

  it("persists both modes across database reopen without changing binder content", () => {
    const directory = mkdtempSync(join(tmpdir(), "shakespeare-project-mode-"));
    const databasePath = join(directory, "project.db");
    let database: Database.Database | undefined;

    try {
      database = new Database(databasePath);
      migrateDatabase(database);
      const projectRepository = new SqliteProjectRepository(database);
      const binderNodeRepository = new SqliteBinderNodeRepository(database);
      const project = projectRepository.create({
        name: "A story",
        mode: "simple",
      });
      const scene = binderNodeRepository.create({
        projectId: project.id,
        parentId: null,
        kind: "scene",
        title: "Opening scene",
        content: "The first line.",
        metadata: { draft: true },
      });
      const document = binderNodeRepository.create({
        projectId: project.id,
        parentId: null,
        kind: "document",
        title: "Notes",
        content: "Keep this note.",
        metadata: {},
      });

      database.close();
      database = new Database(databasePath);
      migrateDatabase(database);
      const reopenedProjectRepository = new SqliteProjectRepository(database);
      const reopenedBinderRepository = new SqliteBinderNodeRepository(database);

      expect(reopenedProjectRepository.findById(project.id)?.mode).toBe(
        "simple",
      );
      const nodesBeforeChange = reopenedBinderRepository.findByProjectId(
        project.id,
      );
      expect(nodesBeforeChange).toEqual([scene, document]);

      reopenedProjectRepository.update({
        projectId: project.id,
        mode: "fiction",
      });
      expect(reopenedBinderRepository.findByProjectId(project.id)).toEqual(
        nodesBeforeChange,
      );

      database.close();
      database = new Database(databasePath);
      migrateDatabase(database);
      const finalProjectRepository = new SqliteProjectRepository(database);
      const finalBinderRepository = new SqliteBinderNodeRepository(database);

      expect(finalProjectRepository.findById(project.id)?.mode).toBe("fiction");
      expect(finalBinderRepository.findByProjectId(project.id)).toEqual(
        nodesBeforeChange,
      );
    } finally {
      if (database?.open) {
        database.close();
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("creates and updates node content and metadata, preserving sibling order", () => {
    const { projectRepository, binderNodeRepository } = createRepositories();
    const project = projectRepository.create({
      name: "Draft",
      mode: "simple",
    });

    const folder = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "folder",
      title: "Part One",
      content: null,
      metadata: {},
    });
    const scene = binderNodeRepository.create({
      projectId: project.id,
      parentId: folder.id,
      kind: "scene",
      title: "Opening",
      content: null,
      metadata: {},
    });

    const updated = binderNodeRepository.update({
      nodeId: scene.id,
      title: "New opening",
      content: "Beginning text.",
      metadata: { color: "blue", tags: ["intro"] },
    });

    expect(updated).toMatchObject({
      title: "New opening",
      content: "Beginning text.",
      metadata: { color: "blue", tags: ["intro"] },
      parentId: folder.id,
      position: 0,
    });
    expect(
      binderNodeRepository.findByProjectId(project.id).map((node) => node.id),
    ).toEqual([folder.id, scene.id]);
    expect(() =>
      binderNodeRepository.create({
        projectId: project.id,
        parentId: scene.id,
        kind: "scene",
        title: "Invalid child",
        content: null,
        metadata: {},
      }),
    ).toThrowError(ApplicationError);
  });

  it("deletes a binder subtree and rejects content on folders", () => {
    const { projectRepository, binderNodeRepository } = createRepositories();
    const project = projectRepository.create({
      name: "Tree",
      mode: "fiction",
    });
    const folder = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "folder",
      title: "Chapter",
      content: null,
      metadata: {},
    });
    const scene = binderNodeRepository.create({
      projectId: project.id,
      parentId: folder.id,
      kind: "scene",
      title: "Scene",
      content: "Text",
      metadata: {},
    });

    expect(() =>
      binderNodeRepository.update({ nodeId: folder.id, content: "invalid" }),
    ).toThrowError(ApplicationError);
    binderNodeRepository.delete(folder.id);
    expect(binderNodeRepository.findById(folder.id)).toBeUndefined();
    expect(binderNodeRepository.findById(scene.id)).toBeUndefined();
  });

  it("moves nodes while maintaining contiguous stable sibling positions", () => {
    const { projectRepository, binderNodeRepository } = createRepositories();
    const project = projectRepository.create({
      name: "Outline",
      mode: "fiction",
    });
    const first = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "folder",
      title: "First",
      content: null,
      metadata: {},
    });
    const second = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "folder",
      title: "Second",
      content: null,
      metadata: {},
    });
    const third = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "scene",
      title: "Third",
      content: "",
      metadata: {},
    });
    const nestedFolder = binderNodeRepository.create({
      projectId: project.id,
      parentId: first.id,
      kind: "folder",
      title: "Nested",
      content: null,
      metadata: {},
    });

    binderNodeRepository.move({
      nodeId: third.id,
      parentId: null,
      position: 0,
    });
    expect(
      binderNodeRepository
        .findByProjectId(project.id)
        .filter((node) => node.parentId === null)
        .map(({ id, position }) => [id, position]),
    ).toEqual([
      [third.id, 0],
      [first.id, 1],
      [second.id, 2],
    ]);

    binderNodeRepository.move({
      nodeId: second.id,
      parentId: first.id,
      position: 1,
    });
    expect(binderNodeRepository.findById(second.id)).toMatchObject({
      parentId: first.id,
      position: 1,
    });
    expect(
      binderNodeRepository
        .findByProjectId(project.id)
        .filter((node) => node.parentId === first.id)
        .map(({ id, position }) => [id, position]),
    ).toEqual([
      [nestedFolder.id, 0],
      [second.id, 1],
    ]);
    expect(() =>
      binderNodeRepository.move({
        nodeId: first.id,
        parentId: nestedFolder.id,
        position: 0,
      }),
    ).toThrowError(ApplicationError);
    expect(() =>
      binderNodeRepository.move({
        nodeId: third.id,
        parentId: null,
        position: 99,
      }),
    ).toThrowError(ApplicationError);
  });

  it("rolls back every position change when a reorder fails", () => {
    const { database, projectRepository, binderNodeRepository } =
      createRepositories();
    const project = projectRepository.create({
      name: "Rollback",
      mode: "simple",
    });
    const first = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "scene",
      title: "First",
      content: "",
      metadata: {},
    });
    const second = binderNodeRepository.create({
      projectId: project.id,
      parentId: null,
      kind: "scene",
      title: "Second",
      content: "",
      metadata: {},
    });
    database.exec(`
      CREATE TRIGGER fail_staged_reorder
      BEFORE UPDATE OF sort_order ON binder_nodes
      WHEN NEW.sort_order >= 3
      BEGIN
        SELECT RAISE(ABORT, 'forced reorder failure');
      END;
    `);

    expect(() =>
      binderNodeRepository.move({
        nodeId: second.id,
        parentId: null,
        position: 0,
      }),
    ).toThrow("forced reorder failure");
    expect(
      binderNodeRepository
        .findByProjectId(project.id)
        .map(({ id, position }) => [id, position]),
    ).toEqual([
      [first.id, 0],
      [second.id, 1],
    ]);
  });
});
