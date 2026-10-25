import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { BinderNodeSchema, NodeMetadataSchema } from "@shakespeare/shared";
import type {
  BinderNode,
  CreateBinderNodeInput,
  MoveBinderNodeInput,
  UpdateBinderNodeInput,
} from "@shakespeare/shared";
import type { BinderNodeRepository } from "@shakespeare/domain";
import { ApplicationError } from "@shakespeare/domain";

interface BinderNodeRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  kind: string;
  title: string;
  sort_order: number;
  content: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function mapBinderNode(row: BinderNodeRow): BinderNode {
  const metadata = NodeMetadataSchema.parse(
    JSON.parse(row.metadata) as unknown,
  );
  return BinderNodeSchema.parse({
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    kind: row.kind,
    title: row.title,
    position: row.sort_order,
    content: row.content,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const NODE_COLUMNS =
  "id, project_id, parent_id, kind, title, sort_order, content, metadata, created_at, updated_at";

export class SqliteBinderNodeRepository implements BinderNodeRepository {
  constructor(private readonly database: Database.Database) {}

  create(input: CreateBinderNodeInput): BinderNode {
    return this.database
      .transaction(() => {
        this.ensureProjectExists(input.projectId);
        this.ensureParentIsFolder(input.parentId, input.projectId);

        const position = this.getSiblingIds(
          input.projectId,
          input.parentId,
        ).length;
        const timestamp = new Date().toISOString();
        const row: BinderNodeRow = {
          id: randomUUID(),
          project_id: input.projectId,
          parent_id: input.parentId,
          kind: input.kind,
          title: input.title,
          sort_order: position,
          content: input.content,
          metadata: JSON.stringify(NodeMetadataSchema.parse(input.metadata)),
          created_at: timestamp,
          updated_at: timestamp,
        };

        this.database
          .prepare(
            `INSERT INTO binder_nodes (${NODE_COLUMNS})
           VALUES (@id, @project_id, @parent_id, @kind, @title, @sort_order,
             @content, @metadata, @created_at, @updated_at)`,
          )
          .run(row);

        return mapBinderNode(row);
      })
      .immediate();
  }

  findById(nodeId: string): BinderNode | undefined {
    const row = this.database
      .prepare(`SELECT ${NODE_COLUMNS} FROM binder_nodes WHERE id = ?`)
      .get(nodeId) as BinderNodeRow | undefined;

    return row === undefined ? undefined : mapBinderNode(row);
  }

  findByProjectId(projectId: string): BinderNode[] {
    this.ensureProjectExists(projectId);

    const rows = this.database
      .prepare(
        `SELECT ${NODE_COLUMNS} FROM binder_nodes
         WHERE project_id = ?
         ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END,
           parent_id, sort_order, id`,
      )
      .all(projectId) as BinderNodeRow[];

    return rows.map(mapBinderNode);
  }

  update(input: UpdateBinderNodeInput): BinderNode {
    const current = this.findById(input.nodeId);
    if (current === undefined) {
      throw new ApplicationError("NOT_FOUND", "Binder node was not found.");
    }
    if (current.kind === "folder" && input.content != null) {
      throw new ApplicationError(
        "INVALID_OPERATION",
        "Folders cannot contain document text.",
      );
    }

    const updated = BinderNodeSchema.parse({
      ...current,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.content === undefined ? {} : { content: input.content }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      updatedAt: new Date().toISOString(),
    });

    this.database
      .prepare(
        `UPDATE binder_nodes
         SET title = ?, content = ?, metadata = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.title,
        updated.content,
        JSON.stringify(updated.metadata),
        updated.updatedAt,
        updated.id,
      );

    return updated;
  }

  delete(nodeId: string): void {
    const result = this.database
      .prepare("DELETE FROM binder_nodes WHERE id = ?")
      .run(nodeId);

    if (result.changes === 0) {
      throw new ApplicationError("NOT_FOUND", "Binder node was not found.");
    }
  }

  move(input: MoveBinderNodeInput): BinderNode {
    return this.database
      .transaction(() => {
        const node = this.findById(input.nodeId);
        if (node === undefined) {
          throw new ApplicationError("NOT_FOUND", "Binder node was not found.");
        }

        this.ensureParentIsFolder(input.parentId, node.projectId);
        this.ensureMoveDoesNotCreateCycle(node.id, input.parentId);

        const oldSiblings = this.getSiblingIds(node.projectId, node.parentId);
        const destinationSiblings = this.getSiblingIds(
          node.projectId,
          input.parentId,
        ).filter((siblingId) => siblingId !== node.id);
        if (input.position > destinationSiblings.length) {
          throw new ApplicationError(
            "INVALID_OPERATION",
            "The requested binder position is out of range.",
          );
        }

        destinationSiblings.splice(input.position, 0, node.id);
        const affectedIds = [
          ...new Set([...oldSiblings, ...destinationSiblings]),
        ];
        const maxPosition = this.database
          .prepare(
            "SELECT COALESCE(MAX(sort_order), 0) AS max_position FROM binder_nodes WHERE project_id = ?",
          )
          .get(node.projectId) as { max_position: number };
        const stagingOffset = maxPosition.max_position + affectedIds.length + 1;

        const updatePosition = this.database.prepare(
          "UPDATE binder_nodes SET sort_order = ? WHERE id = ?",
        );
        affectedIds.forEach((id, index) => {
          updatePosition.run(stagingOffset + index, id);
        });

        this.database
          .prepare(
            "UPDATE binder_nodes SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            input.parentId,
            input.position,
            new Date().toISOString(),
            node.id,
          );

        oldSiblings
          .filter((id) => id !== node.id && !destinationSiblings.includes(id))
          .forEach((id, index) => updatePosition.run(index, id));
        destinationSiblings.forEach((id, index) => {
          if (id !== node.id) {
            updatePosition.run(index, id);
          }
        });

        const moved = this.findById(node.id);
        if (moved === undefined) {
          throw new ApplicationError(
            "INTERNAL_ERROR",
            "Moved node was not found.",
          );
        }
        return moved;
      })
      .immediate();
  }

  private ensureProjectExists(projectId: string): void {
    const project = this.database
      .prepare("SELECT 1 FROM projects WHERE id = ?")
      .get(projectId);

    if (project === undefined) {
      throw new ApplicationError("NOT_FOUND", "Project was not found.");
    }
  }

  private ensureParentIsFolder(
    parentId: string | null,
    projectId: string,
  ): void {
    if (parentId === null) {
      return;
    }

    const parent = this.database
      .prepare("SELECT kind FROM binder_nodes WHERE id = ? AND project_id = ?")
      .get(parentId, projectId) as { kind: string } | undefined;

    if (parent === undefined) {
      throw new ApplicationError("NOT_FOUND", "Parent folder was not found.");
    }
    if (parent.kind !== "folder") {
      throw new ApplicationError(
        "INVALID_OPERATION",
        "Binder nodes can only be placed inside folders.",
      );
    }
  }

  private ensureMoveDoesNotCreateCycle(
    nodeId: string,
    parentId: string | null,
  ): void {
    if (parentId === null) {
      return;
    }

    const cycle = this.database
      .prepare(
        `WITH RECURSIVE descendants(id) AS (
           SELECT id FROM binder_nodes WHERE id = ?
           UNION ALL
           SELECT child.id FROM binder_nodes child
           JOIN descendants parent ON child.parent_id = parent.id
         )
         SELECT 1 FROM descendants WHERE id = ? LIMIT 1`,
      )
      .get(nodeId, parentId);

    if (cycle !== undefined) {
      throw new ApplicationError(
        "INVALID_OPERATION",
        "A binder node cannot be moved into its own subtree.",
      );
    }
  }

  private getSiblingIds(projectId: string, parentId: string | null): string[] {
    const rows = this.database
      .prepare(
        `SELECT id FROM binder_nodes
         WHERE project_id = ? AND parent_id IS ?
         ORDER BY sort_order, id`,
      )
      .all(projectId, parentId) as Array<{ id: string }>;

    return rows.map((row) => row.id);
  }
}
