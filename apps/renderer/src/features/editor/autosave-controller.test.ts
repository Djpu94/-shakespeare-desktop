import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutosaveController,
  AutosaveStateError,
  type AutosaveContent,
  type AutosaveState,
} from "./autosave-controller.js";

interface DeferredSave {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

function createDeferredSave(): DeferredSave {
  let resolvePromise: (() => void) | null = null;
  let rejectPromise: ((error: unknown) => void) | null = null;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: () => resolvePromise?.(),
    reject: (error) => rejectPromise?.(error),
  };
}

describe("AutosaveController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces 800ms after the last edit and writes once", async () => {
    const save = vi.fn(async () => {});
    const controller = new AutosaveController({
      save,
      debounceMs: 800,
      describeError: () => "error",
    });
    controller.openDocument("node-a", "v0");

    controller.update("v1");
    await vi.advanceTimersByTimeAsync(700);
    controller.update("v2");
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe("pending");

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ nodeId: "node-a", content: "v2" });
    expect(controller.getState()).toMatchObject({
      documentId: "node-a",
      status: "saved",
      hasPendingChanges: false,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not write unchanged content or duplicate manual flushes", async () => {
    const save = vi.fn(async () => {});
    const controller = new AutosaveController({ save });
    controller.openDocument("node-a", "saved");

    controller.update("saved");
    expect(await controller.flush()).toBe(true);
    expect(save).not.toHaveBeenCalled();

    controller.update("changed");
    expect(await controller.flush()).toBe(true);
    expect(await controller.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      nodeId: "node-a",
      content: "changed",
    });
  });

  it("coalesces edits made while a debounced write is in flight", async () => {
    const deferred = createDeferredSave();
    const save = vi.fn(() => deferred.promise);
    const controller = new AutosaveController({ save });
    controller.openDocument("node-a", "v0");

    controller.update("v1");
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("saving");

    controller.update("v2");
    deferred.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      status: "pending",
      hasPendingChanges: true,
    });

    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({
      nodeId: "node-a",
      content: "v2",
    });
  });

  it("persists the newest content immediately when flushed during a save", async () => {
    const deferred = createDeferredSave();
    const save = vi
      .fn<(input: AutosaveContent) => Promise<void>>()
      .mockImplementationOnce(() => deferred.promise)
      .mockResolvedValue(undefined);
    const controller = new AutosaveController({ save });
    controller.openDocument("node-a", "v0");

    controller.update("v1");
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);

    controller.update("v2");
    const flushPromise = controller.flush();
    deferred.resolve();
    expect(await flushPromise).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({
      nodeId: "node-a",
      content: "v2",
    });
    expect(controller.getState().status).toBe("saved");
  });

  it("keeps the original document while switching during an in-flight save", async () => {
    const deferred = createDeferredSave();
    const save = vi.fn(() => deferred.promise);
    const states: AutosaveState[] = [];
    const controller = new AutosaveController({
      save,
      onStateChange: (state) => states.push(state),
    });
    controller.openDocument("node-a", "a0");

    controller.update("a1");
    await vi.advanceTimersByTimeAsync(800);
    const flushPromise = controller.flush();
    expect(controller.getState().documentId).toBe("node-a");

    deferred.resolve();
    expect(await flushPromise).toBe(true);
    controller.openDocument("node-b", "b0");

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ nodeId: "node-a", content: "a1" });
    expect(controller.getState()).toMatchObject({
      documentId: "node-b",
      status: "saved",
      hasPendingChanges: false,
    });
    expect(states.at(-1)?.documentId).toBe("node-b");
  });

  it("never applies an in-flight save to a document opened after discard", async () => {
    const deferred = createDeferredSave();
    const save = vi.fn(() => deferred.promise);
    const controller = new AutosaveController({ save });
    controller.openDocument("node-a", "a0");

    controller.update("a1");
    await vi.advanceTimersByTimeAsync(800);
    controller.close({ discard: true });
    controller.openDocument("node-b", "b0");

    deferred.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getState()).toMatchObject({
      documentId: "node-b",
      status: "saved",
      hasPendingChanges: false,
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ nodeId: "node-a", content: "a1" });
  });

  it("schedules a debounce when an edit reverts while a save is in flight", async () => {
    const deferred = createDeferredSave();
    const save = vi
      .fn<(input: AutosaveContent) => Promise<void>>()
      .mockImplementationOnce(() => deferred.promise)
      .mockResolvedValue(undefined);
    const controller = new AutosaveController({ save });
    controller.openDocument("node-a", "saved");

    controller.update("new");
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("saving");

    controller.update("saved");
    deferred.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState()).toMatchObject({
      status: "pending",
      hasPendingChanges: true,
    });

    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({
      nodeId: "node-a",
      content: "saved",
    });
    expect(controller.getState().status).toBe("saved");
  });

  it("does not report a safe close while a save is in flight", async () => {
    const deferred = createDeferredSave();
    const save = vi.fn(() => deferred.promise);
    const controller = new AutosaveController({
      save,
      saveSync: vi.fn(),
    });
    controller.openDocument("node-a", "v0");

    controller.update("v1");
    await vi.advanceTimersByTimeAsync(800);
    expect(controller.flushForClose()).toBe(false);

    deferred.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.flushForClose()).toBe(true);
  });

  it("surfaces persistence failures, keeps the draft, and retries", async () => {
    const error = new Error("disk unavailable");
    const save = vi
      .fn<(input: AutosaveContent) => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const controller = new AutosaveController({
      save,
      describeError: () => "No se pudo guardar.",
      onError,
    });
    controller.openDocument("node-a", "v0");

    controller.update("v1");
    await vi.advanceTimersByTimeAsync(800);
    expect(controller.getState()).toMatchObject({
      status: "error",
      errorMessage: "No se pudo guardar.",
      hasPendingChanges: true,
    });
    expect(onError).toHaveBeenCalledWith(error, {
      nodeId: "node-a",
      content: "v1",
    });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).toHaveBeenCalledTimes(1);

    expect(await controller.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.getState().status).toBe("saved");
  });

  it("refuses to open or close a document with pending changes", () => {
    const controller = new AutosaveController({
      save: async () => {},
    });
    controller.openDocument("node-a", "a0");
    controller.update("a1");

    expect(() => controller.openDocument("node-b", "b0")).toThrow(
      AutosaveStateError,
    );
    expect(() => controller.close()).toThrow(AutosaveStateError);

    controller.close({ discard: true });
    expect(controller.getState().documentId).toBeNull();
  });

  it("flushes synchronously for window close and reports failures", () => {
    const saveSync = vi.fn();
    const controller = new AutosaveController({
      save: async () => {},
      saveSync,
      describeError: () => "No se pudo guardar.",
    });
    controller.openDocument("node-a", "a0");

    expect(controller.flushForClose()).toBe(true);
    expect(saveSync).not.toHaveBeenCalled();

    controller.update("a1");
    expect(controller.flushForClose()).toBe(true);
    expect(saveSync).toHaveBeenCalledWith({
      nodeId: "node-a",
      content: "a1",
    });
    expect(controller.getState()).toMatchObject({
      status: "saved",
      hasPendingChanges: false,
    });

    controller.update("a2");
    saveSync.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(controller.flushForClose()).toBe(false);
    expect(controller.getState()).toMatchObject({
      status: "error",
      hasPendingChanges: true,
    });
  });

  it("does not run timers after disposal", async () => {
    const save = vi.fn(async () => {});
    const controller = new AutosaveController({ save });
    controller.openDocument("node-a", "a0");
    controller.update("a1");
    controller.dispose();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(save).not.toHaveBeenCalled();
  });
});
