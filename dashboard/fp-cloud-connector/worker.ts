/**
 * Web Worker that handles messages from the main thread
 */

import { ensureSuperThis } from "@fireproof/core-runtime";
import { createWorkerMessager } from "./worker-messager.js";
import { Lazy } from "@adviser/cement";

const workerMessager = Lazy(() => {
  const sthis = ensureSuperThis();
  const wm = createWorkerMessager(sthis, {
    onMessage: function (data: unknown, event: MessageEvent<unknown>): void {
      wm.logger.Info().Any("data", data).Msg("Received message from main thread");

      // Echo back a response
      wm.postMessage({
        type: 'ack',
        received: data,
        timestamp: Date.now()
      });
    }
  });
  wm.logger.Info().Msg("WorkerMessager created");

  // Send ready message to main thread
  wm.postMessage({
    type: 'ready',
    message: 'Worker is ready',
    timestamp: Date.now()
  });

  return wm;
});

workerMessager();

export { workerMessager };
