import { createClerkClient } from "@clerk/backend";
import { Result } from "@adviser/cement";
import { DashboardApiImpl, DashAuthType } from "@fireproof/core-protocols-dashboard";

const apiUrl = process.env.API_URL || "http://localhost:7370/api";

async function registerClerkKeys(clerkId: string, jwksUrl: string) {
  console.log(`Registering Clerk instance: ${clerkId}`);
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "reqRegisterClerkKeys",
      clerkId,
      jwksUrl,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to register: ${await res.text()}`);
  }

  return res.json();
}

async function listClerkInstances() {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "reqListClerkInstances" }),
  });

  if (!res.ok) {
    throw new Error(`Failed to list: ${await res.text()}`);
  }

  return res.json();
}

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY || "";
  const jwksUrl = process.env.CLERK_JWKS_URL || "";
  const clerkId = process.env.CLERK_ID || "my-clerk";

  if (!secretKey) {
    console.error("CLERK_SECRET_KEY is required");
    console.error("\nUsage:");
    console.error("  CLERK_SECRET_KEY=sk_xxx CLERK_JWKS_URL=https://xxx.clerk.accounts.dev npx tsx cli-clerk.ts");
    process.exit(1);
  }

  console.log("Custom Clerk CLI\n");

  // Step 1: Register your Clerk JWKS URL (if provided)
  if (jwksUrl) {
    const registered = await registerClerkKeys(clerkId, jwksUrl);
    console.log("Registered:", registered);
  }

  // List all registered instances
  const instances = await listClerkInstances();
  console.log("\nRegistered Clerk instances:", instances);

  // Step 2: Use Clerk Backend API to get user info
  const clerk = createClerkClient({ secretKey });

  const users = await clerk.users.getUserList({ limit: 5 });
  console.log(`\nFound ${users.totalCount} users in your Clerk instance:`);

  for (const user of users.data) {
    const email = user.emailAddresses[0]?.emailAddress || "no-email";
    console.log(`  - ${user.id}: ${email}`);
  }

  if (users.data.length === 0) {
    console.log("\nNo users found. Create a user in Clerk first.");
    return;
  }

  // Step 3: Get an active session for the first user
  const user = users.data[0];
  const sessions = await clerk.sessions.getSessionList({
    userId: user.id,
    status: "active",
  });

  if (sessions.data.length === 0) {
    console.log(`\nNo active sessions for user ${user.id}.`);
    console.log("The user needs to sign in via the browser first to create a session.");
    console.log("\nAlternatively, you can use the device-id auth flow (see cli-fp.ts).");
    return;
  }

  const session = sessions.data[0];
  console.log(`\nUsing session: ${session.id}`);

  // Get session token
  const tokenResponse = await clerk.sessions.getToken(session.id, "");
  const sessionToken = tokenResponse.jwt;

  console.log("Got session token");

  // Step 4: Use the token with Dashboard API
  const dashApi = new DashboardApiImpl({
    gracePeriodMs: 5000,
    getTokenCtx: { template: "with-email" },
    apiUrl,
    fetch: fetch.bind(globalThis),
    getToken: async (): Promise<Result<DashAuthType>> => {
      return Result.Ok({
        type: "clerk",
        clerkId: jwksUrl ? clerkId : undefined, // only set if we registered custom keys
        token: sessionToken,
      });
    },
  });

  // Step 5: Call the API
  console.log("\nCalling ensureUser...");
  const userResult = await dashApi.ensureUser({});
  console.log("Result:", userResult);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
