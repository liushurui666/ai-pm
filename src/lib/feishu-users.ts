import { getFeishuTenantAccessToken } from "@/lib/feishu-client";
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

function getFeishuContactError(
  payload: { code?: number; msg?: string; message?: string; error?: { message?: string } },
  fallback: string
) {
  const message = payload.msg || payload.message || payload.error?.message || fallback;

  return payload.code === undefined ? message : `${message}（code: ${payload.code}）`;
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

    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken && userIds.size + departmentIds.size < 2_000);

  return {
    departmentIds: [...departmentIds],
    userIds: [...userIds]
  };
}

async function listChildDepartmentIds(accessToken: string, departmentId: string) {
  const departmentIds = new Set<string>();
  let pageToken = "";

  do {
    const url = new URL(`https://open.feishu.cn/open-apis/contact/v3/departments/${departmentId}/children`);
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
    const payload = (await response.json()) as FeishuListResponse<FeishuDepartment>;

    if (!response.ok || payload.code !== 0) {
      return [];
    }

    for (const department of payload.data?.items ?? []) {
      const childDepartmentId = department.open_department_id || department.department_id;

      if (childDepartmentId) {
        departmentIds.add(childDepartmentId);
      }
    }

    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken && departmentIds.size < 1_000);

  return [...departmentIds];
}

async function expandScopedDepartmentIds(accessToken: string, departmentIds: string[]) {
  const expandedDepartmentIds = new Set(departmentIds);
  const queue = [...departmentIds];

  while (queue.length && expandedDepartmentIds.size < 1_000) {
    const departmentId = queue.shift();

    if (!departmentId) {
      continue;
    }

    const childDepartmentIds = await listChildDepartmentIds(accessToken, departmentId);

    for (const childDepartmentId of childDepartmentIds) {
      if (!expandedDepartmentIds.has(childDepartmentId)) {
        expandedDepartmentIds.add(childDepartmentId);
        queue.push(childDepartmentId);
      }
    }
  }

  return [...expandedDepartmentIds];
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

export async function listFeishuPeople(query = "") {
  const accessToken = await getFeishuTenantAccessToken();
  const peopleByOpenId = new Map<string, FeishuPerson>();
  const scopes = await listContactScopes(accessToken);
  const departmentIds = await expandScopedDepartmentIds(accessToken, scopes.departmentIds);
  const departmentErrors: Error[] = [];

  for (const userId of scopes.userIds) {
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

  if (!keyword) {
    return people;
  }

  return people.filter((person) =>
    [person.name, person.enName, person.email, person.openId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  );
}
