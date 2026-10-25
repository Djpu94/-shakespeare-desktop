import { describe, expect, it } from "vitest";
import type { RichTextDocument } from "@shakespeare/shared";
import {
  EditorCursorStore,
  clampEditorCursor,
  getBlockItemLengths,
  inlineContentLength,
  isEditorCursor,
} from "./cursor-position.js";

const DOCUMENT: RichTextDocument = {
  version: 1,
  blocks: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hola", marks: [] },
        { type: "hardBreak" },
        { type: "text", text: "mundo", marks: [] },
      ],
    },
    {
      type: "heading",
      level: 2,
      content: [{ type: "text", text: "Título", marks: ["bold"] }],
    },
    {
      type: "bulletList",
      items: [
        [{ type: "text", text: "uno", marks: [] }],
        [{ type: "text", text: "dos", marks: [] }],
      ],
    },
    { type: "codeBlock", text: "const x = 1;\nconst y = 2;" },
  ],
};

describe("editor cursor model", () => {
  it("measures inline content and block item lengths", () => {
    expect(
      inlineContentLength([
        { type: "text", text: "Hola", marks: [] },
        { type: "hardBreak" },
        { type: "text", text: "mundo", marks: [] },
      ]),
    ).toBe(10);
    expect(getBlockItemLengths(DOCUMENT.blocks[0]!)).toEqual([10]);
    expect(getBlockItemLengths(DOCUMENT.blocks[2]!)).toEqual([3, 3]);
    expect(getBlockItemLengths(DOCUMENT.blocks[3]!)).toEqual([25]);
  });

  it("clamps cursor positions to existing blocks and offsets", () => {
    expect(
      clampEditorCursor(DOCUMENT, {
        blockIndex: 0,
        itemIndex: null,
        offset: 99,
      }),
    ).toEqual({ blockIndex: 0, itemIndex: null, offset: 10 });
    expect(
      clampEditorCursor(DOCUMENT, {
        blockIndex: 99,
        itemIndex: 3,
        offset: 99,
      }),
    ).toEqual({ blockIndex: 3, itemIndex: null, offset: 25 });
    expect(
      clampEditorCursor(DOCUMENT, {
        blockIndex: 2,
        itemIndex: 9,
        offset: 99,
      }),
    ).toEqual({ blockIndex: 2, itemIndex: 1, offset: 3 });
    expect(
      clampEditorCursor(DOCUMENT, {
        blockIndex: 2,
        itemIndex: null,
        offset: -5,
      }),
    ).toEqual({ blockIndex: 2, itemIndex: 0, offset: 0 });
  });

  it("recognises serialised cursor values", () => {
    expect(isEditorCursor({ blockIndex: 0, itemIndex: null, offset: 2 })).toBe(
      true,
    );
    expect(isEditorCursor({ blockIndex: 0, itemIndex: 1, offset: 2 })).toBe(
      true,
    );
    expect(
      isEditorCursor({ blockIndex: "0", itemIndex: null, offset: 2 }),
    ).toBe(false);
    expect(isEditorCursor(null)).toBe(false);
  });

  it("stores independent cursor snapshots per document", () => {
    const store = new EditorCursorStore();
    store.set("a", { blockIndex: 0, itemIndex: null, offset: 2 });
    store.set("b", { blockIndex: 1, itemIndex: null, offset: 4 });

    const cursor = store.get("a");
    expect(cursor).toEqual({ blockIndex: 0, itemIndex: null, offset: 2 });
    if (cursor !== null) {
      (cursor as { offset: number }).offset = 99;
    }
    expect(store.get("a")?.offset).toBe(2);

    store.clear("a");
    expect(store.get("a")).toBeNull();
    store.clearAll();
    expect(store.get("b")).toBeNull();
  });
});
