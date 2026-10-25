import { z } from "zod";

/**
 * Versioned, serializable representation of a rich-text document.
 *
 * The editor persists this contract as JSON inside `BinderNode.content`; the
 * string never contains HTML. Every read and write goes through this schema so
 * unsupported nodes, marks, or oversized documents are rejected instead of
 * being rendered or persisted blindly.
 */
export const RICH_TEXT_DOCUMENT_VERSION = 1 as const;

export const MAX_RICH_TEXT_BLOCKS = 10_000;
export const MAX_RICH_TEXT_INLINE_NODES = 20_000;
export const MAX_RICH_TEXT_BLOCK_TEXT_LENGTH = 200_000;
export const MAX_SERIALIZED_RICH_TEXT_LENGTH = 1_000_000;

export const RICH_TEXT_MARKS = ["bold", "italic", "underline", "code"] as const;

export const RichTextMarkSchema = z.enum(RICH_TEXT_MARKS);
export const RichTextHeadingLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

const RichTextMarksSchema = z
  .array(RichTextMarkSchema)
  .max(RICH_TEXT_MARKS.length)
  .refine((marks) => new Set(marks).size === marks.length, {
    message: "Rich text marks cannot repeat.",
  });

export const RichTextTextSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1).max(MAX_RICH_TEXT_BLOCK_TEXT_LENGTH),
    marks: RichTextMarksSchema,
  })
  .strict();

export const RichTextHardBreakSchema = z
  .object({ type: z.literal("hardBreak") })
  .strict();

export const RichTextInlineSchema = z.discriminatedUnion("type", [
  RichTextTextSchema,
  RichTextHardBreakSchema,
]);

const RichTextInlineListSchema = z
  .array(RichTextInlineSchema)
  .max(MAX_RICH_TEXT_INLINE_NODES);

export const RichTextParagraphSchema = z
  .object({
    type: z.literal("paragraph"),
    content: RichTextInlineListSchema,
  })
  .strict();

export const RichTextHeadingSchema = z
  .object({
    type: z.literal("heading"),
    level: RichTextHeadingLevelSchema,
    content: RichTextInlineListSchema,
  })
  .strict();

export const RichTextBlockquoteSchema = z
  .object({
    type: z.literal("blockquote"),
    content: RichTextInlineListSchema,
  })
  .strict();

export const RichTextBulletListSchema = z
  .object({
    type: z.literal("bulletList"),
    items: z.array(RichTextInlineListSchema).min(1).max(5_000),
  })
  .strict();

export const RichTextOrderedListSchema = z
  .object({
    type: z.literal("orderedList"),
    items: z.array(RichTextInlineListSchema).min(1).max(5_000),
  })
  .strict();

export const RichTextCodeBlockSchema = z
  .object({
    type: z.literal("codeBlock"),
    text: z.string().max(MAX_RICH_TEXT_BLOCK_TEXT_LENGTH),
  })
  .strict();

export const RichTextBlockSchema = z.discriminatedUnion("type", [
  RichTextParagraphSchema,
  RichTextHeadingSchema,
  RichTextBlockquoteSchema,
  RichTextBulletListSchema,
  RichTextOrderedListSchema,
  RichTextCodeBlockSchema,
]);

export const RichTextDocumentSchema = z
  .object({
    version: z.literal(RICH_TEXT_DOCUMENT_VERSION),
    blocks: z.array(RichTextBlockSchema).min(1).max(MAX_RICH_TEXT_BLOCKS),
  })
  .strict();

export type RichTextMark = z.infer<typeof RichTextMarkSchema>;
export type RichTextHeadingLevel = z.infer<typeof RichTextHeadingLevelSchema>;
export type RichTextInline = z.infer<typeof RichTextInlineSchema>;
export type RichTextParagraph = z.infer<typeof RichTextParagraphSchema>;
export type RichTextHeading = z.infer<typeof RichTextHeadingSchema>;
export type RichTextBlockquote = z.infer<typeof RichTextBlockquoteSchema>;
export type RichTextBulletList = z.infer<typeof RichTextBulletListSchema>;
export type RichTextOrderedList = z.infer<typeof RichTextOrderedListSchema>;
export type RichTextCodeBlock = z.infer<typeof RichTextCodeBlockSchema>;
export type RichTextBlock = z.infer<typeof RichTextBlockSchema>;
export type RichTextDocument = z.infer<typeof RichTextDocumentSchema>;

export type RichTextContentErrorCode = "INVALID_CONTENT" | "CONTENT_TOO_LARGE";

export class RichTextContentError extends Error {
  constructor(
    public readonly code: RichTextContentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RichTextContentError";
  }
}

const EMPTY_PARAGRAPH: RichTextParagraph = {
  type: "paragraph",
  content: [],
};

export function createEmptyRichTextDocument(): RichTextDocument {
  return {
    version: RICH_TEXT_DOCUMENT_VERSION,
    blocks: [{ ...EMPTY_PARAGRAPH, content: [] }],
  };
}

function createTextInline(text: string): RichTextInline | null {
  if (text.length === 0) {
    return null;
  }

  return { type: "text", text, marks: [] };
}

function paragraphFromLine(line: string): RichTextParagraph {
  const text = createTextInline(line);
  return {
    type: "paragraph",
    content: text === null ? [] : [text],
  };
}

/**
 * Converts plain text into the rich-text contract. Used for content written by
 * earlier versions of the application, which stored plain text in the same
 * `content` column, and never interprets the source as HTML.
 */
export function plainTextToRichTextDocument(
  plainText: string,
): RichTextDocument {
  const normalized = plainText.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const lines = normalized.split("\n");
  if (lines.length > MAX_RICH_TEXT_BLOCKS) {
    throw new RichTextContentError(
      "CONTENT_TOO_LARGE",
      "The document contains too many paragraphs.",
    );
  }

  return {
    version: RICH_TEXT_DOCUMENT_VERSION,
    blocks: lines.map(paragraphFromLine),
  };
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      "version" in parsed
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Parses persisted `BinderNode.content` into a validated document.
 *
 * - `null` and blank strings produce an empty document.
 * - A JSON object with a `version` field must satisfy the strict schema; a
 *   malformed versioned payload is an error, never silently downgraded.
 * - Anything else is legacy plain text and is converted paragraph by paragraph.
 */
export function parseRichTextContent(raw: string | null): RichTextDocument {
  if (raw === null || raw.trim().length === 0) {
    return createEmptyRichTextDocument();
  }

  const versioned = tryParseJsonObject(raw);
  if (versioned !== null) {
    const parsed = RichTextDocumentSchema.safeParse(versioned);
    if (!parsed.success) {
      throw new RichTextContentError(
        "INVALID_CONTENT",
        "The stored rich-text document does not satisfy the content contract.",
      );
    }
    return parsed.data;
  }

  return plainTextToRichTextDocument(raw);
}

export function serializeRichTextContent(document: RichTextDocument): string {
  const validated = RichTextDocumentSchema.parse(document);
  const serialized = JSON.stringify(validated);
  if (serialized.length > MAX_SERIALIZED_RICH_TEXT_LENGTH) {
    throw new RichTextContentError(
      "CONTENT_TOO_LARGE",
      "The serialized document exceeds the maximum allowed size.",
    );
  }

  return serialized;
}

/**
 * Validates the exact string shape accepted by the IPC write boundary. Empty
 * content is allowed so new documents can start without a round trip; any
 * non-empty value must be a serialized rich-text document.
 */
export function isValidSerializedRichTextContent(value: string): boolean {
  if (value.length === 0) {
    return true;
  }
  if (value.length > MAX_SERIALIZED_RICH_TEXT_LENGTH) {
    return false;
  }

  const versioned = tryParseJsonObject(value);
  if (versioned === null) {
    return false;
  }

  return RichTextDocumentSchema.safeParse(versioned).success;
}

export const RichTextContentStringSchema = z
  .string()
  .max(MAX_SERIALIZED_RICH_TEXT_LENGTH)
  .refine(isValidSerializedRichTextContent, {
    message: "Binder content must be a serialized rich-text document.",
  });

function inlineToPlainText(inline: RichTextInline): string {
  return inline.type === "text" ? inline.text : "\n";
}

function inlineListToPlainText(content: readonly RichTextInline[]): string {
  return content.map(inlineToPlainText).join("");
}

function countInlineWords(content: readonly RichTextInline[]): number {
  const text = inlineListToPlainText(content).trim();
  return text.length === 0 ? 0 : text.split(/\s+/u).length;
}

function countBlockWords(block: RichTextBlock): number {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "blockquote":
      return countInlineWords(block.content);
    case "bulletList":
    case "orderedList":
      return block.items.reduce(
        (total, item) => total + countInlineWords(item),
        0,
      );
    case "codeBlock":
      return block.text.trim().length === 0
        ? 0
        : block.text.trim().split(/\s+/u).length;
  }
}

function blockToPlainText(block: RichTextBlock): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "blockquote":
      return inlineListToPlainText(block.content);
    case "bulletList":
      return block.items
        .map((item) => `- ${inlineListToPlainText(item)}`)
        .join("\n");
    case "orderedList":
      return block.items
        .map((item, index) => `${index + 1}. ${inlineListToPlainText(item)}`)
        .join("\n");
    case "codeBlock":
      return block.text;
  }
}

export function richTextToPlainText(document: RichTextDocument): string {
  return document.blocks.map(blockToPlainText).join("\n");
}

export function richTextCharacterCount(document: RichTextDocument): number {
  return richTextToPlainText(document).length;
}

export function countRichTextWords(document: RichTextDocument): number {
  return document.blocks.reduce(
    (total, block) => total + countBlockWords(block),
    0,
  );
}

export function isEmptyRichTextDocument(document: RichTextDocument): boolean {
  return richTextToPlainText(document).trim().length === 0;
}
