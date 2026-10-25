import type { BinderNode, RichTextDocument } from "@shakespeare/shared";
import {
  parseRichTextContent,
  richTextCharacterCount,
} from "@shakespeare/shared";
import { getBinderChildren } from "../binder/binder-tree.js";

export const SCRIVENINGS_MAX_DOCUMENTS = 20;
export const SCRIVENINGS_MAX_CHARACTERS = 200_000;

export interface ScriveningsSegment {
  readonly node: BinderNode;
  readonly document: RichTextDocument;
  readonly characterCount: number;
}

export interface ScriveningsPlan {
  readonly segments: readonly ScriveningsSegment[];
  readonly totalDocuments: number;
  readonly omittedDocuments: number;
  readonly characterCount: number;
  readonly documentLimit: number;
  readonly characterLimit: number;
  readonly isTruncated: boolean;
}

/**
 * Collects every document below a folder in binder order. Folders contribute
 * their children but are not editable segments themselves.
 */
export function collectScriveningsDocuments(
  nodes: readonly BinderNode[],
  rootId: string,
): BinderNode[] {
  const root = nodes.find((node) => node.id === rootId);
  if (root === undefined) {
    return [];
  }
  if (root.kind !== "folder") {
    return [root];
  }

  const documents: BinderNode[] = [];
  const visited = new Set<string>([rootId]);

  const visit = (parentId: string): void => {
    for (const child of getBinderChildren(nodes, parentId)) {
      if (visited.has(child.id)) {
        continue;
      }
      visited.add(child.id);
      if (child.kind === "folder") {
        visit(child.id);
      } else {
        documents.push(child);
      }
    }
  };

  visit(rootId);
  return documents;
}

/**
 * Builds the editable Scrivenings view. The API associates every segment with
 * its original `BinderNode`, so a later edit writes only to `segment.node.id`.
 *
 * Limits keep the combined view responsive and bounded: at most
 * `SCRIVENINGS_MAX_DOCUMENTS` documents and `SCRIVENINGS_MAX_CHARACTERS`
 * characters. Once a document does not fit, the remaining documents are
 * omitted to preserve contiguous binder order.
 */
export function buildScriveningsPlan(
  nodes: readonly BinderNode[],
  rootId: string,
): ScriveningsPlan {
  const candidates = collectScriveningsDocuments(nodes, rootId);
  const segments: ScriveningsSegment[] = [];
  let characterCount = 0;
  let limitReached = false;

  for (const node of candidates) {
    if (limitReached || segments.length >= SCRIVENINGS_MAX_DOCUMENTS) {
      limitReached = true;
      continue;
    }

    const document = parseRichTextContent(node.content);
    const nodeCharacters = richTextCharacterCount(document);
    if (characterCount + nodeCharacters > SCRIVENINGS_MAX_CHARACTERS) {
      limitReached = true;
      continue;
    }

    characterCount += nodeCharacters;
    segments.push({
      node,
      document,
      characterCount: nodeCharacters,
    });
  }

  const omittedDocuments = candidates.length - segments.length;
  return {
    segments,
    totalDocuments: candidates.length,
    omittedDocuments,
    characterCount,
    documentLimit: SCRIVENINGS_MAX_DOCUMENTS,
    characterLimit: SCRIVENINGS_MAX_CHARACTERS,
    isTruncated: omittedDocuments > 0,
  };
}

/**
 * Applies an edit to one segment only. Neighbouring segments keep their
 * identity, which makes accidental cross-document writes observable in tests.
 */
export function replaceScriveningsSegmentDocument(
  plan: ScriveningsPlan,
  nodeId: string,
  document: RichTextDocument,
): ScriveningsPlan {
  const index = plan.segments.findIndex(
    (segment) => segment.node.id === nodeId,
  );
  if (index === -1) {
    return plan;
  }

  const segments = plan.segments.map((segment, segmentIndex) => {
    if (segmentIndex !== index) {
      return segment;
    }
    return {
      ...segment,
      document,
      characterCount: richTextCharacterCount(document),
    };
  });

  return { ...plan, segments };
}
