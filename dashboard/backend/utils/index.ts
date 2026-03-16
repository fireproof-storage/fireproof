import { Result, EventoResultType, EventoResult } from "@adviser/cement";

export * from "./auth.js";

export function wrapStop<T>(res: Promise<Result<T>>): Promise<Result<EventoResultType>> {
  return res.then((r) => {
    if (r.isErr()) {
      return Result.Err(r);
    }
    return Result.Ok(EventoResult.Stop);
  });
}
