# Fireproof Dashboard

https://dashboard.fireproof.storage/

## Environment Variables

### Development

To run this project in development mode, you need to set up the following environment files:

1. Create a `.env` or `.env.local` file with these variables:

```
CLOUD_SESSION_TOKEN_SECRET=your_session_token_secret
CLERK_SECRET_KEY=your_clerk_secret_key
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

2. Create a `.dev.vars` file (used by Wrangler for local development):

```
CLOUD_SESSION_TOKEN_SECRET=your_session_token_secret
CLERK_SECRET_KEY=your_clerk_secret_key
```

Additionally, you need to create a token template named `with-email` in your Clerk dashboard with the following configuration:

```json
{
  "role": "authenticated",
  "params": {
    "last": "{{user.last_name}}",
    "name": "{{user.username}}",
    "email": "{{user.primary_email_address}}",
    "first": "{{user.first_name}}",
    "image_url": "{{user.image_url}}",
    "external_id": "{{user.external_id}}",
    "public_meta": "{{user.public_metadata}}",
    "email_verified": "{{user.email_verified}}"
  },
  "userId": "{{user.id}}"
}
```

## Local Development

To set up and run the project locally:

1. Set up the database schema:
   ```
   pnpm drizzle:d1-local
   ```

2. Start the frontend development server:
   ```
   pnpm dev
   ```

3. In a separate terminal, start one of the backend servers:
   ```
   pnpm backend:d1    # For Cloudflare Workers D1 backend
   ```
   OR
   ```
   pnpm backend:deno  # For Deno backend
   ```

### Deployment

The main deployment target for this project is **Cloudflare Workers**.

For deployment, you'll need these additional environment variables:

```
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_DATABASE_ID=your_cloudflare_database_id
VITE_CLERK_PUBLISHABLE_KEY=
```
