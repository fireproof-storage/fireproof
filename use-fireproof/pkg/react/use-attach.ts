/// <reference lib="dom" />

import { useEffect, useState } from "react";
import { AttachState as AttachHook, UseFPConfig, WebCtxHook, WebToCloudCtx } from "./types.js";
import { AppContext, exception2Result, KeyedResolvOnce } from "@adviser/cement";
import { Database } from "@fireproof/core-types-base";
import { ToCloudAttachable, ToCloudOptionalOpts, TokenStrategie } from "@fireproof/core-types-protocols-cloud";

export const WebCtx = "webCtx";

export type ToCloudParam = Omit<ToCloudOptionalOpts, "strategy"> &
  Partial<WebToCloudCtx> & {
    readonly strategy?: TokenStrategie;
    readonly context?: AppContext;
    readonly webCtx: WebToCloudCtx;
  };

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
          prepareWebctx(database, config.attach, setAttachState);
        }
      });
    });
  }, [database, config.attach, attachState.state]);

  return attachState;
}

async function prepareWebctx(
  database: Database,
  attachable: ToCloudAttachable,
  setAttachState: React.Dispatch<React.SetStateAction<AttachHook>>,
) {
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
