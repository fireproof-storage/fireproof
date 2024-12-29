import { ResolveOnce, Result, URI } from "@adviser/cement";
import { Gateway, GetResult, TestGateway, VoidResult } from "../../../blockstore/gateway.js";
import { SuperThis } from "../../../types.js";

const loadExternal = new ResolveOnce<Gateway>();
function getGateway(sthis: SuperThis): Promise<{
  gwy: Gateway;
  tst: TestGateway;
}> {
  return loadExternal.once(async () => {
    const { GatewayImpl, GatewayTestImpl } = await import("@fireproof/core/web");
    return {
      gwy: new GatewayImpl(sthis),
      tst: new GatewayTestImpl(sthis),
    };
  });
}

export class IndexDBGateway implements Gateway {
  readonly sthis: SuperThis;

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
  }

  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return getGateway(this.sthis).then(({ gwy }) => gwy.buildUrl(baseUrl, key));
  }
  start(baseUrl: URI): Promise<Result<URI>> {
    return getGateway(this.sthis).then(({ gwy }) => gwy.start(baseUrl));
  }
  close(baseUrl: URI): Promise<VoidResult> {
    return getGateway(this.sthis).then(({ gwy }) => gwy.close(baseUrl));
  }
  destroy(baseUrl: URI): Promise<VoidResult> {
    return getGateway(this.sthis).then(({ gwy }) => gwy.destroy(baseUrl));
  }
  put(url: URI, body: Uint8Array): Promise<VoidResult> {
    return getGateway(this.sthis).then(({ gwy }) => gwy.put(url, body));
  }
  get(url: URI): Promise<GetResult> {
    return getGateway(this.sthis).then(({ gwy }) => gwy.get(url));
  }
  delete(url: URI): Promise<VoidResult> {
    return getGateway(this.sthis).then(({ gwy }) => gwy.delete(url));
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

  get(url: URI, key: string) {
    return getGateway(this.sthis).then(({ tst }) => tst.get(url, key));
  }
}
