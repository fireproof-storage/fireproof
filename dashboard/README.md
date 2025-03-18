# Fireproof Dashboard

https://dashboard.fireproof.storage/

## Environment Variables

### Development

To run this project in development mode, you need to set the following environment variables:

```
CLOUD_SESSION_TOKEN_SECRET=your_session_token_secret
CLERK_SECRET_KEY=your_clerk_secret_key
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
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

### Deployment

The main deployment target for this project is **Cloudflare Workers**.

For deployment, you'll need these additional environment variables:

```
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_DATABASE_ID=your_cloudflare_database_id
VITE_CLERK_PUBLISHABLE_KEY=
```
