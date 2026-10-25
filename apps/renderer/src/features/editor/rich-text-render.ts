import type {
  RichTextBlock,
  RichTextDocument,
  RichTextInline,
  RichTextMark,
} from "@shakespeare/shared";

/**
 * DOM-independent render plan for the rich-text document. Only allow-listed
 * elements are produced and every character stays inside a text node, so no
 * stored string is ever interpreted as HTML.
 */
export type RichTextRenderNode =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "element";
      readonly tag: "strong" | "em" | "u" | "code" | "br";
      readonly children: readonly RichTextRenderNode[];
    };

export interface RichTextSimpleRenderBlock {
  readonly type: "block";
  readonly tag: "p" | "h1" | "h2" | "h3" | "blockquote" | "pre";
  readonly blockIndex: number;
  readonly children: readonly RichTextRenderNode[];
}

export interface RichTextListRenderItem {
  readonly itemIndex: number;
  readonly children: readonly RichTextRenderNode[];
}

export interface RichTextListRenderBlock {
  readonly type: "list";
  readonly tag: "ul" | "ol";
  readonly blockIndex: number;
  readonly items: readonly RichTextListRenderItem[];
}

export type RichTextRenderBlock =
  RichTextSimpleRenderBlock | RichTextListRenderBlock;

export const RICH_TEXT_RENDER_TAGS = [
  "strong",
  "em",
  "u",
  "code",
  "br",
] as const;

const MARK_TAG: Record<RichTextMark, "strong" | "em" | "u" | "code"> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  code: "code",
};

const MARK_ORDER: readonly RichTextMark[] = [
  "bold",
  "italic",
  "underline",
  "code",
];

function renderInlineNode(inline: RichTextInline): RichTextRenderNode {
  if (inline.type === "hardBreak") {
    return { type: "element", tag: "br", children: [] };
  }

  let node: RichTextRenderNode = { type: "text", text: inline.text };
  for (const mark of [...MARK_ORDER].reverse()) {
    if (!inline.marks.includes(mark)) {
      continue;
    }
    node = { type: "element", tag: MARK_TAG[mark], children: [node] };
  }
  return node;
}

export function buildInlineRenderNodes(
  content: readonly RichTextInline[],
): RichTextRenderNode[] {
  return content.map(renderInlineNode);
}

function editableChildren(
  content: readonly RichTextInline[],
): RichTextRenderNode[] {
  const nodes = buildInlineRenderNodes(content);
  return nodes.length === 0
    ? [{ type: "element", tag: "br", children: [] }]
    : nodes;
}

function headingTag(level: 1 | 2 | 3): "h1" | "h2" | "h3" {
  switch (level) {
    case 1:
      return "h1";
    case 2:
      return "h2";
    case 3:
      return "h3";
  }
}

function renderBlock(
  block: RichTextBlock,
  blockIndex: number,
): RichTextRenderBlock {
  switch (block.type) {
    case "paragraph":
      return {
        type: "block",
        tag: "p",
        blockIndex,
        children: editableChildren(block.content),
      };
    case "heading":
      return {
        type: "block",
        tag: headingTag(block.level),
        blockIndex,
        children: editableChildren(block.content),
      };
    case "blockquote":
      return {
        type: "block",
        tag: "blockquote",
        blockIndex,
        children: editableChildren(block.content),
      };
    case "codeBlock":
      return {
        type: "block",
        tag: "pre",
        blockIndex,
        children:
          block.text.length === 0
            ? [{ type: "element", tag: "br", children: [] }]
            : [{ type: "text", text: block.text }],
      };
    case "bulletList":
      return {
        type: "list",
        tag: "ul",
        blockIndex,
        items: block.items.map((item, itemIndex) => ({
          itemIndex,
          children: editableChildren(item),
        })),
      };
    case "orderedList":
      return {
        type: "list",
        tag: "ol",
        blockIndex,
        items: block.items.map((item, itemIndex) => ({
          itemIndex,
          children: editableChildren(item),
        })),
      };
  }
}

export function buildRichTextRenderPlan(
  document: RichTextDocument,
): RichTextRenderBlock[] {
  return document.blocks.map(renderBlock);
}
