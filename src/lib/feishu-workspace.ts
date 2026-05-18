import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getFeishuTenantAccessToken, hasFeishuAppConfig } from "@/lib/feishu-client";
import type { FeishuUser } from "@/types/dashboard";

type ManagedWorkspace = {
  folderToken?: string;
  folderUrl?: string;
  appToken: string;
  appUrl?: string;
  createdAt: string;
};

type FeishuFolderCreateResponse = {
  code: number;
  msg?: string;
  error?: {
    message?: string;
  };
  data?: {
    token?: string;
    url?: string;
  };
};

type FeishuBitableCreateResponse = {
  code: number;
  msg?: string;
  error?: {
    message?: string;
  };
  data?: {
    app?: {
      app_token?: string;
      url?: string;
    };
    app_token?: string;
    url?: string;
  };
};

type FeishuPermissionResponse = {
  code: number;
  msg?: string;
  error?: {
    message?: string;
  };
};

const WORKSPACE_DIR = path.join(process.cwd(), ".ai-pm");
const WORKSPACE_FILE = path.join(WORKSPACE_DIR, "feishu-workspace.json");
const DEFAULT_WORKSPACE_NAME = "AI PM 项目管理平台";

let cachedWorkspace: ManagedWorkspace | null = null;

function getWorkspaceName() {
  return process.env.FEISHU_WORKSPACE_NAME?.trim() || DEFAULT_WORKSPACE_NAME;
}

async function readManagedWorkspace() {
  if (cachedWorkspace) {
    return cachedWorkspace;
  }

  try {
    const raw = await readFile(WORKSPACE_FILE, "utf8");
    const workspace = JSON.parse(raw) as ManagedWorkspace;

    if (workspace.appToken) {
      cachedWorkspace = workspace;
      return workspace;
    }
  } catch {
    return null;
  }

  return null;
}

async function saveManagedWorkspace(workspace: ManagedWorkspace) {
  cachedWorkspace = workspace;
  await mkdir(WORKSPACE_DIR, { recursive: true });
  await writeFile(WORKSPACE_FILE, `${JSON.stringify(workspace, null, 2)}\n`, { mode: 0o600 });
}

function getFeishuErrorMessage(payload: { code?: number; msg?: string; error?: { message?: string } }, fallback: string) {
  const message = payload.msg || payload.error?.message || fallback;

  return payload.code === undefined ? message : `${message}（code: ${payload.code}）`;
}

async function createFeishuFolder(accessToken: string, parentFolderToken: string) {
  const response = await fetch("https://open.feishu.cn/open-apis/drive/v1/files/create_folder", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      folder_token: parentFolderToken,
      name: getWorkspaceName()
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuFolderCreateResponse;

  if (!response.ok || payload.code !== 0 || !payload.data?.token) {
    throw new Error(getFeishuErrorMessage(payload, "创建飞书项目管理文件夹失败"));
  }

  return {
    token: payload.data.token,
    url: payload.data.url
  };
}

async function createFeishuBitableApp(accessToken: string, folderToken?: string) {
  const response = await fetch("https://open.feishu.cn/open-apis/bitable/v1/apps", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: getWorkspaceName(),
      folder_token: folderToken,
      time_zone: "Asia/Shanghai"
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuBitableCreateResponse;
  const appToken = payload.data?.app?.app_token || payload.data?.app_token;

  if (!response.ok || payload.code !== 0 || !appToken) {
    throw new Error(getFeishuErrorMessage(payload, "创建飞书项目管理多维表格失败"));
  }

  return {
    appToken,
    url: payload.data?.app?.url || payload.data?.url
  };
}

async function grantFeishuPermission(token: string, type: "folder" | "bitable", openId?: string) {
  if (!openId) {
    return;
  }

  const accessToken = await getFeishuTenantAccessToken();
  const url = new URL(`https://open.feishu.cn/open-apis/drive/v1/permissions/${token}/members`);
  url.searchParams.set("type", type);
  url.searchParams.set("need_notification", "false");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      member_id: openId,
      member_type: "openid",
      perm: "full_access",
      type: "user"
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuPermissionResponse;

  if (!response.ok || payload.code !== 0) {
    throw new Error(getFeishuErrorMessage(payload, "授权飞书项目管理文件失败"));
  }
}

export function canEnsureFeishuWorkspace() {
  return Boolean(process.env.FEISHU_BITABLE_APP_TOKEN?.trim() || hasFeishuAppConfig());
}

export async function ensureFeishuWorkspace(user?: FeishuUser) {
  const configuredAppToken = process.env.FEISHU_BITABLE_APP_TOKEN?.trim();

  if (configuredAppToken) {
    return {
      appToken: configuredAppToken,
      created: false,
      managed: false
    };
  }

  const existingWorkspace = await readManagedWorkspace();

  if (existingWorkspace) {
    await grantFeishuPermission(existingWorkspace.appToken, "bitable", user?.openId).catch(() => undefined);

    if (existingWorkspace.folderToken) {
      await grantFeishuPermission(existingWorkspace.folderToken, "folder", user?.openId).catch(() => undefined);
    }

    return {
      ...existingWorkspace,
      created: false,
      managed: true
    };
  }

  if (!hasFeishuAppConfig()) {
    throw new Error("请先配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET");
  }

  const accessToken = await getFeishuTenantAccessToken();
  const parentFolderToken = process.env.FEISHU_PARENT_FOLDER_TOKEN?.trim();
  const folder = parentFolderToken ? await createFeishuFolder(accessToken, parentFolderToken) : null;
  const bitable = await createFeishuBitableApp(accessToken, folder?.token || parentFolderToken);
  const workspace: ManagedWorkspace = {
    folderToken: folder?.token,
    folderUrl: folder?.url,
    appToken: bitable.appToken,
    appUrl: bitable.url,
    createdAt: new Date().toISOString()
  };

  await saveManagedWorkspace(workspace);
  if (folder?.token) {
    await grantFeishuPermission(folder.token, "folder", user?.openId).catch(() => undefined);
  }
  await grantFeishuPermission(bitable.appToken, "bitable", user?.openId).catch(() => undefined);

  return {
    ...workspace,
    created: true,
    managed: true
  };
}
