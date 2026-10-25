import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode, RefObject } from "react";
import type { BinderNode } from "@shakespeare/shared";
import {
  buildBinderTree,
  flattenBinderTree,
  getBinderChildren,
  isBinderDescendant,
  isValidBinderMove,
} from "./binder-tree.js";
import { getBinderKindLabel } from "./binder-types.js";

interface BinderDialogProps {
  open: boolean;
  titleId: string;
  initialFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  children: ReactNode;
}

function BinderDialog({
  open,
  titleId,
  initialFocusRef,
  onCancel,
  children,
}: BinderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => initialFocusRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocusRef]);

  return (
    <dialog
      aria-labelledby={titleId}
      className="binder-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}

interface BinderDeleteDialogProps {
  target: BinderNode | null;
  descendantCount: number;
  isBusy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BinderDeleteDialog({
  target,
  descendantCount,
  isBusy,
  errorMessage,
  onCancel,
  onConfirm,
}: BinderDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  function getConsequenceText(): string {
    if (descendantCount === 0) {
      return "No contiene otros elementos.";
    }
    if (descendantCount === 1) {
      return "También se eliminará 1 elemento que está dentro.";
    }
    return `También se eliminarán ${descendantCount} elementos que están dentro.`;
  }

  return (
    <BinderDialog
      initialFocusRef={cancelRef}
      onCancel={onCancel}
      open={target !== null}
      titleId="binder-delete-title"
    >
      {target !== null && (
        <div className="dialog-content">
          <p className="eyebrow">{getBinderKindLabel(target.kind)}</p>
          <h2 id="binder-delete-title">Eliminar «{target.title}»</h2>
          <p>
            {getConsequenceText()} Esta acción no se puede deshacer y el
            contenido se eliminará del proyecto.
          </p>
          {errorMessage !== null && (
            <p className="dialog-error" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={isBusy}
              onClick={onCancel}
              ref={cancelRef}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="danger-button"
              disabled={isBusy}
              onClick={onConfirm}
              type="button"
            >
              {isBusy ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </div>
      )}
    </BinderDialog>
  );
}

interface BinderMoveDialogProps {
  target: BinderNode | null;
  nodes: readonly BinderNode[];
  isBusy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onMove: (parentId: string | null, position: number) => void;
}

interface FolderOption {
  id: string;
  label: string;
}

function getFolderOptions(
  nodes: readonly BinderNode[],
  target: BinderNode | null,
): FolderOption[] {
  const allFolders = new Set(
    nodes.filter((node) => node.kind === "folder").map((node) => node.id),
  );
  const tree = buildBinderTree(nodes);
  const flatFolders = flattenBinderTree(tree, allFolders).filter(
    (entry) => entry.node.kind === "folder",
  );

  return flatFolders
    .filter((entry) => {
      if (target === null) {
        return true;
      }
      return (
        entry.node.id !== target.id &&
        !isBinderDescendant(nodes, target.id, entry.node.id)
      );
    })
    .map((entry) => ({
      id: entry.node.id,
      label: `${"— ".repeat(entry.level - 1)}${entry.node.title}`,
    }));
}

export function BinderMoveDialog({
  target,
  nodes,
  isBusy,
  errorMessage,
  onCancel,
  onMove,
}: BinderMoveDialogProps) {
  const destinationRef = useRef<HTMLSelectElement>(null);
  const [destinationParentId, setDestinationParentId] = useState<string | null>(
    null,
  );
  const [position, setPosition] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (target === null) {
      return;
    }

    const siblings = getBinderChildren(nodes, target.parentId).filter(
      (node) => node.id !== target.id,
    );
    setDestinationParentId(target.parentId);
    setPosition(Math.min(target.position, siblings.length));
    setLocalError(null);
  }, [target, nodes]);

  const folderOptions = getFolderOptions(nodes, target);
  const destinationSiblings = getBinderChildren(
    nodes,
    destinationParentId,
  ).filter((node) => node.id !== target?.id);
  const maxPosition = destinationSiblings.length;

  function handleDestinationChange(value: string): void {
    const nextParentId = value === "" ? null : value;
    setDestinationParentId(nextParentId);
    const nextSiblings = getBinderChildren(nodes, nextParentId).filter(
      (node) => node.id !== target?.id,
    );
    setPosition(nextSiblings.length);
    setLocalError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (target === null) {
      return;
    }
    if (!isValidBinderMove(nodes, target.id, destinationParentId, position)) {
      setLocalError("El destino o la posición seleccionados no son válidos.");
      return;
    }
    setLocalError(null);
    onMove(destinationParentId, position);
  }

  function getPositionLabel(index: number): string {
    if (index === 0) {
      return "Al principio";
    }
    if (index === maxPosition) {
      return "Al final";
    }
    const before = destinationSiblings[index];
    return before === undefined
      ? `Posición ${index + 1}`
      : `Antes de «${before.title}»`;
  }

  return (
    <BinderDialog
      initialFocusRef={destinationRef}
      onCancel={onCancel}
      open={target !== null}
      titleId="binder-move-title"
    >
      {target !== null && (
        <form className="dialog-content" onSubmit={handleSubmit}>
          <p className="eyebrow">Reorganizar Binder</p>
          <h2 id="binder-move-title">Mover «{target.title}»</h2>
          <p>
            Elige una carpeta y la posición. Solo las carpetas pueden contener
            otros elementos.
          </p>
          <label>
            Carpeta de destino
            <select
              onChange={(event) => handleDestinationChange(event.target.value)}
              ref={destinationRef}
              value={destinationParentId ?? ""}
            >
              <option value="">Raíz del proyecto</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Posición
            <select
              onChange={(event) => setPosition(Number(event.target.value))}
              value={position}
            >
              {Array.from({ length: maxPosition + 1 }, (_, index) => (
                <option key={index} value={index}>
                  {getPositionLabel(index)}
                </option>
              ))}
            </select>
          </label>
          {(localError ?? errorMessage) !== null && (
            <p className="dialog-error" role="alert">
              {localError ?? errorMessage}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={isBusy}
              onClick={onCancel}
              type="button"
            >
              Cancelar
            </button>
            <button className="primary-button" disabled={isBusy} type="submit">
              {isBusy ? "Moviendo…" : "Mover"}
            </button>
          </div>
        </form>
      )}
    </BinderDialog>
  );
}
