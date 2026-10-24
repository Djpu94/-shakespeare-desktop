import { describe, expect, it } from "vitest";
import {
  AppHealthRequestSchema,
  AppHealthResponseSchema,
  ApplicationErrorSchema,
} from "./ipc.schema.js";

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
});
