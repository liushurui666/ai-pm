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
    <Avatar size={size} src={avatarUrl}>
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
    <Space>
      <OwnerAvatar name={name} avatarUrl={avatarUrl} />
      <Space orientation="vertical" size={0}>
        <Text>{name || "未分配"}</Text>
        {secondary ? <Text type="secondary">{secondary}</Text> : null}
      </Space>
    </Space>
  );
}
