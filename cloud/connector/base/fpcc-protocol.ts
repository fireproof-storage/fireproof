import {
  FPCCError,
  FPCCEvtApp,
  FPCCEvtConnectorReady,
  FPCCEvtNeedsLogin,
  FPCCMessage,
  FPCCMsgBase,
  FPCCPing,
  FPCCPong,
  FPCCReqRegisterLocalDbName,
  FPCCReqWaitConnectorReady,
  FPCCSendMessage,
  isFPCCError,
  isFPCCEvtApp,
  isFPCCEvtConnectorReady,
  isFPCCEvtNeedsLogin,
  isFPCCPing,
  isFPCCPong,
  isFPCCReqRegisterLocalDbName,
  isFPCCReqWaitConnectorReady,
  validateFPCCMessage,
} from "./protocol-fp-cloud-conn.js";
import { Logger, OnFunc } from "@adviser/cement";
import { ensureLogger } from "@fireproof/core-runtime";
import { SuperThis } from "@fireproof/core-types-base";

export interface FPCCProtocol {
  // handle must be this bound method
  hash: () => string;

  sendMessage<T extends FPCCMsgBase>(event: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown>): void;
  handleError: (error: unknown) => void;
  injectSend(send: (evt: FPCCMessage, srcEvent: MessageEvent<unknown> | string) => FPCCMessage): void;
  ready(): Promise<FPCCProtocol>;
  stop(): void;
}

export class FPCCProtocolBase implements FPCCProtocol {
  protected readonly sthis: SuperThis;
  protected readonly logger: Logger;
  readonly onStartFns: (() => void)[] = [];
  #sendFn: ((msg: FPCCMessage, srcEvent: MessageEvent<unknown> | string) => FPCCMessage) | undefined = undefined;

  readonly onMessage = OnFunc<(event: MessageEvent<unknown>) => void>();
  readonly onFPCCMessage = OnFunc<(msg: FPCCMessage, srcEvent: MessageEvent<unknown>) => void>();

  readonly onFPCCEvtNeedsLogin = OnFunc<(msg: FPCCEvtNeedsLogin, srcEvent: MessageEvent<unknown>) => void>()
  readonly onFPCCError = OnFunc<(msg: FPCCError, srcEvent: MessageEvent<unknown>) => void>();
  readonly onFPCCReqRegisterLocalDbName = OnFunc<(msg: FPCCReqRegisterLocalDbName, srcEvent: MessageEvent<unknown>) => void>()
  readonly onFPCCEvtApp = OnFunc<(msg: FPCCEvtApp, srcEvent: MessageEvent<unknown>) => void>()  
  readonly onFPCCPing = OnFunc<(msg: FPCCPing, srcEvent: MessageEvent<unknown>) => void>();
  readonly onFPCCPong = OnFunc<(msg: FPCCPong, srcEvent: MessageEvent<unknown>) => void>()
  readonly onFPCCEvtConnectorReady = OnFunc<(msg: FPCCEvtConnectorReady, srcEvent: MessageEvent<unknown>) => void>();
  readonly onFPCCReqWaitConnectorReady = OnFunc<(msg: FPCCReqWaitConnectorReady, srcEvent: MessageEvent<unknown>) => void>(); 

  constructor(sthis: SuperThis, logger?: Logger) {
    this.sthis = sthis;
    this.logger = logger || ensureLogger(sthis, "FPCCProtocolBase");
    this.onMessage(event => {
      this.handleMessage(event);
    });
    this.onFPCCMessage((msg, srcEvent) => {
      this.#handleFPCCMessage(msg, srcEvent);
    })
    this.onFPCCPing((msg, srcEvent) => {
      this.sendMessage<FPCCPong>({
          src: msg.dst,
          dst: msg.src,
          pingTid: msg.tid,
          type: "FPCCPong",
        },
        srcEvent,
      );
    });
  }

  hash(): string {
    throw new Error("should be implemented by subclass");
  }

  handleMessage = (event: MessageEvent<unknown>) => {
    if ((event.data as { type: string })?.type === "EXTENSION_VERSION") {
      // ignore extension version messages
      return;
    }
    const fpCCmsg = validateFPCCMessage(event.data);
    // console.log("IframeFPCCProtocol handleMessage called", event.data, fpCCmsg.success);
    if (fpCCmsg.success) {
      this.onFPCCMessage.invoke(fpCCmsg.data, event);
    } else {
      this.logger.Warn().Err(fpCCmsg.error).Any("event", event).Msg("Received non-FPCC message");
    }
  };

  #handleFPCCMessage(event: FPCCMessage, srcEvent: MessageEvent<unknown>) {
    this.logger.Debug().Any("event", event).Msg("Handling FPCC message");
    switch (true) {

      case isFPCCEvtNeedsLogin(event): {
        this.onFPCCEvtNeedsLogin.invoke(event, srcEvent);
        break;
      }

      case isFPCCError(event): {
        this.onFPCCError.invoke(event, srcEvent);
        break;
      }

      case isFPCCReqRegisterLocalDbName(event): {
        this.onFPCCReqRegisterLocalDbName.invoke(event, srcEvent);
        break;
      }

      case isFPCCEvtApp(event): {
        this.onFPCCEvtApp.invoke(event, srcEvent);
        break;
      }

      case isFPCCPing(event): {
        this.onFPCCPing.invoke(event, srcEvent);
        break;
      }

      case isFPCCPong(event): {
        this.onFPCCPong.invoke(event, srcEvent);
        break;
      }

      case isFPCCEvtConnectorReady(event): {
        this.onFPCCEvtConnectorReady.invoke(event, srcEvent);
        break;
      }

      case isFPCCReqWaitConnectorReady(event): {
        this.onFPCCReqWaitConnectorReady.invoke(event, srcEvent);
        break;
      }

    }
  }

  handleError = (_error: unknown) => {
    throw new Error("Method not implemented.");
  };

  ready(): Promise<FPCCProtocol> {

    return Promise.resolve(this);
  }

  injectSend(sendFn: (msg: FPCCMessage, srcEvent: MessageEvent<unknown> | string) => FPCCMessage): void {
    this.#sendFn = sendFn;
  }

  stop(): void {
    this.#sendFn = undefined;
    this.onFPCCMessage.clear();
    this.onStartFns.splice(0, this.onStartFns.length);
  }

  sendMessage<T extends FPCCMsgBase>(msg: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown> | string): T {
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
