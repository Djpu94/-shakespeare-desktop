import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "@shakespeare/shared";

export interface ProjectRepository {
  create(input: CreateProjectInput): Project;
  findById(projectId: string): Project | undefined;
  findAll(): Project[];
  update(input: UpdateProjectInput): Project;
  delete(projectId: string): void;
}
