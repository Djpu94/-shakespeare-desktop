export type AutosaveStatus = "saved" | "pending" | "saving" | "error";

export interface AutosaveState {
  readonly documentId: string | null;
  readonly status: AutosaveStatus;
  readonly errorMessage: string | null;
  readonly hasPendingChanges: boolean;
}

export interface AutosaveContent {
  readonly nodeId: string;
  readonly content: string;
}

export interface AutosaveDependencies {
  save(input: AutosaveContent): Promise<void>;
  /**
   * Synchronous write used by `beforeunload` in Electron. SQLite is
   * synchronous in the main process, so the pending save can finish before the
   * window is destroyed.
   */
  saveSync?(input: AutosaveContent): void;
  debounceMs?: number;
  describeError?(error: unknown): string;
  onStateChange?(state: AutosaveState): void;
  onError?(error: unknown, input: AutosaveContent): void;
  scheduleTimeout?(handler: () => void, timeoutMs: number): unknown;
  cancelTimeout?(handle: unknown): void;
}

export class AutosaveStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutosaveStateError";
  }
}

export const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 800;
const DEFAULT_ERROR_MESSAGE =
  "No se pudo guardar el documento. Vuelve a intentarlo.";

/**
 * Framework-agnostic autosave engine.
 *
 * Invariants:
 * - Only one write is in flight at a time; later content waits in the chain.
 * - Repeated content that already matches the last saved snapshot is never
 *   written again.
 * - Auto saves respect the debounce, while explicit flushes (switching
 *   documents, manual save, close) persist the newest content immediately.
 * - A document is never switched or closed while its pending changes are still
 *   unsaved; callers must await `flush()` first.
 */
export class AutosaveController {
  private documentId: string | null = null;
  private content = "";
  private savedContent = "";
  private status: AutosaveStatus = "saved";
  private errorMessage: string | null = null;
  private timer: unknown = null;
  private isSaveInFlight = false;
  private isDisposed = false;
  private documentEpoch = 0;
  private flushChain: Promise<boolean> = Promise.resolve(true);
  private lastState: AutosaveState | null = null;

  private readonly debounceMs: number;
  private readonly scheduleTimeout: (
    handler: () => void,
    timeoutMs: number,
  ) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;

  constructor(private readonly dependencies: AutosaveDependencies) {
    this.debounceMs = dependencies.debounceMs ?? DEFAULT_AUTOSAVE_DEBOUNCE_MS;
    this.scheduleTimeout =
      dependencies.scheduleTimeout ??
      ((handler, timeoutMs) => globalThis.setTimeout(handler, timeoutMs));
    this.cancelTimeout =
      dependencies.cancelTimeout ??
      ((handle) => globalThis.clearTimeout(handle as number));
  }

  getState(): AutosaveState {
    return {
      documentId: this.documentId,
      status: this.status,
      errorMessage: this.errorMessage,
      hasPendingChanges: this.hasPendingChanges(),
    };
  }

  hasPendingChanges(): boolean {
    return this.documentId !== null && this.content !== this.savedContent;
  }

  getDocumentId(): string | null {
    return this.documentId;
  }

  /**
   * Opens a document that the caller already flushed. Throws if pending
   * changes would otherwise be silently discarded.
   */
  openDocument(documentId: string, content: string): void {
    this.assertActive();
    if (this.hasPendingChanges()) {
      throw new AutosaveStateError(
        "Flush pending changes before opening another document.",
      );
    }

    this.cancelScheduledSave();
    this.documentEpoch += 1;
    this.documentId = documentId;
    this.content = content;
    this.savedContent = content;
    this.status = "saved";
    this.errorMessage = null;
    this.emit();
  }

  close(options: { discard?: boolean } = {}): void {
    if (!options.discard && this.hasPendingChanges()) {
      throw new AutosaveStateError(
        "Flush pending changes before closing the document.",
      );
    }

    this.cancelScheduledSave();
    this.documentEpoch += 1;
    this.documentId = null;
    this.content = "";
    this.savedContent = "";
    this.status = "saved";
    this.errorMessage = null;
    this.emit();
  }

  update(content: string): void {
    if (this.documentId === null || content === this.content) {
      return;
    }

    this.content = content;
    this.errorMessage = null;
    this.cancelScheduledSave();

    if (content === this.savedContent) {
      this.status = this.isSaveInFlight ? "saving" : "saved";
      this.emit();
      return;
    }

    this.status = this.isSaveInFlight ? "saving" : "pending";
    this.scheduleDebouncedSave();
    this.emit();
  }

  /**
   * Cancels the debounce timer and persists the newest content. Returns false
   * when persistence failed so the caller can keep the current document open.
   */
  flush(): Promise<boolean> {
    this.cancelScheduledSave();
    return this.enqueueFlush(true);
  }

  /**
   * Last-resort synchronous write for `beforeunload`. Returns false when the
   * pending content could not be persisted synchronously.
   */
  flushForClose(): boolean {
    if (this.isSaveInFlight) {
      // Let the in-flight async save finish and ask the user before closing.
      return false;
    }
    if (!this.hasPendingChanges()) {
      return true;
    }
    if (this.documentId === null) {
      return false;
    }
    if (this.dependencies.saveSync === undefined) {
      return false;
    }

    this.cancelScheduledSave();
    const input: AutosaveContent = {
      nodeId: this.documentId,
      content: this.content,
    };

    try {
      this.dependencies.saveSync(input);
    } catch (error) {
      this.status = "error";
      this.errorMessage = this.describeError(error);
      this.emit();
      this.dependencies.onError?.(error, input);
      return false;
    }

    this.savedContent = input.content;
    this.status = "saved";
    this.errorMessage = null;
    this.emit();
    return true;
  }

  dispose(): void {
    this.cancelScheduledSave();
    this.isDisposed = true;
  }

  private enqueueFlush(force: boolean): Promise<boolean> {
    const run = this.flushChain.then(() => this.flushInternal(force));
    this.flushChain = run.then(
      () => true,
      () => false,
    );
    return run;
  }

  private async flushInternal(force: boolean): Promise<boolean> {
    while (
      !this.isDisposed &&
      this.documentId !== null &&
      this.content !== this.savedContent
    ) {
      const nodeId = this.documentId;
      const content = this.content;
      const epoch = this.documentEpoch;
      const input: AutosaveContent = { nodeId, content };

      this.isSaveInFlight = true;
      this.status = "saving";
      this.errorMessage = null;
      this.emit();

      try {
        await this.dependencies.save(input);
      } catch (error) {
        this.isSaveInFlight = false;
        if (
          this.isDisposed ||
          this.documentEpoch !== epoch ||
          this.documentId !== nodeId
        ) {
          return false;
        }
        this.status = "error";
        this.errorMessage = this.describeError(error);
        this.emit();
        this.dependencies.onError?.(error, input);
        return false;
      }

      this.isSaveInFlight = false;
      if (this.isDisposed) {
        return true;
      }
      if (this.documentEpoch !== epoch || this.documentId !== nodeId) {
        // The document was force-closed while saving; never apply this
        // content to the new document.
        return true;
      }

      this.savedContent = content;
      if (this.content === content) {
        this.status = "saved";
        this.errorMessage = null;
        this.emit();
        return true;
      }

      // Newer edits arrived while saving. Only an explicit flush persists them
      // immediately; automatic saves wait for their own debounce timer. The
      // timer may have been cancelled by a revert, so make sure one exists.
      if (!force) {
        this.status = "pending";
        this.scheduleDebouncedSave();
        this.emit();
        return true;
      }
    }

    if (this.isDisposed) {
      return true;
    }
    if (this.hasPendingChanges()) {
      return false;
    }
    if (this.status !== "saved" && this.status !== "error") {
      this.status = "saved";
      this.errorMessage = null;
      this.emit();
    }
    return this.status !== "error";
  }

  private scheduleDebouncedSave(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = this.scheduleTimeout(() => {
      this.timer = null;
      void this.enqueueFlush(false);
    }, this.debounceMs);
  }

  private cancelScheduledSave(): void {
    if (this.timer === null) {
      return;
    }
    this.cancelTimeout(this.timer);
    this.timer = null;
  }

  private describeError(error: unknown): string {
    return this.dependencies.describeError?.(error) ?? DEFAULT_ERROR_MESSAGE;
  }

  private assertActive(): void {
    if (this.isDisposed) {
      throw new AutosaveStateError(
        "Cannot use an autosave controller after disposal.",
      );
    }
  }

  private emit(): void {
    if (this.isDisposed) {
      return;
    }

    const state = this.getState();
    if (statesEqual(this.lastState, state)) {
      return;
    }
    this.lastState = state;
    this.dependencies.onStateChange?.(state);
  }
}

function statesEqual(
  first: AutosaveState | null,
  second: AutosaveState,
): boolean {
  return (
    first !== null &&
    first.documentId === second.documentId &&
    first.status === second.status &&
    first.errorMessage === second.errorMessage &&
    first.hasPendingChanges === second.hasPendingChanges
  );
}
