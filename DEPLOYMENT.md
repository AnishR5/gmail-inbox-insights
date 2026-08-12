# Deploying Gmail Inbox Insights (Azure + Supabase + Upstash, free tier)

This is a step-by-step guide to get the app live at a public URL for ~$0/mo. It
assumes you've read [README.md](README.md) and have the app running locally
already (same Google OAuth client gets reused for prod — you'll just add a
second redirect URI to it).

## Architecture

```
Browser
  │
  ├── Azure Static Web Apps (free)        apps/web (Vite build)
  │
  └── Azure App Service, Free F1 ($0)     apps/api (NestJS + in-process BullMQ workers)
        │
        ├── Supabase (free)                Postgres
        └── Upstash (free)                 Redis
```

**The tradeoff you're accepting for $0/mo**: App Service's Free (F1) tier caps
usage at **60 CPU-minutes/day**, and once that's hit the platform force-stops
the app entirely (Portal shows **Status: Quota exceeded**, visitors get a
`403 - This web app is stopped`) until the quota resets — you have to go into
the Portal and click **Start** to bring it back. F1 also doesn't support
"Always On", so even short of the quota, the app can idle-unload after ~20
min with no traffic and the next visitor eats a ~10-30s cold start.

**This isn't just a cold-start inconvenience** — confirmed in practice, not
just theoretical: this app runs continuous background workers (BullMQ
processing, the 30-minute auto-sync scheduler) even with zero visitors, so
the daily quota can get exhausted from background activity alone, not only
from traffic. Expect to periodically find it stopped and need to manually
restart it in the Portal. Upgrade to Basic B1 (~$13/mo) if/when that gets
old — it removes the quota entirely and enables Always On, no code changes
needed, just a plan change under App Service Plan → Scale up.

**Order matters below** — the API needs to exist before you can point the
frontend's build at it, and the API's `WEB_ORIGIN` setting needs the
frontend's URL, which only exists after the frontend is created. You'll
circle back to update one setting after both are up.

---

## 1. Supabase (Postgres)

1. [supabase.com](https://supabase.com) → New project. Pick any name/region, set a database password (save it).
2. Once provisioned: **Project Settings → Database → Connection string → URI**. Copy it — this is your `DATABASE_URL`. It looks like:
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxx.supabase.co:5432/postgres`
3. Free tier pauses the project after 7 days of zero activity and auto-resumes on the next connection (with a short delay) — fine for a demo.

## 2. Upstash (Redis)

1. [upstash.com](https://upstash.com) → Create database. Any name/region, type: Regional (not Global — simpler, and this app doesn't need multi-region).
2. On the database's page, copy the **"Redis Connect"** URL that starts with `rediss://` (note the double `s` — TLS). This is your `REDIS_URL`. No code changes needed for this — `ioredis` (which BullMQ uses under the hood) auto-detects TLS from `rediss://`.
3. Free tier: 10,000 commands/day. Keep an eye on Upstash's usage dashboard after your first few syncs; if you're close to the limit, their pay-as-you-go tier is ~$0.20/100k commands.

## 3. Generate production secrets

**Never reuse your local `.env` values in production.** Generate fresh ones:

```bash
openssl rand -base64 48   # → SESSION_SECRET
openssl rand -base64 32   # → KEY_ENCRYPTION_KEY
```

Save both somewhere safe (password manager) — you'll paste them into Azure in the next step.

## 4. Azure App Service (the API)

1. [portal.azure.com](https://portal.azure.com) → Create a resource → **Web App**.
2. Resource Group: create new (e.g. `gmail-insights-rg`).
3. Name: globally unique (e.g. `gmail-inbox-insights-api`). Azure sometimes assigns a longer **default domain** than the simple `https://<name>.azurewebsites.net` pattern — e.g. `https://<name>-<random>.<region>.azurewebsites.net`. **Use whatever the Portal's Overview page actually shows under "Default domain" for every URL below** — don't assume the short form.
4. Publish: **Code**. Runtime stack: **Node 20 LTS**. OS: **Linux**.
5. Pricing plan: create a new App Service Plan, SKU **Free F1**.
6. Review + create.

Once it exists, configure it:

**Configuration → Application settings** — add each of these (New application setting → name/value):

| Name | Value |
|---|---|
| `DATABASE_URL` | from Supabase (step 1) |
| `REDIS_URL` | from Upstash (step 2) |
| `SESSION_SECRET` | from step 3 |
| `KEY_ENCRYPTION_KEY` | from step 3 |
| `GOOGLE_CLIENT_ID` | same value as your local `.env` |
| `GOOGLE_CLIENT_SECRET` | same value as your local `.env` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://<app-name>.azurewebsites.net/auth/google/callback` |
| `WEB_ORIGIN` | placeholder for now (e.g. `https://placeholder.example.com`) — you'll come back and fix this in step 6 |
| `NODE_ENV` | `production` |

**Configuration → General settings → Startup Command**:
```
node apps/api/dist/main.js
```

Run migrations separately, from your own machine, against the production
`DATABASE_URL` — **not** chained into the Azure startup command. In practice
`npx prisma migrate deploy` at Azure App Service startup resolves an
incomplete/misresolved Prisma CLI (it falls back to a live npm registry
fetch, then crashes on a missing `prisma_schema_build_bg.wasm`), which turns
every single container start into a crash — and each crash-restart burns
real CPU against the Free tier's 60-min/day quota, so a flaky migration step
here doesn't just fail once, it can eat your whole day's quota:
```bash
cd apps/api
DATABASE_URL="<your prod DATABASE_URL>" npx prisma migrate deploy --schema=prisma/schema.prisma
```
Do this once now, and again after any future change to `prisma/schema.prisma`
before deploying that change.

**Overview → Get publish profile** — downloads a `.PublishSettings` file. Open it, copy the entire contents.

**In your GitHub repo** (Settings → Secrets and variables → Actions → New repository secret), add:
- `AZURE_WEBAPP_NAME` = the app name you picked (e.g. `gmail-inbox-insights-api`)
- `AZURE_WEBAPP_PUBLISH_PROFILE` = the full contents of the publish profile file you just downloaded

The workflow at [.github/workflows/deploy-api.yml](.github/workflows/deploy-api.yml) uses these to deploy automatically on every push to `main` that touches `apps/api/`, `packages/shared/`, or itself.

## 5. Azure Static Web Apps (the frontend)

1. Portal → Create a resource → **Static Web App**.
2. Same resource group as above. Name: e.g. `gmail-inbox-insights-web`. Plan type: **Free**.
3. Deployment: **GitHub** → authorize → pick this repo, branch `main`.
4. Build Details: Build Presets **Custom**, App location `/apps/web`, Api location *(leave blank)*, Output location `dist`.
5. Create. Azure will auto-commit a new workflow file to your repo, something like `.github/workflows/azure-static-web-apps-<random-name>.yml`.

**Pull that new commit locally, then two edits are needed** (the shared package has to build before the frontend, and the API URL has to be baked in at build time — Vite reads `import.meta.env.VITE_API_BASE_URL` at build time, not runtime):

- Add a repo secret `VITE_API_BASE_URL` = `https://<app-service-name>.azurewebsites.net` (the API URL from step 4).
- In the new workflow file, find the `Azure/static-web-apps-deploy@v1` (or `@v2`) step and add an `env:` block and change `app_build_command`:
  ```yaml
  env:
    VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
  with:
    app_build_command: "cd ../.. && npm ci && npm run build --workspace=packages/shared && npm run build --workspace=apps/web"
    # ...leave the rest (app_location, output_location, tokens) as Azure generated them
  ```

Once that commit lands, note the SWA's URL (Portal → the Static Web App resource → "URL" on the Overview page, something like `https://icy-forest-0a1b2c3d.azurestaticapps.net`).

**Now go back to App Service → Configuration → Application settings** and fix `WEB_ORIGIN` to that real SWA URL (no trailing slash), then **Save** and **Restart** the App Service.

## 6. Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → your existing OAuth 2.0 Client ID.
2. **Authorized redirect URIs → Add URI**: `https://<app-service-name>.azurewebsites.net/auth/google/callback` (keep the localhost one too). Save.
3. **OAuth consent screen → Test users → Add users**: add the Gmail address of anyone you want to be able to log in — this includes yourself on prod, plus anyone from LinkedIn who asks for access. Up to 100.

Anyone who clicks "Connect Gmail" without being on this list will hit Google's own "app not verified / access blocked" screen — that's expected while the app is in Testing status (the app deliberately isn't going through Google's full verification review, which the gmail.modify scope requires and can take weeks — see the LoginPage copy, which already sets this expectation for visitors).

## 7. Ship it

```bash
git add -A
git commit -m "Add production deploy config for Azure + Supabase + Upstash"
git push
```

Pushing triggers `.github/workflows/deploy-api.yml` (API → App Service) and the Azure-generated workflow (frontend → Static Web Apps). Watch both under the repo's **Actions** tab.

## Verification checklist

- [ ] `https://<app-service-name>.azurewebsites.net/health` → `{"status":"ok"}`
- [ ] Static Web App URL loads the Login page, no console CORS errors
- [ ] Log in with a tester account → lands on `/dashboard/...` with real data (not bounced back to Login — this is the direct test of the cross-origin cookie fix)
- [ ] Trigger a manual sync from the dashboard, confirm it completes
- [ ] Refresh the browser while on `/dashboard/:mailboxId` directly (tests the SPA routing fallback — without `staticwebapp.config.json` this would 404)

## Troubleshooting

- **Login redirects to `/dashboard` but everything shows logged-out (401 loop)**: the cross-origin cookie fix didn't take effect — double check `NODE_ENV=production` is actually set in App Service settings (it gates `secure`/`sameSite` in [auth.controller.ts](apps/api/src/auth/auth.controller.ts)).
- **CORS errors in the browser console**: `WEB_ORIGIN` on the API doesn't exactly match the SWA URL (check for trailing slash / http vs https).
- **App Service shows "Application Error"**: check **Log stream** in the Portal; most likely a missing/wrong Application Setting, or the startup command's `prisma migrate deploy` failing (bad `DATABASE_URL`).
- **Google's OAuth screen says access blocked**: that account isn't in the Test users list (step 6.3).
- **API returns `403 - This web app is stopped` / Portal shows Status: Quota exceeded**: F1's 60 CPU-min/day quota is used up (see the tradeoff note above — this app's background workers alone can trigger it). Go to the App Service Overview page and click **Start**. If it immediately stops again, the quota hasn't reset yet — wait, or upgrade to Basic B1.
