/*
 * this context handles the user token
 */

import { URI, KeyedResolvOnce, ResolveOnce, Result, Option, Lazy, CoerceURI, Logger, BuildURI } from "@adviser/cement";
import { ensureLogger, syncHashObject } from "@fireproof/core-runtime";
import { SuperThis, Database, KeyBagIf } from "@fireproof/core-types-base";
import { FPUserToken, TokenAndClaims, FPUserTokenSchema } from "@fireproof/core-types-protocols-cloud";
import { decodeJwt } from "jose";
import { WebToCloudCtx } from "./react/types.js";

interface UserTokenParams {
  readonly sthis: SuperThis;
  readonly urls: {
    readonly base: CoerceURI;
    readonly loginUserURI: CoerceURI; // default "${base}/fp/cloud/api/token"
    readonly dashApiURI: CoerceURI; // default "${base}/api"
  }; // point to the Dashboard which will be opened by iframe or redirect .....
  readonly refreshTokenPresetSec?: number; // default 120 sec this is the time before the token expires
  readonly keyBag?: KeyBagIf;
  // readonly events: TokenAndClaimsEvents;
  readonly webCtx: WebToCloudCtx;
}

const webUserToken = new KeyedResolvOnce<UserToken>();

interface UserToken {
  readonly jwt: string;
  readonly claims: FPUserToken;
}

function defaultUrls(logger: Logger, opts: UserTokenParams["urls"]) {
  let loginUserURI: URI | undefined = undefined;
  if (opts.loginUserURI) {
    loginUserURI = URI.from(opts.loginUserURI);
  }
  let dashApiURI: URI | undefined = undefined;
  if (opts.dashApiURI) {
    dashApiURI = URI.from(opts.dashApiURI);
  }
  if (loginUserURI && dashApiURI) {
    return {
      loginUserURI,
      dashApiURI,
    };
  }
  if (opts.base) {
    throw logger.Error().Msg("base is required").AsError();
  }
  if (!loginUserURI) {
    loginUserURI = BuildURI.from(opts.base).pathname("/fp/cloud/api/token").URI();
  }
  if (!dashApiURI) {
    dashApiURI = BuildURI.from(opts.base).pathname("/api").URI();
  }
  return {
    loginUserURI,
    dashApiURI,
  };
}

class UserTokenImpl implements WebToCloudCtx {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly onActions = new Set<(token?: TokenAndClaims) => void>();
  readonly userToken = new ResolveOnce<UserToken>();
  keyBag!: KeyBagIf;
  readonly webCtx: WebToCloudCtx;
  dbId!: string;

  readonly urls: { readonly loginUserURI: URI; readonly dashApiURI: URI };
  readonly refreshTokenPresetSec: number;
  tokenParam: string;

  static getInstance(opts: UserTokenParams): UserTokenImpl {
    return webUserToken.get(syncHashObject(opts)).once(() => new UserTokenImpl(opts));
  }

  private constructor(opts: UserTokenParams) {
    this.webCtx = opts.webCtx;
    this.sthis = opts.sthis;
    this.logger = ensureLogger(opts.sthis, `UserToken:[${opts.urls.loginUserURI}]`);
    this.urls = defaultUrls(this.logger, opts.urls);
    this.refreshTokenPresetSec = opts.refreshTokenPresetSec ?? 120;
  }

  async ready(db: Database): Promise<void> {
    this.keyBag = await db.ledger.crdt.blockstore.loader.keyBag();
    this.dbId = await db.ledger.refId();
  }

  async onAction(token?: TokenAndClaims) {
    for (const action of this.onActions.values()) {
      action(token);
    }
  }

  onTokenChange(on: (token?: TokenAndClaims) => void) {
    if (this.webCtx.onTokenChange) {
      return this.webCtx.onTokenChange(on);
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

  readonly keyName = Lazy(() => {
    return `${syncHashObject(this.urls)}@userToken`;
  });

  async token(): Promise<Option<TokenAndClaims>> {
    if (typeof this.webCtx.token === "function") {
      return this.webCtx.token();
    }
    const tc = await this._tokenAndClaims.once(async () => {
      const res = await this.keyBag.getNamedKey(await this.keyName(), true);
      if (res.Err()) {
        // not found
        return;
      }
      const defKey = await res.Ok().get();
      if (!defKey) {
        return;
      }
      const jwtBin = (await defKey.extract()).key;
      const jwtStr = this.sthis.txt.decode(jwtBin);
      try {
        const claims = decodeJwt(jwtStr);
        const ps = FPUserTokenSchema.safeParse(claims);
        if (!ps.success) {
          this.sthis.logger
            .Error()
            .Err(ps.error)
            .Any({
              claims,
              jwtStr,
            })
            .Msg("Invalid JWT");
          return;
        }
        await this.setTokenNoLock(
          {
            token: jwtStr,
            claims: ps.data,
          },
          Option.None(),
        );
        return {
          token: jwtStr,
          claims: ps.data,
        };
      } catch (e) {
        this.sthis.logger
          .Error()
          .Err(e)
          .Any({
            jwtStr,
          })
          .Msg("Invalid JWT");
        return;
      }
    });

    const now = Date.now();
    if (tc && (!tc.claims.exp || tc.claims.exp * 1000 <= now - this.webCtx.refreshTokenPresetSec)) {
      this._tokenAndClaims.reset();
      return this.token();
    }
    if (tc) {
      this.onAction(tc);
    }
    return Option.From(tc);
  }

  async resetToken() {
    if (this.webCtx.resetToken) {
      return this.webCtx.resetToken();
    }
    this._tokenAndClaims.reset();
    await this.keyBag.del(await this.keyName());
    this.onAction();
  }

  async setToken(token: TokenAndClaims) {
    if (this.webCtx.setToken) {
      return this.webCtx.setToken(token);
    }
    const oldToken = await this.token();
    this._tokenAndClaims.reset();
    await this._tokenAndClaims.once(() => this.setTokenNoLock(token, oldToken));
  }

  private async setTokenNoLock(token: TokenAndClaims, oldToken: Option<TokenAndClaims>) {
    if (oldToken.IsNone() || (oldToken.IsSome() && oldToken.unwrap().token !== token.token)) {
      await this.keyBag.del(await this.keyName());
      await this.keyBag.getNamedKey(await this.keyName(), true, this.sthis.txt.encode(token.token));
    }
    this.onAction(token);
    return token;
  }

  async getUserToken(): Promise<Result<UserToken>> {
    const uToken = await this.userToken.once(() => {
      return fetch(this.userLoginURI.toString(), {
        method: "POST",
        mode: "cors",
        credentials: "include",
      })
        .then((res) => {
          if (!res.ok) {
            return Result.Err<UserToken>(`HTTP: ${res.status} ${res.statusText}`);
          }
          return res.json();
        })
        .then((json) => {
          const jwtStr = (json as { token: string }).token as string;
          const jwt = decodeJwt(jwtStr);
          const sp = FPUserTokenSchema.safeParse(jwt);
          if (!sp.success) {
            return Result.Err<UserToken>(sp.error);
          }
          return Result.Ok<UserToken>({
            jwt: jwtStr,
            claims: sp.data,
          } as UserToken);
        })
        .catch((e) => Result.Err<UserToken>(e));
    });
    if (uToken.isErr()) {
      return Result.Err(uToken);
    }
    const claims = uToken.Ok().claims;
    const now = Date.now();
    const exp = cl;
    return uToken;
  }
}
