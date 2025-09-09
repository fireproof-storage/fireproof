/// <reference lib="dom" />

import { useEffect, useState } from "react";
import { AttachState as AttachHook, UseFPConfig, WebCtxHook, WebToCloudCtx } from "./types.js";
import { AppContext, BuildURI, exception2Result, KeyedResolvOnce, ResolveOnce } from "@adviser/cement";
import { decodeJwt } from "jose/jwt/decode";
import { SuperThis, Database, KeyBagIf } from "@fireproof/core-types-base";
import { ensureSuperThis } from "@fireproof/core-runtime";
import {
  FPCloudClaim,
  ToCloudAttachable,
  ToCloudOptionalOpts,
  TokenAndClaims,
  TokenStrategie,
} from "@fireproof/core-types-protocols-cloud";
import { getKeyBag } from "@fireproof/core-keybag";

export const WebCtx = "webCtx";

export type ToCloudParam = Omit<ToCloudOptionalOpts, "strategy"> &
  Partial<WebToCloudCtx> & { readonly strategy?: TokenStrategie; readonly context?: AppContext };

class WebCtxImpl implements WebToCloudCtx {
  readonly onActions = new Set<(token?: TokenAndClaims) => void>();
  readonly dashboardURI: string;
  readonly tokenApiURI: string;
  // readonly uiURI: string;
  readonly tokenParam: string;
  // if not provided set in ready
  keyBag?: KeyBagIf;
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
    this.keyBag = opts.keyBag; // ?? kb.getKeyBag(ensureSuperThis());

    // if (opts.keyBag) {
    //   this.keyBag = opts.keyBag;
    // } else {
    //   const sthis = opts.sthis ?? ensureSuperThis();
    //   this.keyBag = kb.getKeyBag(sthis)
    // }
    this.opts = opts;
  }

  async ready(db: Database): Promise<void> {
    this.dbId = db.ledger.refId();
    this.keyBag = this.keyBag ?? (await getKeyBag(this.sthis));
  }

  async onAction(token?: TokenAndClaims) {
    for (const action of this.onActions.values()) {
      action(token);
    }
  }

  onTokenChange(on: (token?: TokenAndClaims) => void) {
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

  readonly _tokenAndClaims = new ResolveOnce<TokenAndClaims | undefined>();

  async token() {
    if (this.opts.token) {
      return this.opts.token();
    }
    const tc = await this._tokenAndClaims.once(async () => {
      const ret = await this.keyBag?.getJwt(`${this.dbId}/urlToken`);
      if (!ret || ret.Err()) {
        return;
      }
      const key = ret.Ok();
      const token = key.jwt;
      const claims = decodeJwt(token) as FPCloudClaim;
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
    await this.keyBag?.delete(`${this.dbId}/urlToken`);
    this.onAction();
  }

  async setToken(token: TokenAndClaims) {
    if (this.opts.setToken) {
      return this.opts.setToken(token);
    }
    const oldToken = await this.token();
    if (oldToken?.token !== token.token) {
      this._tokenAndClaims.reset();
      this._tokenAndClaims.once(() => token);
      await this.keyBag?.setJwt(`${this.dbId}/urlToken`, token.token);
      this.onAction(token);
    }
  }
}

// export type WebToCloudOpts = WebToCloudCtx & { readonly strategy?: TokenStrategie }

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
    prepareWebctxs.get(database.ledger.refId()).once(() => {
      if (config.attach && attachState.state === "initial") {
        // const id = database.sthis.nextId().str;
        setAttachState((prev) => ({ ...prev, state: "attaching" }));

        async function prepareWebctx(attachable: ToCloudAttachable) {
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
          } else {
            const attached = rAttached.Ok();
            setAttachState((prev) => ({
              ...prev,
              state: "attached",
              attached,
            }));
          }
        }
        prepareWebctx(config.attach);
      }
    });
  }, [database, config.attach, attachState.state]);

  return attachState;
}
