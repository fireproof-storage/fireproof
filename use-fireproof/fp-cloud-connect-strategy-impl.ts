import { BuildURI, KeyedResolvOnce, Lazy, Logger, ResolveSeq, Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { ToCloudOpts, TokenAndSelectedTenantAndLedger, TokenStrategie } from "@fireproof/core-types-protocols-cloud";
import { ensureLogger, ensureSuperThis, hashObjectSync } from "@fireproof/core-runtime";

import { FPCCEvtApp, dbAppKey } from "@fireproof/cloud-connector-base";
import { FPCloudConnectOpts, PageControllerImpl } from "./fp-cloud-connect-strategy.js";
import { FPCloudFrontendImpl } from "./window-open-fp-cloud.js";

const registerLocalDbNames = new KeyedResolvOnce<Promise<void>, string>();

export class FPCloudConnectStrategyImpl implements TokenStrategie {
  overlayNode?: HTMLDivElement;
  waitState: "started" | "stopped" = "stopped";

  readonly fpCloudConnectURL: string;
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly pageController: PageControllerImpl;

  constructor(opts: Partial<FPCloudConnectOpts>) {
    const dashboardURI = opts.dashboardURI ?? "https://dev.connect.fireproof.direct/";
    let fpCloudConnectURL: BuildURI;
    if (opts.fpCloudConnectURL) {
      fpCloudConnectURL = BuildURI.from(opts.fpCloudConnectURL);
    } else {
      fpCloudConnectURL = BuildURI.from(
        // eslint-disable-next-line no-restricted-globals
        new URL("/", dashboardURI).toString(),
      ).pathname("/@fireproof/cloud-connector-iframe/injected-iframe.html");
    }

    if (opts.dashboardURI) {
      fpCloudConnectURL.setParam("dashboard_uri", opts.dashboardURI);
    }
    if (opts.cloudApiURI) {
      fpCloudConnectURL.setParam("cloud_api_uri", opts.cloudApiURI);
    }
    this.fpCloudConnectURL = fpCloudConnectURL.toString();
    // console.log("FPCloudConnectStrategy constructed with fpCloudConnectURL", this.fpCloudConnectURL);
    this.sthis = opts.sthis ?? ensureSuperThis();
    this.logger = ensureLogger(this.sthis, "FPCloudConnectStrategy");
    this.pageController = new PageControllerImpl({
      sthis: this.sthis,
      iframeHref: this.fpCloudConnectURL,
      logger: this.logger,
      fpCloudFrontend: opts.fpCloudFrontend ?? new FPCloudFrontendImpl(opts),
    });
  }
  readonly hash = Lazy(() =>
    hashObjectSync({
      pageController: this.pageController.hash(),
      fpCloudConnectURL: this.fpCloudConnectURL,
    }),
  );

  readonly openloginSeq = new ResolveSeq();
  // readonly waitForTokenPerLocalDbFuture = new KeyedResolvOnce<Future<Result<TokenAndClaims>>>();

  fpccEvtApp2TokenAndClaims(evt: FPCCEvtApp): Result<TokenAndSelectedTenantAndLedger> {
    // convertToTokenAndClaims({

    // }, this.logger, evt.localDb.accessToken)
    const tAndC: TokenAndSelectedTenantAndLedger = {
      token: evt.localDb.accessToken,
      claims: {
        selected: {
          tenant: evt.localDb.tenantId,
          ledger: evt.localDb.ledgerId,
        },
      },
    };
    return Result.Ok(tAndC);
  }

  // getPageProtocol(sthis: SuperThis): Promise<PageFPCCProtocol> {
  //   const key = ppageProtocolKey(this.fpCloudConnectURL);
  //   return ppageProtocolInstances.get(key).once(async () => {
  //     console.log("FPCloudConnectStrategy creating new PageFPCCProtocol for key", key, import.meta.url);
  //     const ppage = new PageFPCCProtocol(sthis, { iframeHref: key });
  //     await initializeIframe(ppage);
  //     await ppage.ready();
  //     ppage.onFPCCEvtNeedsLogin((msg) => {
  //       this.openloginSeq.add(() => {
  //         // test if all dbs are ready
  //         console.log("FPCloudConnectStrategy detected needs login event");
  //         this.openFireproofLogin(msg);
  //         return sleep(10000);
  //       });
  //       // logger.Info().Msg("FPCloudConnectStrategy detected needs login event");
  //     });
  //     // this.waitForTokenPerLocalDbFuture.get(key).once(() => new Future<void>());
  //     ppage.onFPCCEvtApp((evt) => {
  //       const key = dbAppKey({ appId: evt.appId, dbName: evt.localDb.dbName });
  //       const rTAndC = this.fpccEvtApp2TokenAndClaims(evt);
  //       console.log("FPCloudConnectStrategy received FPCCEvtApp, resolving waitForTokenAndClaims for key", key, rTAndC.Ok());
  //       this.waitForTokenAndClaims.get(key).reset(() => rTAndC);
  //       // if (future) {
  //       //   future.resolve(rTAndC)
  //       // }
  //     });
  //     return ppage.ready();
  //   });
  // }

  open(sthis: SuperThis, _logger: Logger, localDbName: string, _opts: ToCloudOpts) {
    console.log("FPCloudConnectStrategy open called for localDbName", localDbName);
    return this.pageController.ready().then(() => {
      return registerLocalDbNames.get(`${localDbName}:${this.pageController.appId()}:${ppage.dst}`).once(() => {
        console.log("FPCloudConnectStrategy open registering localDbName", localDbName);
      });
    });
  }

  // private currentToken?: TokenAndClaims;

  // waiting?: ReturnType<typeof setTimeout>;

  stop() {
    console.log("FPCloudConnectStrategy stop called");
    // if (this.waiting) {
    //   clearTimeout(this.waiting);
    //   this.waiting = undefined;
    // }
    // this.waitState = "stopped";
  }

  readonly waitForTokenAndClaims = new KeyedResolvOnce<Result<TokenAndSelectedTenantAndLedger>>();
  // async tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined> {
  //   console.log("FPCloudConnectStrategy tryToken called", opts);
  //   // if (!this.currentToken) {
  //   //   const webCtx = opts.context.get(WebCtx) as WebToCloudCtx;
  //   //   this.currentToken = await webCtx.token();
  //   //   // console.log("RedirectStrategy tryToken - ctx", this.currentToken);
  //   // }
  //   // return this.currentToken;
  //   return undefined;
  // }

  async waitForToken(
    _sthis: SuperThis,
    _logger: Logger,
    localDbName: string,
    _opts: ToCloudOpts,
  ): Promise<Result<TokenAndSelectedTenantAndLedger>> {
    // console.log("FPCloudConnectStrategy waitForToken called for localDbName", localDbName);
    await this.pageController.ready();
    const key = dbAppKey({ appId: this.pageController.appId(), dbName: localDbName });
    await this.openloginSeq.flush();
    return this.waitForTokenAndClaims.get(key).once(() => {
      return this.pageController.registerDatabase(localDbName).then((evt) => {
        if (evt.isErr()) {
          console.log("FPCloudConnectStrategy waitForToken registering database failed for key", key, evt);
          return Result.Err(evt);
        }
        console.log("FPCloudConnectStrategy waitForToken resolving for key", key);
        return this.fpccEvtApp2TokenAndClaims(evt.Ok());
      });

      // const future = this.waitForTokenPerLocalDbFuture.get(key).once(() => new Future<Result<TokenAndClaims>>())
      // return future.asPromise();
    });
  }
}
