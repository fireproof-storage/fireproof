import { Logger, CoerceURI, URI, AppContext } from "@adviser/cement";
import { Attachable, SuperThis } from "@fireproof/core-types-base";
import { FPCloudClaim } from "./msg-types.js";

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
  open(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): void;
  tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
  waitForToken(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
  stop(): void;
}

export const ToCloudName = "toCloud";

export interface FPCloudRef {
  readonly base: CoerceURI;
  readonly car: CoerceURI;
  readonly file: CoerceURI;
  readonly meta: CoerceURI;
}

export interface TokenAndClaimsEvents {
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
