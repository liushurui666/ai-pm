"use client";

import "./index.less";
import { Avatar, Space, Typography } from "antd";

const { Text } = Typography;

function getOwnerInitial(name?: string) {
  return (name?.trim() || "未").slice(0, 1);
}

export function OwnerAvatar({
  avatarUrl,
  name,
  size = "small"
}: {
  avatarUrl?: string;
  name?: string;
  size?: "small" | "default";
}) {
  return (
    <Avatar className="owner-avatar" size={size} src={avatarUrl}>
      {getOwnerInitial(name)}
    </Avatar>
  );
}

export function OwnerInline({
  avatarUrl,
  name,
  secondary
}: {
  avatarUrl?: string;
  name?: string;
  secondary?: string;
}) {
  return (
    <Space className="owner-inline" size={8}>
      <OwnerAvatar name={name} avatarUrl={avatarUrl} />
      <Space className="owner-inline-copy" orientation="vertical" size={0}>
        <Text>{name || "未分配"}</Text>
        {secondary ? <Text type="secondary">{secondary}</Text> : null}
      </Space>
    </Space>
  );
}
