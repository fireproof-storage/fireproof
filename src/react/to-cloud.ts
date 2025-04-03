import { BuildURI, Logger, URI } from "@adviser/cement";
import { Attachable, bs, ensureLogger, Ledger } from "@fireproof/core";
import { decodeJwt } from "jose";

interface ToCloudOpts {
  readonly interval: number; // default 1000 or 1 second
  readonly tokenKey: string; // default "fpToken"
  readonly dashboardURI: string; // https://dev.connect.fireproof.direct/fp/cloud/api/token
}

function defaultOpts(opts: Partial<ToCloudOpts>): ToCloudOpts {
  return {
    interval: 1000,
    tokenKey: "fpToken",
    dashboardURI: "https://dev.connect.fireproof.direct/fp/cloud/api/token",
    ...opts,
  };
}

interface ToCloudAttachable extends Attachable {
  resetToken(): void;
  token?: string;
}

class ToCloud implements ToCloudAttachable {
  readonly name = "toCloud";
  readonly opts: ToCloudOpts;

  currentToken?: string;

  constructor(opts: Partial<ToCloudOpts>) {
    this.opts = defaultOpts(opts);
  }

  resetToken() {
    localStorage.removeItem(this.opts.tokenKey);
  }

  configHash() {
    return "toCloud"; // this is a placeholder, you can use a more complex hash function if needed
  }
  doRedirect(logger: Logger, name: string) {
    const url = BuildURI.from(this.opts.dashboardURI)
      .setParam("back_url", window.location.href)
      .setParam("local_ledger_name", name)
      .toString();
    logger.Debug().Url(url).Msg("gathering token");
    window.location.href = url;
  }

  get token(): string | undefined {
    return this.currentToken;
  }
  getToken(logger: Logger, ledger: Ledger): string {
    const gi = localStorage.getItem(this.opts.tokenKey);
    if (!gi) {
      logger.Debug().Msg("waiting for token");
      this.doRedirect(logger, ledger.name);
      return "should not be here";
    }
    if (!this.currentToken) {
      logger.Debug().Msg("set current token");
      this.currentToken = gi;
      return gi;
    }
    if (gi === this.currentToken) {
      const claims = decodeJwt(gi);
      const now = new Date().getTime();
      if (claims.exp && claims.exp - 10000 < now) {
        logger.Debug().Any(claims).Msg("Token unchanged, is token valid TODO?");
      }
      return gi;
    }
    logger.Debug().Msg("Token changed");
    this.currentToken = gi;
    return gi;
  }
  async prepare(ledger?: Ledger) {
    if (!ledger) {
      throw new Error("Ledger is required");
    }
    const logger = ensureLogger(ledger.sthis, "ToCloud").SetDebug("ToCloud");
    const dummy = {
      car: { url: "memory://car" },
      file: { url: "memory://file" },
      meta: { url: "memory://meta" },
    };
    const uri = URI.from(window.location.href);
    const uriFpToken = uri.getParam("fpToken");
    if (uriFpToken) {
      localStorage.setItem(this.opts.tokenKey, uriFpToken);
      logger.Debug().Any({ uriFpToken }).Msg("Token set");
      window.location.href = uri.build().delParam("fpToken").toString();
      return dummy;
    }
    const interval = setInterval(() => {
      this.getToken(logger, ledger);
    }, this.opts.interval);
    const gatewayInterceptor = bs.URIInterceptor.withMapper((uri) => {
      const token = this.getToken(logger, ledger);
      return uri.build().setParam("authJWK", token).URI();
    });
    return {
      car: { url: "memory://car", gatewayInterceptor },
      file: { url: "memory://file", gatewayInterceptor },
      meta: { url: "memory://meta", gatewayInterceptor },
      teardown: () => {
        clearInterval(interval);
      },
    };
  }
}

export function toCloud(iopts: Partial<ToCloudOpts> = {}): ToCloudAttachable {
  return new ToCloud(iopts);
}
