import { Logger } from "@adviser/cement";
import { ActiveStore, CarClockHead, CarClockLink, DbMeta } from "./types.js";

export interface TaskManagerParams {
  readonly removeAfter: number; // default 3
  readonly retryTimeout: number; // default 50
}

export interface TaskManagerIf {
  // we need to remove the events after some time
  readonly logger: Logger;
  readonly params: TaskManagerParams;

  readonly callback: (dbMeta: DbMeta, store: ActiveStore) => Promise<void>;

  handleEvent(cid: CarClockLink, parents: CarClockHead, dbMeta: DbMeta, store: ActiveStore): Promise<void>; 

}
