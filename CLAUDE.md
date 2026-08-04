# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Install once at the repo root (npm workspaces): `npm install`

**Local services** (Postgres 16 + Redis 7):
```
docker compose up -d
```

**Environment** — copy `.env.example` to *both* locations, since NestJS reads `.env` relative to its own cwd:
```
cp .env.example .env
cp .env.example apps/api/.env
```
`KEY_ENCRYPTION_KEY` must base64-decode to exactly 32 bytes or the API refuses to boot (`apps/api/src/common/env.validation.ts`).

**Database**:
```
npm run prisma:migrate -- --name <name>   # apps/api/prisma/schema.prisma
npm run prisma:generate
```

**Run**:
```
npm run dev:api    # http://localhost:4000 — API + background sync workers, in one process
npm run dev:web     # http://localhost:5173 — React dashboard
```
There is no separate worker process to start — the BullMQ processors (`apps/api/src/**/processors/*`) register themselves via `onModuleInit` inside the API's own Nest app. `apps/api/package.json` has a `worker` script pointing at `src/worker.ts`, but that file does not exist in the repo; don't try to run it.

**Build** (order matters — `packages/shared` publishes compiled output to `dist/`, which `apps/api`/`apps/web` resolve as `@gmail-insights/shared`):
```
npm run build   # builds packages/shared, then apps/api, then apps/web, in that order
```

**Lint**: `apps/api/package.json` defines `npm run lint --workspace=apps/api` (`eslint "{src,test}/**/*.ts"`), but no ESLint config file exists anywhere in the repo, so it currently has nothing to run against.

**Tests**: there is no test suite in this repo (no `*.spec.ts`/`*.test.ts` files, no test runner wired into either `package.json`). If asked to add tests, a framework needs to be chosen and configured first — don't assume Jest/Vitest is already set up.

## Architecture

npm-workspaces monorepo, three packages: `apps/api` (NestJS), `apps/web` (React/Vite), `packages/shared` (types + Zod schemas consumed by both — see validation caveat below).

**Request flow**: Google OAuth2+PKCE login → encrypted refresh/access tokens (`common/encryption.service.ts`, AES-256-GCM) → BullMQ workers pull Gmail message *metadata only* (From/Subject headers, never body/attachments) → Postgres via Prisma → REST API → React dashboard. Backend module boundaries mirror `apps/api/src/*`: `auth`, `mailbox`, `sync`, `senders`, `insights`, `actions`, `common`, `prisma`.

**Tenant isolation**: every route under `/mailbox/:id/*` is gated by `SessionGuard` (valid session cookie) then `MailboxOwnerGuard` (`mailbox.userId === req.userId`). A mailbox id that doesn't exist or belongs to another user returns 404, never 403 — deliberate, to avoid confirming other users' mailbox ids exist. Preserve this pattern on any new route under that prefix.

**Bulk trash is a server-enforced state machine**, not a UI convention — `BulkAction.status`: `pending_confirmation → confirmed → in_progress → completed | completed_with_errors | failed`, or `→ cancelled` from `pending_confirmation`/`confirmed` only. The REST handler (`actions.service.ts`) and the BullMQ worker (`actions/processors/bulk-action.processor.ts`) each independently enforce which transitions are legal from their side; read both together, not just one, when touching this flow. The worker re-checks `status === "confirmed"` before doing anything, so a redelivered BullMQ job can't double-process a cancelled/completed action.

**Sync watermarking**: full sync (`sync/processors/full-sync.processor.ts`) paginates `messages.list`/`messages.get` and stores the mailbox's Gmail `historyId` as a watermark. Incremental sync (`incremental-sync.processor.ts`) consumes that watermark via `history.list`, and auto-falls-back to enqueuing a full sync (without failing the job) if there's no baseline yet or Gmail returns `410` (expired history). A `NeedsReauthError` (refresh grant failed) is a distinct failure path — mailbox flips to `needs_reauth` — from a generic sync error, which flips it to `error` with `syncError` set. Keep these two outcomes separate in any new sync-adjacent code.

**Gmail API access is always rate-limited and retried**: `GmailClientService.acquireQuota()` (Redis token bucket, `common/gmail-rate-limiter.service.ts`, 150 quota units/sec per mailbox) must be called before every Gmail call, and the call itself should go through `callGmailWithRetry()` (`sync/gmail-retry.ts`, backoff on 429/403/5xx, honors `Retry-After`, 5 attempts). Don't call `googleapis` directly from new code — follow the pattern in the existing processors.

**Sender aggregates are never incrementally updated** — the `senders` table is fully rebuilt from `messages` via raw SQL (`sync/sender-aggregate.service.ts`, a `GROUP BY` upsert + a delete for senders with zero remaining non-trashed messages). It's called after every sync and after every bulk action completes. Any new code path that mutates `messages` should call `SenderAggregateService.recompute()` afterward rather than trying to update sender counts directly.

**Two parallel validation layers exist and have drifted**: `packages/shared` exports Zod schemas (`CreateTrashActionSchema`, `SenderListQuerySchema`, `VolumeQuerySchema`) that mirror the API's actual request shapes, but the NestJS controllers validate independently via class-validator DTOs (`*.dto.ts` files, enforced by the global `ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})` in `main.ts`). The Zod schemas are not wired into request handling anywhere — if you change a validation rule, update the DTO (the one that actually runs) and decide whether the Zod schema needs to follow.

**Cross-cutting**: a global `ThrottlerGuard` (`app.module.ts`) caps every route at 300 requests/60s. All API errors are normalized through `common/http-exception.filter.ts` into `{code, message, requestId}`; a handler can attach a specific `code` to an exception body (e.g. `modify_scope_required` on the bulk-action confirm 403) for the frontend to branch on instead of just the HTTP status.
