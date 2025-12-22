import { describe, expect, it, vi } from "vitest";
import { clerkDashApi, ResEnsureUser } from "@fireproof/core-protocols-dashboard";
import { Future, OnFunc } from "@adviser/cement";
import type { Clerk } from "@clerk/shared/types";

describe("clerk-dash-api", () => {
  function testClerk(getToken: () => Promise<string>): Clerk & {
    invokeCallback: ReturnType<typeof OnFunc<() => void>>;
  } {
    const invokeCallback = OnFunc<() => void>();
    return {
      invokeCallback,
      addListener: function (callback: Parameters<Clerk["addListener"]>[0]): () => void {
        console.log("testClerk: addListener called");
        invokeCallback(() => {
          console.log("testClerk: onCallback invoked");
          callback({ session: { getToken } } as Parameters<Parameters<Clerk["addListener"]>[0]>[0]);
        });
        return () => {
          /* no-op */
        };
      },
    } as unknown as Clerk & { invokeCallback: ReturnType<typeof OnFunc<() => void>> };
  }

  it("is a singleton", () => {
    const ci = testClerk(async () => "token");
    const m1 = clerkDashApi(ci, { apiUrl: "https://api.example.com" });
    const m2 = clerkDashApi(ci, { apiUrl: "https://api.example.com" });
    expect(m1).toBe(m2);
  });

  it("check if getToken fails work", async () => {
    const fut = new Future<string>();
    const futFn = vi.fn(() => fut.asPromise());
    const ci = testClerk(futFn);
    const api = clerkDashApi(ci, { apiUrl: "https://fails.example.com" });
    ci.invokeCallback.invoke();
    setTimeout(() => {
      fut.reject(new Error("getToken failed"));
    }, 5);
    const res = await api.ensureUser({});
    expect(res.isErr()).toBe(true);
    expect(res.Err().message).toBe("getToken failed");
  });

  it("check if getToken works", async () => {
    const fut = new Future<string>();
    const futFn = vi.fn(() => fut.asPromise());
    const ci = testClerk(futFn);
    const actions = new Array(3).fill(0).map(async () => {
      const api = clerkDashApi(ci, {
        apiUrl: "https://ok.example.com",
        fetch: async (_input: RequestInfo, init: RequestInit) => {
          expect(JSON.parse(init.body as string)).toEqual({ type: "reqEnsureUser", auth: { type: "clerk", token: "valid-token" } });
          return new Response(
            JSON.stringify({
              type: "resEnsureUser",
              user: {
                userId: "",
                maxTenants: 0,
                status: "active",
                createdAt: new Date(),
                updatedAt: new Date(),
                byProviders: [],
              },
              tenants: [],
            } satisfies ResEnsureUser),
            { status: 200 },
          );
        },
      });
      const res = await api.ensureUser({});
      expect(res.isOk()).toBe(true);
    });
    ci.invokeCallback.invoke();
    setTimeout(() => {
      fut.resolve("valid-token");
    }, 5);
    await Promise.all(actions);
    expect(futFn).toHaveBeenCalledTimes(1);
  });

  it("it gets new token on each listener call", async () => {
    let tokenValue = `valid-token-first`;
    const tokenFN = vi.fn(async () => {
      console.log("tokenFN called", tokenValue);
      return tokenValue;
    });
    const ci = testClerk(tokenFN);
    const api = clerkDashApi(ci, {
      apiUrl: "https://complex.example.com",
      fetch: async (_input: RequestInfo, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            type: "resEnsureUser",
            user: {
              userId: body.auth.token,
              maxTenants: 0,
              status: "active",
              createdAt: new Date(),
              updatedAt: new Date(),
              byProviders: [],
            },
            tenants: [],
          } satisfies ResEnsureUser),
          { status: 200 },
        );
      },
    });
    console.log("First invoke");
    ci.invokeCallback.invoke();
    console.log("Check first token");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-first");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-first");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-first");
    tokenValue = `valid-token-second`;
    console.log("Second invoke-pre");
    ci.invokeCallback.invoke();
    console.log("Second invoke-post");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-second");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-second");
    tokenValue = `valid-token-thrid`;
    ci.invokeCallback.invoke();
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-thrid");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-thrid");
    expect(tokenFN).toBeCalledTimes(3);
  });
});
