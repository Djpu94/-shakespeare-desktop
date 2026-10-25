import { describe, expect, it } from "vitest";
import {
  MAX_RICH_TEXT_BLOCKS,
  MAX_RICH_TEXT_BLOCK_TEXT_LENGTH,
  MAX_SERIALIZED_RICH_TEXT_LENGTH,
  RICH_TEXT_DOCUMENT_VERSION,
  RichTextContentError,
  RichTextContentStringSchema,
  RichTextDocumentSchema,
  countRichTextWords,
  createEmptyRichTextDocument,
  isEmptyRichTextDocument,
  isValidSerializedRichTextContent,
  parseRichTextContent,
  plainTextToRichTextDocument,
  richTextCharacterCount,
  richTextToPlainText,
  serializeRichTextContent,
} from "./rich-text.schema.js";

function paragraph(text: string): {
  type: "paragraph";
  content: Array<{ type: "text"; text: string; marks: [] }>;
} {
  return {
    type: "paragraph",
    content: text.length === 0 ? [] : [{ type: "text", text, marks: [] }],
  };
}

describe("rich-text content contract", () => {
  it("serializes and parses a validated versioned document", () => {
    const document = {
      version: RICH_TEXT_DOCUMENT_VERSION,
      blocks: [
        {
          type: "heading" as const,
          level: 1 as const,
          content: [{ type: "text" as const, text: "Parte uno", marks: [] }],
        },
        {
          type: "paragraph" as const,
          content: [
            { type: "text" as const, text: "Hola ", marks: [] },
            { type: "text" as const, text: "mundo", marks: ["bold" as const] },
            { type: "hardBreak" as const },
            { type: "text" as const, text: "adiós", marks: [] },
          ],
        },
      ],
    };

    const serialized = serializeRichTextContent(document);
    expect(JSON.parse(serialized)).toEqual(document);
    expect(parseRichTextContent(serialized)).toEqual(document);
  });

  it("creates one editable paragraph for empty documents", () => {
    const empty = createEmptyRichTextDocument();
    expect(empty.blocks).toHaveLength(1);
    expect(empty.blocks[0]).toEqual({ type: "paragraph", content: [] });
    expect(isEmptyRichTextDocument(empty)).toBe(true);
    expect(richTextToPlainText(empty)).toBe("");
    expect(countRichTextWords(empty)).toBe(0);
    expect(parseRichTextContent(null)).toEqual(empty);
    expect(parseRichTextContent("   ")).toEqual(empty);
  });

  it("rejects arbitrary HTML and malformed versioned payloads", () => {
    expect(RichTextContentStringSchema.safeParse("<p>hola</p>").success).toBe(
      false,
    );
    expect(
      RichTextContentStringSchema.safeParse(
        serializeRichTextContent(createEmptyRichTextDocument()),
      ).success,
    ).toBe(true);
    expect(RichTextContentStringSchema.safeParse("").success).toBe(true);

    expect(() => parseRichTextContent('{"version":1,"blocks":[]}')).toThrow(
      RichTextContentError,
    );
    expect(() =>
      parseRichTextContent(
        JSON.stringify({
          version: 1,
          blocks: [{ type: "script", content: [] }],
        }),
      ),
    ).toThrow(RichTextContentError);
    expect(() =>
      parseRichTextContent(
        JSON.stringify({
          version: 99,
          blocks: [paragraph("hola")],
        }),
      ),
    ).toThrow(RichTextContentError);
  });

  it("rejects duplicate marks, unknown marks, and unsupported block shapes", () => {
    const duplicateMark = {
      version: 1,
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hola", marks: ["bold", "bold"] }],
        },
      ],
    };
    expect(RichTextDocumentSchema.safeParse(duplicateMark).success).toBe(false);

    const unknownMark = {
      version: 1,
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hola", marks: ["blink"] }],
        },
      ],
    };
    expect(RichTextDocumentSchema.safeParse(unknownMark).success).toBe(false);

    const unknownField = {
      version: 1,
      blocks: [{ type: "paragraph", content: [], html: "<b>hola</b>" }],
    };
    expect(RichTextDocumentSchema.safeParse(unknownField).success).toBe(false);
  });

  it("reads legacy plain text without interpreting it as HTML", () => {
    const legacy = parseRichTextContent("<b>Hola</b>\n\nSegundo párrafo");

    expect(legacy.blocks).toEqual([
      paragraph("<b>Hola</b>"),
      paragraph(""),
      paragraph("Segundo párrafo"),
    ]);
    expect(richTextToPlainText(legacy)).toBe("<b>Hola</b>\n\nSegundo párrafo");
  });

  it("converts plain text with normalized line endings", () => {
    expect(plainTextToRichTextDocument("uno\r\ndos")).toEqual({
      version: 1,
      blocks: [paragraph("uno"), paragraph("dos")],
    });
  });

  it("counts words and characters across block types", () => {
    const document = {
      version: RICH_TEXT_DOCUMENT_VERSION,
      blocks: [
        paragraph("Hola mundo"),
        {
          type: "bulletList" as const,
          items: [
            [{ type: "text" as const, text: "uno", marks: [] }],
            [{ type: "text" as const, text: "dos tres", marks: [] }],
          ],
        },
        {
          type: "codeBlock" as const,
          text: "const x = 1;",
        },
      ],
    };

    expect(countRichTextWords(document)).toBe(9);
    expect(richTextCharacterCount(document)).toBeGreaterThan(0);
    expect(richTextToPlainText(document)).toContain("- uno");
  });

  it("enforces document, block, and serialized size limits", () => {
    const tooManyBlocks = {
      version: 1,
      blocks: Array.from({ length: MAX_RICH_TEXT_BLOCKS + 1 }, () =>
        paragraph(""),
      ),
    };
    expect(RichTextDocumentSchema.safeParse(tooManyBlocks).success).toBe(false);
    expect(() =>
      plainTextToRichTextDocument("\n".repeat(MAX_RICH_TEXT_BLOCKS)),
    ).toThrow(RichTextContentError);

    const tooLongText = "a".repeat(MAX_RICH_TEXT_BLOCK_TEXT_LENGTH + 1);
    expect(
      RichTextDocumentSchema.safeParse({
        version: 1,
        blocks: [paragraph("ok"), paragraph(tooLongText)],
      }).success,
    ).toBe(false);

    expect(
      isValidSerializedRichTextContent(
        "a".repeat(MAX_SERIALIZED_RICH_TEXT_LENGTH + 1),
      ),
    ).toBe(false);
  });
});
