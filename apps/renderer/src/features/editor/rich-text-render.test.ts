import { describe, expect, it } from "vitest";
import type { RichTextDocument } from "@shakespeare/shared";
import {
  RICH_TEXT_RENDER_TAGS,
  buildInlineRenderNodes,
  buildRichTextRenderPlan,
} from "./rich-text-render.js";

describe("rich-text render plan", () => {
  it("wraps marks with allow-listed elements only", () => {
    const nodes = buildInlineRenderNodes([
      { type: "text", text: "Hola", marks: ["bold", "italic"] },
      { type: "hardBreak" },
      { type: "text", text: "código", marks: ["code"] },
    ]);

    expect(nodes).toEqual([
      {
        type: "element",
        tag: "strong",
        children: [
          {
            type: "element",
            tag: "em",
            children: [{ type: "text", text: "Hola" }],
          },
        ],
      },
      { type: "element", tag: "br", children: [] },
      {
        type: "element",
        tag: "code",
        children: [{ type: "text", text: "código" }],
      },
    ]);

    const tags = new Set(RICH_TEXT_RENDER_TAGS);
    const visit = (node: (typeof nodes)[number]): void => {
      if (node.type === "element") {
        expect(tags.has(node.tag)).toBe(true);
        node.children.forEach(visit);
      }
    };
    nodes.forEach(visit);
  });

  it("renders one editable placeholder inside empty blocks", () => {
    const document: RichTextDocument = {
      version: 1,
      blocks: [
        { type: "paragraph", content: [] },
        { type: "heading", level: 1, content: [] },
        { type: "blockquote", content: [] },
        { type: "codeBlock", text: "" },
        { type: "bulletList", items: [[]] },
      ],
    };

    const plan = buildRichTextRenderPlan(document);
    expect(plan.map((block) => block.tag)).toEqual([
      "p",
      "h1",
      "blockquote",
      "pre",
      "ul",
    ]);
    for (const block of plan) {
      if (block.type === "block") {
        expect(block.children).toEqual([
          { type: "element", tag: "br", children: [] },
        ]);
      } else {
        expect(block.items[0]?.children).toEqual([
          { type: "element", tag: "br", children: [] },
        ]);
      }
    }
  });

  it("keeps block and list item indices aligned with the document", () => {
    const document: RichTextDocument = {
      version: 1,
      blocks: [
        { type: "paragraph", content: [] },
        {
          type: "orderedList",
          items: [
            [{ type: "text", text: "uno", marks: [] }],
            [{ type: "text", text: "dos", marks: [] }],
          ],
        },
        { type: "paragraph", content: [] },
      ],
    };

    const plan = buildRichTextRenderPlan(document);
    expect(plan[1]).toMatchObject({
      type: "list",
      tag: "ol",
      blockIndex: 1,
      items: [
        { itemIndex: 0, children: [{ type: "text", text: "uno" }] },
        { itemIndex: 1, children: [{ type: "text", text: "dos" }] },
      ],
    });
    expect(plan[2]).toMatchObject({ type: "block", blockIndex: 2 });
  });

  it("never promotes stored text to markup", () => {
    const document: RichTextDocument = {
      version: 1,
      blocks: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: '<img src=x onerror="alert(1)">',
              marks: [],
            },
          ],
        },
      ],
    };

    const plan = buildRichTextRenderPlan(document);
    expect(plan[0]).toEqual({
      type: "block",
      tag: "p",
      blockIndex: 0,
      children: [
        {
          type: "text",
          text: '<img src=x onerror="alert(1)">',
        },
      ],
    });
  });
});
