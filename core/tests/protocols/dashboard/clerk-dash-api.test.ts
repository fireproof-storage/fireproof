import { describe, expect, it, vi } from "vitest";
import { ClerkApiToken, clerkDashApi, DeviceIdApiToken } from "@fireproof/core-protocols-dashboard";
import { ResEnsureUser } from "@fireproof/core-types-protocols-dashboard";
import { Future, OnFunc } from "@adviser/cement";
import type { Clerk, LoadedClerk } from "@clerk/shared/types";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { DeviceIdCA } from "@fireproof/core-device-id";

describe("clerk-dash-api", () => {
  function testClerk(getToken: () => Promise<string>): LoadedClerk & {
    invokeCallback: ReturnType<typeof OnFunc<() => void>>;
  } {
    const invokeCallback = OnFunc<() => void>();
    return {
      invokeCallback,
      addListener: function (callback: Parameters<Clerk["addListener"]>[0]): () => void {
        invokeCallback(() => {
          callback({ session: { getToken } } as Parameters<Parameters<Clerk["addListener"]>[0]>[0]);
        });
        return () => {
          /* no-op */
        };
      },
    } as unknown as LoadedClerk & { invokeCallback: ReturnType<typeof OnFunc<() => void>> };
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
    ci.invokeCallback.invoke();
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-first");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-first");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-first");
    tokenValue = `valid-token-second`;
    ci.invokeCallback.invoke();
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-second");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-second");
    tokenValue = `valid-token-thrid`;
    ci.invokeCallback.invoke();
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-thrid");
    expect((await api.ensureUser({})).Ok().user.userId).toBe("valid-token-thrid");
    expect(tokenFN).toBeCalledTimes(3);
  });

  const sthis = ensureSuperThis();

  it("decodes clerk token", async () => {
    const clerkToken =
      "eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDIyMkFBQSIsImtpZCI6Imluc18yclpzQUV0TG05OHV5clB1eDI4WlZHdkJKOU8iLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwczovL2Rldi5jb25uZWN0LmZpcmVwcm9vZi5kaXJlY3QiLCJleHAiOjE3NzA4ODQxMDEsImlhdCI6MTc3MDg4Mzk4MSwiaXNzIjoiaHR0cHM6Ly90cnVzdGVkLWdsb3d3b3JtLTUuY2xlcmsuYWNjb3VudHMuZGV2IiwianRpIjoiMDMyOTZkYjAwYTcxNjNmOThkNTgiLCJuYmYiOjE3NzA4ODM5NzYsInBhcmFtcyI6eyJlbWFpbCI6Im1lbm8uYWJlbHNAYWR2aXNlci5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZXh0ZXJuYWxfaWQiOm51bGwsImZpcnN0IjoiTWVubyIsImltYWdlX3VybCI6Imh0dHBzOi8vaW1nLmNsZXJrLmNvbS9leUowZVhCbElqb2ljSEp2ZUhraUxDSnpjbU1pT2lKb2RIUndjem92TDJsdFlXZGxjeTVqYkdWeWF5NWtaWFl2YjJGMWRHaGZaMmwwYUhWaUwybHRaMTh5Y21FeFZIRnBOWEJqVUVkb01uZFpVVEZCTWpGTVlqQmhWV2NpZlEiLCJsYXN0IjoiQWJlbHMiLCJuYW1lIjoibWFiZWxzIiwicHVibGljX21ldGEiOnt9fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJzdWIiOiJ1c2VyXzJyYTFUc1VxQzhpRE1sWnRyWHNBUUcwTTE2SyIsInVzZXJJZCI6InVzZXJfMnJhMVRzVXFDOGlETWxadHJYc0FRRzBNMTZLIn0.TWpuRjG4eIH0pol35teDG_BNnBHlNzDQYgtF0sQAVRyzCI7R9zFjLnrwtYSrcVd691meIxr67vMrg4sjN1uy7sxhoAXFBHuE1ZUohEdJyKI64LibZJfdlR2xv-tTrm0CxazveBq9dZ4z2klPk_GJ-LH81aqScbrbv2_CsyVzF8SAIh0bB7qUCd5--Qro6BxSZXfmn2R9ywZ_ljtpqMGsQnz9OzrC94plh1AXiSnR4uwOmcKYEf3weCWduxwUzVQNc9TBdOOUEzn0DBR2aTo9BXwsTlHJBN28SfL6w-JbGt9WD1HkjZOSqb8bRt4zPRBDUm_RbFQ-lxZpLBq8AzGqaQ";
    const ct = new ClerkApiToken(sthis);
    const result = await ct.decode(clerkToken);
    expect(result.isOk()).toBe(true);
    expect(result.Ok().type).toBe("clerk");
    expect(result.Ok().token).toBe(clerkToken);
    expect(result.Ok().claims).toEqual({
      azp: "https://dev.connect.fireproof.direct",
      exp: 1770884101,
      iat: 1770883981,
      iss: expect.stringContaining("https://trusted-glowworm-5.clerk.accounts.dev"),
      jti: expect.any(String),
      nbf: 1770883976,
      params: {
        email: expect.any(String),
        email_verified: true,
        external_id: null,
        first: expect.any(String),
        image_url: expect.stringContaining("https://img.clerk.com/"),
        last: expect.any(String),
        name: expect.any(String),
        public_meta: {},
      },
      role: "authenticated",
      sub: expect.any(String),
      userId: expect.any(String),
    });
  });

  it("decodes dev token", async () => {
    const devIdToken =
      "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik9VNHR3SW5yNklNTHJtVkR5OTFwV2EwTTFWeEp4SEFIeHVON1dtdWNjUkkiLCJ4NWMiOlsiZXlKaGRXUWlPaUpqWlhKMGFXWnBZMkYwWlMxaGRYUm9iM0pwZEhraUxDSmpaWEowYVdacFkyRjBaU0k2ZXlKbGVIUmxibVJsWkV0bGVWVnpZV2RsSWpwYkluTmxjblpsY2tGMWRHZ2lYU3dpYVhOemRXVnlJanA3SW1OdmJXMXZiazVoYldVaU9pSkdhWEpsY0hKdmIyWWdSR1YySUVOQklpd2lZMjkxYm5SeWVVNWhiV1VpT2lKWFJDSXNJbXh2WTJGc2FYUjVJam9pV1c5MUlHUnBaQ0J1YjNRZ2MyVjBJSFJvWlNCRGFYUjVJaXdpYjNKbllXNXBlbUYwYVc5dUlqb2lSbWx5WlhCeWIyOW1JRVJsZG1Wc2IzQnRaVzUwSWl3aWMzUmhkR1ZQY2xCeWIzWnBibU5sVG1GdFpTSTZJbGx2ZFNCa2FXUWdibTkwSUhObGRDQjBhR1VnVTNSaGRHVWlmU3dpYTJWNVZYTmhaMlVpT2xzaVpHbG5hWFJoYkZOcFoyNWhkSFZ5WlNJc0ltdGxlVVZ1WTJsd2FHVnliV1Z1ZENKZExDSnpaWEpwWVd4T2RXMWlaWElpT2lKNlEycEhTM2xZTVZaUk9UTTFRbXQ0ZGpObldsZzJhVXRUY1VGellUTTFjR1JWVjBwWVlWVlFValV5T0hRaUxDSnphV2R1WVhSMWNtVkJiR2R2Y21sMGFHMGlPaUpGVXpJMU5pSXNJbk4xWW1wbFkzUWlPbnNpWTI5dGJXOXVUbUZ0WlNJNkluaDRlQ0lzSW1OdmRXNTBjbmxPWVcxbElqb2lWMFFpTENKc2IyTmhiR2wwZVNJNklsbHZkU0JrYVdRZ2JtOTBJSE5sZENCMGFHVWdRMmwwZVNJc0ltOXlaMkZ1YVhwaGRHbHZiaUk2SWxsdmRTQmthV1FnYm05MElITmxkQ0IwYUdVZ1QzSm5ZVzVwZW1GMGFXOXVJaXdpYzNSaGRHVlBjbEJ5YjNacGJtTmxUbUZ0WlNJNklsbHZkU0JrYVdRZ2JtOTBJSE5sZENCMGFHVWdVM1JoZEdVaWZTd2ljM1ZpYW1WamRGQjFZbXhwWTB0bGVVbHVabThpT25zaVkzSjJJam9pVUMweU5UWWlMQ0pyZEhraU9pSkZReUlzSW5naU9pSkhNalp2UkY4dFJtdzVZV1phVlRKd05qQkRRV0ZIWldwbGVYaFhkbVZDVm1aWFZ6YzVVMk40TVZCVklpd2llU0k2SWs5aVdEaHZTbEJPY0RkaU9HeDZhMmgwWTJWMmJtSmhXVEJSUTJ0c1NXZHhZMVF3VkRGb2NVUlZlbThpZlN3aWRtRnNhV1JwZEhraU9uc2libTkwUVdaMFpYSWlPaUl5TURJM0xUQXlMVEV5VkRBNU9qQTRPalUyTGpBd01Gb2lMQ0p1YjNSQ1pXWnZjbVVpT2lJeU1ESTJMVEF5TFRFeVZEQTVPakE0T2pVMkxqQXdNRm9pZlN3aWRtVnljMmx2YmlJNklqTWlmU3dpWTNKbFlYUnBibWRWYzJWeUlqcDdJbU5zWVdsdGN5STZleUpoZW5BaU9pSm9kSFJ3Y3pvdkwyUmxkaTVqYjI1dVpXTjBMbVpwY21Wd2NtOXZaaTVrYVhKbFkzUWlMQ0psZUhBaU9qRTNOekE0T0RjME5UWXNJbWxoZENJNk1UYzNNRGc0TnpNek5pd2lhWE56SWpvaWFIUjBjSE02THk5MGNuVnpkR1ZrTFdkc2IzZDNiM0p0TFRVdVkyeGxjbXN1WVdOamIzVnVkSE11WkdWMklpd2lhblJwSWpvaU9ESmlNekJsTVRObFlURXlZVGRpTm1WaFptRWlMQ0p1WW1ZaU9qRTNOekE0T0Rjek16RXNJbkJoY21GdGN5STZleUpsYldGcGJDSTZJbTFsYm04dVlXSmxiSE5BWVdSMmFYTmxjaTVqYjIwaUxDSmxiV0ZwYkY5MlpYSnBabWxsWkNJNmRISjFaU3dpWlhoMFpYSnVZV3hmYVdRaU9tNTFiR3dzSW1acGNuTjBJam9pVFdWdWJ5SXNJbWx0WVdkbFgzVnliQ0k2SW1oMGRIQnpPaTh2YVcxbkxtTnNaWEpyTG1OdmJTOWxlVW93WlZoQ2JFbHFiMmxqU0VwMlpVaHJhVXhEU25wamJVMXBUMmxLYjJSSVVuZGplbTkyVERKc2RGbFhaR3hqZVRWcVlrZFdlV0Y1Tld0YVdGbDJZakpHTVdSSGFHWmFNbXd3WVVoV2FVd3liSFJhTVRoNVkyMUZlRlpJUm5CT1dFSnFWVVZrYjAxdVpGcFZWRVpDVFdwR1RWbHFRbWhXVjJOcFpsRWlMQ0pzWVhOMElqb2lRV0psYkhNaUxDSnVZVzFsSWpvaWJXRmlaV3h6SWl3aWNIVmliR2xqWDIxbGRHRWlPbnQ5ZlN3aWNtOXNaU0k2SW1GMWRHaGxiblJwWTJGMFpXUWlMQ0p6ZFdJaU9pSjFjMlZ5WHpKeVlURlVjMVZ4UXpocFJFMXNXblJ5V0hOQlVVY3dUVEUyU3lJc0luVnpaWEpKWkNJNkluVnpaWEpmTW5KaE1WUnpWWEZET0dsRVRXeGFkSEpZYzBGUlJ6Qk5NVFpMSW4wc0luUjVjR1VpT2lKamJHVnlheUo5TENKbGVIQWlPakU0TURJME1qTXpNellzSW1saGRDSTZNVGMzTURnNE56TXpOaXdpYVhOeklqb2lSbWx5WlhCeWIyOW1JRVJsZGlCRFFTSXNJbXAwYVNJNklucERha2RMZVZneFZsRTVNelZDYTNoMk0yZGFXRFpwUzFOeFFYTmhNelZ3WkZWWFNsaGhWVkJTTlRJNGRDSXNJbTVpWmlJNk1UYzNNRGc0TnpNek5pd2ljM1ZpSWpvaWVIaDRJbjA9Il0sIng1dCI6Ino1ZHJFSjFZZjY5OEY2aXVYZXJVZFNwQlV5VlZVUGUiLCJ4NXQjUzI1NiI6InpRbWZMMkVRcW43VUVuTnZ3S1FNcnZTQlYzeVZNZUhjVER2V2FiQjdtRThxN2FxIn0.eyJpc3MiOiJhcHAtaWQiLCJzdWIiOiJkZXZpY2UtaWQiLCJkZXZpY2VJZCI6Ik9VNHR3SW5yNklNTHJtVkR5OTFwV2EwTTFWeEp4SEFIeHVON1dtdWNjUkkiLCJzZXEiOjEsImV4cCI6MTc3MDg5MDk2MywibmJmIjoxNzcwODg3MzYxLCJpYXQiOjE3NzA4ODczNjMsImp0aSI6InpSVGZyWmdIRCJ9.M63O6DcqpHTBXUffHbv5OoxuJV-yWhlJPe7JWgk1xkfvYWqh1_9Qx_oCU49OFOkpwKnu8ofWY6FNMa_vGtdRDQ";
    const dt = new DeviceIdApiToken(sthis, {
      clockTolerance: 60,
      deviceIdCA: {} as DeviceIdCA,
    });
    const result = await dt.decode(devIdToken);
    expect(result.isOk()).toBe(true);
    expect(result.Ok().type).toBe("device-id");
    expect(result.Ok().token).toBe(devIdToken);
    expect(result.Ok().claims).toEqual({
      azp: "https://dev.connect.fireproof.direct",
      exp: 1770887456,
      iat: 1770887336,
      iss: expect.stringContaining("https://trusted-glowworm-5.clerk.accounts.dev"),
      jti: expect.any(String),
      nbf: 1770887331,
      params: {
        email: expect.any(String),
        email_verified: true,
        external_id: null,
        first: expect.any(String),
        image_url: expect.stringContaining("https://img.clerk.com/"),
        last: expect.any(String),
        name: expect.any(String),
        public_meta: {},
      },
      role: "authenticated",
      sub: expect.any(String),
      userId: expect.any(String),
    });
  });
});
