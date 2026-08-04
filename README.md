# Gmail Inbox Insights

Connects to Gmail, scans mailbox **metadata only** (no message bodies or
attachments are ever fetched or stored), groups messages by sender with
total/unread counts, and lets you run safe bulk actions (move to Trash) with
explicit confirmation.

**Stack:** React (Vite) + NestJS + Postgres (Prisma) + Redis (BullMQ).

## Architecture

```
apps/api/     NestJS API + background sync workers (BullMQ)
apps/web/     React dashboard (Vite)
packages/shared/  Shared TS types/DTOs used by both
```

- **Auth**: Google OAuth2 with PKCE, `gmail.readonly` scope at signup only.
  `gmail.modify` is requested separately, only the first time you confirm a
  bulk action (incremental authorization) — never up front.
- **Tokens**: refresh tokens are encrypted at rest with AES-256-GCM
  (`KEY_ENCRYPTION_KEY`); access tokens are short-lived and refreshed on
  demand.
- **Sync**: a full sync paginates `messages.list`/`messages.get` (metadata
  format — From/Subject headers only); incremental syncs use
  `history.list` against a stored `historyId` watermark, with automatic
  fallback to a full sync if that watermark expires (Gmail `410`).
- **Bulk trash**: preview (snapshot affected messages, no side effects) →
  explicit confirm → background job runs Gmail `batchModify` to add the
  `TRASH` label. This is enforced server-side as a state machine, not just a
  UI guard. Gmail keeps trashed mail for 30 days before permanent deletion,
  so it's recoverable.

See [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) for the
full data model and the module READMEs-in-code under `apps/api/src/*` for
endpoint details.

## Prerequisites

- Node.js 20+
- Postgres 16 and Redis 7 running locally (or via Docker — see below)
- A Google Cloud project with an OAuth client (steps below)

## 1. Install dependencies

```bash
npm install
```

## 2. Start Postgres + Redis

**Option A — Docker:**

```bash
docker compose up -d
```

**Option B — Homebrew (macOS), if you don't want Docker:**

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
createuser gmail_insights --pwprompt   # set password to match DATABASE_URL below, or edit .env
createdb gmail_insights -O gmail_insights
```

## 3. Configure environment variables

```bash
cp .env.example .env
cp .env.example apps/api/.env   # NestJS reads .env relative to its own cwd
```

Fill in / generate:

```bash
openssl rand -base64 48   # -> SESSION_SECRET
openssl rand -base64 32   # -> KEY_ENCRYPTION_KEY (must be exactly 32 bytes)
```

`DATABASE_URL` / `REDIS_URL` already match the docker-compose and Homebrew
defaults above — adjust if you used different credentials.

## 4. Google Cloud Console setup (OAuth client)

You need your own OAuth client — there's no way around this, Google doesn't
allow shared/pre-provisioned credentials for a project like this.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   create a new project (or pick an existing one).
2. **APIs & Services → Library** → search "Gmail API" → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (unless you have a Workspace org and want
     Internal).
   - Fill in app name, support email, developer contact.
   - **Scopes**: add `.../auth/gmail.readonly` and `.../auth/gmail.modify`.
   - **Test users**: add your own Gmail address (required while the app is
     in "Testing" publish status — otherwise Google will refuse to log you
     in).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URI: `http://localhost:4000/auth/google/callback`
     (must match `GOOGLE_OAUTH_REDIRECT_URI` in `.env` exactly).
5. Copy the generated **Client ID** and **Client secret** into `.env` (both
   the root one and `apps/api/.env`) as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.

While the app is in "Testing" mode, only the test users you listed can log
in, and Google will nag with an "unverified app" warning — click
**Advanced → Go to (app name)** to proceed. That's expected for local/personal
use; going through Google's verification review is only needed if you plan
to ship this to other people.

## 5. Run migrations

```bash
npm run prisma:migrate -- --name init
```

## 6. Start the app

```bash
npm run dev:api    # http://localhost:4000 — API + background sync workers (in-process)
npm run dev:web    # http://localhost:5173 — dashboard
```

Open `http://localhost:5173`, click **Connect Gmail**, sign in with one of
your test users, and you'll land on the dashboard. Trigger a **Full sync**
to scan your mailbox for the first time — the sender table fills in once it
completes. The first time you click **Move to Trash** and confirm, you'll be
sent through a second, one-time Google consent screen for the additional
`gmail.modify` permission.

## Environment variables reference

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string (BullMQ + rate limiter) |
| `SESSION_SECRET` | Signs the session cookie and OAuth `state` JWTs |
| `KEY_ENCRYPTION_KEY` | 32-byte base64 key, AES-256-GCM for tokens at rest |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From your OAuth client |
| `GOOGLE_OAUTH_REDIRECT_URI` | Must exactly match the client's authorized redirect URI |
| `WEB_ORIGIN` | Frontend origin, used for CORS + post-login redirect |
| `VITE_API_BASE_URL` | API origin the frontend calls (in `apps/web/.env`) |

## Notes on scope, error handling, and rate limits

- **Scopes are minimal and staged**: `gmail.readonly` at login, `gmail.modify`
  only right before your first bulk action. We never request
  `gmail.send` or the full `mail.google.com` scope.
- **Rate limiting**: sync workers acquire quota from a Redis-backed token
  bucket per mailbox before every Gmail API call, sized conservatively under
  Gmail's per-user quota, plus exponential backoff (honoring `Retry-After`)
  on `429`/`403 rateLimitExceeded`/5xx responses.
- **Token errors**: a revoked/expired refresh token flips the mailbox to
  `needs_reauth`, surfaced in the dashboard with a reconnect link — the app
  never silently retries against a dead token.
- **Bulk actions are never one-shot**: preview → confirm → execute is a
  state machine on the `bulk_actions` table, checked server-side regardless
  of what the UI sends.
