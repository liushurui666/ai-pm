import { getFeishuAppAccessToken } from "@/lib/feishu-client";
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

type FeishuUserListResponse = {
  code: number;
  msg?: string;
  message?: string;
  data?: {
    items?: FeishuContactUser[];
    has_more?: boolean;
    page_token?: string;
  };
};

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

export async function listFeishuPeople(query = "") {
  const accessToken = await getFeishuAppAccessToken();
  const people: FeishuPerson[] = [];
  let pageToken = "";

  do {
    const url = new URL("https://open.feishu.cn/open-apis/contact/v3/users");
    url.searchParams.set("department_id", "0");
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
    const payload = (await response.json()) as FeishuUserListResponse;

    if (!response.ok || payload.code !== 0) {
      throw new Error(
        payload.msg || payload.message || "读取飞书通讯录失败，请确认应用已开通通讯录用户读取权限"
      );
    }

    people.push(...(payload.data?.items ?? []).map(mapContactUser).filter((user): user is FeishuPerson => Boolean(user)));
    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken && people.length < 200);

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
