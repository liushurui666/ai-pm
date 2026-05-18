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

async function listAllVisibleDepartmentIds(accessToken: string) {
  const departmentIds = new Set<string>(["0"]);
  let pageToken = "";

  do {
    const url = new URL("https://open.feishu.cn/open-apis/contact/v3/departments/0/children");
    url.searchParams.set("department_id_type", "open_department_id");
    url.searchParams.set("user_id_type", "open_id");
    url.searchParams.set("fetch_child", "true");
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
      throw new Error(
        getFeishuContactError(
          payload,
          "读取飞书部门失败，请在飞书开放平台把应用通讯录权限范围设置为全员或目标部门"
        )
      );
    }

    for (const department of payload.data?.items ?? []) {
      const departmentId = department.open_department_id || department.department_id;

      if (departmentId) {
        departmentIds.add(departmentId);
      }
    }

    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken && departmentIds.size < 1_000);

  return [...departmentIds];
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

export async function listFeishuPeople(query = "") {
  const accessToken = await getFeishuTenantAccessToken();
  const peopleByOpenId = new Map<string, FeishuPerson>();
  const departmentIds = await listAllVisibleDepartmentIds(accessToken);

  for (const departmentId of departmentIds) {
    const departmentPeople = await listDepartmentPeople(accessToken, departmentId);

    for (const person of departmentPeople) {
      peopleByOpenId.set(person.openId, person);
    }

    if (peopleByOpenId.size >= 1_000) {
      break;
    }
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
