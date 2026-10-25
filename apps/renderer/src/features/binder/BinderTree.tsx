import { useLayoutEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from "react";
import type { BinderNode } from "@shakespeare/shared";
import {
  BinderChevron,
  BinderKindIcon,
  BinderMenuIcon,
} from "./binder-icons.js";
import { getBinderKindLabel } from "./binder-types.js";
import type {
  BinderDropPlacement,
  BinderTreeNode as TreeEntry,
} from "./binder-tree.js";

export interface BinderDropTarget {
  nodeId: string;
  placement: BinderDropPlacement;
}

export interface BinderTreeController {
  selectedNodeId: string | null;
  focusedNodeId: string | null;
  expandedIds: ReadonlySet<string>;
  renamingNodeId: string | null;
  renameDraft: string;
  openMenuNodeId: string | null;
  busyNodeId: string | null;
  isBusy: boolean;
  draggedNodeId: string | null;
  dropTarget: BinderDropTarget | null;
  onFocusNode: (nodeId: string) => void;
  onSelectNode: (node: BinderNode) => void;
  onToggleExpanded: (nodeId: string) => void;
  onStartRename: (node: BinderNode) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleMenu: (nodeId: string) => void;
  onCloseMenu: () => void;
  onRequestDelete: (node: BinderNode) => void;
  onOpenMoveDialog: (node: BinderNode) => void;
  onCreateInside: (node: BinderNode) => void;
  onMoveUp: (node: BinderNode) => void;
  onMoveDown: (node: BinderNode) => void;
  onIndent: (node: BinderNode) => void;
  onOutdent: (node: BinderNode) => void;
  canMoveUp: (node: BinderNode) => boolean;
  canMoveDown: (node: BinderNode) => boolean;
  canIndent: (node: BinderNode) => boolean;
  canOutdent: (node: BinderNode) => boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, node: BinderNode) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, node: BinderNode) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>, node: BinderNode) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, node: BinderNode) => void;
  onDragEnd: () => void;
}

interface BinderTreeProps {
  tree: readonly TreeEntry[];
  controller: BinderTreeController;
  treeRef: RefObject<HTMLUListElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLUListElement>) => void;
}

export function BinderTree({
  tree,
  controller,
  treeRef,
  onKeyDown,
}: BinderTreeProps) {
  return (
    <ul
      aria-busy={controller.isBusy}
      aria-describedby="binder-instructions"
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+Shift+ArrowLeft Alt+Shift+ArrowRight F2 Delete Control+Shift+B"
      aria-label="Árbol del Binder"
      className="binder-tree"
      onKeyDown={onKeyDown}
      ref={treeRef}
      role="tree"
    >
      {tree.map((entry, index) => (
        <BinderNodeItem
          controller={controller}
          entry={entry}
          key={entry.node.id}
          level={1}
          siblingCount={tree.length}
          siblingIndex={index}
        />
      ))}
    </ul>
  );
}

interface BinderNodeItemProps {
  entry: TreeEntry;
  level: number;
  siblingIndex: number;
  siblingCount: number;
  controller: BinderTreeController;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, input, textarea, select, a") !== null
  );
}

function BinderNodeItem({
  entry,
  level,
  siblingIndex,
  siblingCount,
  controller,
}: BinderNodeItemProps) {
  const { node, children } = entry;
  const itemRef = useRef<HTMLLIElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isFolder = node.kind === "folder";
  const isExpanded = controller.expandedIds.has(node.id);
  const isSelected = controller.selectedNodeId === node.id;
  const isFocused = controller.focusedNodeId === node.id;
  const isRenaming = controller.renamingNodeId === node.id;
  const isMenuOpen = controller.openMenuNodeId === node.id;
  const isBusy = controller.busyNodeId === node.id;
  const isDragging = controller.draggedNodeId === node.id;
  const dropPlacement =
    controller.dropTarget?.nodeId === node.id
      ? controller.dropTarget.placement
      : null;
  const kindLabel = getBinderKindLabel(node.kind);
  const [menuOpensUp, setMenuOpensUp] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState(352);

  useLayoutEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const item = itemRef.current;
    const row = item?.querySelector<HTMLElement>(".binder-row");
    if (row !== null && row !== undefined) {
      const rectangle = row.getBoundingClientRect();
      const scrollContainer = row.closest<HTMLElement>(".split-pane-primary");
      const containerRectangle = scrollContainer?.getBoundingClientRect();
      const boundaryTop = containerRectangle?.top ?? 0;
      const boundaryBottom = containerRectangle?.bottom ?? window.innerHeight;
      const spaceAbove = rectangle.top - boundaryTop - 8;
      const spaceBelow = boundaryBottom - rectangle.bottom - 8;
      const opensUp = spaceAbove > spaceBelow && spaceAbove >= 160;
      const availableSpace = Math.max(120, opensUp ? spaceAbove : spaceBelow);
      setMenuOpensUp(opensUp);
      setMenuMaxHeight(Math.min(352, availableSpace));
    }

    menuRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
  }, [isMenuOpen]);

  function handleRowClick(event: MouseEvent<HTMLLIElement>): void {
    if (isInteractiveTarget(event.target)) {
      return;
    }
    if (!isOwnItemEvent(event.target)) {
      return;
    }
    itemRef.current?.focus();
    controller.onSelectNode(node);
  }

  function handleRowDoubleClick(event: MouseEvent<HTMLLIElement>): void {
    if (isInteractiveTarget(event.target) || !isOwnItemEvent(event.target)) {
      return;
    }
    event.preventDefault();
    controller.onStartRename(node);
  }

  function isOwnItemEvent(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest("[role='treeitem']") === itemRef.current
    );
  }

  function handleFocus(event: FocusEvent<HTMLLIElement>): void {
    if (!isOwnItemEvent(event.target)) {
      return;
    }
    controller.onFocusNode(node.id);
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      controller.onCloseMenu();
      itemRef.current?.focus();
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
    if (buttons.length === 0) {
      return;
    }
    const currentIndex = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + offset + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  }

  function runMenuAction(action: () => void): void {
    controller.onCloseMenu();
    action();
  }

  const rowStyle = {
    "--binder-depth": level - 1,
  } as CSSProperties;

  return (
    <li
      aria-busy={isBusy}
      aria-expanded={isFolder ? isExpanded : undefined}
      aria-label={
        isFolder
          ? `${kindLabel}: ${node.title}, ${children.length} ${
              children.length === 1 ? "hijo directo" : "hijos directos"
            }`
          : `${kindLabel}: ${node.title}`
      }
      aria-level={level}
      aria-posinset={siblingIndex + 1}
      aria-selected={isSelected}
      aria-setsize={siblingCount}
      className="binder-tree-item"
      data-kind={node.kind}
      data-node-id={node.id}
      onClick={handleRowClick}
      onDoubleClick={handleRowDoubleClick}
      onFocus={handleFocus}
      ref={itemRef}
      role="treeitem"
      tabIndex={isFocused ? 0 : -1}
    >
      <div className="binder-row-anchor">
        <div
          className={isDragging ? "binder-row is-dragging" : "binder-row"}
          data-drop={dropPlacement ?? undefined}
          draggable={!isRenaming && !controller.isBusy}
          onDragEnd={controller.onDragEnd}
          onDragLeave={(event) => controller.onDragLeave(event, node)}
          onDragOver={(event) => controller.onDragOver(event, node)}
          onDragStart={(event) => controller.onDragStart(event, node)}
          onDrop={(event) => controller.onDrop(event, node)}
          style={rowStyle}
        >
          {isFolder ? (
            <button
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Contraer" : "Expandir"} ${node.title}`}
              className="binder-chevron"
              onClick={(event) => {
                event.stopPropagation();
                itemRef.current?.focus();
                controller.onToggleExpanded(node.id);
              }}
              onMouseDown={(event) => event.preventDefault()}
              tabIndex={-1}
              type="button"
            >
              <BinderChevron expanded={isExpanded} />
            </button>
          ) : (
            <span aria-hidden="true" className="binder-chevron-spacer" />
          )}

          <BinderKindIcon kind={node.kind} />

          {isRenaming ? (
            <input
              aria-label={`Nuevo título para ${node.title}`}
              autoFocus
              className="binder-rename-input"
              maxLength={200}
              onBlur={() => controller.onCommitRename()}
              onChange={(event) =>
                controller.onRenameDraftChange(event.target.value)
              }
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  controller.onCommitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  controller.onCancelRename();
                }
              }}
              value={controller.renameDraft}
            />
          ) : (
            <span className="binder-node-title">{node.title}</span>
          )}

          {isFolder && (
            <span aria-hidden="true" className="binder-child-count">
              {children.length}
            </span>
          )}

          {isBusy && (
            <span aria-hidden="true" className="binder-node-busy">
              …
            </span>
          )}

          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={`Acciones de ${node.title}`}
            className="binder-menu-trigger"
            data-binder-menu-trigger="true"
            onClick={(event) => {
              event.stopPropagation();
              itemRef.current?.focus();
              controller.onToggleMenu(node.id);
            }}
            onMouseDown={(event) => event.preventDefault()}
            tabIndex={-1}
            type="button"
          >
            <BinderMenuIcon />
          </button>
        </div>

        {isMenuOpen && (
          <div
            aria-label={`Acciones de ${node.title}`}
            className={
              menuOpensUp ? "binder-row-menu is-up" : "binder-row-menu"
            }
            data-binder-menu="true"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleMenuKeyDown}
            ref={menuRef}
            role="menu"
            style={{ maxHeight: menuMaxHeight }}
          >
            <button
              disabled={controller.isBusy}
              onClick={() =>
                runMenuAction(() => controller.onStartRename(node))
              }
              role="menuitem"
              type="button"
            >
              Renombrar <kbd>F2</kbd>
            </button>
            <button
              disabled={controller.isBusy || !controller.canMoveUp(node)}
              onClick={() => runMenuAction(() => controller.onMoveUp(node))}
              role="menuitem"
              type="button"
            >
              Mover arriba <kbd>Alt+↑</kbd>
            </button>
            <button
              disabled={controller.isBusy || !controller.canMoveDown(node)}
              onClick={() => runMenuAction(() => controller.onMoveDown(node))}
              role="menuitem"
              type="button"
            >
              Mover abajo <kbd>Alt+↓</kbd>
            </button>
            <button
              disabled={controller.isBusy || !controller.canIndent(node)}
              onClick={() => runMenuAction(() => controller.onIndent(node))}
              role="menuitem"
              type="button"
            >
              Anidar en la carpeta anterior <kbd>Alt+Mayús+→</kbd>
            </button>
            <button
              disabled={controller.isBusy || !controller.canOutdent(node)}
              onClick={() => runMenuAction(() => controller.onOutdent(node))}
              role="menuitem"
              type="button"
            >
              Sacar un nivel <kbd>Alt+Mayús+←</kbd>
            </button>
            <button
              disabled={controller.isBusy}
              onClick={() =>
                runMenuAction(() => controller.onOpenMoveDialog(node))
              }
              role="menuitem"
              type="button"
            >
              Mover a otra carpeta…
            </button>
            {isFolder && (
              <button
                disabled={controller.isBusy}
                onClick={() =>
                  runMenuAction(() => controller.onCreateInside(node))
                }
                role="menuitem"
                type="button"
              >
                Crear dentro…
              </button>
            )}
            <button
              className="is-danger"
              disabled={controller.isBusy}
              onClick={() =>
                runMenuAction(() => controller.onRequestDelete(node))
              }
              role="menuitem"
              type="button"
            >
              Eliminar… <kbd>Supr</kbd>
            </button>
          </div>
        )}
      </div>

      {isFolder && isExpanded && children.length > 0 && (
        <ul className="binder-group" role="group">
          {children.map((child, index) => (
            <BinderNodeItem
              controller={controller}
              entry={child}
              key={child.node.id}
              level={level + 1}
              siblingCount={children.length}
              siblingIndex={index}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
