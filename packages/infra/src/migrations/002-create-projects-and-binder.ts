import type Database from "better-sqlite3";
import type { Migration } from "./001-create-scenes.js";

export const PROJECT_AND_BINDER_MIGRATION = {
  version: 2,
  name: "create-projects-and-binder",
  up(database: Database.Database): void {
    database.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
        mode TEXT NOT NULL CHECK (mode IN ('fiction', 'simple')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_projects_updated_at ON projects (updated_at DESC);

      CREATE TABLE binder_nodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        parent_id TEXT,
        kind TEXT NOT NULL CHECK (
          kind IN ('folder', 'scene', 'document', 'character', 'location', 'research', 'plot')
        ),
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
        sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
        content TEXT,
        metadata TEXT NOT NULL DEFAULT '{}'
          CHECK (json_valid(metadata) AND json_type(metadata) = 'object'),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id, project_id)
          REFERENCES binder_nodes (id, project_id) ON DELETE CASCADE,
        UNIQUE (id, project_id),
        CHECK (kind != 'folder' OR content IS NULL)
      );

      CREATE UNIQUE INDEX idx_binder_nodes_root_order
        ON binder_nodes (project_id, sort_order) WHERE parent_id IS NULL;
      CREATE UNIQUE INDEX idx_binder_nodes_child_order
        ON binder_nodes (project_id, parent_id, sort_order) WHERE parent_id IS NOT NULL;
      CREATE INDEX idx_binder_nodes_project ON binder_nodes (project_id);
      CREATE INDEX idx_binder_nodes_parent ON binder_nodes (parent_id);
      CREATE INDEX idx_binder_nodes_kind ON binder_nodes (project_id, kind);

      CREATE TRIGGER validate_binder_node_parent_insert
      BEFORE INSERT ON binder_nodes
      WHEN NEW.parent_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM binder_nodes
          WHERE id = NEW.parent_id
            AND project_id = NEW.project_id
            AND kind = 'folder'
        )
      BEGIN
        SELECT RAISE(ABORT, 'Binder parent must be a folder in the same project');
      END;

      CREATE TRIGGER validate_binder_node_parent_update
      BEFORE UPDATE OF parent_id, project_id ON binder_nodes
      WHEN NEW.parent_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM binder_nodes
          WHERE id = NEW.parent_id
            AND project_id = NEW.project_id
            AND kind = 'folder'
        )
      BEGIN
        SELECT RAISE(ABORT, 'Binder parent must be a folder in the same project');
      END;
    `);
  },
} satisfies Migration;
