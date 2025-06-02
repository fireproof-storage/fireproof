/// <reference lib="dom" />

import { Database, ensureSuperThis, hashString, rt, SuperThis, ps } from "@fireproof/core";
import { useEffect, useState } from "react";
import { AttachState as AttachHook, UseFPConfig, WebCtxHook, WebToCloudCtx } from "./types.js";
import { AppContext, BuildURI, exception2Result, KeyedResolvOnce, ResolveOnce } from "@adviser/cement";
import { decodeJwt } from "jose/jwt/decode";

export const WebCtx = "webCtx";

export type ToCloudParam = Omit<rt.gw.cloud.ToCloudOptionalOpts, "strategy"> &
  Partial<WebToCloudCtx> & { readonly strategy?: rt.gw.cloud.TokenStrategie; readonly context?: AppContext };

class WebCtxImpl implements WebToCloudCtx {
  readonly onActions = new Set<(token?: rt.gw.cloud.TokenAndClaims) => void>();
  readonly dashboardURI: string;
  readonly tokenApiURI: string;
  // readonly uiURI: string;
  readonly tokenParam: string;
  // if not provided set in ready
  keyBag?: rt.KeyBagProvider;
  readonly sthis: SuperThis;

  dbId!: string;

  private opts: ToCloudParam;
  // readonly myTokenChange = new ResolveOnce();

  constructor(opts: ToCloudParam) {
    this.dashboardURI = opts.dashboardURI ?? "https://dev.connect.fireproof.direct/fp/cloud/api/token";
    if (!opts.tokenApiURI) {
      this.tokenApiURI = BuildURI.from(this.dashboardURI).pathname("/api").toString();
    } else {
      this.tokenApiURI = opts.tokenApiURI;
    }
    // this.uiURI = opts.uiURI ?? "https://dev.connect.fireproof.direct/api";
    this.tokenParam = opts.tokenParam ?? "fpToken";

    this.sthis = opts.sthis ?? ensureSuperThis();
    this.keyBag = opts.keyBag; // ?? rt.kb.getKeyBag(ensureSuperThis());
    // if (opts.keyBag) {
    //   this.keyBag = opts.keyBag;
    // } else {
    //   const sthis = opts.sthis ?? ensureSuperThis();
    //   this.keyBag = rt.kb.getKeyBag(sthis)
    // }
    this.opts = opts;
  }

  async ready(db: Database): Promise<void> {
    this.dbId = await db.ledger.refId();
    this.keyBag = this.keyBag ?? (await db.ledger.opts.keyBag.getBagProvider());
  }

  async onAction(token?: rt.gw.cloud.TokenAndClaims) {
    for (const action of this.onActions.values()) {
      action(token);
    }
  }

  onTokenChange(on: (token?: rt.gw.cloud.TokenAndClaims) => void) {
    if (this.opts.onTokenChange) {
      return this.opts.onTokenChange(on);
    }
    this.onActions.add(on);
    const tc = this._tokenAndClaims.value;
    if (tc) {
      on(tc);
    }
    return () => {
      this.onActions.delete(on);
    };
  }

  readonly _tokenAndClaims = new ResolveOnce<rt.gw.cloud.TokenAndClaims>();

  async token() {
    if (this.opts.token) {
      return this.opts.token();
    }
    const tc = await this._tokenAndClaims.once(async () => {
      const ret = await this.keyBag?.get(`${this.dbId}/urlToken`);
      if (!ret) {
        return;
      }
      let token: string;
      if (rt.isV1StorageKeyItem(ret)) {
        token = ret.key;
      } else if (rt.isKeysItem(ret)) {
        token = ret.keys[this.tokenParam].key;
      } else {
        return undefined;
      }
      const claims = decodeJwt(token) as ps.cloud.FPCloudClaim;
      return {
        token,
        claims,
      };
    });
    if (tc) {
      this.onAction(tc);
    }
    return tc;
  }

  async resetToken() {
    if (this.opts.resetToken) {
      return this.opts.resetToken();
    }
    this._tokenAndClaims.reset();
    await this.keyBag?.del(`${this.dbId}/urlToken`);
    this.onAction();
  }

  async setToken(token: rt.gw.cloud.TokenAndClaims) {
    if (this.opts.setToken) {
      return this.opts.setToken(token);
    }
    const oldToken = await this.token();
    if (oldToken?.token !== token.token) {
      this._tokenAndClaims.reset();
      // set
      this._tokenAndClaims.once(() => token);
      await this.keyBag?.set({
        name: `${this.dbId}/urlToken`,
        keys: {
          [this.tokenParam]: {
            key: token.token,
            fingerPrint: await hashString(token.token),
            default: false,
          },
        },
      });
      this.onAction(token);
    }
  }
}

// export type WebToCloudOpts = WebToCloudCtx & { readonly strategy?: rt.gw.cloud.TokenStrategie }

export function defaultWebToCloudOpts(opts: ToCloudParam): WebToCloudCtx {
  return new WebCtxImpl(opts);
}

const initialCtx = {
  tokenAndClaims: { state: "initial" },
} satisfies WebCtxHook;

const prepareWebctxs = new KeyedResolvOnce();

export function createAttach(database: Database, config: UseFPConfig): AttachHook {
  const [attachState, setAttachState] = useState<AttachHook>({ state: "initial", ctx: initialCtx });

  useEffect(() => {
    database.ledger.refId().then((dbId) => {
      prepareWebctxs.get(dbId).once(() => {
        if (config.attach && attachState.state === "initial") {
          // const id = database.sthis.nextId().str;
          setAttachState((prev) => ({ ...prev, state: "attaching" }));

          async function prepareWebctx(attachable: rt.gw.cloud.ToCloudAttachable) {
            const webCtx = attachable.opts.context.get<WebToCloudCtx>(WebCtx);
            if (!webCtx) {
              throw database.logger.Error().Msg("WebCtx not found").AsError();
            }
            await webCtx.ready(database); // start keybag
            webCtx.onTokenChange((token) => {
              if (!token) {
                setAttachState((prev) => ({ ...prev, state: "initial", ctx: initialCtx }));
                return;
              }
              setAttachState((prev) => ({
                ...prev,
                ctx: {
                  ...prev.ctx,
                  tokenAndClaims: {
                    state: "ready",
                    tokenAndClaims: token,
                    reset: () => {
                      webCtx.resetToken().then(() =>
                        setAttachState((prev) => ({
                          ...prev,
                          state: "initial",
                          ctx: initialCtx,
                        })),
                      );
                      // setDoResetToken(true);
                    },
                  },
                },
              }));
            });
            const rAttached = await exception2Result(async () => {
              const ret = await database.attach(attachable);
              return ret;
            });
            if (rAttached.isErr()) {
              database.logger.Error().Err(rAttached).Msg("attach error");
              setAttachState((prev) => ({ ...prev, state: "error", error: rAttached.Err() }));
            }
            const attached = rAttached.Ok();

            setAttachState((prev) => ({
              ...prev,
              state: "attached",
              attached,
            }));
          }
          prepareWebctx(config.attach);
        }
      });
    });
  }, [database, config.attach, attachState.state]);

  return attachState;
}
