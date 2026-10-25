import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApplicationError } from "@shakespeare/domain";
import {
  SqliteBinderNodeRepository,
  SqliteProjectRepository,
  openDatabase,
} from "@shakespeare/infra";
import {
  AppHealthRequestSchema,
  AppHealthResponseSchema,
  ApplicationErrorSchema,
  BinderNodeListSchema,
  BinderNodeIdRequestSchema,
  BinderNodeSchema,
  CreateBinderNodeSchema,
  CreateProjectSchema,
  EmptyRequestSchema,
  FlushBinderContentRequestSchema,
  IPC_CHANNELS,
  MoveBinderNodeSchema,
  ProjectListSchema,
  ProjectIdRequestSchema,
  ProjectSchema,
  UpdateBinderNodeSchema,
  UpdateProjectSchema,
  VoidResponseSchema,
} from "@shakespeare/shared";
import type { IpcResult } from "@shakespeare/shared";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

interface RuntimeSchema<Output> {
  parse(input: unknown): Output;
}

function executeIpcCall<Request, Response>(
  channel: string,
  requestSchema: RuntimeSchema<Request>,
  responseSchema: RuntimeSchema<Response>,
  operation: (request: Request) => Response,
  input: unknown,
): IpcResult<Response> {
  let request: Request;
  try {
    request = requestSchema.parse(input);
  } catch {
    return {
      ok: false,
      error: ApplicationErrorSchema.parse({
        code: "VALIDATION_ERROR",
        message: "The request is invalid.",
      }),
    };
  }

  try {
    return {
      ok: true,
      value: responseSchema.parse(operation(request)),
    };
  } catch (error) {
    if (error instanceof ApplicationError) {
      return {
        ok: false,
        error: ApplicationErrorSchema.parse({
          code: error.code,
          message:
            error.code === "INTERNAL_ERROR"
              ? "An unexpected error occurred."
              : error.message,
        }),
      };
    }

    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "ipc.unexpected_error",
        channel,
        errorName: error instanceof Error ? error.name : "UnknownError",
      })}\n`,
    );
    return {
      ok: false,
      error: ApplicationErrorSchema.parse({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      }),
    };
  }
}

function handleIpc<Request, Response>(
  channel: string,
  requestSchema: RuntimeSchema<Request>,
  responseSchema: RuntimeSchema<Response>,
  operation: (request: Request) => Response,
): void {
  ipcMain.handle(channel, (_event, input: unknown) =>
    executeIpcCall(channel, requestSchema, responseSchema, operation, input),
  );
}

/**
 * Synchronous IPC used only by the renderer `beforeunload` path. SQLite writes
 * are synchronous, so returning the result through `event.returnValue` lets the
 * window close only after the pending document is safely persisted.
 */
function handleSyncIpc<Request, Response>(
  channel: string,
  requestSchema: RuntimeSchema<Request>,
  responseSchema: RuntimeSchema<Response>,
  operation: (request: Request) => Response,
): void {
  ipcMain.on(channel, (event, input: unknown) => {
    event.returnValue = executeIpcCall(
      channel,
      requestSchema,
      responseSchema,
      operation,
      input,
    );
  });
}

function registerIpcHandlers(
  projectRepository: SqliteProjectRepository,
  binderNodeRepository: SqliteBinderNodeRepository,
): void {
  handleIpc(
    IPC_CHANNELS.getAppHealth,
    AppHealthRequestSchema,
    AppHealthResponseSchema,
    () => ({ status: "ok", appVersion: app.getVersion() }),
  );
  handleIpc(
    IPC_CHANNELS.createProject,
    CreateProjectSchema,
    ProjectSchema,
    (input) => projectRepository.create(input),
  );
  handleIpc(
    IPC_CHANNELS.getProject,
    ProjectIdRequestSchema,
    ProjectSchema.nullable(),
    ({ projectId }) => projectRepository.findById(projectId) ?? null,
  );
  handleIpc(
    IPC_CHANNELS.listProjects,
    EmptyRequestSchema,
    ProjectListSchema,
    () => projectRepository.findAll(),
  );
  handleIpc(
    IPC_CHANNELS.updateProject,
    UpdateProjectSchema,
    ProjectSchema,
    (input) => projectRepository.update(input),
  );
  handleIpc(
    IPC_CHANNELS.deleteProject,
    ProjectIdRequestSchema,
    VoidResponseSchema,
    ({ projectId }) => projectRepository.delete(projectId),
  );
  handleIpc(
    IPC_CHANNELS.createBinderNode,
    CreateBinderNodeSchema,
    BinderNodeSchema,
    (input) => binderNodeRepository.create(input),
  );
  handleIpc(
    IPC_CHANNELS.listBinderNodes,
    ProjectIdRequestSchema,
    BinderNodeListSchema,
    ({ projectId }) => binderNodeRepository.findByProjectId(projectId),
  );
  handleIpc(
    IPC_CHANNELS.updateBinderNode,
    UpdateBinderNodeSchema,
    BinderNodeSchema,
    (input) => binderNodeRepository.update(input),
  );
  handleIpc(
    IPC_CHANNELS.deleteBinderNode,
    BinderNodeIdRequestSchema,
    VoidResponseSchema,
    ({ nodeId }) => binderNodeRepository.delete(nodeId),
  );
  handleIpc(
    IPC_CHANNELS.moveBinderNode,
    MoveBinderNodeSchema,
    BinderNodeSchema,
    (input) => binderNodeRepository.move(input),
  );
  handleSyncIpc(
    IPC_CHANNELS.flushBinderContent,
    FlushBinderContentRequestSchema,
    BinderNodeSchema,
    ({ nodeId, content }) => binderNodeRepository.update({ nodeId, content }),
  );
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const rendererUrl = process.env.SHAKESPEARE_RENDERER_URL;
  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(join(currentDirectory, "renderer", "index.html"));
  }
}

app
  .whenReady()
  .then(() => {
    const database = openDatabase(
      join(app.getPath("userData"), "shakespeare.db"),
    );
    registerIpcHandlers(
      new SqliteProjectRepository(database),
      new SqliteBinderNodeRepository(database),
    );
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "application.startup_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    dialog.showErrorBox(
      "No se pudo iniciar Shakespeare",
      "No se pudo inicializar el almacenamiento local de la aplicación.",
    );
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
