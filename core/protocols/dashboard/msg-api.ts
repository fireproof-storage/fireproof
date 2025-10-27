import { exception2Result, Lazy, Logger, Result } from "@adviser/cement";
import {
  ReqClerkPublishableKey,
  ReqCloudDbToken,
  ReqTokenByResultId,
  ResClerkPublishableKey,
  ResCloudDbToken,
  ResTokenByResultId,
} from "./msg-types.js";
import { FAPIMsgImpl } from "./msg-is.js";

export class DashApi {
  readonly apiUrl: string;
  readonly isser = new FAPIMsgImpl();
  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async request<S, Q>(req: Q): Promise<Result<S>> {
    return exception2Result(async () => {
      const res = await fetch(this.apiUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req),
      });
      if (res.ok) {
        const json = await res.json();
        return json as S;
      }
      throw new Error(`Request failed: ${res.status} ${res.statusText} ${this.apiUrl}`);
    });
  }

  readonly getClerkPublishableKey = Lazy(async (req: Omit<ReqClerkPublishableKey, "type"> = {}) => {
    const rRes = await this.request<ResClerkPublishableKey, ReqClerkPublishableKey>({ ...req, type: "reqClerkPublishableKey" });
    if (rRes.isErr()) {
      throw rRes.Err();
    }
    return rRes.unwrap();
  });

  getCloudDbToken(req: Omit<ReqCloudDbToken, "type">): Promise<Result<ResCloudDbToken>> {
    return this.request<ResCloudDbToken, ReqCloudDbToken>({ ...req, type: "reqCloudDbToken" });
  }

  async waitForToken(req: Omit<ReqTokenByResultId, "type">, logger: Logger): Promise<Result<ResTokenByResultId>> {
    const rTokenByResultId = await this.request<ResTokenByResultId, ReqTokenByResultId>({
      ...req,
      type: "reqTokenByResultId",
    } satisfies ReqTokenByResultId);

    if (rTokenByResultId.isErr()) {
      return logger.Error().Err(rTokenByResultId).Msg("Error fetching token").ResultError();
    }
    const tokenByResultId = rTokenByResultId.unwrap();
    if (this.isser.isResTokenByResultId(tokenByResultId)) {
      if (tokenByResultId.status === "found") {
        const token = tokenByResultId.token;
        return Result.Ok({
          type: "resTokenByResultId",
          status: "found",
          resultId: req.resultId,
          token,
        }); // as ResTokenByResultId);
      }
    } else {
      logger.Warn().Any({ returned: tokenByResultId }).Msg("fetching token failed");
    }
    return Result.Ok({
      type: "resTokenByResultId",
      status: "not-found",
      resultId: req.resultId,
    }); // as ResTokenByResultId);
  }
}
