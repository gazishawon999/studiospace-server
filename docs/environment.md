# Environment & Secrets Guide — StudioSpace Server

This document is the single source of truth for every environment variable used by
the Express backend. The Next.js client only holds public URLs; **all secrets live
in this repository's `.env` file**.

- Template: [`../.env.example`](../.env.example)
- Real file: `.env` (git-ignored, never commit or share it)
- Validator: [`../src/config/env.js`](../src/config/env.js)

---

## 1. How the files work

| File | Committed? | Purpose |
| --- | --- | --- |
| `.env.example` | Yes | Safe template with placeholders and instructions. |
| `.env` | **No** | Your real local credentials. Loaded by `dotenv`. |
| `.env.local` | **No** | Ignored for safety. Not loaded by this server. |

```bash
# From studiospace-server/
cp .env.example .env
# then edit .env and replace every <placeholder>
npm run dev
```

Restart the server after changing `.env`. The validator runs on every boot and
prints **variable names only**, never values.

- **Development:** missing Better Auth / Google / ImgBB credentials produce
  warnings. Public pages and read-only APIs keep working.
- **Production (`NODE_ENV=production`):** every credential below is required and
  the server refuses to start without it.

---

## 2. Variable reference

### Core

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `PORT` | Yes | `5000` | Must be `1–65535`. Render injects its own port. |
| `NODE_ENV` | Yes | `development` | `development`, `test`, or `production`. |
| `CLIENT_URL` | Yes | `http://localhost:3000` | Comma-separated allowed CORS origins. Normalised to origins and also used as Better Auth's `trustedOrigins`. |

### MongoDB Atlas

| Variable | Required | Example |
| --- | --- | --- |
| `MONGODB_URI` | Yes | `mongodb+srv://user:pass@cluster0.abcd.mongodb.net/studiospace_db?retryWrites=true&w=majority` |
| `DB_NAME` | Yes | `studiospace_db` | 1–63 characters: letters, numbers, `-`, `_`. |

### Express JWT + HTTPOnly cookie

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `JWT_SECRET` | Yes | 64-character hex string | At least 32 characters. Must be a real secret before `POST /api/auth/token` can issue API sessions. |
| `JWT_EXPIRES_IN` | Yes | `7d` | `60s`, `15m`, `24h`, `7d`. |
| `JWT_ISSUER` | Yes | `studiospace-api` | Verified by Express JWT middleware. |
| `JWT_AUDIENCE` | Yes | `studiospace-client` | Verified by Express JWT middleware. |
| `AUTH_COOKIE_NAME` | Yes | `studiospace_session` | Letters, numbers, `-`, `_`. Stores the Express-issued JWT. |
| `AUTH_COOKIE_SAME_SITE` | Yes | `lax` | `lax`, `strict`, or `none`. |
| `AUTH_COOKIE_SECURE` | Yes | `false` locally | Must be `true` in production. |
| `AUTH_COOKIE_DOMAIN` | No | empty locally | Bare domain such as `.studiospace.app` only when sharing across subdomains. |

### Better Auth (MongoDB adapter)

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | Yes (Phase 04+) | 43-character base64url string | At least 32 characters. |
| `BETTER_AUTH_URL` | Yes (Phase 04+) | `http://localhost:5000` | Origin of **this Express server**. No path, no trailing slash. |

### Google OAuth

| Variable | Required | Example |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes (Phase 04+) | `1234567890-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Yes (Phase 04+) | `GOCSPX-...` |

### ImgBB

| Variable | Required | Example |
| --- | --- | --- |
| `IMGBB_API_KEY` | Yes (Phase 07+) | 32-character ImgBB key |

---

## 3. Where to obtain each credential

### 3.1 MongoDB Atlas

1. Create an account at <https://www.mongodb.com/cloud/atlas/register>.
2. Create a free **M0** cluster.
3. **Database Access** → add a database user with a strong password.
4. **Network Access** → add your current IP (or `0.0.0.0/0` for development only;
   restrict it before production).
5. **Database → Connect → Drivers → Node.js** → copy the connection string.
6. Replace `<username>`, `<password>`, and `<cluster-host>`. URL-encode special
   characters in the password (`@` → `%40`, `:` → `%3A`, `#` → `%23`).
7. Put it in `studiospace-server/.env` as `MONGODB_URI`.
8. Set `DB_NAME=studiospace_db` (or leave the default).

The database name can also live in the URI path; `DB_NAME` wins in this codebase.

### 3.2 `JWT_SECRET`

Generate a 64-character hex secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the output in `studiospace-server/.env` as `JWT_SECRET`. Do not reuse the
Better Auth secret and never send this value to the client.

### 3.3 `BETTER_AUTH_SECRET`

Generate at least 32 random characters:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Put the output in `studiospace-server/.env` as `BETTER_AUTH_SECRET`.

### 3.4 Google OAuth 2.0

1. Open <https://console.cloud.google.com/> and create (or select) a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app
   name and support email, and add your own Google account as a test user while
   the app is in *Testing*.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Authorised JavaScript origins:
   - `http://localhost:3000`
   - your production frontend origin (for example `https://studiospace.vercel.app`)
6. Authorised redirect URIs:
   - `http://localhost:5000/api/auth/callback/google`
   - your production backend callback (for example
     `https://studiospace-api.onrender.com/api/auth/callback/google`)
7. Copy the **Client ID** and **Client secret** into `studiospace-server/.env`:
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

A redirect URI mismatch (`redirect_uri_mismatch`) means the URI above does not
exactly match what is configured in Google Cloud Console — including
`http` vs `https`, the port, and the trailing path.

### 3.5 ImgBB

1. Sign in at <https://api.imgbb.com/>.
2. Click **Get API key**.
3. Put the key in `studiospace-server/.env` as `IMGBB_API_KEY`.

This key is used **only by the Express server**. The browser never receives it:
the client will upload through an authenticated Express endpoint in Phase 07.

---

## 4. Local development URLs

| Service | URL | Where it is configured |
| --- | --- | --- |
| Next.js client | `http://localhost:3000` | client `NEXT_PUBLIC_APP_URL` |
| Express API | `http://localhost:5000` | server `PORT` / `BETTER_AUTH_URL` |
| API base path | `http://localhost:5000/api` | client `NEXT_PUBLIC_API_URL` |
| Google callback | `http://localhost:5000/api/auth/callback/google` | Google Cloud Console + `BETTER_AUTH_URL` |
| CORS origin | `http://localhost:3000` | server `CLIENT_URL` |

Local cookies:

```dotenv
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_DOMAIN=
```

`localhost:3000` and `localhost:5000` are the same site (ports do not matter for
cookies), so `SameSite=Lax` cookies are sent with `credentials: "include"`.

### Cookie architecture

The project uses two independent cookie families during Phase 04:

| Cookie | Owner | Configured by |
| --- | --- | --- |
| `studiospace_session` (JWT) | Express API auth | `JWT_*` and `AUTH_COOKIE_*` |
| Better Auth cookies (`studiospace.session_token`, etc.) | Better Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` |

`AUTH_COOKIE_*` applies **only** to the Express JWT cookie. Do not reuse
`AUTH_COOKIE_NAME` as Better Auth's cookie prefix. Both cookie families are
HTTPOnly; JavaScript in the browser must never read them. A separate readable
double-submit cookie (`studiospace_csrf`) is issued for Express mutation CSRF
checks.

### Auth endpoint layout

| URL | Method | Purpose |
| --- | --- | --- |
| `/api/auth/csrf` | GET | Issues the double-submit CSRF token used by Express mutations. |
| `/api/auth/providers` | GET | Reports whether Google OAuth is configured. |
| `/api/auth/token` | POST | Verifies the Better Auth session server-side and issues the Express JWT cookie. |
| `/api/auth/me` | GET | Returns the current user after Express JWT verification. |
| `/api/auth/logout` | POST | Revokes the Better Auth session and clears both cookie families. |
| `/api/auth/callback/google` | GET | Better Auth Google OAuth redirect URI. |
| `/api/auth/*` (other) | varies | Handled by Better Auth (email/password, social sign-in, session). |

`POST /api/auth/token` and `POST /api/auth/logout` require an allowed
Origin/Referer and a matching `X-CSRF-Token` header + `studiospace_csrf` cookie.
Better Auth keeps its own built-in origin protections on its routes.

The Next.js client reaches these endpoints through `NEXT_PUBLIC_API_URL`
(`http://localhost:5000/api`), appending `/auth/...`. Better Auth's browser
client should use the backend origin (`http://localhost:5000`) as `baseURL`.

### Cross-origin deployment caveat

In local development (`localhost:3000` + `localhost:5000`) cookies are same-site
and the browser attaches them to credentialed API requests and Next.js server
fetches that forward the cookie header.

In a cross-origin deployment such as Vercel (frontend) + Render (backend), the
Express JWT cookie is scoped to the backend origin and may not be readable by
Next.js Server Components. For that reason, protected routes are enforced by a
client-side `AuthGuard` that verifies the session through `GET /api/auth/me`
with `credentials: "include"`. The session still survives page refreshes because
the browser retains the HTTPOnly cookies. For a fully server-readable protected
layout in production, use a same-site proxy or a shared parent domain with
`SameSite=None; Secure`.

---

## 5. Production checklist

1. Frontend on Vercel (`https://your-app.vercel.app`), backend on Render
   (`https://your-api.onrender.com`).
2. Set `CLIENT_URL` to the frontend origin (comma-separated for previews).
3. Set `BETTER_AUTH_URL` to the Render origin.
4. Add the Render callback URI to Google Cloud Console.
5. Set `NODE_ENV=production`, `AUTH_COOKIE_SECURE=true`.
6. If frontend and backend are on **different sites**, set
   `AUTH_COOKIE_SAME_SITE=none`. This requires HTTPS and may be affected by
   third-party cookie policies; a same-origin proxy is the more robust option.
7. Never commit `.env`. Use the Render/Vercel dashboards for secrets.
8. Rotate any credential that has ever been pasted into a chat, log, or commit.

---

## 6. What works without credentials today

| Feature | Needs | Status without credentials |
| --- | --- | --- |
| Health check (`/api/health`) | MongoDB | Needs `MONGODB_URI` to boot. |
| Public studio APIs | MongoDB | Works with `MONGODB_URI`. |
| Homepage featured studios | MongoDB | Works with `MONGODB_URI`. |
| Email/password registration & login | `BETTER_AUTH_SECRET`, real `JWT_SECRET`, MongoDB | Registration/login UI is implemented, but token exchange requires a real `JWT_SECRET`. Missing `BETTER_AUTH_SECRET` uses an ephemeral dev secret (sessions reset on restart). |
| Google login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, Google redirect URI, real `JWT_SECRET` | Implemented but unavailable until Google credentials are configured and the callback URI matches Google Cloud Console. |
| Protected routes / logout | Express auth cookies | Implemented; session survives refresh in the browser via HTTPOnly cookies and client-side verification. |
| ImgBB uploads | Section 3.5 | Not implemented yet (Phase 07). Warnings only. |

---

## 7. Verification

```bash
# Syntax-check the config module
node --check src/config/env.js

# Start the API and read the validation output
npm run dev

# Health check
curl http://localhost:5000/api/health
```

If a credential is missing, the server tells you the **variable name** and the
file to edit. It never prints the value.
