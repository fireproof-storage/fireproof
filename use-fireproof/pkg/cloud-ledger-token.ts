import { BuildURI, ResolveOnce } from "@adviser/cement";
import { isV1StorageKeyItem, isKeysItem } from "@fireproof/core-keybag";
import { ensureSuperThis, hashString } from "@fireproof/core-runtime";
import { KeyBagProvider, SuperThis, Database } from "@fireproof/core-types-base";
import { TokenAndClaims, FPUserToken } from "@fireproof/core-types-protocols-cloud";
import { decodeJwt } from "jose";
import { WebToCloudCtx } from "./react/types.js";
import { ToCloudParam } from "./react/use-attach.js";

class WebCtxImpl implements WebToCloudCtx {
  readonly onActions = new Set<(token?: TokenAndClaims) => void>();
  readonly dashboardURI: string;
  readonly tokenApiURI: string;
  // readonly uiURI: string;
  readonly tokenParam: string;
  // if not provided set in ready
  keyBag?: KeyBagProvider;
  readonly sthis: SuperThis;

  dbId!: string;

  private opts: ToCloudParam;
  // readonly myTokenChange = new ResolveOnce();

  constructor(opts: Omit<ToCloudParam, "webCtx">) {
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
    this.dbId = await db.ledger.refId();
    this.keyBag = this.keyBag ?? (await db.ledger.opts.keyBag.getBagProvider());
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

  readonly _tokenAndClaims = new ResolveOnce<TokenAndClaims>();

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
      if (isV1StorageKeyItem(ret)) {
        token = ret.key;
      } else if (isKeysItem(ret)) {
        token = ret.keys[this.tokenParam].key;
      } else {
        return undefined;
      }
      const claims = decodeJwt(token) as FPUserToken;
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

  async setToken(token: TokenAndClaims) {
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

// export type WebToCloudOpts = WebToCloudCtx & { readonly strategy?: TokenStrategie }

export function defaultWebToCloudOpts(opts: Omit<ToCloudParam, "webCtx">): WebToCloudCtx {
  return new WebCtxImpl(opts);
}
