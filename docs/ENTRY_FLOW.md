# Lumio entry flow

## Routes

- `/` — public Landing; authenticated sessions see the Home experience.
- `/login` — guest-only login with email/password or Google Identity.
- `/register` — guest-only registration with name/email/password or Google Identity.
- `/app` — authenticated Home and House selector.
- `/account` — authenticated login-method management and separate Drive connection status.
- `/house/:houseId` — authenticated Party, guarded by House membership on HTTP and Socket.IO.
- `/invite/:token` — public invitation details; authentication returns to the same invitation.

The frontend uses the History API and Vite's development fallback. A production static host must rewrite unknown paths to `index.html`.
The PWA manifest starts at `/app`; unauthenticated visitors are redirected by the existing auth flow. Deep links such as `/invite/:token` and `/house/:houseId` still require the host's history fallback. The service worker does not replace that server-side rewrite and does not make authenticated routes work offline.
On a fresh unauthenticated visit to `/`, the public Landing mounts without the App/Party JavaScript chunk. Its Party showcase is local, illustrative markup; it does not connect sockets, load providers or request permissions. Landing CTAs navigate to the existing auth routes. The install section reuses the existing browser-driven PWA prompt and shows platform guidance when no prompt is available.

## Bootstrap and network behavior

When a local token exists, `/api/bootstrap` returns the current profile and House summaries in one request. The UI stays in an `unknown` authentication state until this finishes, preventing a Landing flash. A `401` clears the invalid local session; a network failure keeps it and presents a retry state.

The Home performs a light metadata refresh every 20 seconds and receives `home:update` over one authenticated, lightweight socket. It does not join Party rooms or initialize media, WebRTC, screen sharing or device discovery. Cards distinguish online members from members in the Party. Heavy Party components are loaded as separate Vite chunks only after entering `/house/:houseId`. Route House ID is authoritative for Party selection; older House-detail fetches are canceled on switch.

**Sair da Party** returns to `/app`, disconnects Party presence and releases local call, screen-share and player resources. It does not leave the House, clear its queue, disconnect Google Drive or sign out of Lumio. **Sair** in the profile menu signs out of the account; House membership is managed separately in Casa e membros.

The YouTube embedded player requires the site origin as HTTP Referer. The frontend uses `strict-origin-when-cross-origin` for this purpose, including on the iframe. A production host must not override it with `no-referrer`; the API's own `no-referrer` policy remains separate.

## New-user flow

Registration creates only the account. It does not create or attach a sample House. The empty Home offers two actions: create a House or open an invitation. Creating a House reuses the social domain from Stage 5, assigns the creator as `HOST`, creates one primary Party and opens it.

## Authentication

Passwords are hashed with Node.js `scrypt` and a random per-user salt. Login returns the same generic message for an unknown email and a wrong password. Authentication endpoints use an IP-based 20-attempt/15-minute in-memory limiter. New accounts, Google identity links and hashed bearer sessions persist in the local `.data/auth-v2.json` adapter; Houses and Party state remain in memory. Google Identity is separate from Google Drive authorization. See `docs/AUTH_V2.md` for setup, linking rules and production limitations.

## Local checks

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Then start `npm run dev` and verify Landing → register → empty Home → create House → Party. For an invitation test, create a link as host, log out, open `/invite/:token`, authenticate, return to the invite and explicitly choose **Entrar na Casa**.
