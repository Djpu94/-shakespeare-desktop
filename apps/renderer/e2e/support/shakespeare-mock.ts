import type { Page } from "@playwright/test";
import type { BinderNode, Project } from "@shakespeare/shared";

export const SHAKESPEARE_MOCK_STORAGE_KEY = "shakespeare.e2e.state.v1";
export const SHAKESPEARE_MOCK_FAIL_NEXT_MOVE_KEY =
  "shakespeare.e2e.fail-next-move";
export const SHAKESPEARE_MOCK_FAIL_NEXT_CONTENT_SAVE_KEY =
  "shakespeare.e2e.fail-next-content-save";
export const SHAKESPEARE_MOCK_CONTENT_SAVE_DELAY_KEY =
  "shakespeare.e2e.content-save-delay";
export const SHAKESPEARE_MOCK_WRITE_LOG_KEY = "shakespeare.e2e.write-log";

export interface ShakespeareMockContentWrite {
  readonly nodeId: string;
  readonly content: string;
  readonly ok: boolean;
  readonly at: string;
}

export interface ShakespeareMockSeed {
  projects?: Project[];
  nodes?: BinderNode[];
}

/**
 * Installs a persistent, in-browser Shakespeare API for the renderer preview.
 * State lives in localStorage, so reloading the page exercises the same
 * persistence path a user sees after reopening the desktop application.
 */
export async function installShakespeareMock(
  page: Page,
  seed: ShakespeareMockSeed = {},
): Promise<void> {
  await page.addInitScript(
    ({
      storageKey,
      failNextMoveKey,
      failNextContentSaveKey,
      contentSaveDelayKey,
      writeLogKey,
      seedProjects,
      seedNodes,
    }) => {
      interface MockProject {
        id: string;
        name: string;
        mode: "fiction" | "simple";
        createdAt: string;
        updatedAt: string;
      }

      interface MockNode {
        id: string;
        projectId: string;
        parentId: string | null;
        kind:
          | "folder"
          | "scene"
          | "document"
          | "character"
          | "location"
          | "research"
          | "plot";
        title: string;
        position: number;
        content: string | null;
        metadata: Record<string, unknown>;
        createdAt: string;
        updatedAt: string;
      }

      interface MockState {
        projects: MockProject[];
        nodes: MockNode[];
      }

      interface MockFailure {
        ok: false;
        error: { code: string; message: string };
      }

      interface MockContentWrite {
        nodeId: string;
        content: string;
        ok: boolean;
        at: string;
      }

      function now(): string {
        return new Date().toISOString();
      }

      function readWriteLog(): MockContentWrite[] {
        const raw = localStorage.getItem(writeLogKey);
        if (raw === null) {
          return [];
        }
        try {
          return JSON.parse(raw) as MockContentWrite[];
        } catch {
          return [];
        }
      }

      function appendWriteLog(entry: MockContentWrite): void {
        const log = readWriteLog();
        log.push(entry);
        localStorage.setItem(writeLogKey, JSON.stringify(log));
      }

      function readSaveDelay(): number {
        const raw = localStorage.getItem(contentSaveDelayKey);
        if (raw === null) {
          return 0;
        }
        const delay = Number(raw);
        return Number.isFinite(delay) && delay > 0 ? delay : 0;
      }

      function readState(): MockState {
        const raw = localStorage.getItem(storageKey);
        if (raw === null) {
          const initial: MockState = {
            projects: seedProjects,
            nodes: seedNodes,
          };
          localStorage.setItem(storageKey, JSON.stringify(initial));
          return initial;
        }
        return JSON.parse(raw) as MockState;
      }

      function writeState(state: MockState): void {
        localStorage.setItem(storageKey, JSON.stringify(state));
      }

      function ok<T>(value: T): { ok: true; value: T } {
        return { ok: true, value };
      }

      function fail(code: string, message: string): MockFailure {
        return { ok: false, error: { code, message } };
      }

      function sortedSiblings(
        state: MockState,
        projectId: string,
        parentId: string | null,
        excludeId?: string,
      ): MockNode[] {
        return state.nodes
          .filter(
            (node) =>
              node.projectId === projectId &&
              node.parentId === parentId &&
              node.id !== excludeId,
          )
          .sort(
            (first, second) =>
              first.position - second.position ||
              first.title.localeCompare(second.title) ||
              first.id.localeCompare(second.id),
          );
      }

      function descendantIds(state: MockState, nodeId: string): string[] {
        const descendants: string[] = [];
        const queue = state.nodes
          .filter((node) => node.parentId === nodeId)
          .map((node) => node.id);
        const seen = new Set<string>();

        while (queue.length > 0) {
          const next = queue.shift();
          if (next === undefined || seen.has(next)) {
            continue;
          }
          seen.add(next);
          descendants.push(next);
          for (const child of state.nodes.filter(
            (node) => node.parentId === next,
          )) {
            queue.push(child.id);
          }
        }

        return descendants;
      }

      function isDescendant(
        state: MockState,
        ancestorId: string,
        nodeId: string,
      ): boolean {
        const byId = new Map(state.nodes.map((node) => [node.id, node]));
        const seen = new Set<string>();
        let current = byId.get(nodeId);

        while (current !== undefined && current.parentId !== null) {
          if (current.parentId === ancestorId) {
            return true;
          }
          if (seen.has(current.parentId)) {
            return false;
          }
          seen.add(current.parentId);
          current = byId.get(current.parentId);
        }

        return false;
      }

      const api = {
        getAppHealth: async () =>
          ok({ status: "ok" as const, appVersion: "0.1.0" }),

        createProject: async (input: {
          name: string;
          mode: "fiction" | "simple";
        }) => {
          const state = readState();
          const project: MockProject = {
            id: crypto.randomUUID(),
            name: input.name.trim(),
            mode: input.mode,
            createdAt: now(),
            updatedAt: now(),
          };
          state.projects.unshift(project);
          writeState(state);
          return ok(project);
        },

        getProject: async (projectId: string) => {
          const state = readState();
          return ok(
            state.projects.find((project) => project.id === projectId) ?? null,
          );
        },

        listProjects: async () => {
          const state = readState();
          return ok([...state.projects]);
        },

        updateProject: async (input: {
          projectId: string;
          name?: string;
          mode?: "fiction" | "simple";
        }) => {
          const state = readState();
          const project = state.projects.find(
            (candidate) => candidate.id === input.projectId,
          );
          if (project === undefined) {
            return fail("NOT_FOUND", "Project was not found.");
          }
          if (input.name !== undefined) {
            project.name = input.name.trim();
          }
          if (input.mode !== undefined) {
            project.mode = input.mode;
          }
          project.updatedAt = now();
          writeState(state);
          return ok({ ...project });
        },

        deleteProject: async (projectId: string) => {
          const state = readState();
          state.projects = state.projects.filter(
            (project) => project.id !== projectId,
          );
          state.nodes = state.nodes.filter(
            (node) => node.projectId !== projectId,
          );
          writeState(state);
          return ok(undefined);
        },

        createBinderNode: async (input: {
          projectId: string;
          parentId: string | null;
          kind: MockNode["kind"];
          title: string;
          content: string | null;
          metadata: Record<string, unknown>;
        }) => {
          const state = readState();
          if (
            !state.projects.some((project) => project.id === input.projectId)
          ) {
            return fail("NOT_FOUND", "Project was not found.");
          }
          if (input.parentId !== null) {
            const parent = state.nodes.find(
              (node) =>
                node.id === input.parentId &&
                node.projectId === input.projectId,
            );
            if (parent === undefined) {
              return fail("NOT_FOUND", "Parent folder was not found.");
            }
            if (parent.kind !== "folder") {
              return fail(
                "INVALID_OPERATION",
                "Binder nodes can only be placed inside folders.",
              );
            }
          }

          const siblings = sortedSiblings(
            state,
            input.projectId,
            input.parentId,
          );
          const position =
            siblings.length === 0
              ? 0
              : Math.max(...siblings.map((node) => node.position)) + 1;
          const node: MockNode = {
            id: crypto.randomUUID(),
            projectId: input.projectId,
            parentId: input.parentId,
            kind: input.kind,
            title: input.title.trim(),
            position,
            content: input.content,
            metadata: input.metadata,
            createdAt: now(),
            updatedAt: now(),
          };
          state.nodes.push(node);
          writeState(state);
          return ok({ ...node });
        },

        listBinderNodes: async (projectId: string) => {
          const state = readState();
          return ok(state.nodes.filter((node) => node.projectId === projectId));
        },

        updateBinderNode: async (input: {
          nodeId: string;
          title?: string;
          content?: string | null;
          metadata?: Record<string, unknown>;
        }) => {
          const delay = readSaveDelay();
          if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }

          const state = readState();
          const node = state.nodes.find(
            (candidate) => candidate.id === input.nodeId,
          );
          if (node === undefined) {
            return fail("NOT_FOUND", "Binder node was not found.");
          }
          if (node.kind === "folder" && input.content != null) {
            return fail(
              "INVALID_OPERATION",
              "Folders cannot contain document text.",
            );
          }
          if (
            input.content !== undefined &&
            localStorage.getItem(failNextContentSaveKey) === "1"
          ) {
            localStorage.removeItem(failNextContentSaveKey);
            appendWriteLog({
              nodeId: input.nodeId,
              content: input.content,
              ok: false,
              at: now(),
            });
            return fail("INTERNAL_ERROR", "Forced content save failure.");
          }
          if (input.title !== undefined) {
            node.title = input.title.trim();
          }
          if (input.content !== undefined) {
            node.content = input.content;
          }
          if (input.metadata !== undefined) {
            node.metadata = input.metadata;
          }
          node.updatedAt = now();
          writeState(state);
          if (input.content !== undefined) {
            appendWriteLog({
              nodeId: input.nodeId,
              content: input.content,
              ok: true,
              at: now(),
            });
          }
          return ok({ ...node });
        },

        flushBinderContent: (input: { nodeId: string; content: string }) => {
          const state = readState();
          const node = state.nodes.find(
            (candidate) => candidate.id === input.nodeId,
          );
          if (node === undefined) {
            return fail("NOT_FOUND", "Binder node was not found.");
          }
          if (node.kind === "folder") {
            return fail(
              "INVALID_OPERATION",
              "Folders cannot contain document text.",
            );
          }
          node.content = input.content;
          node.updatedAt = now();
          writeState(state);
          appendWriteLog({
            nodeId: input.nodeId,
            content: input.content,
            ok: true,
            at: now(),
          });
          return ok({ ...node });
        },

        deleteBinderNode: async (nodeId: string) => {
          const state = readState();
          const node = state.nodes.find((candidate) => candidate.id === nodeId);
          if (node === undefined) {
            return fail("NOT_FOUND", "Binder node was not found.");
          }

          const removed = new Set([node.id, ...descendantIds(state, node.id)]);
          state.nodes = state.nodes.filter(
            (candidate) => !removed.has(candidate.id),
          );
          sortedSiblings(state, node.projectId, node.parentId).forEach(
            (sibling, index) => {
              sibling.position = index;
            },
          );
          writeState(state);
          return ok(undefined);
        },

        moveBinderNode: async (input: {
          nodeId: string;
          parentId: string | null;
          position: number;
        }) => {
          const state = readState();
          if (localStorage.getItem(failNextMoveKey) === "1") {
            localStorage.removeItem(failNextMoveKey);
            return fail("INVALID_OPERATION", "Forced move failure.");
          }

          const node = state.nodes.find(
            (candidate) => candidate.id === input.nodeId,
          );
          if (node === undefined) {
            return fail("NOT_FOUND", "Binder node was not found.");
          }
          if (input.position < 0 || !Number.isInteger(input.position)) {
            return fail("INVALID_OPERATION", "Invalid destination position.");
          }
          if (input.parentId !== null) {
            const parent = state.nodes.find(
              (candidate) =>
                candidate.id === input.parentId &&
                candidate.projectId === node.projectId,
            );
            if (parent === undefined) {
              return fail("NOT_FOUND", "Parent folder was not found.");
            }
            if (parent.kind !== "folder") {
              return fail(
                "INVALID_OPERATION",
                "Binder nodes can only be placed inside folders.",
              );
            }
            if (
              parent.id === node.id ||
              isDescendant(state, node.id, parent.id)
            ) {
              return fail(
                "INVALID_OPERATION",
                "A binder node cannot be moved into its own subtree.",
              );
            }
          }

          const destination = sortedSiblings(
            state,
            node.projectId,
            input.parentId,
            node.id,
          );
          if (input.position > destination.length) {
            return fail(
              "INVALID_OPERATION",
              "The requested binder position is out of range.",
            );
          }

          const previousParentId = node.parentId;
          destination.splice(input.position, 0, node);
          node.parentId = input.parentId;
          destination.forEach((sibling, index) => {
            sibling.position = index;
          });
          if (previousParentId !== input.parentId) {
            sortedSiblings(state, node.projectId, previousParentId).forEach(
              (sibling, index) => {
                sibling.position = index;
              },
            );
          }
          node.updatedAt = now();
          writeState(state);
          return ok({ ...node });
        },
      };

      Object.defineProperty(window, "shakespeare", {
        configurable: true,
        value: api,
      });
    },
    {
      storageKey: SHAKESPEARE_MOCK_STORAGE_KEY,
      failNextMoveKey: SHAKESPEARE_MOCK_FAIL_NEXT_MOVE_KEY,
      failNextContentSaveKey: SHAKESPEARE_MOCK_FAIL_NEXT_CONTENT_SAVE_KEY,
      contentSaveDelayKey: SHAKESPEARE_MOCK_CONTENT_SAVE_DELAY_KEY,
      writeLogKey: SHAKESPEARE_MOCK_WRITE_LOG_KEY,
      seedProjects: seed.projects ?? [],
      seedNodes: seed.nodes ?? [],
    },
  );
}

export async function failNextBinderMove(page: Page): Promise<void> {
  await page.evaluate(
    (key) => localStorage.setItem(key, "1"),
    SHAKESPEARE_MOCK_FAIL_NEXT_MOVE_KEY,
  );
}

export async function failNextContentSave(page: Page): Promise<void> {
  await page.evaluate(
    (key) => localStorage.setItem(key, "1"),
    SHAKESPEARE_MOCK_FAIL_NEXT_CONTENT_SAVE_KEY,
  );
}

export async function setContentSaveDelay(
  page: Page,
  delayMs: number,
): Promise<void> {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, String(value)),
    { key: SHAKESPEARE_MOCK_CONTENT_SAVE_DELAY_KEY, value: delayMs },
  );
}

export async function getContentSaveWrites(
  page: Page,
): Promise<ShakespeareMockContentWrite[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return [];
    }
    try {
      return JSON.parse(raw) as ShakespeareMockContentWrite[];
    } catch {
      return [];
    }
  }, SHAKESPEARE_MOCK_WRITE_LOG_KEY);
}

export async function getPersistedBinderNode(
  page: Page,
  nodeId: string,
): Promise<BinderNode | null> {
  return page.evaluate(
    ({ storageKey, id }) => {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) {
        return null;
      }
      const state = JSON.parse(raw) as { nodes: BinderNode[] };
      return state.nodes.find((node) => node.id === id) ?? null;
    },
    { storageKey: SHAKESPEARE_MOCK_STORAGE_KEY, id: nodeId },
  );
}
