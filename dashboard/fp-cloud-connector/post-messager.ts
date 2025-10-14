/**
 * MessageReceiver component for handling postMessage events
 */

import { Logger } from "@adviser/cement";
import { ensureLogger, ensureSuperThis } from "@fireproof/core-runtime";
import { SuperThis } from "use-fireproof";

export interface MessageEvent<T> {
  data: T;
  origin: string;
  source: WindowProxy | MessagePort | ServiceWorker | null;
}

export interface PostMessagerConfig<T> {
  /**
   * Optional origin whitelist for security. If provided, only messages from these origins will be processed.
   */
  allowedOrigins?: string[];

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

  /**
   * Target window to listen on (defaults to current window)
   */
  targetWindow?: Window;
}


export class PostMessager<T> {
  private config: PostMessagerConfig<T>;
  private listener: ((event: MessageEvent<T>) => void) | null = null;
  private targetWindow: Window;
  readonly logger: Logger
  readonly id: string

  constructor(sthis: SuperThis, config: PostMessagerConfig<T>) {
    this.config = config;
    this.targetWindow = config.targetWindow || window;
    this.id = sthis.nextId().str
    this.logger = ensureLogger(sthis, 'PostMessager').With().Str("Id", this.id).Logger()
  }

  /**
   * Start listening for postMessage events
   */
  start(): void {
    if (this.listener) {
      // eslint-disable-next-line no-console
      console.warn('MessageReceiver is already listening');
      return;
    }

    this.listener = (event: MessageEvent<T>) => {
      try {
        // Check origin if whitelist is provided
        if (this.config.allowedOrigins && this.config.allowedOrigins.length > 0) {
          if (!this.config.allowedOrigins.includes(event.origin)) {
            // eslint-disable-next-line no-console
            console.warn(`Message from unauthorized origin: ${event.origin}`);
            return;
          }
        }

        // Validate data structure if validator is provided
        if (this.config.validator && !this.config.validator(event.data)) {
          // eslint-disable-next-line no-console
          console.warn('Message data failed validation:', event.data);
          return;
        }

        // Call the message handler
        this.config.onMessage(event.data, event);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (this.config.onError) {
          this.config.onError(err, event);
        } else {
          // eslint-disable-next-line no-console
          console.error('Error handling message:', err);
        }
      }
    };

    this.targetWindow.addEventListener('message', this.listener as EventListener);
  }

  /**
   * Stop listening for postMessage events
   */
  stop(): void {
    if (this.listener) {
      this.targetWindow.removeEventListener('message', this.listener as EventListener);
      this.listener = null;
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
export function createPostMessager<T>(
  sthis: SuperThis,
  config: PostMessagerConfig<T>
): PostMessager<T> {
  const receiver = new PostMessager(sthis, config);
  receiver.start();
  return receiver;
}
