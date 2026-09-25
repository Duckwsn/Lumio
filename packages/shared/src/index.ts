import { z } from "zod";

export const roleSchema = z.enum(["OWNER", "HOST", "DJ", "ADMIN", "MODERATOR", "MEMBER", "GUEST"]);
export type Role = z.infer<typeof roleSchema>;

export const houseRoleSchema = z.enum(["HOST", "ADMIN", "MEMBER"]);
export type HouseRole = z.infer<typeof houseRoleSchema>;
export const presenceStatusSchema = z.enum(["ONLINE", "IDLE", "OFFLINE"]);
export type PresenceStatus = z.infer<typeof presenceStatusSchema>;
export const permissionSchema = z.enum([
  "HOUSE_MANAGE", "MEMBER_MANAGE", "INVITE_CREATE", "INVITE_REVOKE", "MEDIA_ADD",
  "MEDIA_CONTROL", "QUEUE_MANAGE", "LIBRARY_MANAGE", "PLAYLIST_CREATE", "PLAYLIST_EDIT", "PLAYLIST_DELETE",
  "CHAT_SEND", "CHAT_MODERATE", "CALL_JOIN", "SCREEN_SHARE",
]);
export type Permission = z.infer<typeof permissionSchema>;
export const houseRolePermissions: Record<HouseRole, readonly Permission[]> = {
  HOST: [...permissionSchema.options],
  ADMIN: ["MEMBER_MANAGE", "INVITE_CREATE", "INVITE_REVOKE", "MEDIA_ADD", "MEDIA_CONTROL", "QUEUE_MANAGE", "LIBRARY_MANAGE", "PLAYLIST_CREATE", "PLAYLIST_EDIT", "PLAYLIST_DELETE", "CHAT_SEND", "CHAT_MODERATE", "CALL_JOIN", "SCREEN_SHARE"],
  MEMBER: ["MEDIA_ADD", "LIBRARY_MANAGE", "PLAYLIST_CREATE", "PLAYLIST_EDIT", "CHAT_SEND", "CALL_JOIN", "SCREEN_SHARE"],
};

export const roomModeSchema = z.enum(["watch", "jam"]);
export type RoomMode = z.infer<typeof roomModeSchema>;

export const mediaProviderSchema = z.enum(["youtube", "google-drive", "demo"]);
export type MediaProvider = z.infer<typeof mediaProviderSchema>;

export const mediaTypeSchema = z.enum(["video", "audio"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const playbackStateSchema = z.enum(["idle", "loading", "ready", "playing", "paused", "buffering", "ended", "error"]);
export type PlaybackState = z.infer<typeof playbackStateSchema>;

export const userSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  avatar: z.string().optional(),
  color: z.string(),
  status: z.string().max(80).optional(),
});
export type User = z.infer<typeof userSchema>;

export const houseMemberSchema = z.object({
  user: userSchema,
  role: houseRoleSchema,
  presence: presenceStatusSchema,
  lastSeenAt: z.string(),
  joinedAt: z.string(),
  inParty: z.boolean(),
  inCall: z.boolean(),
  speaking: z.boolean(),
  screenSharing: z.boolean(),
});
export type HouseMember = z.infer<typeof houseMemberSchema>;

export const houseSummarySchema = z.object({
  id: z.string(), name: z.string(), initials: z.string(), avatar: z.string().optional(),
  role: houseRoleSchema, memberCount: z.number(), onlineCount: z.number(), partyCount: z.number(), primaryRoomId: z.string(),
  nowPlaying: z.object({ title: z.string(), provider: mediaProviderSchema }).nullable().optional(),
});
export type HouseSummary = z.infer<typeof houseSummarySchema>;

export const houseInviteSchema = z.object({
  id: z.string(), houseId: z.string(), token: z.string(), role: houseRoleSchema,
  createdBy: userSchema, createdAt: z.string(), expiresAt: z.string(),
  maxUses: z.number().int().positive(), uses: z.number().int().nonnegative(), revokedAt: z.string().nullable(),
});
export type HouseInvite = z.infer<typeof houseInviteSchema>;

export const houseActivitySchema = z.object({
  id: z.string(), houseId: z.string(), kind: z.enum(["MEMBER_JOINED", "MEMBER_LEFT", "ROLE_CHANGED", "INVITE_CREATED", "MEDIA_ADDED"]),
  actor: userSchema.optional(), text: z.string(), createdAt: z.string(),
});
export type HouseActivity = z.infer<typeof houseActivitySchema>;

export const houseDetailsSchema = houseSummarySchema.extend({
  members: z.array(houseMemberSchema), permissions: z.array(permissionSchema),
  invites: z.array(houseInviteSchema), activity: z.array(houseActivitySchema),
});
export type HouseDetails = z.infer<typeof houseDetailsSchema>;

export const mediaItemSchema = z.object({
  id: z.string(),
  provider: mediaProviderSchema,
  providerMediaId: z.string(),
  type: mediaTypeSchema,
  title: z.string(),
  thumbnail: z.string().optional(),
  duration: z.number().optional(),
  mimeType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  creator: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  available: z.boolean().optional(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

export const mediaActorSchema = userSchema.pick({ id: true, displayName: true, color: true });

export const houseLibraryItemSchema = mediaItemSchema.extend({
  addedBy: mediaActorSchema,
  addedAt: z.string(),
  favorite: z.boolean(),
});
export type HouseLibraryItem = z.infer<typeof houseLibraryItemSchema>;

export const houseHistoryEntrySchema = mediaItemSchema.extend({
  id: z.string(),
  startedBy: mediaActorSchema,
  playedAt: z.string(),
});
export type HouseHistoryEntry = z.infer<typeof houseHistoryEntrySchema>;

export const playlistItemSchema = mediaItemSchema.extend({
  itemId: z.string(),
  position: z.number().int().nonnegative(),
  addedBy: mediaActorSchema,
  addedAt: z.string(),
});
export type PlaylistItem = z.infer<typeof playlistItemSchema>;

export const playlistSchema = z.object({
  id: z.string(),
  houseId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdBy: mediaActorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  itemCount: z.number().int().nonnegative(),
  items: z.array(playlistItemSchema).optional(),
});
export type Playlist = z.infer<typeof playlistSchema>;

export const mediaSearchResultSchema = mediaItemSchema.extend({
  provider: z.literal("youtube"),
  channel: z.string().optional(),
  available: z.boolean().default(true),
});
export type MediaSearchResult = z.infer<typeof mediaSearchResultSchema>;

export const queueItemSchema = mediaItemSchema.extend({
  addedBy: mediaActorSchema,
  addedAt: z.string(),
  position: z.number().int().nonnegative().optional(),
  status: z.enum(["queued", "playing"]).optional(),
});
export type QueueItem = z.infer<typeof queueItemSchema>;

export const mediaStateSchema = z.object({
  mediaId: z.string(),
  provider: mediaProviderSchema,
  type: mediaTypeSchema,
  title: z.string(),
  thumbnail: z.string().optional(),
  mimeType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  state: playbackStateSchema,
  position: z.number(),
  duration: z.number(),
  playbackRate: z.number(),
  startedAt: z.number().nullable(),
  updatedAt: z.number(),
  controlledBy: z.string(),
  revision: z.number().int().nonnegative(),
});
export type MediaState = z.infer<typeof mediaStateSchema>;

export const roomMemberSchema = z.object({
  user: userSchema,
  role: roleSchema,
  presence: z.enum(["online", "away", "offline"]),
  speaking: z.boolean(),
  muted: z.boolean(),
  deafened: z.boolean(),
  joinedAt: z.string(),
});
export type RoomMember = z.infer<typeof roomMemberSchema>;

export const screenShareStateSchema = z.object({
  user: userSchema,
  startedAt: z.string(),
}).nullable();
export type ScreenShareState = z.infer<typeof screenShareStateSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  user: userSchema,
  body: z.string().min(1).max(1000),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const mediaControlPolicySchema = z.enum(["host", "host-moderators", "everyone"]);
export const queueControlPolicySchema = z.enum(["host", "members", "everyone"]);
export const roomSettingsSchema = z.object({
  mediaControl: mediaControlPolicySchema,
  queueControl: queueControlPolicySchema,
  skipVotingEnabled: z.boolean(),
  skipVoteThreshold: z.number().int().min(10).max(100),
  autoplayNext: z.boolean(),
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const roomSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupName: z.string(),
  accent: z.string(),
  mode: roomModeSchema,
  members: z.array(roomMemberSchema),
  queue: z.array(queueItemSchema),
  history: z.array(houseHistoryEntrySchema),
  queueRevision: z.number().int().nonnegative(),
  skipVote: z.object({ count: z.number(), required: z.number(), votedBy: z.array(z.string()) }),
  settings: roomSettingsSchema,
  currentMedia: mediaStateSchema,
  messages: z.array(chatMessageSchema),
  connectedCount: z.number(),
  screenShare: screenShareStateSchema,
  houseId: z.string().optional(),
  houseMembers: z.array(houseMemberSchema).optional(),
  permissions: z.array(permissionSchema).optional(),
  typingUserIds: z.array(z.string()).optional(),
});
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;

export const eventNames = {
  roomJoin: "room:join",
  roomLeave: "room:leave",
  presenceUpdate: "presence:update",
  mediaPlay: "media:play",
  mediaPause: "media:pause",
  mediaSeek: "media:seek",
  mediaChange: "media:change",
  mediaSync: "media:sync",
  mediaRate: "media:rate",
  queueAdd: "queue:add",
  queueRemove: "queue:remove",
  queueMove: "queue:move",
  queuePlayNext: "queue:play-next",
  queueClear: "queue:clear",
  queueAdvance: "queue:advance",
  queueNext: "queue:next",
  queuePrevious: "queue:previous",
  roomMode: "room:mode",
  roomSettings: "room:settings",
  mediaRequestSync: "media:request-sync",
  voteSkip: "vote:skip",
  chatMessage: "chat:message",
  reactionSend: "reaction:send",
  voiceJoin: "voice:join",
  voiceLeave: "voice:leave",
  voiceSpeaking: "voice:speaking",
  voiceSignal: "voice:signal",
  screenStart: "screen:start",
  screenStop: "screen:stop",
  screenState: "screen:state",
  presenceActivity: "presence:activity",
  chatTyping: "chat:typing",
} as const;

export type EventName = (typeof eventNames)[keyof typeof eventNames];

export const joinRoomInputSchema = z.object({ roomId: z.string(), user: userSchema });
export const addQueueInputSchema = z.object({
  roomId: z.string(),
  item: queueItemSchema,
});
export const mediaCommandSchema = z.object({
  roomId: z.string(),
  mediaId: z.string(),
  revision: z.number().int().nonnegative(),
  operationId: z.string().min(1).max(100),
  position: z.number().min(0).optional(),
  playbackRate: z.number().min(0.25).max(2).optional(),
});
export const changeMediaSchema = z.object({ roomId: z.string(), item: queueItemSchema });
export const queueMoveSchema = z.object({ roomId: z.string(), itemId: z.string(), toIndex: z.number().int().min(0), revision: z.number().int().nonnegative().optional() });
export const queueRevisionSchema = z.object({ roomId: z.string(), revision: z.number().int().nonnegative().optional() });
export const queuePlayNextSchema = queueRevisionSchema.extend({ item: queueItemSchema });
export const queueAdvanceSchema = queueRevisionSchema.extend({ expectedMediaId: z.string(), expectedQueueItemId: z.string().min(1) });
export const modeChangeSchema = z.object({ roomId: z.string(), mode: roomModeSchema });
export const roomSettingsInputSchema = z.object({ roomId: z.string(), settings: roomSettingsSchema });
export const chatInputSchema = z.object({ roomId: z.string(), body: z.string().min(1).max(1000) });
export const presenceInputSchema = z.object({ roomId: z.string(), speaking: z.boolean(), muted: z.boolean(), deafened: z.boolean().optional() });
export const voiceSignalSchema = z.object({ roomId: z.string().max(100), targetUserId: z.string().max(100), targetSocketId: z.string().max(100), signal: z.union([z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().max(32_000) }), z.object({ candidate: z.object({ candidate: z.string().max(4_000), sdpMid: z.string().max(100).nullable().optional(), sdpMLineIndex: z.number().int().min(0).max(100).nullable().optional(), usernameFragment: z.string().max(256).nullable().optional() }) })]) });
export interface VoicePeer { user: User; socketId: string }

export interface ServerToClientEvents {
  "home:update": (houses: HouseSummary[]) => void;
  "profile:update": (user: User) => void;
  "room:snapshot": (snapshot: RoomSnapshot) => void;
  "presence:update": (members: RoomMember[]) => void;
  "media:sync": (state: MediaState) => void;
  "queue:update": (queue: QueueItem[], revision: number) => void;
  "queue:history": (history: HouseHistoryEntry[]) => void;
  "room:mode": (mode: RoomMode) => void;
  "room:settings": (settings: RoomSettings) => void;
  "vote:skip": (vote: { count: number; required: number; votedBy: string[]; advanced: boolean }) => void;
  "chat:message": (message: ChatMessage) => void;
  "reaction:send": (reaction: { id: string; emoji: string; user: User }) => void;
  "voice:signal": (payload: { fromUserId: string; fromSocketId: string; signal: z.infer<typeof voiceSignalSchema>["signal"] }) => void;
  "voice:peer-joined": (peer: VoicePeer) => void;
  "voice:peer-left": (peer: { userId: string; socketId: string }) => void;
  "screen:state": (state: ScreenShareState) => void;
  "house:update": (house: HouseDetails) => void;
  "media-hub:update": (payload: { houseId: string; kind: "library" | "favorite" | "playlist" | "history" }) => void;
  "chat:typing": (payload: { roomId: string; userId: string; typing: boolean }) => void;
  "member:removed": (payload: { houseId: string; message: string }) => void;
  "house:deleted": (payload: { houseId: string }) => void;
  "server:error": (message: string) => void;
}

export interface ClientToServerEvents {
  "room:join": (input: z.infer<typeof joinRoomInputSchema>) => void;
  "room:leave": (roomId: string) => void;
  "media:play": (input: z.infer<typeof mediaCommandSchema>) => void;
  "media:pause": (input: z.infer<typeof mediaCommandSchema>) => void;
  "media:seek": (input: z.infer<typeof mediaCommandSchema>) => void;
  "media:rate": (input: z.infer<typeof mediaCommandSchema>) => void;
  "media:change": (input: z.infer<typeof changeMediaSchema>, respond?: (result: { ok: boolean; message?: string }) => void) => void;
  "queue:add": (input: z.infer<typeof addQueueInputSchema>, respond?: (result: { ok: boolean; item?: QueueItem; position?: number; message?: string }) => void) => void;
  "queue:remove": (input: { roomId: string; itemId: string }, respond?: (result: { ok: boolean; message?: string }) => void) => void;
  "queue:next": (input: { roomId: string }) => void;
  "queue:previous": (input: { roomId: string }) => void;
  "queue:move": (input: z.infer<typeof queueMoveSchema>) => void;
  "queue:play-next": (input: z.infer<typeof queuePlayNextSchema>, respond?: (result: { ok: boolean; queue?: QueueItem[]; revision?: number; message?: string }) => void) => void;
  "queue:clear": (input: z.infer<typeof queueRevisionSchema>, respond?: (result: { ok: boolean; queue?: QueueItem[]; revision?: number; message?: string }) => void) => void;
  "queue:advance": (input: z.infer<typeof queueAdvanceSchema>, respond?: (result: { ok: boolean; advanced: boolean; message?: string }) => void) => void;
  "room:mode": (input: z.infer<typeof modeChangeSchema>) => void;
  "room:settings": (input: z.infer<typeof roomSettingsInputSchema>) => void;
  "media:request-sync": (input: { roomId: string }) => void;
  "vote:skip": (input: { roomId: string }) => void;
  "chat:message": (input: z.infer<typeof chatInputSchema>) => void;
  "reaction:send": (input: { roomId: string; emoji: string }) => void;
  "presence:update": (input: z.infer<typeof presenceInputSchema>) => void;
  "voice:join": (input: { roomId: string }, respond?: (result: { ok: boolean; message?: string }) => void) => void;
  "voice:leave": (input: { roomId: string }) => void;
  "voice:speaking": (input: z.infer<typeof presenceInputSchema>) => void;
  "voice:signal": (input: z.infer<typeof voiceSignalSchema>) => void;
  "screen:start": (input: { roomId: string }, respond: (result: { ok: boolean; message?: string }) => void) => void;
  "screen:stop": (input: { roomId: string }) => void;
  "presence:activity": (input: { roomId: string; active: boolean }) => void;
  "chat:typing": (input: { roomId: string; typing: boolean }) => void;
}
