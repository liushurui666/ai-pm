export type AuthProviderId = "email" | "feishu" | "github" | "google" | (string & {});

export type AuthUser = {
  avatarUrl?: string | null;
  email?: string | null;
  id: string;
  metadata?: Record<string, unknown>;
  name?: string | null;
};

export type AuthSession = {
  expiresAt?: string | null;
  id: string;
  userId: string;
};

export type AuthContext = {
  session: AuthSession | null;
  user: AuthUser | null;
};

export type LoginProviderId = "feishu" | "github" | "google";

export type LoginProviderView = {
  enabled: boolean;
  href: string;
  icon: string;
  iconClassName: string;
  id: LoginProviderId;
  label: string;
};

export type LoginPageModel = {
  appName: string;
  error?: string;
  providers: LoginProviderView[];
  redirectURI: string;
};

export type LoginPageComponent = (props: { model: LoginPageModel }) => string;
