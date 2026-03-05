# Fireproof Cloud - Alchemy Deployment

You are helping deploy Fireproof's cloud infrastructure to Cloudflare using Alchemy (an infrastructure-as-code tool). All deployment configuration lives in the `alchemy/` directory.

## What Gets Deployed

The deployment provisions the following Cloudflare resources, all suffixed by stage (any name: `dev`, `staging`, `production`, `acme`, etc.):

| Resource | Name Pattern | Purpose |
|---|---|---|
| R2 Bucket | `fp-storage-{stage}` | Blob storage for ledger data |
| R2 S3 API Token | `fp-r2-s3-{stage}` | Generates pre-signed URLs for direct R2 access |
| D1 Database | `fp-meta-{stage}` | Cloud backend metadata (sessions, keys) |
| D1 Database | `fp-connect-{stage}` | Dashboard data (tenants, users, ledgers, invites) |
| Worker | `fireproof-cloud-{stage}` | Cloud backend (REST API, WebSocket, blob proxy) |
| Worker | `fireproof-dashboard-{stage}` | Dashboard app (Clerk auth, tenant management) |
| Durable Object | `FPRoomDurableObject` | WebSocket rooms for real-time sync |

In production, the dashboard also gets the custom domain `connect.fireproof.direct`.

## Prerequisites

1. **Node.js >= 22** and **pnpm** installed
2. **Cloudflare Global API Key** and account email (not a scoped API token -- alchemy needs global key for R2 token creation)
3. **Clerk account** with a configured application
4. **Environment variables** configured (see below)

The dashboard frontend build and Drizzle migrations are handled automatically by the predeploy step.

## Environment Setup

Copy the sample env file and fill in your values:

```bash
cp alchemy/.env.sample alchemy/.env
```

Required variables:

| Variable | Source | Description |
|---|---|---|
| `CLOUDFLARE_API_KEY` | Cloudflare dashboard > My Profile > API Tokens > Global API Key | Cloudflare authentication |
| `CLOUDFLARE_EMAIL` | Your Cloudflare account email | Cloudflare authentication |
| `ALCHEMY_PASSWORD` | Any strong passphrase you choose | Encrypts secrets in alchemy state files |
| `CLOUD_SESSION_TOKEN_PUBLIC` | Generate with `openssl rand -hex 64` | Public key for cloud session tokens |
| `CLOUD_SESSION_TOKEN_SECRET` | Generate with `openssl rand -hex 64` | Private key for cloud session tokens |
| `CLERK_PUBLISHABLE_KEY` | Clerk dashboard > API Keys | Clerk frontend auth key |
| `CLERK_PUB_JWT_URL` | `https://{your-clerk-instance}.clerk.accounts.dev` | Clerk JWKS endpoint base URL |
| `DEVICE_ID_CA_PRIV_KEY` | Generate or use existing CA private key | Device identity CA signing key |
| `DEVICE_ID_CA_CERT` | Corresponding CA certificate | Device identity CA certificate |

Optional variables (with defaults):

| Variable | Default |
|---|---|
| `MAX_TENANTS` | 100 |
| `MAX_ADMIN_USERS` | 10 |
| `MAX_MEMBER_USERS` | 50 |
| `MAX_INVITES` | 100 |
| `MAX_LEDGERS` | 50 |

## Deploy Commands

All commands run from the repo root. Environment variables must be exported before running.

```bash
# Export env vars
set -a && source alchemy/.env && set +a

# Deploy to a named stage (dev, staging, production)
pnpm alchemy:deploy:dev
pnpm alchemy:deploy:staging
pnpm alchemy:deploy:production

# Destroy all resources for a stage
pnpm alchemy:destroy -- --stage dev
```

The deploy commands automatically run `alchemy:predeploy` first, which builds the dashboard frontend and generates Drizzle migrations.

### Spinning Up a New Instance

Each `--stage` name creates a fully isolated stack -- its own Workers, D1 databases, R2 bucket, and API tokens. No state is shared between stages. Use any name:

```bash
# Deploy an isolated instance named "acme"
pnpm alchemy:deploy -- --stage acme

# Deploy another with different Clerk keys
CLERK_PUBLISHABLE_KEY=pk_test_other \
CLERK_PUB_JWT_URL=https://other.clerk.accounts.dev \
pnpm alchemy:deploy -- --stage otherclient

# Tear down a specific instance
pnpm alchemy:destroy -- --stage acme
```

This creates completely independent resources:
- `fireproof-cloud-acme` / `fireproof-dashboard-acme` (Workers)
- `fp-storage-acme` (R2 bucket)
- `fp-meta-acme` / `fp-connect-acme` (D1 databases)
- `fp-r2-s3-acme` (API token)

### Deploy Output

After a successful deploy, the script outputs the deployed URLs and ready-to-use VITE env vars:

```
--- Deployed URLs ---
Stage: acme
Cloud Backend: https://fireproof-cloud-acme.{your-subdomain}.workers.dev
Dashboard: https://fireproof-dashboard-acme.{your-subdomain}.workers.dev

VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=https://fireproof-dashboard-acme.{your-subdomain}.workers.dev
VITE_CLOUD_URL=https://fireproof-cloud-acme.{your-subdomain}.workers.dev
```

## Verify a Deployment

After deploying, run the verification script with the output URLs:

```bash
npx tsx alchemy/alchemy.verify.ts <cloud-backend-url> <dashboard-url>
```

This checks:
- Cloud backend `/health` endpoint
- Blob PUT/GET/DELETE round-trip via R2
- Dashboard serves HTML
- Dashboard JWKS endpoint (`.well-known/jwks.json`)

## Alchemy State

Alchemy stores resource state in `.alchemy/` at the repo root (gitignored). This tracks what has been created so it can update or destroy resources idempotently. If you delete `.alchemy/`, alchemy will treat the next deploy as a fresh creation. Existing Cloudflare resources will be adopted (not duplicated) because `adopt: true` is set on all resources.

## Troubleshooting

**"Secret cannot be undefined"** -- An env var is not exported. Make sure you used `set -a` before sourcing the env file.

**"Cannot serialize secret without password"** -- `ALCHEMY_PASSWORD` is not set.

**D1 tables missing after deploy** -- Check that the `migrationsDir` paths in `alchemy.run.ts` resolve correctly from the repo root (they use `./` prefix, not `../`).

**"already exists" errors** -- Normal on first deploy if resources were previously created by wrangler. The `adopt: true` flag handles this.

**CORS errors on blob URLs** -- The R2 bucket is configured with permissive CORS. If you see CORS issues, verify the R2 bucket was created with the current config by destroying and redeploying.

## File Reference

| File | Purpose |
|---|---|
| `alchemy/alchemy.run.ts` | Main IaC definition -- all Cloudflare resources |
| `alchemy/alchemy.verify.ts` | Post-deploy verification script |
| `alchemy/.env.sample` | Template for required environment variables |
| `alchemy/.env` | Your actual env values (gitignored) |
| `cloud/backend/cf-d1/migrations/` | SQL migrations for the cloud backend D1 |
| `dashboard/backend/dist/` | Auto-generated Drizzle migrations for dashboard D1 |
| `.alchemy/` | Alchemy state directory (gitignored) |
