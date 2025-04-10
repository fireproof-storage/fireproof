/// <reference lib="dom" />

import { falsyToUndef, Database } from "@fireproof/core";
import { AttachState, UseFPConfig, WebToCloudCtx } from "./types.js";
import { useEffect, useState } from "react";

export const WebCtx = "webCtx";

class WebCtxImpl implements WebToCloudCtx {
  readonly dashboardURI: string;
  readonly uiURI: string;
  readonly tokenKey: string;

  private opts: Partial<WebToCloudCtx>;

  constructor(opts: Partial<WebToCloudCtx>) {
    this.dashboardURI = opts.dashboardURI || "https://dev.connect.fireproof.direct/fp/cloud/api/token";
    this.uiURI = opts.uiURI || "https://dev.connect.fireproof.direct/api";
    this.tokenKey = opts.tokenKey || "fpToken";
    this.opts = opts;
  }

  onAction?: (token?: string) => void;

  onTokenChange(on: (token?: string) => void) {
    if (this.opts.onTokenChange) {
      return this.opts.onTokenChange(on);
    }
    this.onAction = on;
  }
  token() {
    if (this.opts.token) {
      return this.opts.token();
    }
    return falsyToUndef(localStorage.getItem(this.tokenKey));
  }
  resetToken() {
    if (this.opts.resetToken) {
      this.opts.resetToken();
    } else {
      localStorage.removeItem(this.tokenKey);
    }
    this.onAction?.(undefined);
  }
  setToken(token: string): void {
    const oldToken = this.token();
    if (this.opts.setToken) {
      this.opts.setToken(token);
    } else {
      localStorage.setItem(this.tokenKey, token);
    }
    if (oldToken !== token) {
      this.onAction?.(token);
    }
  }
}

export function defaultWebToCloudOpts(opts: Partial<WebToCloudCtx>): WebToCloudCtx {
  return new WebCtxImpl(opts);
}

export function createAttach(database: Database, config: UseFPConfig): AttachState {
  const [attachState, setAttachState] = useState<AttachState>({ state: "initial" });
  useEffect(() => {
    if (config.attach && attachState.state === "initial") {
      setAttachState({ state: "attaching" });
      database
        .attach(config.attach)
        .then((a) => {
          a
            .ctx()
            .get<WebToCloudCtx>(WebCtx)
            ?.onTokenChange((token) => {
              console.log("Token changed", token);
              if (!token) {
                setAttachState({ state: "initial" });
                return;
              }
            });
          setAttachState({ state: "attached", attached: a });
        })
        .catch((err) => {
          database.logger.Error().Err(err).Msg("attach error");
          setAttachState({ state: "error", error: err });
        });
    }
  }, [database, config.attach, attachState]);
  return attachState;
}
