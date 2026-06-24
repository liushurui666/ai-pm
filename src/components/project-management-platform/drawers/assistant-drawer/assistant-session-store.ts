import type { UIMessage } from "ai";

export type AssistantChatSession = {
  createdAt: number;
  id: string;
  messages: UIMessage[];
  title: string;
  updatedAt: number;
};

export type AssistantSessionState = {
  activeSessionId: string;
  sessions: AssistantChatSession[];
};

const ACTIVE_SESSION_PREFIX = "ai-pm-assistant-active-session:v1";
const DEFAULT_TITLE = "新对话";
const MAX_SESSION_COUNT = 12;
const MAX_TITLE_LENGTH = 28;
const SESSION_PREFIX = "ai-pm-assistant-sessions:v1";
const SSR_SESSION_ID = "assistant-session-ssr";

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `assistant-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneMessages(messages: UIMessage[]) {
  return JSON.parse(JSON.stringify(messages)) as UIMessage[];
}

function getStorageKey(prefix: string, workspaceId: string) {
  return `${prefix}:${workspaceId || "default"}`;
}

function isMessageLike(value: unknown): value is UIMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<UIMessage>;
  return typeof message.id === "string" && typeof message.role === "string" && Array.isArray(message.parts);
}

function isSessionLike(value: unknown): value is AssistantChatSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<AssistantChatSession>;
  return (
    typeof session.id === "string" &&
    typeof session.title === "string" &&
    typeof session.createdAt === "number" &&
    typeof session.updatedAt === "number" &&
    Array.isArray(session.messages) &&
    session.messages.every(isMessageLike)
  );
}

export function getConversationTitleFromMessages(messages: UIMessage[], fallbackTitle = DEFAULT_TITLE) {
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (!firstUserMessage) {
    return fallbackTitle;
  }

  const title = firstUserMessage.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return title ? title.slice(0, MAX_TITLE_LENGTH) : fallbackTitle;
}

export function createAssistantSession(initialMessages: UIMessage[], title = DEFAULT_TITLE): AssistantChatSession {
  const now = Date.now();

  return {
    createdAt: now,
    id: createSessionId(),
    messages: cloneMessages(initialMessages),
    title,
    updatedAt: now
  };
}

function createSsrSession(initialMessages: UIMessage[]): AssistantChatSession {
  return {
    createdAt: 0,
    id: SSR_SESSION_ID,
    messages: cloneMessages(initialMessages),
    title: DEFAULT_TITLE,
    updatedAt: 0
  };
}

export function createHydrationSafeAssistantSessionState(initialMessages: UIMessage[]): AssistantSessionState {
  const session = createSsrSession(initialMessages);

  // ChatBox 会服务端渲染；首帧不能读取 localStorage 里的历史会话，否则服务端欢迎态和客户端历史态
  // 会在 hydration 时生成完全不同的 DOM 树。这里固定返回可复现的欢迎会话，真实历史在 mount 后再载入。
  return {
    activeSessionId: session.id,
    sessions: [session]
  };
}

export function normalizeAssistantSessionState(
  state: AssistantSessionState,
  initialMessages: UIMessage[]
): AssistantSessionState {
  const uniqueSessions = new Map<string, AssistantChatSession>();

  state.sessions.forEach((session) => {
    uniqueSessions.set(session.id, {
      ...session,
      messages: cloneMessages(session.messages),
      title: session.title.trim() || getConversationTitleFromMessages(session.messages)
    });
  });

  const sessions = [...uniqueSessions.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_SESSION_COUNT);

  if (sessions.length === 0) {
    const session = createAssistantSession(initialMessages);
    return {
      activeSessionId: session.id,
      sessions: [session]
    };
  }

  const activeSessionId = sessions.some((session) => session.id === state.activeSessionId)
    ? state.activeSessionId
    : sessions[0].id;

  return {
    activeSessionId,
    sessions
  };
}

export function loadAssistantSessionState(workspaceId: string, initialMessages: UIMessage[]) {
  if (typeof window === "undefined") {
    return createHydrationSafeAssistantSessionState(initialMessages);
  }

  const rawSessions = window.localStorage.getItem(getStorageKey(SESSION_PREFIX, workspaceId));
  const activeSessionId = window.localStorage.getItem(getStorageKey(ACTIVE_SESSION_PREFIX, workspaceId)) ?? "";

  if (!rawSessions) {
    return normalizeAssistantSessionState(
      {
        activeSessionId,
        sessions: []
      },
      initialMessages
    );
  }

  try {
    const parsed = JSON.parse(rawSessions) as unknown;
    const sessions = Array.isArray(parsed) ? parsed.filter(isSessionLike) : [];

    return normalizeAssistantSessionState(
      {
        activeSessionId,
        sessions
      },
      initialMessages
    );
  } catch {
    return normalizeAssistantSessionState(
      {
        activeSessionId: "",
        sessions: []
      },
      initialMessages
    );
  }
}

export function saveAssistantSessionState(workspaceId: string, state: AssistantSessionState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getStorageKey(SESSION_PREFIX, workspaceId), JSON.stringify(state.sessions));
  window.localStorage.setItem(getStorageKey(ACTIVE_SESSION_PREFIX, workspaceId), state.activeSessionId);
}

export function updateSessionMessages(
  state: AssistantSessionState,
  sessionId: string,
  messages: UIMessage[]
): AssistantSessionState {
  const updatedSessions = state.sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    return {
      ...session,
      messages: cloneMessages(messages),
      title: getConversationTitleFromMessages(messages, session.title),
      updatedAt: Date.now()
    };
  });

  return {
    activeSessionId: state.activeSessionId,
    sessions: updatedSessions
  };
}
