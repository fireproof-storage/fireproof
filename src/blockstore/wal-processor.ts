import { Future, ResolveOnce } from "@adviser/cement";
import { ensureLogger, Logger } from "../utils.js";
import { AnyLink, DbMeta, FileOp, Loadable, WALState, WALStore } from "./types.js";
import { carLogIncludesGroup } from "./loader.js";
import { SuperThis, throwFalsy } from "../types.js";

export interface LoadableOp<T> {
  readonly loader: Loadable;
  readonly walStore: WALStore;
  readonly op: T;
}

export interface WALProcessorState {
  readonly operations: LoadableOp<DbMeta>[];
  readonly noLoaderOps: LoadableOp<DbMeta>[];
  readonly fileOperations: LoadableOp<FileOp>[];
}

export function withLoader<T>(loader: Loadable, walStore: WALStore, op_ops: T | T[]): LoadableOp<T>[] {
  const ops: T[] = !Array.isArray(op_ops) ? [op_ops] : op_ops;
  return ops.map((op) => ({ loader, op, walStore }));
}

export interface WALProcessor {
  // addOperation(dbMeta: WALState): void;
  addState(walState: Partial<WALProcessorState>): void;
  snapState(loader: Loadable): WALState;
  sync(): Promise<void>;
}

// function withoutLoader<T>(loader: Loadable, ops: LoadableOp<T>[]) {
//     return ops.filter(op => op.loader === loader).map(op => {
//         const o = { ...op } as T;
//         delete (o as { loader?: Loadable }).loader;
//         return o;
//     })
// }

enum ActionStyle {
  ops = "ops",
  noLoaderOps = "noLoaderOps",
  fileOps = "fileOps",
}

abstract class Action<T> {
  abstract readonly opStyle: ActionStyle;
  abstract readonly walStore: WALStore;
  readonly loader: Loadable;
  readonly op: T;
  readonly logger: Logger;
  readonly id: string;
  error?: Error;
  state: "pending" | "running" | "done" = "pending";
  constructor(loader: Loadable, op: T, sthis: SuperThis, logger: Logger) {
    this.loader = loader;
    this.op = op;
    this.logger = logger;
    this.id = sthis.nextId();
  }

  abstract key(): string;
  abstract process(logger: Logger): Promise<Action<T>>;
}

interface DbMetaOp {
  readonly seq: number;
  readonly dbMetaId: string;
  readonly dbMeta: DbMeta;
  readonly cid: AnyLink;
}

class DbMetaAction extends Action<DbMetaOp> {
  readonly opStyle: ActionStyle;
  readonly walStore: WALStore;

  constructor(opStyle: ActionStyle, loader: Loadable, wal: WALStore, op: DbMetaOp, sthis: SuperThis) {
    super(loader, op, sthis, ensureLogger(sthis, "DbMetaAction"));
    this.opStyle = opStyle;
    this.walStore = wal;
  }

  async process(logger: Logger) {
    logger = logger.With().Str("processDbMeta", this.op.cid.toString()).Logger();
    const car = await (await this.loader.carStore()).load(this.op.cid);
    if (!car) {
      if (carLogIncludesGroup(this.loader.carLog, this.op.dbMeta.cars)) {
        this.error = logger.Error().Ref("cid", this.op.cid).Msg("missing local car").AsError();
      }
    } else {
      await throwFalsy(this.loader.remoteCarStore).save(car);
    }
    return this;
  }

  key() {
    return this.op.cid.toString();
  }
}

let seq = 0;
function dbMetaActions(loader: Loadable, wal: WALStore, style: ActionStyle, op: DbMeta, sthis: SuperThis): Action<DbMetaOp>[] {
  const id = sthis.nextId();
  const mySeq = seq++;
  return op.cars.map(
    (cid) =>
      new DbMetaAction(
        style,
        loader,
        wal,
        {
          seq: mySeq,
          dbMetaId: id,
          dbMeta: op,
          cid,
        },
        sthis,
      ),
  );
}

class FileAction extends Action<FileOp> {
  readonly opStyle = ActionStyle.fileOps;
  readonly walStore: WALStore;

  constructor(loader: Loadable, wal: WALStore, op: FileOp, sthis: SuperThis) {
    super(loader, op, sthis, ensureLogger(sthis, "FileAction"));
    this.walStore = wal;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async process(logger: Logger) {
    // logger = logger.With().Str("processFile", this.op.cid.toString()).Logger();
    const fileBlock = await (await this.loader.fileStore()).load(this.op.cid); // .catch(() => false)
    await throwFalsy(this.loader.remoteFileStore).save(fileBlock, { public: this.op.public });
    return this;
    // this.walState.fileOperations = this.walState.fileOperations.filter((op) => op.cid !== fileCid);
  }

  key(): string {
    return this.op.cid.toString();
  }
}

function fileActions(loader: Loadable, wal: WALStore, ops: FileOp[], sthis: SuperThis): Action<FileOp>[] {
  return ops.map((op) => new FileAction(loader, wal, op, sthis));
}

function filterDbMeta(opStyle: ActionStyle, actions: Action<unknown>[]): DbMeta[] {
  const byDbMetas = (actions as Action<DbMetaOp>[])
    .filter((a) => a.opStyle === opStyle)
    .reduce(
      (acc, a) => {
        acc[a.op.dbMetaId] = a.op.dbMeta;
        return acc;
      },
      {} as Record<string, DbMeta>,
    );
  return Object.values(byDbMetas);
}

export class WALProcessorImpl implements WALProcessor {
  // readonly walState: WALProcessorState = { operations: [], noLoaderOps: [], fileOperations: [] };
  // readonly processing: Promise<void> | undefined = undefined;
  // readonly processQueue: CommitQueue<void> = new CommitQueue<void>();

  readonly actions = new Map<string, Action<unknown>>();

  readonly logger: Logger;

  constructor(sthis: SuperThis) {
    this.logger = ensureLogger(sthis, "WALProcessorImpl");
  }

  keys() {
    return new Set(Array.from(this.actions.values()).map((a) => a.key()));
  }

  // mutating keys is not nice
  addActions(keys: Set<string>, actions: Action<unknown>[]) {
    for (const action of actions) {
      if (!action.loader.remoteCarStore) {
        continue;
      }
      if (keys.has(action.key())) {
        continue;
      }
      this.logger.Debug().Str("opStyle", action.opStyle).Str("key", action.key()).Msg("adding action");
      keys.add(action.key());
      this.actions.set(action.id, action);
    }
  }

  readonly futureSync: Future<void>[] = [];
  sync() {
    if (Array.from(this.actions.values()).some((a) => ["pending", "running"].includes(a.state))) {
      this.logger.Debug().Msg("sync waiting for actions to complete");
      const future = new Future<void>();
      this.futureSync.push(future);
      return future.asPromise();
    }
    this.logger.Debug().Msg("sync there is no pending actions");
    return Promise.resolve();
  }

  addState(walState: Partial<WALProcessorState>) {
    // this.walState.operations.push(...(walState.operations || []));
    // this.walState.fileOperations.push(...(walState.fileOperations || []));
    // this.walState.noLoaderOps.push(...(walState.noLoaderOps || []));

    const keys = this.keys();
    for (const op of walState.noLoaderOps || []) {
      this.addActions(keys, dbMetaActions(op.loader, op.walStore, ActionStyle.noLoaderOps, op.op, op.loader.sthis));
      // this.walState.noLoaderOps = this.walState.noLoaderOps.filter((op) => op !== dbMeta);
    }
    for (const op of walState.operations || []) {
      this.addActions(keys, dbMetaActions(op.loader, op.walStore, ActionStyle.ops, op.op, op.loader.sthis));
      //         this.walState.operations = this.walState.operations.filter((op) => op !== dbMeta);
    }
    for (const op of walState.fileOperations || []) {
      this.addActions(keys, fileActions(op.loader, op.walStore, [op.op], op.loader.sthis));
      // this.walState.fileOperations = this.walState.fileOperations.filter((op) => op.cid !== fileCid);
    }
    this.trigger();
  }

  snapState(loader: Loadable): WALState {
    const actions = Array.from(this.actions.values());
    const byStyle = actions.reduce(
      (acc, op) => {
        if (op.loader.id === loader.id && op.state === "pending") {
          acc[op.opStyle] = acc[op.opStyle] || [];
          acc[op.opStyle].push(op);
        }
        return acc;
      },
      {} as Record<ActionStyle, Action<unknown>[]>,
    );
    const fileOperations: FileOp[] = [];
    const operations: DbMeta[] = [];
    const noLoaderOps: DbMeta[] = [];
    for (const [style, acts] of Object.entries(byStyle)) {
      switch (style as unknown as ActionStyle) {
        case ActionStyle.ops:
          operations.push(...filterDbMeta(ActionStyle.ops, acts));
          break;
        case ActionStyle.noLoaderOps:
          noLoaderOps.push(...filterDbMeta(ActionStyle.noLoaderOps, acts));
          break;
        case ActionStyle.fileOps:
          fileOperations.push(...acts.filter((act) => act.opStyle === ActionStyle.fileOps).map((act) => act.op as FileOp));
          break;
        default:
          break;
      }
    }
    return { operations, fileOperations, noLoaderOps };
  }

  async trigger() {
    const logger = this.logger.With().Str("triggerId", Math.random().toString(36).substring(7)).Logger();

    const actions = Array.from(this.actions.values());
    const pendingActions = actions.filter((a) => a.state === "pending");
    // const runningActions = Array.from(this.actions.values()).filter(a => a.state === "running");
    if (pendingActions.length !== this.actions.size) {
      logger.Debug().Len(this.actions)./*Any("actions", actions.map(i => i.state)).*/ Msg("has running actions, skipping trigger");
      return;
    }
    pendingActions.forEach((a) => (a.state = "running"));
    logger
      .Debug()
      .Len(pendingActions) /*.Any("styles", pendingActions.map(a => a.opStyle))*/
      .Msg("triggering actions");
    const resultSettled = await Promise.allSettled(
      pendingActions.map((a) =>
        a.process(logger).catch((e: Error) => {
          a.error = logger.Error().Str("key", a.key()).Err(e).Msg("failed process").AsError();
        }),
      ),
    );
    logger.Debug().Len(resultSettled).Msg("triggered actions");
    const results: Action<unknown>[] = [];
    for (const [i, r] of resultSettled.entries()) {
      const action = pendingActions[i];
      action.state = "done";
      if (r.status === "rejected") {
        action.error = r.reason;
      }
      results.push(action);
    }
    const byId = results.reduce(
      (acc, a) => {
        const dbOp = a.op as DbMetaOp;
        if (dbOp.dbMetaId) {
          acc[dbOp.dbMetaId] = acc[dbOp.dbMetaId] || [];
          acc[dbOp.dbMetaId].push(a);
        } else {
          if (["done", "error"].includes(a.state)) {
            acc["@filops"] = acc["@filops"] || [];
            acc["@filops"].push(a);
          }
        }
        return acc;
      },
      {} as Record<string, Action<unknown>[]>,
    );
    const loaders = {} as Record<string /*loaderId*/, Record<string /*walId*/, Action<unknown>>>;
    for (const [id, actions] of Object.entries(byId)) {
      if (actions.every((a) => "done" === a.state)) {
        actions.reduce((acc, a) => {
          acc[a.loader.id] = acc[a.loader.id] || {};
          acc[a.loader.id][a.walStore.id] = a;
          return acc;
        }, loaders);
        const errors = actions.filter((a) => a.error);
        if (errors.length) {
          logger
            .Error()
            .Any(
              "errors",
              errors.reduce(
                (acc, t) => {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  acc[t.id] = JSON.parse(t.error!.message);
                  return acc;
                },
                {} as Record<string, object>,
              ),
            )
            .Msg("error processing action");
        }
        if (id === "@filops") {
          continue;
        }
        // we should skip until the possible last meta
        const action = actions[0] as DbMetaAction;
        await action.loader.remoteMetaStore?.save(action.op.dbMeta).catch((e: Error) => {
          // this.walState.operations.push(lastOp);
          logger.Error().Err(e).Any("dbMeta", action.op.dbMeta).Msg("error saving remote meta");
        });
      }
    }
    // i think this should not store anything in the local.walStore
    // if we want to known how much we send we need to have a WAL for each remote
    // prev:
    // } finally {
    // await this.save(this.walState)
    // }
    // logger.Debug().Len(Object.values(loaders)).Msg("pre loaders update");
    // for (const loader of Object.values(loaders)) {
    //     logger.Debug().Len(Object.values(loader)).Msg("pre loader update");
    //     for (const action of Object.values(loader)) {
    //         const state = this.snapState(action.loader);
    //         if (state.operations.length || state.noLoaderOps.length || state.fileOperations.length) {
    //             await action.walStore.save(state).catch((e: Error) => {
    //                 logger.Error().Any("state", state).Err(e).Msg("error saving state")
    //             })
    //         }
    //     }
    // }
    const doneActions = Array.from(this.actions.values()).filter((a) => a.state === "done");
    logger.Debug().Len(doneActions).Msg("pre doneAction");
    for (const action of doneActions) {
      this.actions.delete(action.id);
    }
    if (!this.actions.size) {
      for (const future of this.futureSync) {
        future.resolve();
      }
    }
    logger.Debug().Len(this.actions).Msg("pre need retrigger");
    if (Array.from(this.actions.values()).some((a) => a.state === "pending")) {
      logger.Debug().Msg("triggering again");
      setImmediate(() => this.trigger());
      // this.trigger();
    }
  }
}

const once = new ResolveOnce<WALProcessor>();
export function walProcessor(sthis: SuperThis): WALProcessor {
  return once.once(() => new WALProcessorImpl(sthis));
}
