# Lumio social layer

## Domain

- A **House** is the durable family/community boundary. Membership, role, profile, library and activity belong to it.
- A **Party** is the House's real-time session. Presence, call, speaking, screen sharing and playback are ephemeral.
- Every House has one primary Party in this MVP. Leaving or disconnecting from the Party never removes House membership.

## Roles and authority

The server owns authorization through `apps/server/src/authorization.ts`. `HOST`, `ADMIN` and `MEMBER` map to explicit permissions. UI checks only hide unavailable actions; every sensitive HTTP and socket operation is validated again by the server.

The host cannot leave or be removed. Ownership transfer is intentionally reserved for a later iteration.

## Presence

Presence has three independent states (`ONLINE`, `IDLE`, `OFFLINE`) plus real-time flags (`inParty`, `inCall`, `speaking`, `screenSharing`). The client sends only active/idle transitions. Multiple tabs are counted by socket id, and offline is applied after a five-second reconnect grace period.

## Invitations

Invitation tokens use 192 bits of cryptographic randomness. They can expire after 1 hour, 24 hours or 7 days, have a usage limit, and can be revoked. Runtime lookup uses a SHA-256 hash and active-invite listings redact the token; the plain token is returned only once at creation.

## Persistence status

The Prisma schema and migration `0003_house_social` define profiles, memberships, invitations and activity. The current development runtime remains the existing in-memory adapter, so social state survives socket disconnects but not a server restart. Replacing that adapter with Prisma is the next persistence step.

## Local verification

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. For manual testing, run `npm run dev`, enter with two browser profiles, create an invitation as host, accept it as the second user, then verify role changes, removal, multi-tab presence, typing and the five-second offline grace period.
