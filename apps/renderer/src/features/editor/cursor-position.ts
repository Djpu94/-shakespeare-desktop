import type {
  RichTextBlock,
  RichTextDocument,
  RichTextInline,
} from "@shakespeare/shared";

/**
 * Serialisable caret position inside a rich-text document. It deliberately
 * avoids DOM nodes so positions survive a document switch and a remount.
 */
export interface EditorCursor {
  readonly blockIndex: number;
  readonly itemIndex: number | null;
  readonly offset: number;
}

export function inlineContentLength(
  content: readonly RichTextInline[],
): number {
  return content.reduce((total, inline) => {
    return total + (inline.type === "text" ? inline.text.length : 1);
  }, 0);
}

export function getBlockItemLengths(block: RichTextBlock): number[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "blockquote":
      return [inlineContentLength(block.content)];
    case "bulletList":
    case "orderedList":
      return block.items.map((item) => inlineContentLength(item));
    case "codeBlock":
      return [block.text.length];
  }
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

/**
 * Clamps a caret position to the blocks that still exist in the document. It
 * is used when restoring a cursor after switching documents or when content
 * changed externally.
 */
export function clampEditorCursor(
  document: RichTextDocument,
  cursor: EditorCursor,
): EditorCursor {
  const blockIndex = clampInteger(
    cursor.blockIndex,
    0,
    Math.max(0, document.blocks.length - 1),
  );
  const block = document.blocks[blockIndex];
  if (block === undefined) {
    return { blockIndex: 0, itemIndex: null, offset: 0 };
  }

  const lengths = getBlockItemLengths(block);
  const isList = block.type === "bulletList" || block.type === "orderedList";

  if (!isList || lengths.length === 0) {
    return {
      blockIndex,
      itemIndex: null,
      offset: clampInteger(cursor.offset, 0, lengths[0] ?? 0),
    };
  }

  const itemIndex = clampInteger(cursor.itemIndex ?? 0, 0, lengths.length - 1);
  return {
    blockIndex,
    itemIndex,
    offset: clampInteger(cursor.offset, 0, lengths[itemIndex] ?? 0),
  };
}

export function isEditorCursor(value: unknown): value is EditorCursor {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.blockIndex === "number" &&
    (candidate.itemIndex === null || typeof candidate.itemIndex === "number") &&
    typeof candidate.offset === "number"
  );
}

/**
 * In-memory caret memory for the documents opened during a session. The editor
 * keeps it up to date on selection changes and reads it when a document is
 * opened again.
 */
export class EditorCursorStore {
  private readonly cursors = new Map<string, EditorCursor>();

  get(nodeId: string): EditorCursor | null {
    const cursor = this.cursors.get(nodeId);
    return cursor === undefined ? null : { ...cursor };
  }

  set(nodeId: string, cursor: EditorCursor): void {
    this.cursors.set(nodeId, { ...cursor });
  }

  clear(nodeId: string): void {
    this.cursors.delete(nodeId);
  }

  clearAll(): void {
    this.cursors.clear();
  }
}
