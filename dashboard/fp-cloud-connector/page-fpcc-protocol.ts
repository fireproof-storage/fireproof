import { ensureLogger } from "@fireproof/core-runtime";
import { FPCCProtocol, FPCCProtocolBase } from "./fpcc-protocol.js";
import { SuperThis } from "@fireproof/core-types-base";
import { Logger } from "@adviser/cement";
import { FPCCMessage, FPCCMsgBase, FPCCPing, FPCCSendMessage } from "./protocol-fp-cloud-conn.js";

export class PageFPCCProtocol implements FPCCProtocol {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly fpccProtocol: FPCCProtocolBase;

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "PageFPCCProtocol");
    this.fpccProtocol = new FPCCProtocolBase(sthis, this.logger);
  }

  readonly handleMessage = (_event: MessageEvent<unknown>): void => {
    this.fpccProtocol.handleMessage(_event);
  };

  onFPCCMessage(callback: (msg: FPCCMessage) => boolean | undefined): void {
    this.fpccProtocol.onFPCCMessage(callback);
  }

  readonly handleError = (_error: unknown): void => {
    throw new Error("Method not implemented.");
  };

  start(sendFn: (evt: FPCCMessage, srcEvent: MessageEvent<unknown>) => void): void {
    this.fpccProtocol.start(sendFn);
    this.fpccProtocol.sendMessage<FPCCPing>(
      {
        type: "FPCCPing",
        dst: "iframe",
        timestamp: Date.now(),
      },
      {} as MessageEvent<unknown>,
    );
  }

  sendMessage<T extends FPCCMsgBase>(msg: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown>): void {
    this.fpccProtocol.sendMessage(msg, srcEvent);
  }
}
