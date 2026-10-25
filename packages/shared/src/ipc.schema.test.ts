import { describe, expect, it } from "vitest";
import {
  AppHealthRequestSchema,
  AppHealthResponseSchema,
  ApplicationErrorSchema,
  FlushBinderContentRequestSchema,
} from "./ipc.schema.js";
import { UpdateBinderNodeSchema } from "./binder-node.schema.js";
import {
  createEmptyRichTextDocument,
  serializeRichTextContent,
} from "./rich-text.schema.js";

const NODE_ID = "b3b8b31d-86c0-4b16-b95a-71730ef4a0ef";

describe("app health IPC contract", () => {
  it("accepts the request and a successful health response", () => {
    expect(AppHealthRequestSchema.parse({})).toEqual({});
    expect(
      AppHealthResponseSchema.parse({
        status: "ok",
        appVersion: "0.1.0",
      }),
    ).toEqual({ status: "ok", appVersion: "0.1.0" });
  });

  it("rejects malformed health payloads", () => {
    expect(() =>
      AppHealthResponseSchema.parse({ status: "degraded", appVersion: "" }),
    ).toThrow();
    expect(() => AppHealthRequestSchema.parse({ unexpected: true })).toThrow();
  });

  it("accepts safe, stable application errors", () => {
    expect(
      ApplicationErrorSchema.parse({
        code: "VALIDATION_ERROR",
        message: "The request is invalid.",
      }),
    ).toEqual({
      code: "VALIDATION_ERROR",
      message: "The request is invalid.",
    });
    expect(() =>
      ApplicationErrorSchema.parse({
        code: "internal error",
        message: "Database password is invalid",
      }),
    ).toThrow();
  });

  it("only accepts serialized rich-text documents on content writes", () => {
    const content = serializeRichTextContent(createEmptyRichTextDocument());

    expect(UpdateBinderNodeSchema.parse({ nodeId: NODE_ID, content })).toEqual({
      nodeId: NODE_ID,
      content,
    });
    expect(() =>
      UpdateBinderNodeSchema.parse({
        nodeId: NODE_ID,
        content: "<p>arbitrary HTML</p>",
      }),
    ).toThrow();

    expect(
      FlushBinderContentRequestSchema.parse({ nodeId: NODE_ID, content }),
    ).toEqual({ nodeId: NODE_ID, content });
    expect(() =>
      FlushBinderContentRequestSchema.parse({
        nodeId: NODE_ID,
        content: "plain text",
      }),
    ).toThrow();
  });
});
