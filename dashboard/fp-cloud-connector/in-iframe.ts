import { ensureSuperThis } from "@fireproof/core-runtime";
import { createPostMessager, MessageEvent  } from "./post-messager.js";
import { Lazy } from "@adviser/cement";

const postMessager = Lazy(() => {
    const sthis = ensureSuperThis()
    const pm = createPostMessager(sthis,{
        onMessage: function (_data: unknown, event: MessageEvent<unknown>): void {
            // throw new Error("Function not implemented.");
            pm.logger.Info().Any("event", event).Msg("Received message")
        }
    })
    pm.logger.Info().Msg("PostMessager created")
    return pm
})

postMessager()
