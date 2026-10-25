import { contextBridge, ipcRenderer } from "electron";
import {
  type IPC_CHANNELS,
  type IpcResult,
  type ShakespeareApi,
} from "@shakespeare/shared";

const channels = {
  getAppHealth: "app:get-health",
  createProject: "project:create",
  getProject: "project:get",
  listProjects: "project:list",
  updateProject: "project:update",
  deleteProject: "project:delete",
  createBinderNode: "binder-node:create",
  listBinderNodes: "binder-node:list",
  updateBinderNode: "binder-node:update",
  deleteBinderNode: "binder-node:delete",
  moveBinderNode: "binder-node:move",
} satisfies typeof IPC_CHANNELS;

function invoke<Response>(
  channel: string,
  input: unknown,
): Promise<IpcResult<Response>> {
  return ipcRenderer.invoke(channel, input) as Promise<IpcResult<Response>>;
}

const shakespeareApi: ShakespeareApi = {
  getAppHealth: () => invoke(channels.getAppHealth, {}),
  createProject: (input) => invoke(channels.createProject, input),
  getProject: (projectId) => invoke(channels.getProject, { projectId }),
  listProjects: () => invoke(channels.listProjects, {}),
  updateProject: (input) => invoke(channels.updateProject, input),
  deleteProject: (projectId) => invoke(channels.deleteProject, { projectId }),
  createBinderNode: (input) => invoke(channels.createBinderNode, input),
  listBinderNodes: (projectId) =>
    invoke(channels.listBinderNodes, { projectId }),
  updateBinderNode: (input) => invoke(channels.updateBinderNode, input),
  deleteBinderNode: (nodeId) => invoke(channels.deleteBinderNode, { nodeId }),
  moveBinderNode: (input) => invoke(channels.moveBinderNode, input),
};

contextBridge.exposeInMainWorld("shakespeare", shakespeareApi);
