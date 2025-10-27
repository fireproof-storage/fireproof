import { Logger, CoerceURI, URI, AppContext, Result } from "@adviser/cement";
import { Attachable, SuperThis } from "@fireproof/core-types-base";
import { FPCloudClaim } from "./msg-types.zod.js";

export interface ToCloudAttachable extends Attachable {
  token?: string;
  readonly opts: ToCloudOpts;
}

export interface TokenAndClaims {
  readonly token: string;
  readonly claims: FPCloudClaim;
  //   readonly exp: number;
  //   readonly tenant?: string;
  //   readonly ledger?: string;
  // };
}

export interface TokenStrategie {
  hash(): string;
  open(sthis: SuperThis, logger: Logger, localDbName: string, opts: ToCloudOpts): void;
  // tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
  waitForToken(sthis: SuperThis, logger: Logger, localDbName: string, opts: ToCloudOpts): Promise<Result<TokenAndClaims>>;
  stop(): void;
}

export const ToCloudName = "toCloud";

export interface FPCloudRef {
  readonly base: CoerceURI;
  readonly car: CoerceURI;
  readonly file: CoerceURI;
  readonly meta: CoerceURI;
}

export function hashableFPCloudRef(ref?: Partial<FPCloudRef>): { base?: string; car?: string; file?: string; meta?: string } {
  // this is not completed --- it's missed the base -> expension to car, file, meta
  // there might be a possibily that to arrays result into the same hash
  // like:
  // { base: http://a.com }
  // {
  //  car: http://a.com/car
  //  file: http://a.com/file
  //  meta: http://a.com/meta
  // } this expension happens during later runtime
  // i ignore that for now
  if (!ref) {
    return {};
  }
  const keys: (keyof FPCloudRef)[] = ["base", "car", "file", "meta"];
  return Object.fromEntries(keys.filter((k) => ref[k]).map((k) => [k, URI.from(ref[k]).toString()]));
}

export interface TokenAndClaimsEvents {
  hash(): string;
  changed(token?: TokenAndClaims): Promise<void>;
}

export interface ToCloudRequiredOpts {
  readonly urls: Partial<FPCloudRef>;
  readonly strategy: TokenStrategie;
  // readonly events: TokenAndClaimsEvents;
  // readonly context: AppContext;
  // readonly context: AppContext;
}

export interface ToCloudBase {
  readonly sthis: SuperThis;
  readonly name: string; // default "toCloud"
  readonly intervalSec: number; // default 1 second
  readonly tokenWaitTimeSec: number; // default 90 seconds
  readonly refreshTokenPresetSec: number; // default 120 sec this is the time before the token expires
  readonly context: AppContext;
  readonly events: TokenAndClaimsEvents;
  readonly tenant?: string; // default undefined
  readonly ledger?: string; // default undefined
}

export type ToCloudOpts = ToCloudRequiredOpts & ToCloudBase;

export type ToCloudOptionalOpts = Partial<ToCloudBase> & Partial<ToCloudRequiredOpts>;

export interface FPCloudUri {
  readonly car: URI;
  readonly file: URI;
  readonly meta: URI;
}
