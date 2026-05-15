import type { FeishuUser } from "@/types/dashboard";

export type AppSession = {
  user: FeishuUser;
  loginAt: string;
};
