import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ClipboardEvent, DragEvent, KeyboardEvent } from "react";
import type { RichTextDocument } from "@shakespeare/shared";
import {
  RichTextContentError,
  isEmptyRichTextDocument,
} from "@shakespeare/shared";
import type { EditorCommand } from "./editor-commands.js";
import {
  EDITOR_COMMAND_DEFINITIONS,
  resolveEditorCommand,
} from "./editor-commands.js";
import type { EditorCursor } from "./cursor-position.js";
import { clampEditorCursor } from "./cursor-position.js";
import {
  applyEditorCommand,
  captureEditorCursor,
  getEditorFormattingState,
  readRichTextDocumentFromElement,
  renderRichTextDocument,
  restoreEditorCursor,
  type EditorFormattingState,
} from "./rich-text-dom.js";

export interface RichTextEditorHandle {
  focus(): void;
  applyCommand(command: EditorCommand): void;
}

export interface RichTextEditorProps {
  documentId: string;
  title: string;
  initialDocument: RichTextDocument;
  initialCursor: EditorCursor | null;
  zoom: number;
  describedBy?: string;
  ariaLabel?: string;
  onChange(document: RichTextDocument): void;
  onCursorChange(cursor: EditorCursor): void;
  onFormattingChange(state: EditorFormattingState): void;
  onContentError(message: string): void;
}

function describeContentError(error: unknown): string {
  if (error instanceof RichTextContentError) {
    return error.code === "CONTENT_TOO_LARGE"
      ? "El texto supera el tamaño máximo que puede guardar el editor. Reduce su extensión para seguir editando."
      : "El texto contiene una estructura que el editor no puede guardar. Revisa el contenido.";
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "editor.content_parse_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return "No se pudo leer el contenido del editor. Vuelve a intentarlo.";
}

function selectionInside(root: HTMLElement): boolean {
  const selection = root.ownerDocument.getSelection();
  return (
    selection !== null &&
    selection.rangeCount > 0 &&
    selection.anchorNode !== null &&
    root.contains(selection.anchorNode)
  );
}

/**
 * Local rich-text editor backed by the validated content contract. The DOM is
 * rendered from the contract (never from stored HTML) and every edit is parsed
 * back into a document before it reaches the autosave controller.
 */
export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(function RichTextEditor(
  {
    documentId,
    title,
    initialDocument,
    initialCursor,
    zoom,
    describedBy,
    ariaLabel,
    onChange,
    onCursorChange,
    onFormattingChange,
    onContentError,
  },
  ref,
) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pendingCursorRef = useRef<EditorCursor | null>(initialCursor);
  const [isEmpty, setIsEmpty] = useState(() =>
    isEmptyRichTextDocument(initialDocument),
  );

  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onFormattingChangeRef = useRef(onFormattingChange);
  const onContentErrorRef = useRef(onContentError);
  onChangeRef.current = onChange;
  onCursorChangeRef.current = onCursorChange;
  onFormattingChangeRef.current = onFormattingChange;
  onContentErrorRef.current = onContentError;

  function emitDocument(root: HTMLElement): void {
    try {
      const document = readRichTextDocumentFromElement(root);
      setIsEmpty(isEmptyRichTextDocument(document));
      onChangeRef.current(document);
    } catch (error) {
      onContentErrorRef.current(describeContentError(error));
    }

    const cursor = captureEditorCursor(root);
    if (cursor !== null) {
      onCursorChangeRef.current(cursor);
    }
    onFormattingChangeRef.current(getEditorFormattingState(root));
  }

  useEffect(() => {
    const root = surfaceRef.current;
    if (root === null) {
      return;
    }

    root.replaceChildren(renderRichTextDocument(initialDocument));
    setIsEmpty(isEmptyRichTextDocument(initialDocument));
    pendingCursorRef.current =
      initialCursor === null
        ? null
        : clampEditorCursor(initialDocument, initialCursor);
    if (pendingCursorRef.current !== null) {
      // Keep the remembered caret ready for the next focus without stealing
      // focus from the Binder. A later pointer click still wins.
      restoreEditorCursor(root, pendingCursorRef.current);
    }

    return () => {
      const selection = root.ownerDocument.getSelection();
      if (selection !== null && root.contains(selection.anchorNode)) {
        selection.removeAllRanges();
      }
    };
    // The component is keyed by document id; this effect runs once per mount.
  }, []);

  useEffect(() => {
    function handleSelectionChange(): void {
      const root = surfaceRef.current;
      if (root === null || !selectionInside(root)) {
        return;
      }

      const cursor = captureEditorCursor(root);
      if (cursor !== null && pendingCursorRef.current === null) {
        onCursorChangeRef.current(cursor);
      }
      onFormattingChangeRef.current(getEditorFormattingState(root));
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focus(): void {
        surfaceRef.current?.focus();
      },
      applyCommand(command: EditorCommand): void {
        const root = surfaceRef.current;
        if (root === null) {
          return;
        }
        root.focus();
        applyEditorCommand(root, command);
        emitDocument(root);
      },
    }),
    [],
  );

  function handleFocus(): void {
    const root = surfaceRef.current;
    if (root === null || selectionInside(root)) {
      pendingCursorRef.current = null;
      return;
    }

    const cursor = pendingCursorRef.current;
    if (cursor !== null) {
      restoreEditorCursor(root, cursor);
      pendingCursorRef.current = null;
    }
  }

  function handleInput(): void {
    const root = surfaceRef.current;
    if (root === null) {
      return;
    }
    emitDocument(root);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const command = resolveEditorCommand({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
    });

    if (command !== null) {
      event.preventDefault();
      applyEditorCommand(event.currentTarget, command);
      emitDocument(event.currentTarget);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      const selection = event.currentTarget.ownerDocument.getSelection();
      const anchor = selection?.anchorNode ?? null;
      const insidePre =
        anchor !== null &&
        (anchor instanceof Element
          ? anchor.closest("pre")
          : anchor.parentElement?.closest("pre")) !== null;
      if (insidePre) {
        return;
      }

      event.preventDefault();
      event.currentTarget.ownerDocument.execCommand("insertParagraph", false);
      emitDocument(event.currentTarget);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    if (text.length === 0) {
      return;
    }
    event.currentTarget.ownerDocument.execCommand("insertText", false, text);
    emitDocument(event.currentTarget);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    const text = event.dataTransfer.getData("text/plain");
    event.preventDefault();
    if (text.length === 0) {
      return;
    }
    event.currentTarget.ownerDocument.execCommand("insertText", false, text);
    emitDocument(event.currentTarget);
  }

  function handleBlur(): void {
    const root = surfaceRef.current;
    if (root === null) {
      return;
    }
    const cursor = captureEditorCursor(root);
    if (cursor !== null) {
      onCursorChangeRef.current(cursor);
    }
  }

  return (
    <div
      aria-describedby={describedBy}
      aria-keyshortcuts={EDITOR_COMMAND_DEFINITIONS.map(
        (definition) => definition.ariaKeyShortcut,
      ).join(" ")}
      aria-label={ariaLabel ?? `Contenido de ${title}`}
      aria-multiline="true"
      autoCapitalize="sentences"
      className="editor-surface"
      contentEditable
      data-document-id={documentId}
      data-empty={isEmpty}
      data-placeholder="Empieza a escribir aquí…"
      onBlur={handleBlur}
      onDrop={handleDrop}
      onFocus={handleFocus}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      ref={surfaceRef}
      role="textbox"
      spellCheck
      style={{ fontSize: `${zoom}%` }}
      suppressContentEditableWarning
      tabIndex={0}
    />
  );
});
