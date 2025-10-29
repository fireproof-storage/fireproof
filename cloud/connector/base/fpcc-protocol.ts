import { FPCCMessage, FPCCMsgBase, FPCCPong, FPCCSendMessage, isFPCCPing, validateFPCCMessage } from "./protocol-fp-cloud-conn.js";
import { Logger } from "@adviser/cement";
import { ensureLogger } from "@fireproof/core-runtime";
import { SuperThis } from "@fireproof/core-types-base";

export interface FPCCProtocol {
  // handle must be this bound method
  handleMessage: (event: MessageEvent<unknown>) => void;
  handleFPCCMessage?: (event: FPCCMessage, srcEvent: MessageEvent<unknown>) => void;
  sendMessage<T extends FPCCMsgBase>(event: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown>): void;
  handleError: (error: unknown) => void;
  injectSend(send: (evt: FPCCMessage, srcEvent: MessageEvent<unknown>) => FPCCMessage): void;
  ready(): Promise<FPCCProtocol>;
  stop(): void;
}

export class FPCCProtocolBase implements FPCCProtocol {
  protected readonly sthis: SuperThis;
  protected readonly logger: Logger;
  readonly #fpccMessageHandlers: ((msg: FPCCMessage, srcEvent: MessageEvent<unknown>) => boolean | undefined)[] = [];
  readonly onStartFns: (() => void)[] = [];
  #sendFn: ((msg: FPCCMessage, srcEvent: MessageEvent<unknown>) => FPCCMessage) | undefined = undefined;

  constructor(sthis: SuperThis, logger?: Logger) {
    this.sthis = sthis;
    this.logger = logger || ensureLogger(sthis, "FPCCProtocolBase");
  }

  handleMessage = (event: MessageEvent<unknown>) => {
    if ((event.data as { type: string })?.type === "EXTENSION_VERSION") {
      // ignore extension version messages
      return;
    }
    const fpCCmsg = validateFPCCMessage(event.data);
    // console.log("IframeFPCCProtocol handleMessage called", event.data, fpCCmsg.success);
    if (fpCCmsg.success) {
      this.handleFPCCMessage(fpCCmsg.data, event);
    } else {
      this.logger.Warn().Err(fpCCmsg.error).Any("event", event).Msg("Received non-FPCC message");
    }
  };

  onFPCCMessage(callback: (msg: FPCCMessage, srcEvent: MessageEvent<unknown>) => boolean | undefined): void {
    this.#fpccMessageHandlers.push(callback);
  }

  handleFPCCMessage = (event: FPCCMessage, srcEvent: MessageEvent<unknown>) => {
    // allow handlers to process the message first and abort further processing
    if (this.#fpccMessageHandlers.map((handler) => handler(event, srcEvent)).some((handled) => handled)) {
      return;
    }
    this.logger.Debug().Any("event", event).Msg("Handling FPCC message");
    switch (true) {
      case isFPCCPing(event): {
        const pong: FPCCSendMessage<FPCCPong> = {
          type: "FPCCPong",
          dst: event.src,
          pingTid: event.tid,
          timestamp: Date.now(),
        };
        this.sendMessage<FPCCPong>(pong, srcEvent);
        break;
      }
    }
  };

  handleError = (_error: unknown) => {
    throw new Error("Method not implemented.");
  };

  ready(): Promise<FPCCProtocol> {
    return Promise.resolve(this);
  }

  injectSend(sendFn: (msg: FPCCMessage, srcEvent: MessageEvent<unknown>) => FPCCMessage): void {
    this.#sendFn = sendFn;
  }

  stop(): void {
    this.#sendFn = undefined;
    this.#fpccMessageHandlers.splice(0, this.#fpccMessageHandlers.length);
    this.onStartFns.splice(0, this.onStartFns.length);
  }

  sendMessage<T extends FPCCMsgBase>(msg: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown>): T {
    if (!this.#sendFn) {
      throw new Error("Protocol not started. Call start() before sending messages.");
    }
    return this.#sendFn(
      {
        ...msg,
        src: msg.src,
        tid: msg.tid ?? this.sthis.nextId().str,
      } as FPCCMessage,
      srcEvent,
    ) as T;
  }
}

// this.listener = (event: MessageEvent<unknown>) => {
//       try {
//         // Check origin if whitelist is provided
//         if (this.config.allowedOrigins && this.config.allowedOrigins.length > 0) {
//           if (!this.config.allowedOrigins.includes(event.origin)) {
//             // eslint-disable-next-line no-console
//             console.warn(`Message from unauthorized origin: ${event.origin}`);
//             return;
//           }
//         }

//         if (!this.isMessageEvent<T>(event)) {
//           throw this.logger.Error().Any({ data: event.data }).Msg("Received message with invalid data structure(T)");
//         }

//         // Call the message handler
//         this.config.onMessage(event.data, event);
//       } catch (error) {
//         const err = error instanceof Error ? error : new Error(String(error));
//         if (this.config.onError) {
//           this.config.onError(err, event);
//         } else {
//           // eslint-disable-next-line no-console
//           console.error("Error handling message:", err);
//         }
//       }
//     };
