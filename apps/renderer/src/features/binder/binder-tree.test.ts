import { describe, expect, it } from "vitest";
import type { BinderNode, BinderNodeKind } from "@shakespeare/shared";
import {
  applyBinderMove,
  buildBinderTree,
  countBinderDescendants,
  flattenBinderTree,
  getBinderAncestorIds,
  getBinderChildren,
  getBinderDescendantIds,
  isBinderDescendant,
  isValidBinderMove,
  removeBinderSubtree,
  resolveBinderDrop,
} from "./binder-tree.js";

const PROJECT_ID = "b3b8b31d-86c0-4b16-b95a-71730ef4a0ef";
const TIMESTAMP = "2026-10-24T00:00:00.000Z";

let idCounter = 0;

function createNode(
  title: string,
  kind: BinderNodeKind,
  parentId: string | null = null,
  position = 0,
  id = `00000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`,
): BinderNode {
  return {
    id,
    projectId: PROJECT_ID,
    parentId,
    kind,
    title,
    position,
    content: kind === "folder" ? null : "",
    metadata: {},
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

describe("binder tree view model", () => {
  it("builds a sorted hierarchy from the shared flat node list", () => {
    const folder = createNode("Parte uno", "folder", null, 1, "folder");
    const sceneB = createNode("Escena B", "scene", folder.id, 1, "scene-b");
    const sceneA = createNode("Escena A", "scene", folder.id, 0, "scene-a");
    const document = createNode("Notas", "document", null, 0, "document");

    const tree = buildBinderTree([sceneB, document, folder, sceneA]);

    expect(tree.map((entry) => entry.node.id)).toEqual([
      document.id,
      folder.id,
    ]);
    expect(tree[1]?.children.map((entry) => entry.node.id)).toEqual([
      sceneA.id,
      sceneB.id,
    ]);
  });

  it("treats orphans as roots and survives corrupt cycles", () => {
    const orphan = createNode(
      "Huérfano",
      "scene",
      "missing-parent",
      0,
      "orphan",
    );
    const first = createNode("Ciclo A", "folder", "cycle-b", 0, "cycle-a");
    const second = createNode("Ciclo B", "folder", "cycle-a", 0, "cycle-b");

    const tree = buildBinderTree([orphan, first, second]);
    const ids = tree.map((entry) => entry.node.id);

    expect(ids).toContain(orphan.id);
    expect(ids).toContain(first.id);
    expect(ids).toHaveLength(2);
  });

  it("flattens only expanded folders and reports tree item metadata", () => {
    const folder = createNode("Parte", "folder", null, 0, "folder");
    const scene = createNode("Escena", "scene", folder.id, 0, "scene");
    const notes = createNode("Notas", "document", null, 1, "notes");
    const tree = buildBinderTree([folder, scene, notes]);

    expect(flattenBinderTree(tree, new Set())).toEqual([
      { node: folder, level: 1, siblingIndex: 0, siblingCount: 2 },
      { node: notes, level: 1, siblingIndex: 1, siblingCount: 2 },
    ]);

    expect(flattenBinderTree(tree, new Set([folder.id]))).toEqual([
      { node: folder, level: 1, siblingIndex: 0, siblingCount: 2 },
      { node: scene, level: 2, siblingIndex: 0, siblingCount: 1 },
      { node: notes, level: 1, siblingIndex: 1, siblingCount: 2 },
    ]);
  });

  it("counts descendants and resolves ancestors without duplicates", () => {
    const root = createNode("Raíz", "folder", null, 0, "root");
    const child = createNode("Hijo", "folder", root.id, 0, "child");
    const grandchild = createNode("Nieto", "scene", child.id, 0, "grandchild");
    const sibling = createNode("Hermano", "scene", root.id, 1, "sibling");
    const nodes = [root, child, grandchild, sibling];

    expect(getBinderChildren(nodes, root.id).map((node) => node.id)).toEqual([
      child.id,
      sibling.id,
    ]);
    expect(getBinderDescendantIds(nodes, root.id).sort()).toEqual(
      [child.id, grandchild.id, sibling.id].sort(),
    );
    expect(countBinderDescendants(nodes, root.id)).toBe(3);
    expect(countBinderDescendants(nodes, sibling.id)).toBe(0);
    expect(isBinderDescendant(nodes, root.id, grandchild.id)).toBe(true);
    expect(isBinderDescendant(nodes, grandchild.id, root.id)).toBe(false);
    expect(getBinderAncestorIds(nodes, grandchild.id)).toEqual([
      child.id,
      root.id,
    ]);
  });

  it("resolves before, after, and inside drops against filtered siblings", () => {
    const first = createNode("Primera", "folder", null, 0, "first");
    const second = createNode("Segunda", "folder", null, 1, "second");
    const moving = createNode("Mover", "scene", null, 2, "moving");
    const nested = createNode("Anidada", "scene", first.id, 0, "nested");
    const nodes = [first, second, moving, nested];

    expect(resolveBinderDrop(nodes, moving.id, first.id, "before")).toEqual({
      parentId: null,
      position: 0,
    });
    expect(resolveBinderDrop(nodes, moving.id, second.id, "after")).toEqual({
      parentId: null,
      position: 2,
    });
    expect(resolveBinderDrop(nodes, moving.id, second.id, "inside")).toEqual({
      parentId: second.id,
      position: 0,
    });
  });

  it("rejects invalid drops on itself, descendants, and non-folder rows", () => {
    const folder = createNode("Carpeta", "folder", null, 0, "folder");
    const child = createNode("Hija", "folder", folder.id, 0, "child");
    const grandchild = createNode("Nieta", "scene", child.id, 0, "grandchild");
    const scene = createNode("Escena", "scene", null, 1, "scene");
    const nodes = [folder, child, grandchild, scene];

    expect(resolveBinderDrop(nodes, folder.id, folder.id, "before")).toBeNull();
    expect(resolveBinderDrop(nodes, folder.id, child.id, "after")).toBeNull();
    expect(
      resolveBinderDrop(nodes, folder.id, grandchild.id, "inside"),
    ).toBeNull();
    expect(resolveBinderDrop(nodes, scene.id, child.id, "inside")).toEqual({
      parentId: child.id,
      position: 1,
    });
    expect(
      resolveBinderDrop(nodes, folder.id, grandchild.id, "before"),
    ).toBeNull();
    expect(resolveBinderDrop(nodes, scene.id, grandchild.id, "before")).toEqual(
      {
        parentId: child.id,
        position: 0,
      },
    );
    expect(resolveBinderDrop(nodes, scene.id, folder.id, "inside")).toEqual({
      parentId: folder.id,
      position: 1,
    });
  });

  it("validates moves against folder, cycle, and range rules", () => {
    const root = createNode("Raíz", "folder", null, 0, "root");
    const child = createNode("Hija", "folder", root.id, 0, "child");
    const scene = createNode("Escena", "scene", null, 1, "scene");
    const nodes = [root, child, scene];

    expect(isValidBinderMove(nodes, scene.id, child.id, 0)).toBe(true);
    expect(isValidBinderMove(nodes, scene.id, root.id, 1)).toBe(true);
    expect(isValidBinderMove(nodes, root.id, child.id, 0)).toBe(false);
    expect(isValidBinderMove(nodes, scene.id, scene.id, 0)).toBe(false);
    expect(isValidBinderMove(nodes, scene.id, null, 2)).toBe(false);
    expect(isValidBinderMove(nodes, scene.id, null, -1)).toBe(false);
    expect(isValidBinderMove(nodes, scene.id, scene.id, 0)).toBe(false);
  });

  it("applies a confirmed move and keeps every affected sibling contiguous", () => {
    const first = createNode("Primera", "folder", null, 0, "first");
    const second = createNode("Segunda", "folder", null, 1, "second");
    const scene = createNode("Escena", "scene", second.id, 0, "scene");
    const third = createNode("Tercera", "scene", null, 2, "third");
    const nodes = [first, second, scene, third];
    const moved: BinderNode = {
      ...third,
      parentId: second.id,
      position: 1,
      updatedAt: "2026-10-24T01:00:00.000Z",
    };

    const next = applyBinderMove(nodes, moved);

    expect(next.find((node) => node.id === third.id)).toMatchObject({
      parentId: second.id,
      position: 1,
    });
    expect(
      getBinderChildren(next, null).map((node) => [node.id, node.position]),
    ).toEqual([
      [first.id, 0],
      [second.id, 1],
    ]);
    expect(
      getBinderChildren(next, second.id).map((node) => [
        node.id,
        node.position,
      ]),
    ).toEqual([
      [scene.id, 0],
      [third.id, 1],
    ]);
  });

  it("removes a confirmed subtree and compacts the remaining siblings", () => {
    const folder = createNode("Carpeta", "folder", null, 0, "folder");
    const first = createNode("Primera", "scene", folder.id, 0, "first");
    const second = createNode("Segunda", "scene", folder.id, 1, "second");
    const third = createNode("Tercera", "scene", folder.id, 2, "third");
    const nodes = [folder, first, second, third];

    const next = removeBinderSubtree(nodes, first.id);

    expect(next.map((node) => node.id)).toEqual([
      folder.id,
      second.id,
      third.id,
    ]);
    expect(
      getBinderChildren(next, folder.id).map((node) => [
        node.id,
        node.position,
      ]),
    ).toEqual([
      [second.id, 0],
      [third.id, 1],
    ]);
  });

  it("removes every descendant when a folder is deleted", () => {
    const root = createNode("Raíz", "folder", null, 0, "root");
    const child = createNode("Hija", "folder", root.id, 0, "child");
    const grandchild = createNode("Nieta", "scene", child.id, 0, "grandchild");
    const surviving = createNode("Sobrevive", "scene", null, 1, "surviving");
    const nodes = [root, child, grandchild, surviving];

    expect(removeBinderSubtree(nodes, child.id).map((node) => node.id)).toEqual(
      [root.id, surviving.id],
    );
  });
});
