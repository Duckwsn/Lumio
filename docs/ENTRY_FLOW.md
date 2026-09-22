# Lumio entry flow

## Routes

- `/` — public Landing; authenticated sessions see the Home experience.
- `/login` — guest-only login with email and password.
- `/register` — guest-only registration with name, email and password.
- `/app` — authenticated Home and House selector.
- `/house/:houseId` — authenticated Party, guarded by House membership on HTTP and Socket.IO.
- `/invite/:token` — public invitation details; authentication returns to the same invitation.

The frontend uses the History API and Vite's development fallback. A production static host must rewrite unknown paths to `index.html`.

## Bootstrap and network behavior

When a local token exists, `/api/bootstrap` returns the current profile and House summaries in one request. The UI stays in an `unknown` authentication state until this finishes, preventing a Landing flash. A `401` clears the invalid local session; a network failure keeps it and presents a retry state.

The Home performs a light metadata refresh every 20 seconds. It does not join Party sockets or initialize media, WebRTC, screen sharing or device discovery. Heavy Party components are loaded as separate Vite chunks only after entering `/house/:houseId`.

## New-user flow

Registration creates only the account. It does not create or attach a sample House. The empty Home offers two actions: create a House or open an invitation. Creating a House reuses the social domain from Stage 5, assigns the creator as `HOST`, creates one primary Party and opens it.

## Authentication

Passwords are hashed with Node.js `scrypt` and a random per-user salt. Login returns the same generic message for an unknown email and a wrong password. Authentication endpoints use an IP-based 20-attempt/15-minute in-memory limiter. Bearer sessions and account records remain in memory in this development adapter and are lost on API restart.

## Local checks

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Then start `npm run dev` and verify Landing → register → empty Home → create House → Party. For an invitation test, create a link as host, log out, open `/invite/:token`, authenticate, return to the invite and explicitly choose **Entrar na Casa**.
