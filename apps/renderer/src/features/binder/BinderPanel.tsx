import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent, KeyboardEvent } from "react";
import type {
  BinderNode,
  BinderNodeKind,
  ProjectMode,
} from "@shakespeare/shared";
import { describeBinderError } from "./binder-api.js";
import { BinderDeleteDialog, BinderMoveDialog } from "./BinderDialogs.js";
import {
  applyBinderMove,
  buildBinderTree,
  countBinderDescendants,
  flattenBinderTree,
  getBinderAncestorIds,
  getBinderChildren,
  getBinderSubtreeIds,
  isBinderDescendant,
  isValidBinderMove,
  removeBinderSubtree,
  resolveBinderDrop,
} from "./binder-tree.js";
import { BinderTree } from "./BinderTree.js";
import type { BinderDropTarget, BinderTreeController } from "./BinderTree.js";
import {
  getBinderCreationKinds,
  getBinderKindLabel,
  type BinderApi,
} from "./binder-types.js";
import { unwrapIpcResult } from "../../lib/ipc-result.js";

export interface BinderPanelProps {
  projectId: string;
  projectMode: ProjectMode;
  nodes: BinderNode[];
  selectedNodeId: string | null;
  api: BinderApi;
  onNodesChange: (nodes: BinderNode[]) => void;
  onSelectionChange: (node: BinderNode | null) => void;
}

interface RenameSession {
  cancelled: boolean;
  inFlight: boolean;
}

function getDestinationLabel(
  nodes: readonly BinderNode[],
  parentId: string | null,
): string {
  if (parentId === null) {
    return "la raíz del proyecto";
  }
  const parent = nodes.find((node) => node.id === parentId);
  return parent === undefined ? "otra carpeta" : `«${parent.title}»`;
}

/**
 * Navigation view over the shared `BinderNode` list owned by the workspace.
 * Expansion, focus, menus, and drag state are view-only; the visible tree is
 * replaced only after the IPC mutation resolves, so a failed write leaves the
 * last confirmed tree untouched.
 */
export function BinderPanel({
  projectId,
  projectMode,
  nodes,
  selectedNodeId,
  api,
  onNodesChange,
  onSelectionChange,
}: BinderPanelProps) {
  const tree = useMemo(() => buildBinderTree(nodes), [nodes]);
  const expandedFolders = useMemo(
    () =>
      new Set(
        nodes.filter((node) => node.kind === "folder").map((node) => node.id),
      ),
    [nodes],
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(expandedFolders),
  );
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(
    () => selectedNodeId ?? tree[0]?.node.id ?? null,
  );
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BinderNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<BinderNode | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<BinderDropTarget | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createKind, setCreateKind] = useState<BinderNodeKind>("scene");
  const [createParentId, setCreateParentId] = useState<string | null>(null);

  const treeRef = useRef<HTMLUListElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const draggedNodeRef = useRef<string | null>(null);
  const renameSessionRef = useRef<RenameSession>({
    cancelled: false,
    inFlight: false,
  });

  const flatNodes = useMemo(
    () => flattenBinderTree(tree, expandedIds),
    [tree, expandedIds],
  );
  const flatFolders = useMemo(
    () =>
      flattenBinderTree(tree, expandedFolders).filter(
        (entry) => entry.node.kind === "folder",
      ),
    [tree, expandedFolders],
  );
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const focusedNode = nodes.find((node) => node.id === focusedNodeId) ?? null;
  const creationKinds = getBinderCreationKinds(projectMode);
  const folderIds = useMemo(
    () => nodes.filter((node) => node.kind === "folder").map((node) => node.id),
    [nodes],
  );
  const hasExpandedFolders = folderIds.some((id) => expandedIds.has(id));
  const deleteDescendantCount =
    deleteTarget === null ? 0 : countBinderDescendants(nodes, deleteTarget.id);

  useEffect(() => {
    if (creationKinds.includes(createKind)) {
      return;
    }
    setCreateKind("scene");
  }, [creationKinds, createKind]);

  useEffect(() => {
    if (
      focusedNodeId !== null &&
      nodes.some((node) => node.id === focusedNodeId)
    ) {
      return;
    }
    setFocusedNodeId(selectedNodeId ?? tree[0]?.node.id ?? null);
  }, [focusedNodeId, nodes, selectedNodeId, tree]);

  useEffect(() => {
    if (
      openMenuNodeId !== null &&
      !nodes.some((node) => node.id === openMenuNodeId)
    ) {
      setOpenMenuNodeId(null);
    }
  }, [nodes, openMenuNodeId]);

  useEffect(() => {
    if (openMenuNodeId === null) {
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        target.closest("[data-binder-menu]") !== null ||
        target.closest("[data-binder-menu-trigger]") !== null
      ) {
        return;
      }
      setOpenMenuNodeId(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openMenuNodeId]);

  useEffect(() => {
    if (!createOpen) {
      return;
    }
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [createOpen]);

  function findNodeElement(nodeId: string): HTMLElement | null {
    const elements =
      treeRef.current?.querySelectorAll<HTMLElement>("[data-node-id]");
    if (elements === undefined) {
      return null;
    }

    return (
      Array.from(elements).find(
        (element) => element.dataset.nodeId === nodeId,
      ) ?? null
    );
  }

  function focusNode(nodeId: string | null): void {
    setFocusedNodeId(nodeId);
    if (nodeId === null) {
      return;
    }
    requestAnimationFrame(() => findNodeElement(nodeId)?.focus());
  }

  function announce(message: string): void {
    setAnnouncement(message);
  }

  async function runMutation(
    nodeId: string | null,
    operation: () => Promise<void>,
  ): Promise<boolean> {
    if (pendingRef.current) {
      return false;
    }

    pendingRef.current = true;
    setPendingAction(true);
    setBusyNodeId(nodeId);
    setErrorMessage(null);
    setAnnouncement("");

    try {
      await operation();
      return true;
    } catch (error) {
      setErrorMessage(describeBinderError(error));
      return false;
    } finally {
      pendingRef.current = false;
      setPendingAction(false);
      setBusyNodeId(null);
    }
  }

  function expandAncestors(parentId: string | null): void {
    if (parentId === null) {
      return;
    }
    const ids = new Set([parentId, ...getBinderAncestorIds(nodes, parentId)]);
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        next.add(id);
      }
      return next;
    });
  }

  function selectNode(node: BinderNode): void {
    setOpenMenuNodeId(null);
    setErrorMessage(null);
    setFocusedNodeId(node.id);
    onSelectionChange(node);
  }

  function toggleExpanded(nodeId: string): void {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined || node.kind !== "folder") {
      return;
    }

    const willExpand = !expandedIds.has(nodeId);
    const next = new Set(expandedIds);
    if (willExpand) {
      next.add(nodeId);
    } else {
      next.delete(nodeId);
    }
    setExpandedIds(next);

    if (
      !willExpand &&
      focusedNodeId !== null &&
      (focusedNodeId === nodeId ||
        isBinderDescendant(nodes, nodeId, focusedNodeId))
    ) {
      focusNode(nodeId);
    }
  }

  function toggleCollapseAll(): void {
    if (hasExpandedFolders) {
      setExpandedIds(new Set());
      announce("Todas las carpetas se contrajeron.");
      if (focusedNodeId !== null) {
        const visibleRoots = new Set(tree.map((entry) => entry.node.id));
        if (!visibleRoots.has(focusedNodeId)) {
          const ancestors = getBinderAncestorIds(nodes, focusedNodeId);
          focusNode(ancestors.at(-1) ?? focusedNodeId);
        }
      }
      return;
    }

    setExpandedIds(new Set(folderIds));
    announce("Todas las carpetas se expandieron.");
  }

  function startRename(node: BinderNode): void {
    setOpenMenuNodeId(null);
    setErrorMessage(null);
    renameSessionRef.current = { cancelled: false, inFlight: false };
    setRenamingNodeId(node.id);
    setRenameDraft(node.title);
    setFocusedNodeId(node.id);
    requestAnimationFrame(() => {
      const input = treeRef.current?.querySelector<HTMLInputElement>(
        ".binder-rename-input",
      );
      input?.focus();
      input?.select();
    });
  }

  function cancelRename(): void {
    renameSessionRef.current.cancelled = true;
    setRenamingNodeId(null);
    setRenameDraft("");
    if (focusedNodeId !== null) {
      requestAnimationFrame(() => findNodeElement(focusedNodeId)?.focus());
    }
  }

  async function commitRename(): Promise<void> {
    const session = renameSessionRef.current;
    if (session.cancelled || session.inFlight) {
      return;
    }

    const target = nodes.find((node) => node.id === renamingNodeId);
    if (target === undefined) {
      setRenamingNodeId(null);
      return;
    }

    const title = renameDraft.trim();
    if (title.length === 0) {
      setErrorMessage("El título no puede estar vacío.");
      return;
    }
    if (title === target.title) {
      setRenamingNodeId(null);
      setRenameDraft("");
      focusNode(target.id);
      return;
    }

    session.inFlight = true;
    const success = await runMutation(target.id, async () => {
      const updated = unwrapIpcResult(
        await api.updateBinderNode({ nodeId: target.id, title }),
      );
      onNodesChange(
        nodes.map((node) => (node.id === updated.id ? updated : node)),
      );
      setRenamingNodeId(null);
      setRenameDraft("");
      focusNode(updated.id);
      announce(`«${updated.title}» se renombró correctamente.`);
    });
    session.inFlight = false;

    if (!success) {
      requestAnimationFrame(() => {
        const input = treeRef.current?.querySelector<HTMLInputElement>(
          ".binder-rename-input",
        );
        input?.focus();
        input?.select();
      });
    }
  }

  function openCreateForm(parentId: string | null): void {
    setOpenMenuNodeId(null);
    setErrorMessage(null);
    setCreateOpen(true);
    setCreateParentId(parentId);
    setCreateTitle("");
  }

  function toggleCreateForm(): void {
    if (createOpen) {
      setCreateOpen(false);
      return;
    }

    if (selectedNode?.kind === "folder") {
      openCreateForm(selectedNode.id);
    } else {
      openCreateForm(selectedNode?.parentId ?? null);
    }
  }

  async function handleCreate(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const title = createTitle.trim();
    if (title.length === 0) {
      setErrorMessage("El título es obligatorio.");
      return;
    }

    if (createParentId !== null) {
      const parent = nodes.find((node) => node.id === createParentId);
      if (parent === undefined || parent.kind !== "folder") {
        setErrorMessage("La carpeta de destino ya no está disponible.");
        return;
      }
    }

    const parentId = createParentId;
    const kind = createKind;
    const content = kind === "folder" ? null : "";

    await runMutation(parentId, async () => {
      const created = unwrapIpcResult(
        await api.createBinderNode({
          projectId,
          parentId,
          kind,
          title,
          content,
          metadata: {},
        }),
      );
      onNodesChange([...nodes, created]);
      expandAncestors(created.parentId);
      setCreateOpen(false);
      setCreateTitle("");
      focusNode(created.id);
      onSelectionChange(created);
      announce(
        `«${created.title}» se creó en ${getDestinationLabel(
          nodes,
          created.parentId,
        )}.`,
      );
    });
  }

  function requestDelete(node: BinderNode): void {
    setOpenMenuNodeId(null);
    setErrorMessage(null);
    setDeleteTarget(node);
  }

  function getNextFocusAfterDelete(
    target: BinderNode,
    removedIds: ReadonlySet<string>,
  ): string | null {
    const index = flatNodes.findIndex((entry) => entry.node.id === target.id);
    if (index !== -1) {
      for (
        let position = index + 1;
        position < flatNodes.length;
        position += 1
      ) {
        const entry = flatNodes[position];
        if (entry !== undefined && !removedIds.has(entry.node.id)) {
          return entry.node.id;
        }
      }
      for (let position = index - 1; position >= 0; position -= 1) {
        const entry = flatNodes[position];
        if (entry !== undefined && !removedIds.has(entry.node.id)) {
          return entry.node.id;
        }
      }
    }

    return target.parentId;
  }

  async function confirmDelete(): Promise<void> {
    const target = deleteTarget;
    if (target === null) {
      return;
    }

    const removedIds = getBinderSubtreeIds(nodes, target.id);
    const nextFocus = getNextFocusAfterDelete(target, removedIds);
    const removesSelection =
      selectedNodeId !== null && removedIds.has(selectedNodeId);

    const success = await runMutation(target.id, async () => {
      unwrapIpcResult(await api.deleteBinderNode(target.id));
      onNodesChange(removeBinderSubtree(nodes, target.id));
      if (removesSelection) {
        onSelectionChange(null);
      }
      if (focusedNodeId !== null && removedIds.has(focusedNodeId)) {
        focusNode(nextFocus);
      }
      announce(`«${target.title}» y su contenido se eliminaron.`);
    });

    if (success) {
      setDeleteTarget(null);
    }
  }

  function getSiblingIndex(node: BinderNode): number {
    return getBinderChildren(nodes, node.parentId).findIndex(
      (sibling) => sibling.id === node.id,
    );
  }

  function canMoveUp(node: BinderNode): boolean {
    return getSiblingIndex(node) > 0;
  }

  function canMoveDown(node: BinderNode): boolean {
    const siblings = getBinderChildren(nodes, node.parentId);
    const index = siblings.findIndex((sibling) => sibling.id === node.id);
    return index !== -1 && index < siblings.length - 1;
  }

  function canIndent(node: BinderNode): boolean {
    const siblings = getBinderChildren(nodes, node.parentId);
    const index = siblings.findIndex((sibling) => sibling.id === node.id);
    return index > 0 && siblings[index - 1]?.kind === "folder";
  }

  function canOutdent(node: BinderNode): boolean {
    return node.parentId !== null;
  }

  async function performMove(
    nodeId: string,
    parentId: string | null,
    position: number,
  ): Promise<boolean> {
    if (pendingRef.current) {
      return false;
    }

    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) {
      setErrorMessage("El elemento que quieres mover ya no está disponible.");
      return false;
    }

    if (!isValidBinderMove(nodes, nodeId, parentId, position)) {
      setErrorMessage(
        "Ese movimiento no es válido: solo las carpetas pueden contener elementos y una carpeta no puede moverse dentro de sí misma.",
      );
      return false;
    }

    if (node.parentId === parentId && node.position === position) {
      announce("El elemento ya está en esa posición.");
      focusNode(node.id);
      return true;
    }

    return runMutation(node.id, async () => {
      const moved = unwrapIpcResult(
        await api.moveBinderNode({ nodeId, parentId, position }),
      );
      onNodesChange(applyBinderMove(nodes, moved));
      expandAncestors(moved.parentId);
      focusNode(moved.id);
      announce(
        `«${moved.title}» se movió a ${getDestinationLabel(
          nodes,
          moved.parentId,
        )}.`,
      );
    });
  }

  function moveUp(node: BinderNode): void {
    const index = getSiblingIndex(node);
    if (index <= 0) {
      announce("El elemento ya está al principio de su carpeta.");
      return;
    }
    void performMove(node.id, node.parentId, index - 1);
  }

  function moveDown(node: BinderNode): void {
    if (!canMoveDown(node)) {
      announce("El elemento ya está al final de su carpeta.");
      return;
    }
    void performMove(node.id, node.parentId, getSiblingIndex(node) + 1);
  }

  function indent(node: BinderNode): void {
    if (!canIndent(node)) {
      announce("No hay una carpeta anterior donde anidar este elemento.");
      return;
    }
    const siblings = getBinderChildren(nodes, node.parentId);
    const previous = siblings[getSiblingIndex(node) - 1];
    if (previous === undefined) {
      return;
    }
    void performMove(
      node.id,
      previous.id,
      getBinderChildren(nodes, previous.id).length,
    );
  }

  function outdent(node: BinderNode): void {
    const parent = nodes.find((candidate) => candidate.id === node.parentId);
    if (parent === undefined) {
      announce("El elemento ya está en la raíz del proyecto.");
      return;
    }
    const parentIndex = getBinderChildren(nodes, parent.parentId).findIndex(
      (sibling) => sibling.id === parent.id,
    );
    void performMove(node.id, parent.parentId, parentIndex + 1);
  }

  function requestMoveDialog(node: BinderNode): void {
    setOpenMenuNodeId(null);
    setErrorMessage(null);
    setMoveTarget(node);
  }

  async function handleMoveFromDialog(
    parentId: string | null,
    position: number,
  ): Promise<void> {
    const target = moveTarget;
    if (target === null) {
      return;
    }

    const success = await performMove(target.id, parentId, position);
    if (success) {
      setMoveTarget(null);
    }
  }

  function getDropPlacement(
    event: DragEvent<HTMLDivElement>,
    node: BinderNode,
  ): "before" | "after" | "inside" {
    const rectangle = event.currentTarget.getBoundingClientRect();
    const offset = event.clientY - rectangle.top;
    if (node.kind === "folder") {
      if (offset < rectangle.height * 0.25) {
        return "before";
      }
      if (offset > rectangle.height * 0.75) {
        return "after";
      }
      return "inside";
    }
    return offset < rectangle.height / 2 ? "before" : "after";
  }

  function clearDragState(): void {
    draggedNodeRef.current = null;
    setDraggedNodeId(null);
    setDropTarget(null);
  }

  function handleDragStart(
    event: DragEvent<HTMLDivElement>,
    node: BinderNode,
  ): void {
    if (pendingRef.current) {
      event.preventDefault();
      return;
    }
    setOpenMenuNodeId(null);
    draggedNodeRef.current = node.id;
    setDraggedNodeId(node.id);
    setDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
    announce(
      `Moviendo «${node.title}». Suelta sobre otra fila o usa Alt+flechas.`,
    );
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
    node: BinderNode,
  ): void {
    const draggedId = draggedNodeRef.current;
    if (draggedId === null) {
      return;
    }

    const placement = getDropPlacement(event, node);
    const destination = resolveBinderDrop(nodes, draggedId, node.id, placement);
    if (destination === null) {
      setDropTarget(null);
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTarget?.nodeId !== node.id || dropTarget.placement !== placement) {
      setDropTarget({ nodeId: node.id, placement });
    }
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>,
    node: BinderNode,
  ): void {
    const related = event.relatedTarget;
    if (related instanceof Node && event.currentTarget.contains(related)) {
      return;
    }
    if (dropTarget?.nodeId === node.id) {
      setDropTarget(null);
    }
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    node: BinderNode,
  ): void {
    event.preventDefault();
    const draggedId = draggedNodeRef.current;
    const placement = getDropPlacement(event, node);
    clearDragState();
    if (draggedId === null) {
      return;
    }

    const destination = resolveBinderDrop(nodes, draggedId, node.id, placement);
    if (destination === null) {
      setErrorMessage(
        "No se puede mover un elemento dentro de sí mismo ni sobre sus propios descendientes.",
      );
      return;
    }

    void performMove(draggedId, destination.parentId, destination.position);
  }

  function handleTreeKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        "input, textarea, select, button, [role='menu'], [contenteditable='true']",
      ) !== null
    ) {
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "b"
    ) {
      event.preventDefault();
      toggleCollapseAll();
      return;
    }

    const node = focusedNode;
    if (node === null) {
      return;
    }

    if (event.altKey) {
      if (event.shiftKey && event.key === "ArrowRight") {
        event.preventDefault();
        indent(node);
        return;
      }
      if (event.shiftKey && event.key === "ArrowLeft") {
        event.preventDefault();
        outdent(node);
        return;
      }
      if (!event.shiftKey && event.key === "ArrowUp") {
        event.preventDefault();
        moveUp(node);
        return;
      }
      if (!event.shiftKey && event.key === "ArrowDown") {
        event.preventDefault();
        moveDown(node);
        return;
      }
    }

    const index = flatNodes.findIndex((entry) => entry.node.id === node.id);

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = flatNodes[Math.min(flatNodes.length - 1, index + 1)];
        if (next !== undefined) {
          focusNode(next.node.id);
        }
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        const previous = flatNodes[Math.max(0, index - 1)];
        if (previous !== undefined) {
          focusNode(previous.node.id);
        }
        return;
      }
      case "Home": {
        event.preventDefault();
        const first = flatNodes[0];
        if (first !== undefined) {
          focusNode(first.node.id);
        }
        return;
      }
      case "End": {
        event.preventDefault();
        const last = flatNodes.at(-1);
        if (last !== undefined) {
          focusNode(last.node.id);
        }
        return;
      }
      case "ArrowRight": {
        if (node.kind !== "folder") {
          return;
        }
        event.preventDefault();
        if (!expandedIds.has(node.id)) {
          toggleExpanded(node.id);
          return;
        }
        const firstChild = getBinderChildren(nodes, node.id)[0];
        if (firstChild !== undefined) {
          focusNode(firstChild.id);
        }
        return;
      }
      case "ArrowLeft": {
        if (node.kind === "folder" && expandedIds.has(node.id)) {
          event.preventDefault();
          toggleExpanded(node.id);
          return;
        }
        if (node.parentId !== null) {
          event.preventDefault();
          focusNode(node.parentId);
        }
        return;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        selectNode(node);
        return;
      }
      case "F2": {
        event.preventDefault();
        startRename(node);
        return;
      }
      case "Delete": {
        event.preventDefault();
        requestDelete(node);
        return;
      }
      case "ContextMenu":
      case "F10": {
        if (event.key === "F10" && !event.shiftKey) {
          return;
        }
        event.preventDefault();
        setOpenMenuNodeId(node.id);
        return;
      }
      case "Escape": {
        if (renamingNodeId !== null) {
          event.preventDefault();
          cancelRename();
        } else if (openMenuNodeId !== null) {
          event.preventDefault();
          setOpenMenuNodeId(null);
        }
        return;
      }
      default:
        return;
    }
  }

  const controller: BinderTreeController = {
    selectedNodeId,
    focusedNodeId,
    expandedIds,
    renamingNodeId,
    renameDraft,
    openMenuNodeId,
    busyNodeId,
    isBusy: pendingAction,
    draggedNodeId,
    dropTarget,
    onFocusNode: (nodeId) => setFocusedNodeId(nodeId),
    onSelectNode: selectNode,
    onToggleExpanded: toggleExpanded,
    onStartRename: startRename,
    onRenameDraftChange: (value) => setRenameDraft(value),
    onCommitRename: () => {
      void commitRename();
    },
    onCancelRename: cancelRename,
    onToggleMenu: (nodeId) =>
      setOpenMenuNodeId((current) => (current === nodeId ? null : nodeId)),
    onCloseMenu: () => setOpenMenuNodeId(null),
    onRequestDelete: requestDelete,
    onOpenMoveDialog: requestMoveDialog,
    onCreateInside: (node) => openCreateForm(node.id),
    onMoveUp: moveUp,
    onMoveDown: moveDown,
    onIndent: indent,
    onOutdent: outdent,
    canMoveUp,
    canMoveDown,
    canIndent,
    canOutdent,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onDragEnd: clearDragState,
  };

  return (
    <section aria-labelledby="binder-heading" className="binder-panel">
      <div className="binder-header">
        <div>
          <h2 id="binder-heading">Binder</h2>
          <p className="binder-summary">
            {nodes.length === 0
              ? "Sin elementos"
              : `${nodes.length} ${
                  nodes.length === 1 ? "elemento" : "elementos"
                }`}
          </p>
        </div>
        <div className="binder-toolbar-actions">
          <button
            aria-controls="binder-create-form"
            aria-expanded={createOpen}
            className="secondary-button binder-toolbar-button"
            onClick={toggleCreateForm}
            type="button"
          >
            {createOpen ? "Cerrar" : "Nuevo"}
          </button>
          <button
            aria-keyshortcuts="Control+Shift+B"
            className="secondary-button binder-toolbar-button"
            disabled={folderIds.length === 0}
            onClick={toggleCollapseAll}
            type="button"
          >
            {hasExpandedFolders ? "Colapsar todo" : "Expandir todo"}
          </button>
        </div>
      </div>

      <p className="binder-instructions" id="binder-instructions">
        Selecciona con las flechas y Enter. F2 renombra, Supr elimina, Mayús+F10
        abre las acciones, Alt+flechas reordena y Ctrl+Mayús+B colapsa el árbol.
        También puedes arrastrar una fila sobre otra.
      </p>

      <div aria-live="polite" className="binder-status" role="status">
        {pendingAction ? "Guardando cambios en el Binder…" : announcement}
      </div>

      {errorMessage !== null && (
        <p className="error-message" role="alert">
          {errorMessage}
        </p>
      )}

      {flatNodes.length === 0 ? (
        <div className="binder-empty">
          <p>Aún no hay elementos en este proyecto.</p>
          <p>Crea una carpeta, una escena o un documento para empezar.</p>
        </div>
      ) : (
        <BinderTree
          controller={controller}
          onKeyDown={handleTreeKeyDown}
          tree={tree}
          treeRef={treeRef}
        />
      )}

      {createOpen && (
        <form
          aria-labelledby="binder-create-heading"
          className="binder-create-form"
          id="binder-create-form"
          onSubmit={(event) => {
            void handleCreate(event);
          }}
        >
          <h3 id="binder-create-heading">Nuevo elemento</h3>
          <label>
            Título
            <input
              maxLength={200}
              onChange={(event) => setCreateTitle(event.target.value)}
              ref={titleInputRef}
              required
              value={createTitle}
            />
          </label>
          <label>
            Tipo
            <select
              onChange={(event) => {
                const nextKind = event.target.value as BinderNodeKind;
                if (creationKinds.includes(nextKind)) {
                  setCreateKind(nextKind);
                }
              }}
              value={createKind}
            >
              {creationKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {getBinderKindLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dentro de
            <select
              onChange={(event) =>
                setCreateParentId(
                  event.target.value === "" ? null : event.target.value,
                )
              }
              value={createParentId ?? ""}
            >
              <option value="">Raíz del proyecto</option>
              {flatFolders.map((entry) => (
                <option key={entry.node.id} value={entry.node.id}>
                  {`${"— ".repeat(entry.level - 1)}${entry.node.title}`}
                </option>
              ))}
            </select>
          </label>
          <div className="binder-create-actions">
            <button
              className="secondary-button"
              disabled={pendingAction}
              onClick={() => setCreateOpen(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={pendingAction || createTitle.trim().length === 0}
              type="submit"
            >
              {pendingAction ? "Creando…" : "Crear elemento"}
            </button>
          </div>
        </form>
      )}

      <BinderDeleteDialog
        descendantCount={deleteDescendantCount}
        errorMessage={errorMessage}
        isBusy={pendingAction}
        onCancel={() => {
          setDeleteTarget(null);
          setErrorMessage(null);
        }}
        onConfirm={() => {
          void confirmDelete();
        }}
        target={deleteTarget}
      />

      <BinderMoveDialog
        errorMessage={errorMessage}
        isBusy={pendingAction}
        nodes={nodes}
        onCancel={() => {
          setMoveTarget(null);
          setErrorMessage(null);
        }}
        onMove={(parentId, position) => {
          void handleMoveFromDialog(parentId, position);
        }}
        target={moveTarget}
      />
    </section>
  );
}
