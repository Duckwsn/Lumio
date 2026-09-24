import type { User } from "@lumio/shared";

/** Social/Party payloads do not need a member's account email. */
export const publicUser = ({ email: _email, ...user }: User): User => user;
