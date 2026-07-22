import { getPrismaClient } from "@/lib/database/prisma";
import { toJsonValue } from "@/lib/database/json";
import {
  loadActiveWorkspaceMembers,
  projectActivityActor,
  requireGovernanceCapability
} from "@/lib/project-management/mutation-context";
import { mapProjectActivityRecord } from "@/lib/project-management/normalizers";
import type { TransferProjectOwnerInput } from "@/lib/project-management/types";
import { ProjectManagementError } from "@/lib/project-management/types";
import type { DashboardMember, ProjectActivity } from "@/types/dashboard";

function findFeishuOwnerIdentity(member: DashboardMember) {
  const identity = member.identities.find((item) => item.provider === "feishu");
  const channel = member.notification.channels.find((item) => item.provider === "feishu" && item.enabled)
    ?? member.notification.channels.find((item) => item.provider === "feishu");

  // 负责人快照优先使用通知渠道中经过管理员确认的飞书身份，再回退到成员 identity，避免交接后通知仍发给旧账号。
  return {
    ownerOpenId: channel?.feishuOpenId ?? member.notification.feishuOpenId ?? identity?.providerUserId ?? null,
    ownerUnionId: channel?.feishuUnionId ?? member.notification.feishuUnionId ?? identity?.providerUnionId ?? null,
    ownerUserId: channel?.feishuUserId ?? member.notification.feishuUserId ?? identity?.providerTenantUserId ?? null
  };
}

function projectOwnerSnapshot(member: DashboardMember) {
  return {
    owner: member.name,
    ownerMemberId: member.id,
    ...findFeishuOwnerIdentity(member),
    ownerEmail: member.email ?? null,
    ownerAvatarUrl: member.avatarUrl ?? null
  };
}

export async function transferProjectOwner(input: TransferProjectOwnerInput): Promise<{
  message: string;
  activity: ProjectActivity;
}> {
  const state = await requireGovernanceCapability(input, "canTransferOwner");
  const reason = input.reason.trim();

  if (!input.newOwnerMemberId.trim()) {
    throw new ProjectManagementError("请选择新的项目负责人。", 400);
  }

  if (!reason) {
    throw new ProjectManagementError("更换项目负责人必须填写交接原因。", 400);
  }

  const [newOwner] = await loadActiveWorkspaceMembers(state.workspaceId, [input.newOwnerMemberId.trim()]);
  const prisma = getPrismaClient();
  const project = await prisma.project.findFirst({
    where: { id: state.project.id, workspaceId: state.workspaceId },
    select: { id: true, name: true, owner: true, ownerMemberId: true }
  });

  if (!project) {
    throw new ProjectManagementError("项目不存在或已被删除。", 404);
  }

  if (project.ownerMemberId === newOwner.id) {
    throw new ProjectManagementError("新负责人与当前负责人相同，无需交接。", 400);
  }

  const keepPreviousOwnerAsAdmin = input.keepPreviousOwnerAsAdmin ?? true;
  const createdActivity = await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: project.id }, data: projectOwnerSnapshot(newOwner) });
    await tx.projectMemberPermission.upsert({
      where: { projectId_memberId: { projectId: project.id, memberId: newOwner.id } },
      create: {
        workspaceId: state.workspaceId,
        projectId: project.id,
        memberId: newOwner.id,
        accessLevel: "admin",
        functionalRoles: toJsonValue([]),
        createdByMemberId: state.currentMember?.id ?? null,
        updatedByMemberId: state.currentMember?.id ?? null
      },
      update: { accessLevel: "admin", updatedByMemberId: state.currentMember?.id ?? null }
    });

    if (project.ownerMemberId) {
      if (keepPreviousOwnerAsAdmin) {
        await tx.projectMemberPermission.upsert({
          where: { projectId_memberId: { projectId: project.id, memberId: project.ownerMemberId } },
          create: {
            workspaceId: state.workspaceId,
            projectId: project.id,
            memberId: project.ownerMemberId,
            accessLevel: "admin",
            functionalRoles: toJsonValue([]),
            createdByMemberId: state.currentMember?.id ?? null,
            updatedByMemberId: state.currentMember?.id ?? null
          },
          update: { accessLevel: "admin", updatedByMemberId: state.currentMember?.id ?? null }
        });
      } else {
        await tx.projectMemberPermission.deleteMany({ where: { projectId: project.id, memberId: project.ownerMemberId } });
      }
    }

    return tx.projectActivity.create({
      data: {
        workspaceId: state.workspaceId,
        projectId: project.id,
        ...projectActivityActor(state),
        action: "owner_transferred",
        entityType: "project",
        entityId: project.id,
        target: newOwner.name,
        detail: `项目负责人由「${project.owner || "未指定"}」交接给「${newOwner.name}」。原因：${reason}。${project.ownerMemberId && keepPreviousOwnerAsAdmin ? "原负责人保留项目管理员权限。" : ""}`
      }
    });
  });

  return {
    message: `已将项目负责人更换为 ${newOwner.name}。`,
    activity: mapProjectActivityRecord(createdActivity)
  };
}
