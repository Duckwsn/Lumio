import { houseRolePermissions, type HouseRole, type Permission } from "@lumio/shared";

export const rolePermissions = houseRolePermissions;

export const can = (role: HouseRole | undefined, permission: Permission) => Boolean(role && rolePermissions[role].includes(permission));
