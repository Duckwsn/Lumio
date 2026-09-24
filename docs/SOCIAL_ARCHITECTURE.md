# Lumio social layer

## Domain

- A **House** is the durable family/community boundary. Membership, role, profile, library and activity belong to it.
- A **Party** is the House's real-time session. Presence, call, speaking, screen sharing and playback are ephemeral.
- Every House has one primary Party in this MVP. Leaving or disconnecting from the Party never removes House membership.

## Roles and authority

The shared role matrix in `packages/shared/src/index.ts` defines `HOST`, `ADMIN` and `MEMBER`; `apps/server/src/authorization.ts` uses that same matrix for authoritative checks. UI checks only hide unavailable actions. HTTP routes validate current membership and permissions, and Party socket packets revalidate current membership.

Exactly one host is maintained in the in-memory House adapter. The host may transfer ownership only to a current member via `POST /api/houses/:houseId/transfer-host`; the old host becomes admin in the same synchronous operation. The host cannot leave or be removed until transfer. Admins and members may leave; authorized admins/hosts may remove non-host members. Removal disconnects that member's affected Party socket, Call and screen share, revokes their House-scoped Drive grant, aborts active House Drive streams involving them, and removes their HTTP access. A real database adapter will need a transaction/constraint to preserve the same invariant across multiple server processes.

## Presence

Presence has three independent states (`ONLINE`, `IDLE`, `OFFLINE`) plus real-time flags (`inParty`, `inCall`, `speaking`, `screenSharing`). The Home opens one lightweight authenticated Socket.IO connection, but does not join the Party or initialize media/WebRTC. Party and Home sockets are counted by user and socket id; disconnecting the last socket marks the account offline after five seconds. Separately, Party membership is tracked per House and cleared after a five-second reconnect grace period. Active/idle transitions do not clear Party/Call/screen flags. Background visibility alone does not mark a user offline. Home receives `home:update` summaries with online and in-Party counts.

## Invitations

Invitation tokens use 192 bits of cryptographic randomness. They can expire after 1 hour, 24 hours or 7 days, have a usage limit, and can be revoked. Runtime lookup uses a SHA-256 hash; retained invite records contain no plain token, which is returned only once at creation. Acceptance is explicit and increments usage synchronously. An existing member can reopen even an exhausted invitation without consuming another use. Google Identity login remains separate from Google Drive authorization.

## Persistence status

The Prisma schema and migration `0003_house_social` define profiles, unique `(groupId,userId)` membership, unique hashed invite tokens and activity. The current development runtime remains the existing in-memory adapter, so social state survives socket disconnects but not a server restart. No Stage 13 migration is applied because the runtime does not yet use Prisma. Persisting Houses will require a transactional host transfer, invite-use claim and owner/membership consistency before multi-process deployment.

## Local verification

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. For manual testing, run `npm run dev`, enter with two browser profiles, create an invitation as host, accept it as the second user, then verify role changes, removal, multi-tab presence, typing and the five-second offline grace period.
