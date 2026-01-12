// import { auth } from "./better-auth.js";
import {
  CoercedHeadersInit,
  HttpHeader,
  Lazy,
  LoggerImpl,
  Result,
  param,
  Option,
  Evento,
  EventoEnDecoder,
  EventoType,
  AppContext,
  ValidateTriggerCtx,
  HandleTriggerCtx,
  EventoResultType,
  EventoResult,
  EventoSendProvider,
} from "@adviser/cement";
import { SuperThisOpts } from "@fireproof/core-types-base";
import { createFPApiSQLCtx } from "./api.js";
import type { Env } from "./cf-serve.js";
import { ensureSuperThis, coerceInt } from "@fireproof/core-runtime";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { ResultSet } from "@libsql/client";
import { getCloudPubkeyFromEnv } from "./get-cloud-pubkey-from-env.js";
import { FPApiSQLCtx } from "./types.js";
import { deleteTenantItem } from "./public/delete-tenant.js";
import { updateTenantItem } from "./public/update-tenant.js";
import { createTenantItem } from "./public/create-tenant.js";
import { updateLedgerItem } from "./public/update-ledger.js";
import { deleteLedgerItem } from "./public/delete-ledger.js";
import { createLedgerItem } from "./public/create-ledger.js";
import { listInvitesItem } from "./public/list-invites.js";
import { inviteUserItem } from "./public/invite-user.js";
import { findUserItem } from "./public/find-user.js";
import { redeemInviteItem } from "./public/redeem-invite.js";
import { listTenantsByUserItem } from "./public/list-tenants-by-user.js";
import { updateUserTenantItem } from "./public/update-user-tenant.js";
import { listLedgersByUserItem } from "./public/list-ledgers-by-user.js";
import { deleteInviteItem } from "./public/delete-invite.js";
import { getCloudSessionTokenItem } from "./public/get-cloud-session-token.js";
import { getTokenByResultIdItem } from "./public/get-token-by-result-id.js";
import { getCertFromCsrItem } from "./public/get-cert-from-csr.js";
import { ensureUserItem } from "./public/ensure-user.js";
import { ensureCloudTokenItem } from "./public/ensure-cloud-token.js";
import { FPApiParameters } from "@fireproof/core-types-protocols-dashboard";
import { deviceIdCAFromEnv, tokenApi } from "@fireproof/core-protocols-dashboard";

const defaultHttpHeaders = Lazy(() =>
  HttpHeader.from({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PUT,DELETE",
    "Access-Control-Allow-Headers": "Origin, Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  }),
);

export function DefaultHttpHeaders(...h: CoercedHeadersInit[]): HeadersInit {
  return defaultHttpHeaders()
    .Merge(...h)
    .AsHeaderInit();
}

export type DashSqlite = BaseSQLiteDatabase<"async", ResultSet | D1Result, Record<string, never>>;

export type BindPromise<T> = (promise: Promise<T>) => Promise<T>;

class ReqResEventoEnDecoder implements EventoEnDecoder<Request, string> {
  async encode(args: Request): Promise<Result<unknown>> {
    if (args.method === "POST" || args.method === "PUT") {
      const body = (await args.json()) as unknown;
      return Result.Ok(body);
    }
    return Result.Ok(null);
  }
  decode(data: unknown): Promise<Result<string>> {
    return Promise.resolve(Result.Ok(JSON.stringify(data)));
  }
}

interface ResponseType {
  type: "Response";
  payload: {
    status: number;
    headers: HeadersInit;
    body: BodyInit;
  };
}

function isResponseType(obj: unknown): obj is ResponseType {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  return (obj as ResponseType).type === "Response";
}

export const fpApiEvento = Lazy(() => {
  const evento = new Evento(new ReqResEventoEnDecoder());
  evento.push(
    {
      hash: "cors-preflight",
      validate: (ctx: ValidateTriggerCtx<Request, unknown, unknown>) => {
        const { request: req } = ctx;
        if (req && req.method === "OPTIONS") {
          return Promise.resolve(Result.Ok(Option.Some("Send CORS preflight response")));
        }
        return Promise.resolve(Result.Ok(Option.None()));
      },
      handle: async (ctx: HandleTriggerCtx<Request, string, unknown>): Promise<Result<EventoResultType>> => {
        await ctx.send.send(ctx, {
          type: "Response",
          payload: {
            status: 200,
            headers: DefaultHttpHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ type: "ok", message: "CORS preflight" }),
          },
        } satisfies ResponseType);
        return Result.Ok(EventoResult.Stop);
      },
    },
    {
      hash: "log-request ",
      validate: async (_ctx: ValidateTriggerCtx<Request, unknown, unknown>): Promise<Result<Option<unknown>>> => {
        return Promise.resolve(Result.Ok(Option.Some("Log request")));
      },
      handle: async (ctx: HandleTriggerCtx<Request, unknown, unknown>): Promise<Result<EventoResultType>> => {
        const { request: req } = ctx;
        if (!["POST", "PUT"].includes(req.method)) {
          await ctx.send.send(ctx, {
            type: "Response",
            payload: {
              status: 503,
              headers: DefaultHttpHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ type: "error", message: "Only POST and PUT methods are supported", req: ctx.enRequest }),
            },
          } satisfies ResponseType);
          return Result.Ok(EventoResult.Stop);
        }
        ctx.ctx
          .getOrThrow<FPApiSQLCtx>("fpApiCtx")
          .sthis.logger.Debug()
          .TimerStart(`api-request-${ctx.id}`)
          .Any({
            method: req.method,
            url: req.url,
            headers: HttpHeader.from(req.headers).AsRecordStringString(),
            body: ctx.enRequest,
          })
          .Msg("API Request started");
        return Result.Ok(EventoResult.Continue);
      },
      post: async (ctx: HandleTriggerCtx<Request, unknown, unknown>): Promise<void> => {
        // ctx.send.tranfer(ctx);
        ctx.ctx
          .getOrThrow<FPApiSQLCtx>("fpApiCtx")
          .sthis.logger.Debug()
          .TimerEnd(`api-request-${ctx.id}`)
          .Any({ stats: ctx.stats })
          .Msg("API Request ended");
      },
    },
    createLedgerItem,
    createTenantItem,
    deleteLedgerItem,
    deleteInviteItem,
    deleteTenantItem,
    ensureCloudTokenItem,
    ensureUserItem,
    findUserItem,
    getCertFromCsrItem,
    getCloudSessionTokenItem,
    getTokenByResultIdItem,
    inviteUserItem,
    listInvitesItem,
    listLedgersByUserItem,
    listTenantsByUserItem,
    redeemInviteItem,
    updateLedgerItem,
    updateTenantItem,
    updateUserTenantItem,
    {
      type: EventoType.WildCard,
      hash: "not-found-handler",
      handle: async (ctx) => {
        await ctx.send.send(ctx, {
          type: "Response",
          payload: {
            status: 501,
            headers: DefaultHttpHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ type: "error", message: "Not Found", req: ctx.enRequest }),
          },
        } satisfies ResponseType);
        return Result.Ok(EventoResult.Continue);
      },
    },
    {
      type: EventoType.Error,
      hash: "error-handler",
      handle: async (ctx) => {
        await ctx.send.send(ctx, {
          type: "Response",
          payload: {
            status: 500,
            headers: DefaultHttpHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ type: "error", message: "Internal Server Error", error: ctx.error?.toString() }),
          },
        } satisfies ResponseType);
        return Result.Ok(EventoResult.Continue);
      },
    },
  );
  return evento;
});

class SendResponseProvider implements EventoSendProvider<Request, unknown, unknown> {
  response?: Response;
  getResponse(): Response {
    if (!this.response) {
      this.response = new Response(JSON.stringify({ type: "error", message: "Response not set" }), {
        status: 500,
        headers: DefaultHttpHeaders({ "Content-Type": "application/json" }),
      });
    }
    const res = this.response;
    this.response = undefined;
    return res;
  }
  async send<T>(ctx: HandleTriggerCtx<Request, unknown, unknown>, res: unknown): Promise<Result<T>> {
    // noop, handled in createHandler
    if (this.response) {
      return Result.Err("response could only be set once");
    }
    if (isResponseType(res)) {
      this.response = new Response(res.payload.body, {
        status: res.payload.status,
        headers: res.payload.headers,
      });
      return Result.Ok();
    }
    // need to set src / transactionId ... the optionals to real
    const defaultRes = { ...(res as object) };
    return ctx.encoder.decode(res).then((rStr) => {
      if (rStr.isErr()) {
        const x = { type: "error", message: "Failed to decode response", error: rStr.Err() };
        this.response = new Response(JSON.stringify(x), {
          status: 500,
          headers: DefaultHttpHeaders({ "Content-Type": "application/json" }),
        });
        return Result.Err(rStr.Err());
      }
      this.response = new Response(rStr.Ok() as string, {
        status: 200,
        headers: DefaultHttpHeaders({
          "Content-Type": "application/json",
          "Server-Timing": `total;dur=${(ctx.stats.request.doneTime.getTime() - ctx.stats.request.startTime.getTime()).toFixed(2)}`,
        }),
      });
      return Result.Ok(defaultRes as T);
    });
  }
}

// BaseSQLiteDatabase<'async', ResultSet, TSchema>
export async function createHandler<T extends DashSqlite>(db: T, env: Record<string, string> | Env) {
  // const stream = new utils.ConsoleWriterStream();
  const sthis = ensureSuperThis({
    logger: new LoggerImpl(),
  } as unknown as SuperThisOpts);
  // try {
  //   if (import.meta && import.meta.env) {
  //     sthis.env.sets(import.meta.env as unknown as Record<string, string>);
  //   }
  // } catch (e) {
  //   sthis.logger.Error().Err(e).Msg("Error setting import.meta.env");
  // }
  sthis.env.sets(env as unknown as Record<string, string>);
  const rEnvVals = sthis.env.gets({
    CLOUD_SESSION_TOKEN_PUBLIC: param.REQUIRED,
    CLERK_PUBLISHABLE_KEY: param.REQUIRED,
    DEVICE_ID_CA_PRIV_KEY: param.REQUIRED,
    DEVICE_ID_CA_CERT: param.REQUIRED,
  });
  if (rEnvVals.isErr()) {
    throw rEnvVals.Err();
  }
  const envVals = rEnvVals.Ok();

  const rCloudPublicKey = await getCloudPubkeyFromEnv(envVals.CLOUD_SESSION_TOKEN_PUBLIC, sthis);
  if (rCloudPublicKey.isErr()) {
    throw rCloudPublicKey.Err();
  }

  const rDeviceIdCA = await deviceIdCAFromEnv(sthis);
  if (rDeviceIdCA.isErr()) {
    throw rDeviceIdCA.Err();
  }

  const svcParams: FPApiParameters = {
    cloudPublicKeys: rCloudPublicKey.Ok().keys,
    clerkPublishableKey: envVals.CLERK_PUBLISHABLE_KEY,
    maxTenants: coerceInt(env.MAX_TENANTS, 10),
    maxAdminUsers: coerceInt(env.MAX_ADMIN_USERS, 5),
    maxMemberUsers: coerceInt(env.MAX_MEMBER_USERS, 5),
    maxInvites: coerceInt(env.MAX_INVITES, 10),
    maxLedgers: coerceInt(env.MAX_LEDGERS, 5),
    maxAppIdBindings: coerceInt(env.MAX_APPID_BINDINGS, 10),
  };
  sthis.env.onSet((k, v) => {
    // console.log(`Env set: ${k}=${v}`);
    switch (k) {
      case "MAX_TENANTS":
        svcParams.maxTenants = coerceInt(v, 10);
        break;
      case "MAX_ADMIN_USERS":
        svcParams.maxAdminUsers = coerceInt(v, 10);
        break;
      case "MAX_MEMBER_USERS":
        svcParams.maxMemberUsers = coerceInt(v, 10);
        break;
      case "MAX_INVITES":
        svcParams.maxInvites = coerceInt(v, 10);
        break;
      case "MAX_LEDGERS":
        svcParams.maxLedgers = coerceInt(v, 10);
        break;
      case "MAX_APPID_BINDINGS":
        svcParams.maxAppIdBindings = coerceInt(v, 10);
        break;
      default:
        return;
    }
  });

  const fpApiCtx = new AppContext().set(
    "fpApiCtx",
    createFPApiSQLCtx(
      sthis,
      db,
      await tokenApi(sthis, {
        clockTolerance: 60,
        deviceIdCA: rDeviceIdCA.Ok(),
      }),
      rDeviceIdCA.Ok(),
      svcParams,
    ),
  );
  const evento = fpApiEvento();
  const send = new SendResponseProvider();
  return async (req: Request, bindPromise: BindPromise<Result<unknown>> = (p) => p): Promise<Response> => {
    // const startTime = performance.now();
    // if (req.method === "OPTIONS") {
    //   return new Response("ok", {
    //     status: 200,
    //     headers: DefaultHttpHeaders({ "Content-Type": "application/json" }),
    //   });
    // }

    // const rJso = await exception2Result(async () => await req.json());
    // if (rJso.isErr()) {
    //   logger.Error().Err(rJso.Err()).Msg("createhandler-Error");
    //   return new Response("Invalid request", { status: 404, headers: DefaultHttpHeaders() });
    // }
    // const jso = rJso.Ok();
    const rTrigger = await bindPromise(
      evento.trigger({
        ctx: fpApiCtx,
        send,
        request: req,
      }),
    );
    if (rTrigger.isErr()) {
      fpApiCtx.getOrThrow<FPApiSQLCtx>("fpApiCtx").logger.Error().Err(rTrigger).Msg("createhandler-Error");
      return new Response(
        JSON.stringify({
          type: "error",
          message: rTrigger.Err().message,
        }),
        {
          status: 500,
          headers: DefaultHttpHeaders({
            "Content-Type": "application/json",
          }),
        },
      );
    }
    return send.getResponse();
  };
}
