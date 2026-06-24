import { getFeishuTenantAccessToken } from "@/lib/feishu/client";
import type { FeishuPerson } from "@/types/dashboard";

type FeishuContactUser = {
  open_id?: string;
  union_id?: string;
  user_id?: string;
  name?: string;
  en_name?: string;
  email?: string;
  avatar?: {
    avatar_72?: string;
    avatar_240?: string;
    avatar_origin?: string;
  };
  avatar_url?: string;
};

type FeishuDepartment = {
  department_id?: string;
  open_department_id?: string;
  name?: string;
};

type FeishuScopeResponse = {
  code: number;
  msg?: string;
  message?: string;
  error?: {
    message?: string;
  };
  data?: {
    user_ids?: string[];
    department_ids?: string[];
    group_ids?: string[];
    has_more?: boolean;
    page_token?: string;
  };
};

type FeishuGroupMember = {
  member_id?: string;
  member_type?: "user" | "department" | string;
};

type FeishuPeopleResult = {
  people: FeishuPerson[];
  warning?: string;
};

type FeishuUserResponse = {
  code: number;
  msg?: string;
  message?: string;
  error?: {
    message?: string;
  };
  data?: {
    user?: FeishuContactUser;
  };
};

type FeishuListResponse<T> = {
  code: number;
  msg?: string;
  message?: string;
  error?: {
    message?: string;
  };
  data?: {
    items?: T[];
    has_more?: boolean;
    page_token?: string;
  };
};

type FeishuDepartmentResponse = {
  code: number;
  msg?: string;
  message?: string;
  error?: {
    message?: string;
  };
  data?: {
    department?: FeishuDepartment;
  };
};

type FeishuDepartmentNode = {
  departmentId: string;
  openDepartmentId: string;
};

function getFeishuContactError(
  payload: { code?: number; msg?: string; message?: string; error?: { message?: string } },
  fallback: string
) {
  const message = payload.msg || payload.message || payload.error?.message || fallback;

  return payload.code === undefined ? message : `${message}（code: ${payload.code}）`;
}

function getFeishuGroupReadWarning(error: Error) {
  // 飞书会在缺少权限时返回带后台授权链接的长错误；前端只需要告诉管理员缺哪项权限，
  // 避免把开放平台 URL 和 app 标识直接展示在业务弹窗里造成噪音。
  if (error.message.includes("contact:group:readonly")) {
    return "飞书应用缺少 contact:group:readonly 用户组读取权限，请在飞书开放平台为当前应用开通后重新发布/生效。";
  }

  return error.message.replace(/https?:\/\/\S+/g, "").trim();
}

function mapContactUser(user: FeishuContactUser): FeishuPerson | null {
  if (!user.open_id || !user.name) {
    return null;
  }

  return {
    openId: user.open_id,
    unionId: user.union_id,
    userId: user.user_id,
    name: user.name,
    enName: user.en_name,
    email: user.email,
    avatarUrl: user.avatar?.avatar_72 || user.avatar?.avatar_240 || user.avatar?.avatar_origin || user.avatar_url
  };
}

async function listContactScopes(accessToken: string) {
  const userIds = new Set<string>();
  const departmentIds = new Set<string>();
  const groupIds = new Set<string>();
  let pageToken = "";

  do {
    const url = new URL("https://open.feishu.cn/open-apis/contact/v3/scopes");
    url.searchParams.set("department_id_type", "open_department_id");
    url.searchParams.set("user_id_type", "open_id");
    url.searchParams.set("page_size", "100");

    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });
    const payload = (await response.json()) as FeishuScopeResponse;

    if (!response.ok || payload.code !== 0) {
      throw new Error(
        getFeishuContactError(
          payload,
          "读取飞书通讯录授权范围失败，请确认应用已开通通讯录授权范围读取能力"
        )
      );
    }

    for (const userId of payload.data?.user_ids ?? []) {
      userIds.add(userId);
    }

    for (const departmentId of payload.data?.department_ids ?? []) {
      if (departmentId) {
        departmentIds.add(departmentId);
      }
    }

    for (const groupId of payload.data?.group_ids ?? []) {
      if (groupId) {
        groupIds.add(groupId);
      }
    }

    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken && userIds.size + departmentIds.size + groupIds.size < 2_000);

  return {
    departmentIds: [...departmentIds],
    groupIds: [...groupIds],
    userIds: [...userIds]
  };
}

function mapDepartmentNode(department: FeishuDepartment): FeishuDepartmentNode | null {
  const departmentId = department.department_id?.trim();
  const openDepartmentId = department.open_department_id?.trim();

  if (!departmentId || !openDepartmentId) {
    return null;
  }

  return {
    departmentId,
    openDepartmentId
  };
}

async function getDepartmentNode(accessToken: string, openDepartmentId: string): Promise<FeishuDepartmentNode | null> {
  if (openDepartmentId === "0") {
    return {
      departmentId: "0",
      openDepartmentId: "0"
    };
  }

  const url = new URL(`https://open.feishu.cn/open-apis/contact/v3/departments/${openDepartmentId}`);
  url.searchParams.set("department_id_type", "open_department_id");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuDepartmentResponse;

  if (!response.ok || payload.code !== 0) {
    return null;
  }

  return payload.data?.department ? mapDepartmentNode(payload.data.department) : null;
}

async function listChildDepartments(accessToken: string, departmentId: string) {
  const departments: FeishuDepartmentNode[] = [];
  let pageToken = "";

  do {
    const url = new URL(`https://open.feishu.cn/open-apis/contact/v3/departments/${departmentId}/children`);
    url.searchParams.set("department_id_type", "department_id");
    // 飞书子部门接口对 page_size 上限更保守，传 100 会直接返回 field validation failed；
    // 这里用 50 保持分页展开稳定，避免授权了上级部门但下拉只看到直属成员。
    url.searchParams.set("page_size", "50");

    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });
    const payload = (await response.json()) as FeishuListResponse<FeishuDepartment>;

    if (!response.ok || payload.code !== 0) {
      return [];
    }

    for (const department of payload.data?.items ?? []) {
      const childDepartment = mapDepartmentNode(department);

      if (childDepartment) {
        departments.push(childDepartment);
      }
    }

    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken && departments.length < 1_000);

  return departments;
}

async function expandScopedDepartmentIds(accessToken: string, departmentIds: string[]) {
  const expandedOpenDepartmentIds = new Set<string>();
  const visitedDepartmentIds = new Set<string>();
  const queue: FeishuDepartmentNode[] = [];

  for (const departmentId of departmentIds) {
    const departmentNode = await getDepartmentNode(accessToken, departmentId);

    if (!departmentNode) {
      expandedOpenDepartmentIds.add(departmentId);
      continue;
    }

    expandedOpenDepartmentIds.add(departmentNode.openDepartmentId);
    queue.push(departmentNode);
  }

  while (queue.length && expandedOpenDepartmentIds.size < 1_000) {
    const department = queue.shift();

    if (!department || visitedDepartmentIds.has(department.departmentId)) {
      continue;
    }

    visitedDepartmentIds.add(department.departmentId);
    const childDepartments = await listChildDepartments(accessToken, department.departmentId);

    for (const childDepartment of childDepartments) {
      if (!expandedOpenDepartmentIds.has(childDepartment.openDepartmentId)) {
        expandedOpenDepartmentIds.add(childDepartment.openDepartmentId);
        queue.push(childDepartment);
      }
    }
  }

  return [...expandedOpenDepartmentIds];
}

async function listDepartmentPeople(accessToken: string, departmentId: string) {
  const people: FeishuPerson[] = [];
  let pageToken = "";

  do {
    const url = new URL("https://open.feishu.cn/open-apis/contact/v3/users/find_by_department");
    url.searchParams.set("department_id", departmentId);
    url.searchParams.set("department_id_type", "open_department_id");
    url.searchParams.set("user_id_type", "open_id");
    url.searchParams.set("page_size", "50");

    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });
    const payload = (await response.json()) as FeishuListResponse<FeishuContactUser>;

    if (!response.ok || payload.code !== 0) {
      throw new Error(
        getFeishuContactError(
          payload,
          "读取飞书部门成员失败，请确认应用已开通通讯录用户读取权限"
        )
      );
    }

    people.push(...(payload.data?.items ?? []).map(mapContactUser).filter((user): user is FeishuPerson => Boolean(user)));
    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken && people.length < 500);

  return people;
}

async function listGroupMemberIds(accessToken: string, groupId: string) {
  const userIds = new Set<string>();
  const departmentIds = new Set<string>();
  let pageToken = "";

  do {
    const url = new URL(`https://open.feishu.cn/open-apis/contact/v3/group/${groupId}/member/simplelist`);

    // 飞书用户组成员可能是用户，也可能是部门；member_id_type=open_id 能让用户返回 open_id，
    // 部门返回 open_department_id，后续继续复用现有用户详情和部门成员读取链路。
    url.searchParams.set("member_id_type", "open_id");
    url.searchParams.set("page_size", "100");

    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });
    const payload = (await response.json()) as FeishuListResponse<FeishuGroupMember>;

    if (!response.ok || payload.code !== 0) {
      throw new Error(getFeishuContactError(payload, "读取飞书用户组成员失败"));
    }

    for (const member of payload.data?.items ?? []) {
      if (!member.member_id) {
        continue;
      }

      if (member.member_type === "department") {
        departmentIds.add(member.member_id);
        continue;
      }

      userIds.add(member.member_id);
    }

    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken && userIds.size + departmentIds.size < 2_000);

  return {
    departmentIds: [...departmentIds],
    userIds: [...userIds]
  };
}

async function getUserDetail(accessToken: string, userId: string) {
  const url = new URL(`https://open.feishu.cn/open-apis/contact/v3/users/${userId}`);
  url.searchParams.set("department_id_type", "open_department_id");
  url.searchParams.set("user_id_type", "open_id");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuUserResponse;

  if (!response.ok || payload.code !== 0 || !payload.data?.user) {
    throw new Error(getFeishuContactError(payload, "读取飞书成员详情失败"));
  }

  return mapContactUser(payload.data.user);
}

export async function listFeishuPeopleWithDiagnostics(query = ""): Promise<FeishuPeopleResult> {
  const accessToken = await getFeishuTenantAccessToken();
  const peopleByOpenId = new Map<string, FeishuPerson>();
  const scopes = await listContactScopes(accessToken);
  const scopedUserIds = new Set(scopes.userIds);
  const scopedDepartmentIds = new Set(scopes.departmentIds);
  const departmentErrors: Error[] = [];
  const groupErrors: Error[] = [];

  for (const groupId of scopes.groupIds) {
    try {
      const groupMemberIds = await listGroupMemberIds(accessToken, groupId);

      // 通讯录授权范围可以通过“用户组”维护一批人；如果只处理 user_ids/department_ids，
      // 后台看起来授权了很多人，但 AI PM 下拉只会出现零散用户，容易误判成前端过滤问题。
      for (const userId of groupMemberIds.userIds) {
        scopedUserIds.add(userId);
      }

      for (const departmentId of groupMemberIds.departmentIds) {
        scopedDepartmentIds.add(departmentId);
      }
    } catch (error) {
      groupErrors.push(error instanceof Error ? error : new Error("读取飞书用户组成员失败"));
    }
  }

  const departmentIds = await expandScopedDepartmentIds(accessToken, [...scopedDepartmentIds]);

  for (const userId of scopedUserIds) {
    const person = await getUserDetail(accessToken, userId);

    if (person) {
      peopleByOpenId.set(person.openId, person);
    }
  }

  for (const departmentId of departmentIds) {
    let departmentPeople: FeishuPerson[] = [];

    try {
      departmentPeople = await listDepartmentPeople(accessToken, departmentId);
    } catch (error) {
      departmentErrors.push(error instanceof Error ? error : new Error("读取飞书部门成员失败"));
      continue;
    }

    for (const person of departmentPeople) {
      peopleByOpenId.set(person.openId, person);
    }

    if (peopleByOpenId.size >= 1_000) {
      break;
    }
  }

  if (!peopleByOpenId.size && departmentErrors.length) {
    throw departmentErrors[0];
  }

  const people = [...peopleByOpenId.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "zh-Hans-CN")
  );

  const keyword = query.trim().toLowerCase();

  const filteredPeople = keyword
    ? people.filter((person) =>
        [person.name, person.enName, person.email, person.openId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      )
    : people;

  return {
    people: filteredPeople,
    warning: groupErrors.length
      ? `飞书通讯录授权范围包含 ${scopes.groupIds.length} 个用户组，但用户组成员读取失败：${getFeishuGroupReadWarning(groupErrors[0])}`
      : undefined
  };
}

export async function listFeishuPeople(query = "") {
  const result = await listFeishuPeopleWithDiagnostics(query);

  return result.people;
}
