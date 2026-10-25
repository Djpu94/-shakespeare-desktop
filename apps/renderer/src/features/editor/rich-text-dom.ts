import type {
  RichTextBlock,
  RichTextDocument,
  RichTextInline,
  RichTextMark,
} from "@shakespeare/shared";
import {
  RICH_TEXT_DOCUMENT_VERSION,
  RICH_TEXT_MARKS,
  RichTextDocumentSchema,
} from "@shakespeare/shared";
import type { EditorCommand } from "./editor-commands.js";
import type { EditorCursor } from "./cursor-position.js";
import {
  buildRichTextRenderPlan,
  type RichTextRenderNode,
} from "./rich-text-render.js";

export type EditorBlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock";

export interface EditorFormattingState {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly inlineCode: boolean;
  readonly blockType: EditorBlockType;
}

export const EMPTY_FORMATTING_STATE: EditorFormattingState = {
  bold: false,
  italic: false,
  underline: false,
  inlineCode: false,
  blockType: "paragraph",
};

const SKIPPED_TAGS = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
  "video",
  "audio",
  "img",
]);

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "li",
  "pre",
  "section",
  "article",
  "header",
  "footer",
  "aside",
  "main",
  "nav",
  "figure",
  "figcaption",
  "address",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
]);

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function tagName(node: Element): string {
  return node.tagName.toLowerCase();
}

function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag);
}

function canonicalMarks(marks: readonly RichTextMark[]): RichTextMark[] {
  return RICH_TEXT_MARKS.filter((mark) => marks.includes(mark));
}

function marksWith(
  marks: readonly RichTextMark[],
  mark: RichTextMark,
): RichTextMark[] {
  return canonicalMarks(marks.includes(mark) ? marks : [...marks, mark]);
}

function addStyleMarks(
  marks: readonly RichTextMark[],
  element: Element,
): RichTextMark[] {
  let next = canonicalMarks(marks);
  const style = (element as HTMLElement).style;
  if (style === undefined) {
    return next;
  }

  const fontWeight = style.fontWeight;
  const numericWeight = Number.parseInt(fontWeight, 10);
  if (
    fontWeight === "bold" ||
    fontWeight === "bolder" ||
    (!Number.isNaN(numericWeight) && numericWeight >= 600)
  ) {
    next = marksWith(next, "bold");
  }
  if (style.fontStyle === "italic" || style.fontStyle === "oblique") {
    next = marksWith(next, "italic");
  }
  if (
    style.textDecorationLine.includes("underline") ||
    style.textDecoration.includes("underline")
  ) {
    next = marksWith(next, "underline");
  }
  return next;
}

function normalizeInline(inlines: readonly RichTextInline[]): RichTextInline[] {
  const normalized: RichTextInline[] = [];
  for (const inline of inlines) {
    if (inline.type === "hardBreak") {
      normalized.push({ type: "hardBreak" });
      continue;
    }
    if (inline.text.length === 0) {
      continue;
    }

    const previous = normalized.at(-1);
    if (
      previous !== undefined &&
      previous.type === "text" &&
      marksEqual(previous.marks, inline.marks)
    ) {
      normalized[normalized.length - 1] = {
        type: "text",
        text: previous.text + inline.text,
        marks: previous.marks,
      };
      continue;
    }

    normalized.push({
      type: "text",
      text: inline.text,
      marks: canonicalMarks(inline.marks),
    });
  }
  return normalized;
}

function marksEqual(
  first: readonly RichTextMark[],
  second: readonly RichTextMark[],
): boolean {
  return (
    first.length === second.length &&
    first.every((mark, index) => mark === second[index])
  );
}

function normalizeBlockContent(
  inlines: readonly RichTextInline[],
): RichTextInline[] {
  const normalized = normalizeInline(inlines);
  if (normalized.length === 1 && normalized[0]?.type === "hardBreak") {
    return [];
  }
  return normalized;
}

function hasVisibleContent(inlines: readonly RichTextInline[]): boolean {
  return inlines.some(
    (inline) => inline.type === "hardBreak" || inline.text.trim().length > 0,
  );
}

function collectInlineNode(
  node: Node,
  marks: readonly RichTextMark[],
  output: RichTextInline[],
): void {
  if (node.nodeType === 3) {
    const text = (node.textContent ?? "").replace(/\u00a0/g, " ");
    if (text.length > 0) {
      output.push({ type: "text", text, marks: canonicalMarks(marks) });
    }
    return;
  }

  if (!isElement(node)) {
    return;
  }

  const tag = tagName(node);
  if (SKIPPED_TAGS.has(tag)) {
    return;
  }
  if (tag === "br") {
    output.push({ type: "hardBreak" });
    return;
  }

  let nextMarks = canonicalMarks(marks);
  if (tag === "strong" || tag === "b") {
    nextMarks = marksWith(nextMarks, "bold");
  } else if (tag === "em" || tag === "i") {
    nextMarks = marksWith(nextMarks, "italic");
  } else if (tag === "u") {
    nextMarks = marksWith(nextMarks, "underline");
  } else if (tag === "code") {
    nextMarks = marksWith(nextMarks, "code");
  } else {
    nextMarks = addStyleMarks(nextMarks, node);
  }

  const isInlineContainer = tag === "span" || tag === "a" || tag === "mark";
  if (isBlockTag(tag) && !isInlineContainer) {
    const hadContent = output.length > 0;
    if (hadContent) {
      output.push({ type: "hardBreak" });
    }
    collectInlineChildren(node, nextMarks, output);
    return;
  }

  collectInlineChildren(node, nextMarks, output);
}

function collectInlineChildren(
  element: Element,
  marks: readonly RichTextMark[],
  output: RichTextInline[],
): void {
  for (const child of Array.from(element.childNodes)) {
    collectInlineNode(child, marks, output);
  }
}

function readSimpleContent(element: Element): RichTextInline[] {
  const content: RichTextInline[] = [];
  collectInlineChildren(element, [], content);
  return normalizeBlockContent(content);
}

function hasBlockChildren(element: Element): boolean {
  return Array.from(element.children).some((child) =>
    isBlockTag(tagName(child)),
  );
}

function readPreText(element: Element): string {
  let text = "";
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) {
      text += child.textContent ?? "";
      continue;
    }
    if (!isElement(child)) {
      continue;
    }
    const tag = tagName(child);
    if (tag === "br") {
      text += "\n";
      continue;
    }
    if (tag === "div" || tag === "p") {
      if (text.length > 0 && !text.endsWith("\n")) {
        text += "\n";
      }
      text += readPreText(child);
      continue;
    }
    text += readPreText(child);
  }
  return text.replace(/\u00a0/g, " ");
}

function readList(element: Element, tag: "ul" | "ol"): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  const items: RichTextInline[][] = [];

  for (const child of Array.from(element.children)) {
    const childTag = tagName(child);
    if (childTag === "ul" || childTag === "ol") {
      blocks.push(...readList(child, childTag));
      continue;
    }
    if (childTag !== "li") {
      continue;
    }

    const itemContent: RichTextInline[] = [];
    for (const itemChild of Array.from(child.childNodes)) {
      if (
        isElement(itemChild) &&
        (tagName(itemChild) === "ul" || tagName(itemChild) === "ol")
      ) {
        blocks.push(...readList(itemChild, tagName(itemChild) as "ul" | "ol"));
        continue;
      }
      collectInlineNode(itemChild, [], itemContent);
    }
    items.push(normalizeBlockContent(itemContent));
  }

  if (items.length > 0) {
    blocks.unshift({
      type: tag === "ul" ? "bulletList" : "orderedList",
      items,
    });
  }
  return blocks;
}

function readBlockElement(element: Element): RichTextBlock[] {
  const tag = tagName(element);

  switch (tag) {
    case "h1":
    case "h2":
    case "h3": {
      const level = Number.parseInt(tag.slice(1), 10) as 1 | 2 | 3;
      return [{ type: "heading", level, content: readSimpleContent(element) }];
    }
    case "blockquote": {
      const inner: RichTextBlock[] = [];
      parseContainer(element, inner);
      if (inner.length === 0) {
        return [{ type: "blockquote", content: [] }];
      }
      return inner.map((block) => {
        if (
          block.type === "paragraph" ||
          block.type === "heading" ||
          block.type === "blockquote"
        ) {
          return { type: "blockquote", content: block.content };
        }
        return block;
      });
    }
    case "ul":
      return readList(element, "ul");
    case "ol":
      return readList(element, "ol");
    case "pre":
      return [{ type: "codeBlock", text: readPreText(element) }];
    case "li": {
      const blocks: RichTextBlock[] = [
        { type: "paragraph", content: readSimpleContent(element) },
      ];
      for (const child of Array.from(element.children)) {
        const childTag = tagName(child);
        if (childTag === "ul" || childTag === "ol") {
          blocks.push(...readList(child, childTag));
        }
      }
      return blocks;
    }
    default: {
      if (hasBlockChildren(element)) {
        const blocks: RichTextBlock[] = [];
        parseContainer(element, blocks);
        return blocks;
      }
      return [{ type: "paragraph", content: readSimpleContent(element) }];
    }
  }
}

function parseContainer(container: Node, blocks: RichTextBlock[]): void {
  let inlineBuffer: RichTextInline[] = [];

  const flushInline = (): void => {
    const content = normalizeBlockContent(inlineBuffer);
    inlineBuffer = [];
    if (hasVisibleContent(content)) {
      blocks.push({ type: "paragraph", content });
    }
  };

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === 3) {
      collectInlineNode(child, [], inlineBuffer);
      continue;
    }
    if (!isElement(child)) {
      continue;
    }

    const tag = tagName(child);
    if (SKIPPED_TAGS.has(tag)) {
      continue;
    }
    if (isBlockTag(tag)) {
      flushInline();
      blocks.push(...readBlockElement(child));
      continue;
    }
    collectInlineNode(child, [], inlineBuffer);
  }

  flushInline();
}

/**
 * Parses the contenteditable DOM into the validated document contract. The
 * parser is deliberately total: unknown wrappers are flattened to their text,
 * unsupported embeds are discarded, and the final schema validates the result.
 */
export function readRichTextDocumentFromElement(
  root: HTMLElement,
): RichTextDocument {
  const blocks: RichTextBlock[] = [];
  parseContainer(root, blocks);

  if (blocks.length === 0) {
    return {
      version: RICH_TEXT_DOCUMENT_VERSION,
      blocks: [{ type: "paragraph", content: [] }],
    };
  }

  return RichTextDocumentSchema.parse({
    version: RICH_TEXT_DOCUMENT_VERSION,
    blocks,
  });
}

function appendRenderNodes(
  parent: Node,
  nodes: readonly RichTextRenderNode[],
  ownerDocument: Document,
): void {
  for (const node of nodes) {
    if (node.type === "text") {
      parent.appendChild(ownerDocument.createTextNode(node.text));
      continue;
    }
    const element = ownerDocument.createElement(node.tag);
    if (node.tag !== "br") {
      appendRenderNodes(element, node.children, ownerDocument);
    }
    parent.appendChild(element);
  }
}

export function renderRichTextDocument(
  document: RichTextDocument,
  ownerDocument: Document = globalThis.document,
): DocumentFragment {
  const fragment = ownerDocument.createDocumentFragment();
  for (const block of buildRichTextRenderPlan(document)) {
    const element = ownerDocument.createElement(block.tag);
    element.setAttribute("data-block-index", String(block.blockIndex));
    if (block.type === "list") {
      for (const item of block.items) {
        const listItem = ownerDocument.createElement("li");
        listItem.setAttribute("data-block-index", String(block.blockIndex));
        listItem.setAttribute("data-item-index", String(item.itemIndex));
        appendRenderNodes(listItem, item.children, ownerDocument);
        element.appendChild(listItem);
      }
    } else {
      appendRenderNodes(element, block.children, ownerDocument);
    }
    fragment.appendChild(element);
  }
  return fragment;
}

function elementForNode(node: Node | null): Element | null {
  if (node === null) {
    return null;
  }
  if (isElement(node)) {
    return node;
  }
  return node.parentElement;
}

function closestBlockElement(
  node: Node | null,
  root: HTMLElement,
): Element | null {
  let element = elementForNode(node);
  while (element !== null && element !== root) {
    if (element.hasAttribute("data-block-index")) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function countTextAndBreaks(node: Node): number {
  if (node.nodeType === 3) {
    return (node.textContent ?? "").length;
  }
  if (!isElement(node)) {
    if (node.nodeType === 11) {
      return Array.from(node.childNodes).reduce(
        (total, child) => total + countTextAndBreaks(child),
        0,
      );
    }
    return 0;
  }
  if (tagName(node) === "br") {
    return 1;
  }
  return Array.from(node.childNodes).reduce(
    (total, child) => total + countTextAndBreaks(child),
    0,
  );
}

function measureOffset(block: Element, node: Node, offset: number): number {
  const ownerDocument = block.ownerDocument;
  const range = ownerDocument.createRange();
  try {
    range.selectNodeContents(block);
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return countTextAndBreaks(range.cloneContents());
}

export function captureEditorCursor(root: HTMLElement): EditorCursor | null {
  const selection = root.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return null;
  }

  const block = closestBlockElement(range.startContainer, root);
  if (block === null) {
    return null;
  }

  const blockIndex = Number.parseInt(
    block.getAttribute("data-block-index") ?? "",
    10,
  );
  if (Number.isNaN(blockIndex)) {
    return null;
  }

  const itemAttribute = block.getAttribute("data-item-index");
  const itemIndex =
    itemAttribute === null ? null : Number.parseInt(itemAttribute, 10);

  return {
    blockIndex,
    itemIndex: itemIndex !== null && Number.isNaN(itemIndex) ? null : itemIndex,
    offset: measureOffset(block, range.startContainer, range.startOffset),
  };
}

function findBlockElement(
  root: HTMLElement,
  cursor: EditorCursor,
): Element | null {
  const blockIndex = String(cursor.blockIndex);
  if (cursor.itemIndex === null) {
    const candidates = root.querySelectorAll<HTMLElement>(
      `[data-block-index="${blockIndex}"]:not([data-item-index])`,
    );
    return candidates[0] ?? null;
  }

  const candidates = root.querySelectorAll<HTMLElement>(
    `[data-block-index="${blockIndex}"][data-item-index="${String(cursor.itemIndex)}"]`,
  );
  return candidates[0] ?? null;
}

function locatePosition(
  block: Element,
  offset: number,
): { node: Node; offset: number } | null {
  const remaining = { value: Math.max(0, offset) };

  const visit = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? "";
      if (remaining.value <= text.length) {
        return { node, offset: remaining.value };
      }
      remaining.value -= text.length;
      return null;
    }

    if (!isElement(node)) {
      return null;
    }

    if (tagName(node) === "br") {
      const parent = node.parentNode;
      if (parent === null) {
        return null;
      }
      const index = Array.from(parent.childNodes).indexOf(node);
      if (remaining.value === 0) {
        return { node: parent, offset: index };
      }
      remaining.value -= 1;
      if (remaining.value === 0) {
        return { node: parent, offset: index + 1 };
      }
      return null;
    }

    for (const child of Array.from(node.childNodes)) {
      const position = visit(child);
      if (position !== null) {
        return position;
      }
    }
    return null;
  };

  return visit(block);
}

export function restoreEditorCursor(
  root: HTMLElement,
  cursor: EditorCursor,
): boolean {
  const block = findBlockElement(root, cursor);
  if (block === null) {
    return false;
  }

  const ownerDocument = root.ownerDocument;
  const selection = ownerDocument.getSelection();
  if (selection === null) {
    return false;
  }

  const range = ownerDocument.createRange();
  const position = locatePosition(block, cursor.offset);
  if (position !== null) {
    range.setStart(position.node, position.offset);
  } else {
    range.selectNodeContents(block);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function focusEditorAtEnd(root: HTMLElement): void {
  root.focus();
  const selection = root.ownerDocument.getSelection();
  if (selection === null) {
    return;
  }
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectionInside(root: HTMLElement): Selection | null {
  const selection = root.ownerDocument.getSelection();
  if (
    selection === null ||
    selection.rangeCount === 0 ||
    selection.anchorNode === null ||
    !root.contains(selection.anchorNode)
  ) {
    return null;
  }
  return selection;
}

function currentBlock(root: HTMLElement): Element | null {
  const selection = selectionInside(root);
  return selection === null
    ? null
    : closestBlockElement(selection.anchorNode, root);
}

export function getEditorBlockType(block: Element | null): EditorBlockType {
  if (block === null) {
    return "paragraph";
  }

  const tag = tagName(block);
  switch (tag) {
    case "h1":
      return "heading1";
    case "h2":
      return "heading2";
    case "h3":
      return "heading3";
    case "blockquote":
      return "blockquote";
    case "pre":
      return "codeBlock";
    case "li": {
      const parentTag =
        block.parentElement === null ? "" : tagName(block.parentElement);
      return parentTag === "ol" ? "orderedList" : "bulletList";
    }
    default:
      return "paragraph";
  }
}

function commandState(ownerDocument: Document, command: string): boolean {
  try {
    return ownerDocument.queryCommandState(command);
  } catch {
    return false;
  }
}

function hasAncestorTag(
  node: Node | null,
  tag: string,
  root: HTMLElement,
): Element | null {
  let element = elementForNode(node);
  while (element !== null && element !== root) {
    if (tagName(element) === tag) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

export function getEditorFormattingState(
  root: HTMLElement,
): EditorFormattingState {
  const block = currentBlock(root);
  if (block === null) {
    return EMPTY_FORMATTING_STATE;
  }

  const ownerDocument = root.ownerDocument;
  const selection = selectionInside(root);
  const code = hasAncestorTag(selection?.anchorNode ?? null, "code", root);
  const inlineCode =
    code !== null && hasAncestorTag(code, "pre", root) === null;

  return {
    bold: commandState(ownerDocument, "bold"),
    italic: commandState(ownerDocument, "italic"),
    underline: commandState(ownerDocument, "underline"),
    inlineCode,
    blockType: getEditorBlockType(block),
  };
}

export function areFormattingStatesEqual(
  first: EditorFormattingState,
  second: EditorFormattingState,
): boolean {
  return (
    first.bold === second.bold &&
    first.italic === second.italic &&
    first.underline === second.underline &&
    first.inlineCode === second.inlineCode &&
    first.blockType === second.blockType
  );
}

function toggleInlineCode(root: HTMLElement): void {
  const selection = selectionInside(root);
  if (selection === null) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return;
  }

  const startBlock = closestBlockElement(range.startContainer, root);
  const endBlock = closestBlockElement(range.endContainer, root);
  if (startBlock === null || startBlock !== endBlock) {
    return;
  }

  const ownerDocument = root.ownerDocument;
  const existingCode = hasAncestorTag(
    range.commonAncestorContainer,
    "code",
    root,
  );
  if (existingCode !== null) {
    const parent = existingCode.parentNode;
    if (parent === null) {
      return;
    }
    while (existingCode.firstChild !== null) {
      parent.insertBefore(existingCode.firstChild, existingCode);
    }
    parent.removeChild(existingCode);
    const nextRange = ownerDocument.createRange();
    nextRange.selectNodeContents(parent);
    nextRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    return;
  }

  const wrapper = ownerDocument.createElement("code");
  wrapper.appendChild(range.extractContents());
  range.insertNode(wrapper);
  const nextRange = ownerDocument.createRange();
  nextRange.selectNodeContents(wrapper);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function applyBlockCommand(root: HTMLElement, command: EditorCommand): void {
  const ownerDocument = root.ownerDocument;
  const block = currentBlock(root);
  const currentTag = block === null ? "" : tagName(block);

  const formatBlock = (tag: string): void => {
    ownerDocument.execCommand("formatBlock", false, tag);
  };

  switch (command) {
    case "paragraph":
      formatBlock("p");
      return;
    case "heading1":
      formatBlock(currentTag === "h1" ? "p" : "h1");
      return;
    case "heading2":
      formatBlock(currentTag === "h2" ? "p" : "h2");
      return;
    case "heading3":
      formatBlock(currentTag === "h3" ? "p" : "h3");
      return;
    case "blockquote":
      formatBlock(currentTag === "blockquote" ? "p" : "blockquote");
      return;
    case "codeBlock":
      formatBlock(currentTag === "pre" ? "p" : "pre");
      return;
    case "bulletList":
      ownerDocument.execCommand("insertUnorderedList", false);
      return;
    case "orderedList":
      ownerDocument.execCommand("insertOrderedList", false);
      return;
    default:
      return;
  }
}

export function applyEditorCommand(
  root: HTMLElement,
  command: EditorCommand,
): void {
  if (selectionInside(root) === null) {
    focusEditorAtEnd(root);
  }

  switch (command) {
    case "bold":
    case "italic":
    case "underline":
      root.ownerDocument.execCommand(command, false);
      return;
    case "inlineCode":
      toggleInlineCode(root);
      return;
    default:
      applyBlockCommand(root, command);
  }
}
