import type { HouseRole, Permission } from "@lumio/shared";

export const rolePermissions: Record<HouseRole, readonly Permission[]> = {
  HOST: ["HOUSE_MANAGE", "MEMBER_MANAGE", "INVITE_CREATE", "INVITE_REVOKE", "MEDIA_ADD", "MEDIA_CONTROL", "QUEUE_MANAGE", "LIBRARY_MANAGE", "PLAYLIST_CREATE", "PLAYLIST_EDIT", "PLAYLIST_DELETE", "CHAT_SEND", "CHAT_MODERATE", "CALL_JOIN", "SCREEN_SHARE"],
  ADMIN: ["MEMBER_MANAGE", "INVITE_CREATE", "INVITE_REVOKE", "MEDIA_ADD", "MEDIA_CONTROL", "QUEUE_MANAGE", "LIBRARY_MANAGE", "PLAYLIST_CREATE", "PLAYLIST_EDIT", "PLAYLIST_DELETE", "CHAT_SEND", "CHAT_MODERATE", "CALL_JOIN", "SCREEN_SHARE"],
  MEMBER: ["MEDIA_ADD", "LIBRARY_MANAGE", "PLAYLIST_CREATE", "PLAYLIST_EDIT", "CHAT_SEND", "CALL_JOIN", "SCREEN_SHARE"],
};

export const can = (role: HouseRole | undefined, permission: Permission) => Boolean(role && rolePermissions[role].includes(permission));
