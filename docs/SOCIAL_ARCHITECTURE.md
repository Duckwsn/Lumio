# Lumio social layer

> Registro histórico da Etapa 13. O parágrafo de persistência em memória foi superado pela Etapa 18: Casas, membros, convites e atividades agora usam PostgreSQL em `PERSISTENCE_MODE=postgres`. Presença/call continuam efêmeras; execução multi-instância continua não suportada. Consulte [DEPLOYMENT_18.md](DEPLOYMENT_18.md).

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

## Current invitation/persistence update — September 2026

The Stage 13 persistence section above describes the historical implementation. Stage 18 added `PrismaSocialRepository`, which loads PostgreSQL Houses/members/invites into the single-process runtime and saves House snapshots in a queued Prisma transaction. This is not a multi-instance, database-authoritative invite-use claim.

New invites have two bearer credentials for one record: the existing 192-bit link token and a random ten-character human code. Only their hashes persist; `HouseInvite.codeHash` is nullable and unique. Legacy NULL codes preserve the existing token lookup. Code and link share expiration, revocation, role and usage; an existing member consumes no extra use. Code lookup normalizes whitespace/hyphens/case on the server. Missing, revoked, expired and exhausted codes have the same unavailable response without House metadata for non-members.

Inspection and acceptance share one IP-limited `invite-entry` bucket: 30 requests per 15 minutes, independent of identifier. This limiter is in memory, not distributed. Creation/revocation keep the existing permission checks. Raw code is returned only at creation, never in retained House details. Migration and verification: `INVITES_LINK_CODE_REPORT.md`.
