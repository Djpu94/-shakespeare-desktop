import { describe, expect, it } from "vitest";
import type { BinderNode, BinderNodeKind } from "@shakespeare/shared";
import {
  createEmptyRichTextDocument,
  plainTextToRichTextDocument,
  serializeRichTextContent,
} from "@shakespeare/shared";
import {
  SCRIVENINGS_MAX_CHARACTERS,
  SCRIVENINGS_MAX_DOCUMENTS,
  buildScriveningsPlan,
  collectScriveningsDocuments,
  replaceScriveningsSegmentDocument,
} from "./scrivenings.js";

const PROJECT_ID = "b3b8b31d-86c0-4b16-b95a-71730ef4a0ef";
const TIMESTAMP = "2026-10-25T00:00:00.000Z";

function createNode(
  id: string,
  title: string,
  kind: BinderNodeKind,
  parentId: string | null,
  position: number,
  content: string | null = null,
): BinderNode {
  return {
    id,
    projectId: PROJECT_ID,
    parentId,
    kind,
    title,
    position,
    content:
      kind === "folder"
        ? null
        : (content ?? serializeRichTextContent(createEmptyRichTextDocument())),
    metadata: {},
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function textContent(text: string): string {
  return serializeRichTextContent(plainTextToRichTextDocument(text));
}

describe("Scrivenings plan", () => {
  it("collects nested documents in binder order without folders", () => {
    const root = createNode("root", "Parte", "folder", null, 0);
    const sceneB = createNode(
      "scene-b",
      "B",
      "scene",
      "nested",
      0,
      textContent("B"),
    );
    const sceneA = createNode(
      "scene-a",
      "A",
      "scene",
      "root",
      0,
      textContent("A"),
    );
    const nested = createNode("nested", "Capítulo", "folder", "root", 1);
    const sceneC = createNode(
      "scene-c",
      "C",
      "scene",
      "root",
      2,
      textContent("C"),
    );
    const nodes = [sceneC, root, sceneB, sceneA, nested];

    expect(
      collectScriveningsDocuments(nodes, "root").map((node) => node.id),
    ).toEqual(["scene-a", "scene-b", "scene-c"]);

    const plan = buildScriveningsPlan(nodes, "root");
    expect(plan.segments.map((segment) => segment.node.id)).toEqual([
      "scene-a",
      "scene-b",
      "scene-c",
    ]);
    expect(plan).toMatchObject({
      totalDocuments: 3,
      omittedDocuments: 0,
      isTruncated: false,
      characterCount: 3,
    });
  });

  it("returns an empty plan for an empty folder or unknown root", () => {
    const folder = createNode("folder", "Vacía", "folder", null, 0);
    const other = createNode("other", "Otra", "scene", null, 1);

    expect(buildScriveningsPlan([folder, other], "folder")).toMatchObject({
      segments: [],
      totalDocuments: 0,
      omittedDocuments: 0,
      isTruncated: false,
    });
    expect(buildScriveningsPlan([folder, other], "missing")).toMatchObject({
      segments: [],
      totalDocuments: 0,
    });
  });

  it("enforces the maximum document count", () => {
    const folder = createNode("folder", "Parte", "folder", null, 0);
    const scenes = Array.from(
      { length: SCRIVENINGS_MAX_DOCUMENTS + 5 },
      (_, index) =>
        createNode(
          `scene-${String(index).padStart(2, "0")}`,
          `Escena ${index}`,
          "scene",
          "folder",
          index,
          textContent(`Texto ${index}`),
        ),
    );

    const plan = buildScriveningsPlan([folder, ...scenes], "folder");
    expect(plan.segments).toHaveLength(SCRIVENINGS_MAX_DOCUMENTS);
    expect(plan.totalDocuments).toBe(SCRIVENINGS_MAX_DOCUMENTS + 5);
    expect(plan.omittedDocuments).toBe(5);
    expect(plan.isTruncated).toBe(true);
    expect(plan.documentLimit).toBe(SCRIVENINGS_MAX_DOCUMENTS);
    expect(plan.segments[0]?.node.title).toBe("Escena 0");
    expect(plan.segments.at(-1)?.node.title).toBe(
      `Escena ${SCRIVENINGS_MAX_DOCUMENTS - 1}`,
    );
  });

  it("stops adding documents once the character budget is exhausted", () => {
    const folder = createNode("folder", "Parte", "folder", null, 0);
    const first = createNode(
      "first",
      "Primera",
      "scene",
      "folder",
      0,
      textContent("a".repeat(120_000)),
    );
    const second = createNode(
      "second",
      "Segunda",
      "scene",
      "folder",
      1,
      textContent("b".repeat(120_000)),
    );
    const third = createNode(
      "third",
      "Tercera",
      "scene",
      "folder",
      2,
      textContent("corta"),
    );

    const plan = buildScriveningsPlan([folder, first, second, third], "folder");
    expect(plan.segments.map((segment) => segment.node.id)).toEqual(["first"]);
    expect(plan.omittedDocuments).toBe(2);
    expect(plan.characterCount).toBe(120_000);
    expect(plan.characterCount).toBeLessThanOrEqual(SCRIVENINGS_MAX_CHARACTERS);
    expect(plan.characterLimit).toBe(SCRIVENINGS_MAX_CHARACTERS);
    expect(plan.isTruncated).toBe(true);
  });

  it("updates only the targeted segment without touching neighbours", () => {
    const folder = createNode("folder", "Parte", "folder", null, 0);
    const first = createNode(
      "first",
      "Primera",
      "scene",
      "folder",
      0,
      textContent("uno"),
    );
    const second = createNode(
      "second",
      "Segunda",
      "scene",
      "folder",
      1,
      textContent("dos"),
    );
    const plan = buildScriveningsPlan([folder, first, second], "folder");
    const neighbour = plan.segments[1];

    const next = replaceScriveningsSegmentDocument(
      plan,
      "first",
      plainTextToRichTextDocument("contenido nuevo"),
    );

    expect(next).not.toBe(plan);
    expect(next.segments[0]?.document).toEqual(
      plainTextToRichTextDocument("contenido nuevo"),
    );
    expect(next.segments[0]?.characterCount).toBe(15);
    expect(next.segments[1]).toBe(neighbour);
    expect(next.segments[1]?.document).toEqual(
      plainTextToRichTextDocument("dos"),
    );
    expect(plan.segments[0]?.document).toEqual(
      plainTextToRichTextDocument("uno"),
    );
  });

  it("returns the unchanged plan when the segment does not exist", () => {
    const folder = createNode("folder", "Parte", "folder", null, 0);
    const scene = createNode(
      "scene",
      "Escena",
      "scene",
      "folder",
      0,
      textContent("texto"),
    );
    const plan = buildScriveningsPlan([folder, scene], "folder");

    expect(
      replaceScriveningsSegmentDocument(
        plan,
        "missing",
        plainTextToRichTextDocument("otro"),
      ),
    ).toBe(plan);
  });
});
