import { ResolveOnce, Result, URI } from "@adviser/cement";
import { Gateway, GetResult, TestGateway, VoidResult } from "../../../blockstore/gateway.js";
import { SuperThis } from "../../../types.js";
import { gatewayImport } from "./gateway-import-static.js";

const loadExternal = new ResolveOnce<Gateway>();
export class IndexDBGateway implements Gateway {
  readonly sthis: SuperThis;

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
  }
  private getGateway(): Promise<Gateway> {
    return loadExternal.once(() => {
      return gatewayImport().then(({ IndexDBGatewayImpl }) => new IndexDBGatewayImpl(this.sthis));
    });
  }
  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return this.getGateway().then((gw) => gw.buildUrl(baseUrl, key));
  }
  start(baseUrl: URI): Promise<Result<URI>> {
    return this.getGateway().then((gw) => gw.start(baseUrl));
  }
  close(baseUrl: URI): Promise<VoidResult> {
    return this.getGateway().then((gw) => gw.close(baseUrl));
  }
  destroy(baseUrl: URI): Promise<VoidResult> {
    return this.getGateway().then((gw) => gw.destroy(baseUrl));
  }
  put(url: URI, body: Uint8Array): Promise<VoidResult> {
    return this.getGateway().then((gw) => gw.put(url, body));
  }
  get(url: URI): Promise<GetResult> {
    return this.getGateway().then((gw) => gw.get(url));
  }
  delete(url: URI): Promise<VoidResult> {
    return this.getGateway().then((gw) => gw.delete(url));
  }
  // subscribe?(url: URI, callback: (meta: Uint8Array) => void): Promise<UnsubscribeResult> {
  //     // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  //     return this.getGateway().then(gw => gw.subscribe!(url, callback));
  // }
}

export class IndexDBTestStore implements TestGateway {
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis) {
    this.sthis = sthis;
  }
  readonly loadExternal = new ResolveOnce<TestGateway>();
  private getGateway(): Promise<TestGateway> {
    return this.loadExternal.once(() => {
      return gatewayImport().then(({ IndexDBTestStore }) => new IndexDBTestStore(this.sthis));
    });
  }

  get(url: URI, key: string) {
    return this.getGateway().then((gw) => gw.get(url, key));
  }
}
