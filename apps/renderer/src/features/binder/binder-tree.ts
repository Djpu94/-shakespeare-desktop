import type { BinderNode } from "@shakespeare/shared";

export interface BinderTreeNode {
  readonly node: BinderNode;
  readonly children: BinderTreeNode[];
}

export interface FlatBinderNode {
  readonly node: BinderNode;
  readonly level: number;
  readonly siblingIndex: number;
  readonly siblingCount: number;
}

export type BinderDropPlacement = "before" | "after" | "inside";

export interface BinderMoveDestination {
  readonly parentId: string | null;
  readonly position: number;
}

const collator = new Intl.Collator("es", { sensitivity: "base" });

export function compareBinderNodes(
  first: BinderNode,
  second: BinderNode,
): number {
  return (
    first.position - second.position ||
    collator.compare(first.title, second.title) ||
    first.id.localeCompare(second.id)
  );
}

/**
 * Derives the navigation tree from the shared flat list of binder nodes.
 * Missing parents are treated as roots and cycles are cut defensively, but the
 * persisted contract guarantees neither case.
 */
export function buildBinderTree(
  nodes: readonly BinderNode[],
): BinderTreeNode[] {
  const knownIds = new Set(nodes.map((node) => node.id));
  const groups = new Map<string | null, BinderNode[]>();

  for (const node of nodes) {
    const parentId =
      node.parentId !== null && knownIds.has(node.parentId)
        ? node.parentId
        : null;
    const siblings = groups.get(parentId);
    if (siblings === undefined) {
      groups.set(parentId, [node]);
    } else {
      siblings.push(node);
    }
  }

  for (const siblings of groups.values()) {
    siblings.sort(compareBinderNodes);
  }

  const visited = new Set<string>();
  const buildNode = (node: BinderNode): BinderTreeNode => {
    visited.add(node.id);
    const children = (groups.get(node.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map(buildNode);

    return { node, children };
  };

  const tree = (groups.get(null) ?? []).map(buildNode);

  // A corrupt cycle would leave nodes unreachable from the roots. Render them
  // as roots instead of dropping data from the navigation view.
  for (const node of [...nodes].sort(compareBinderNodes)) {
    if (!visited.has(node.id)) {
      tree.push(buildNode(node));
    }
  }

  return tree;
}

export function flattenBinderTree(
  tree: readonly BinderTreeNode[],
  expandedNodeIds: ReadonlySet<string>,
): FlatBinderNode[] {
  const flat: FlatBinderNode[] = [];

  const visit = (entries: readonly BinderTreeNode[], level: number): void => {
    entries.forEach((entry, siblingIndex) => {
      flat.push({
        node: entry.node,
        level,
        siblingIndex,
        siblingCount: entries.length,
      });

      if (entry.node.kind === "folder" && expandedNodeIds.has(entry.node.id)) {
        visit(entry.children, level + 1);
      }
    });
  };

  visit(tree, 1);
  return flat;
}

export function getBinderChildren(
  nodes: readonly BinderNode[],
  parentId: string | null,
): BinderNode[] {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort(compareBinderNodes);
}

export function getBinderDescendantIds(
  nodes: readonly BinderNode[],
  nodeId: string,
): string[] {
  const childrenByParent = new Map<string, BinderNode[]>();
  for (const node of nodes) {
    if (node.parentId === null) {
      continue;
    }
    const children = childrenByParent.get(node.parentId);
    if (children === undefined) {
      childrenByParent.set(node.parentId, [node]);
    } else {
      children.push(node);
    }
  }

  const descendants: string[] = [];
  const queue = [...(childrenByParent.get(nodeId) ?? [])];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined || seen.has(node.id) || node.id === nodeId) {
      continue;
    }
    seen.add(node.id);
    descendants.push(node.id);
    queue.push(...(childrenByParent.get(node.id) ?? []));
  }

  return descendants;
}

export function countBinderDescendants(
  nodes: readonly BinderNode[],
  nodeId: string,
): number {
  return getBinderDescendantIds(nodes, nodeId).length;
}

export function isBinderDescendant(
  nodes: readonly BinderNode[],
  ancestorId: string,
  nodeId: string,
): boolean {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let current = nodesById.get(nodeId);

  while (current !== undefined && current.parentId !== null) {
    if (current.parentId === ancestorId) {
      return true;
    }
    if (seen.has(current.parentId)) {
      return false;
    }
    seen.add(current.parentId);
    current = nodesById.get(current.parentId);
  }

  return false;
}

export function getBinderAncestorIds(
  nodes: readonly BinderNode[],
  nodeId: string,
): string[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const ancestors: string[] = [];
  const seen = new Set<string>([nodeId]);
  let current = nodesById.get(nodeId);

  while (current !== undefined && current.parentId !== null) {
    if (seen.has(current.parentId)) {
      break;
    }
    seen.add(current.parentId);
    ancestors.push(current.parentId);
    current = nodesById.get(current.parentId);
  }

  return ancestors;
}

export function isValidBinderMove(
  nodes: readonly BinderNode[],
  nodeId: string,
  parentId: string | null,
  position: number,
): boolean {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined || !Number.isInteger(position) || position < 0) {
    return false;
  }

  if (parentId !== null) {
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (parent === undefined || parent.kind !== "folder") {
      return false;
    }
    if (
      parent.id === node.id ||
      isBinderDescendant(nodes, node.id, parent.id)
    ) {
      return false;
    }
  }

  const siblings = getBinderChildren(nodes, parentId).filter(
    (sibling) => sibling.id !== nodeId,
  );

  return position <= siblings.length;
}

/**
 * Converts a drop over a row into the persistent `move` destination. The
 * destination index is computed against the sibling list without the dragged
 * node so it matches the repository transaction semantics.
 */
export function resolveBinderDrop(
  nodes: readonly BinderNode[],
  draggedNodeId: string,
  targetNodeId: string,
  placement: BinderDropPlacement,
): BinderMoveDestination | null {
  if (draggedNodeId === targetNodeId) {
    return null;
  }

  const target = nodes.find((node) => node.id === targetNodeId);
  if (target === undefined) {
    return null;
  }

  if (
    target.id === draggedNodeId ||
    isBinderDescendant(nodes, draggedNodeId, target.id)
  ) {
    return null;
  }

  if (placement === "inside") {
    if (target.kind !== "folder") {
      return null;
    }
    return {
      parentId: target.id,
      position: getBinderChildren(nodes, target.id).length,
    };
  }

  const destinationSiblings = getBinderChildren(nodes, target.parentId).filter(
    (sibling) => sibling.id !== draggedNodeId,
  );
  const targetIndex = destinationSiblings.findIndex(
    (sibling) => sibling.id === target.id,
  );
  if (targetIndex === -1) {
    return null;
  }

  return {
    parentId: target.parentId,
    position: targetIndex + (placement === "after" ? 1 : 0),
  };
}

/**
 * Applies a move that the repository already confirmed. Only sibling
 * positions change, and they stay contiguous from zero.
 */
export function applyBinderMove(
  nodes: readonly BinderNode[],
  moved: BinderNode,
): BinderNode[] {
  if (!nodes.some((node) => node.id === moved.id)) {
    return [...nodes];
  }

  const groups = new Map<string | null, BinderNode[]>();
  for (const node of nodes) {
    if (node.id === moved.id) {
      continue;
    }
    const siblings = groups.get(node.parentId);
    if (siblings === undefined) {
      groups.set(node.parentId, [node]);
    } else {
      siblings.push(node);
    }
  }

  for (const siblings of groups.values()) {
    siblings.sort(compareBinderNodes);
  }

  const destination = groups.get(moved.parentId) ?? [];
  const insertionIndex = Math.min(moved.position, destination.length);
  destination.splice(insertionIndex, 0, moved);
  groups.set(moved.parentId, destination);

  const positions = new Map<string, number>();
  for (const siblings of groups.values()) {
    siblings.forEach((node, index) => positions.set(node.id, index));
  }

  return nodes.map((node) => {
    if (node.id === moved.id) {
      return { ...moved, position: positions.get(moved.id) ?? moved.position };
    }

    const position = positions.get(node.id);
    return position === undefined || position === node.position
      ? node
      : { ...node, position };
  });
}

/**
 * Removes a node and its subtree after the repository confirmed the cascade
 * delete, then compacts the remaining siblings.
 */
export function removeBinderSubtree(
  nodes: readonly BinderNode[],
  nodeId: string,
): BinderNode[] {
  const removed = nodes.find((node) => node.id === nodeId);
  if (removed === undefined) {
    return [...nodes];
  }

  const removedIds = new Set([
    nodeId,
    ...getBinderDescendantIds(nodes, nodeId),
  ]);
  const remaining = nodes.filter((node) => !removedIds.has(node.id));
  const positions = new Map<string, number>();
  getBinderChildren(remaining, removed.parentId).forEach((node, index) => {
    positions.set(node.id, index);
  });

  return remaining.map((node) => {
    const position = positions.get(node.id);
    return position === undefined || position === node.position
      ? node
      : { ...node, position };
  });
}

export function getBinderSubtreeIds(
  nodes: readonly BinderNode[],
  nodeId: string,
): Set<string> {
  return new Set([nodeId, ...getBinderDescendantIds(nodes, nodeId)]);
}
