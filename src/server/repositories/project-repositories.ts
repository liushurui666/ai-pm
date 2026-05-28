import { getPrismaClient } from "@/lib/database/prisma";
import type { ProjectRepository } from "@/types/dashboard";

function toProjectRepository(repository: {
  id: string;
  workspaceId: string;
  projectId: string | null;
  provider: "github" | "gitlab";
  repoFullName: string;
  cloneUrl: string;
  defaultBranch: string;
  packageManager: string;
  installCommand: string;
  lintCommand: string | null;
  testCommand: string | null;
  buildCommand: string | null;
  allowedPaths: string[];
  blockedPaths: string[];
  defaultReviewers: string[];
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
}): ProjectRepository {
  return {
    id: repository.id,
    workspaceId: repository.workspaceId,
    projectId: repository.projectId ?? undefined,
    provider: repository.provider,
    repoFullName: repository.repoFullName,
    cloneUrl: repository.cloneUrl,
    defaultBranch: repository.defaultBranch,
    packageManager: repository.packageManager as ProjectRepository["packageManager"],
    installCommand: repository.installCommand,
    lintCommand: repository.lintCommand ?? undefined,
    testCommand: repository.testCommand ?? undefined,
    buildCommand: repository.buildCommand ?? undefined,
    allowedPaths: repository.allowedPaths,
    blockedPaths: repository.blockedPaths,
    defaultReviewers: repository.defaultReviewers,
    status: repository.status,
    createdAt: repository.createdAt.toISOString(),
    updatedAt: repository.updatedAt.toISOString()
  };
}

export async function listProjectRepositories(workspaceId: string) {
  const prisma = getPrismaClient();
  const repositories = await prisma.projectRepository.findMany({
    where: {
      workspaceId,
      status: "active"
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  return repositories.map(toProjectRepository);
}

export async function getProjectRepository(repositoryId: string) {
  const prisma = getPrismaClient();
  const repository = await prisma.projectRepository.findUnique({
    where: {
      id: repositoryId
    }
  });

  return repository ? toProjectRepository(repository) : undefined;
}

export async function createProjectRepository(values: {
  allowedPaths?: string[];
  blockedPaths?: string[];
  buildCommand?: string;
  cloneUrl: string;
  defaultBranch?: string;
  defaultReviewers?: string[];
  installCommand?: string;
  lintCommand?: string;
  packageManager?: ProjectRepository["packageManager"];
  projectId?: string;
  provider?: ProjectRepository["provider"];
  repoFullName: string;
  testCommand?: string;
  workspaceId: string;
}) {
  const prisma = getPrismaClient();
  const repository = await prisma.projectRepository.create({
    data: {
      workspaceId: values.workspaceId,
      projectId: values.projectId,
      provider: values.provider ?? "github",
      repoFullName: values.repoFullName,
      cloneUrl: values.cloneUrl,
      defaultBranch: values.defaultBranch ?? "main",
      packageManager: values.packageManager ?? "pnpm",
      installCommand: values.installCommand ?? "pnpm install",
      lintCommand: values.lintCommand,
      testCommand: values.testCommand,
      buildCommand: values.buildCommand,
      allowedPaths: values.allowedPaths ?? [],
      blockedPaths: values.blockedPaths ?? [],
      defaultReviewers: values.defaultReviewers ?? [],
      status: "active"
    }
  });

  return toProjectRepository(repository);
}

export async function findRepositoryForBug(workspaceId: string, projectName: string) {
  const prisma = getPrismaClient();
  const project = await prisma.project.findFirst({
    where: {
      workspaceId,
      name: projectName
    },
    select: {
      id: true
    }
  });
  const repository = await prisma.projectRepository.findFirst({
    where: {
      workspaceId,
      status: "active",
      OR: [
        project
          ? {
              projectId: project.id
            }
          : {
              projectId: "__missing__"
            },
        {
          projectId: null
        }
      ]
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  return repository ? toProjectRepository(repository) : undefined;
}
