/**
 * MessageReceiver component for handling postMessage events
 */

import { Logger } from "@adviser/cement";
import { ensureLogger } from "@fireproof/core-runtime";
import { SuperThis } from "@fireproof/core-types-base";
import { Writable } from "ts-essentials";

export interface MessageEvent<T> {
  data: T;
  origin: string;
  source: WindowProxy | MessagePort | ServiceWorker | null;
}

export interface PostMessagerConfig<T> {
  /**
   * Optional origin whitelist for security. If provided, only messages from these origins will be processed.
   */
  readonly allowedOrigins?: string[];

  /**
   * Handler function called when a valid message is received
   */
  onMessage(data: T, event: MessageEvent<unknown>): void;

  /**
   * Optional error handler
   */
  onError?(error: Error, event: MessageEvent<unknown>): void;

  /**
   * Optional validator function to validate message data structure
   */
  validator(data: unknown): data is T;

  /**
   * Target window to listen on (defaults to current window)
   */
  targetWindow?: Window;
}

export class PostMessager<T> {
  private config: Omit<PostMessagerConfig<T>, "allowedOrigins"> & Pick<Writable<PostMessagerConfig<T>>, "allowedOrigins">;

  private listener?: (this: Window, event: MessageEvent<unknown>) => void;
  private targetWindow: Window;
  readonly logger: Logger;
  readonly id: string;

  constructor(sthis: SuperThis, config: PostMessagerConfig<T>) {
    this.config = { allowedOrigins: [], ...config };
    this.targetWindow = config.targetWindow || window;
    this.id = sthis.nextId().str;
    this.logger = ensureLogger(sthis, "PostMessager").With().Str("Id", this.id).Logger();
  }

  private isMessageEvent<T>(event: MessageEvent<unknown>): event is MessageEvent<T> {
    return this.config.validator && !this.config.validator(event.data);
  }

  /**
   * Start listening for postMessage events
   */
  start(): void {
    if (this.listener) {
      // eslint-disable-next-line no-console
      console.warn("MessageReceiver is already listening");
      return;
    }

    this.listener = (event: MessageEvent<unknown>) => {
      try {
        // Check origin if whitelist is provided
        if (this.config.allowedOrigins && this.config.allowedOrigins.length > 0) {
          if (!this.config.allowedOrigins.includes(event.origin)) {
            // eslint-disable-next-line no-console
            console.warn(`Message from unauthorized origin: ${event.origin}`);
            return;
          }
        }

        if (!this.isMessageEvent<T>(event)) {
          throw this.logger.Error().Any({ data: event.data }).Msg("Received message with invalid data structure(T)");
        }

        // Call the message handler
        this.config.onMessage(event.data, event);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (this.config.onError) {
          this.config.onError(err, event);
        } else {
          // eslint-disable-next-line no-console
          console.error("Error handling message:", err);
        }
      }
    };

    this.targetWindow.addEventListener("message", this.listener);
  }

  /**
   * Stop listening for postMessage events
   */
  stop(): void {
    if (this.listener) {
      this.targetWindow.removeEventListener("message", this.listener);
      this.listener = undefined;
    }
  }

  /**
   * Update the allowed origins list
   */
  updateAllowedOrigins(origins: string[]): void {
    this.config.allowedOrigins = origins;
  }

  /**
   * Check if the receiver is currently listening
   */
  isListening(): boolean {
    return this.listener !== null;
  }
}

/**
 * Helper function to create and start a message receiver
 */
export function createPostMessager<T>(sthis: SuperThis, config: PostMessagerConfig<T>): PostMessager<T> {
  const receiver = new PostMessager(sthis, config);
  receiver.start();
  return receiver;
}
