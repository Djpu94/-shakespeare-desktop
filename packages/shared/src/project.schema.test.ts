import { describe, expect, it } from "vitest";
import { CreateProjectSchema, UpdateProjectSchema } from "./project.schema.js";
import {
  CreateBinderNodeSchema,
  UpdateBinderNodeSchema,
} from "./binder-node.schema.js";

describe("project and binder contracts", () => {
  it("validates project creation and rejects empty updates", () => {
    expect(
      CreateProjectSchema.parse({ name: "  Novel  ", mode: "fiction" }),
    ).toEqual({ name: "Novel", mode: "fiction" });
    expect(() =>
      CreateProjectSchema.parse({ name: "  ", mode: "fiction" }),
    ).toThrow();
    expect(() =>
      UpdateProjectSchema.parse({
        projectId: "not-a-uuid",
        name: "Renamed",
      }),
    ).toThrow();
    expect(() =>
      UpdateProjectSchema.parse({
        projectId: "b3b8b31d-86c0-4b16-b95a-71730ef4a0ef",
      }),
    ).toThrow();
  });

  it("validates node content, metadata, and required update fields", () => {
    const validNode = {
      projectId: "b3b8b31d-86c0-4b16-b95a-71730ef4a0ef",
      parentId: null,
      kind: "scene",
      title: "Opening",
      content: "Text",
      metadata: { tags: ["draft"] },
    };
    expect(CreateBinderNodeSchema.parse(validNode)).toMatchObject(validNode);
    expect(() =>
      CreateBinderNodeSchema.parse({
        ...validNode,
        kind: "folder",
        content: "",
      }),
    ).toThrow();
    expect(() =>
      CreateBinderNodeSchema.parse({
        ...validNode,
        metadata: { invalid: BigInt(1) },
      }),
    ).toThrow();
    expect(() =>
      UpdateBinderNodeSchema.parse({
        nodeId: validNode.projectId,
      }),
    ).toThrow();
  });
});
