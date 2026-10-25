import type {
  BinderNode,
  CreateBinderNodeInput,
  MoveBinderNodeInput,
  UpdateBinderNodeInput,
} from "@shakespeare/shared";

export interface BinderNodeRepository {
  create(input: CreateBinderNodeInput): BinderNode;
  findById(nodeId: string): BinderNode | undefined;
  findByProjectId(projectId: string): BinderNode[];
  update(input: UpdateBinderNodeInput): BinderNode;
  delete(nodeId: string): void;
  move(input: MoveBinderNodeInput): BinderNode;
}
