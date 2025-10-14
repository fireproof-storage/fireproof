/**
 * WorkerMessager - Web Worker compatible message handler
 */

import { Logger } from "@adviser/cement";
import { ensureLogger } from "@fireproof/core-runtime";
import { SuperThis } from "use-fireproof";

export interface WorkerMessageEvent<T> {
  data: T;
}

export interface WorkerMessagerConfig<T> {
  /**
   * Handler function called when a valid message is received
   */
  onMessage: (data: T, event: MessageEvent<T>) => void;

  /**
   * Optional error handler
   */
  onError?: (error: Error, event: MessageEvent<T>) => void;

  /**
   * Optional validator function to validate message data structure
   */
  validator?: (data: unknown) => data is T;
}

export class WorkerMessager<T> {
  private config: WorkerMessagerConfig<T>;
  private listener: ((event: MessageEvent<T>) => void) | null = null;
  readonly logger: Logger;
  readonly id: string;

  constructor(sthis: SuperThis, config: WorkerMessagerConfig<T>) {
    this.config = config;
    this.id = sthis.nextId().str;
    this.logger = ensureLogger(sthis, 'WorkerMessager').With().Str("Id", this.id).Logger();
  }

  /**
   * Start listening for postMessage events from the worker context
   */
  start(): void {
    if (this.listener) {
      this.logger.Warn().Msg('WorkerMessager is already listening');
      return;
    }

    this.listener = (event: MessageEvent<T>) => {
      try {
        // Validate data structure if validator is provided
        if (this.config.validator && !this.config.validator(event.data)) {
          this.logger.Warn().Any('data', event.data).Msg('Message data failed validation');
          return;
        }

        // Call the message handler
        this.config.onMessage(event.data, event);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (this.config.onError) {
          this.config.onError(err, event);
        } else {
          this.logger.Error().Err(err).Msg('Error handling message');
        }
      }
    };

    // In a Web Worker, listen on self instead of window
    self.addEventListener('message', this.listener as EventListener);
    this.logger.Info().Msg('WorkerMessager started listening');
  }

  /**
   * Stop listening for postMessage events
   */
  stop(): void {
    if (this.listener) {
      self.removeEventListener('message', this.listener as EventListener);
      this.listener = null;
      this.logger.Info().Msg('WorkerMessager stopped listening');
    }
  }

  /**
   * Check if the messager is currently listening
   */
  isListening(): boolean {
    return this.listener !== null;
  }

  /**
   * Send a message back to the main thread
   */
  postMessage(data: T): void {
    self.postMessage(data);
    this.logger.Debug().Any('data', data).Msg('Posted message to main thread');
  }
}

/**
 * Helper function to create and start a worker messager
 */
export function createWorkerMessager<T>(
  sthis: SuperThis,
  config: WorkerMessagerConfig<T>
): WorkerMessager<T> {
  const messager = new WorkerMessager(sthis, config);
  messager.start();
  return messager;
}
