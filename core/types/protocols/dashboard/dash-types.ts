import { Result } from "@adviser/cement";
import { DashAuthType } from "./msg-types.js";

export interface TypeString {
  readonly type: string;
}

export interface WithType<T extends TypeString> {
  readonly type: T["type"];
  readonly auth?: DashAuthType;
}

export type WithoutTypeAndAuth<T> = Omit<T, "type" | "auth">;

export interface ClerkDashboardApiConfig<T> {
  readonly apiUrl: string;
  readonly getTokenCtx?: T;
  readonly template?: string; // if not provided default to "with-email"
  readonly gracePeriodMs?: number; // if not provided default to 5 seconds
  fetch?(input: RequestInfo, init?: RequestInit): Promise<Response>;
}
export interface DashboardApiConfigIntern<T> {
  readonly apiUrl: string;
  readonly getTokenCtx?: T;
  readonly gracePeriodMs: number; // if not provided default to 5 seconds
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
  getToken: (ctx: never) => Promise<Result<DashAuthType>>;
}

export interface DashboardApiConfig<T> extends Omit<DashboardApiConfigIntern<T>, "gracePeriodMs"> {
  readonly gracePeriodMs?: number; // if not provided default to 5 seconds
}
