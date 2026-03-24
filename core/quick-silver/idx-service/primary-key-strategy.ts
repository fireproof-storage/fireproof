import { exception2Result, Lazy, Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { DeviceIdClient, DeviceIdKey } from "@fireproof/core-device-id";
import { IdxService, IdxServiceImpl, defaultIdxStrategy } from "./service.js";
import { AddToIdxOpts, IdxEntry, IdxStrategy, IdxTransaction, MetaEntry } from "./types.js";
import { isQSDocMeta, isQSFileMeta, QSDeviceMeta, QSDocMeta, QSFileMeta } from "../envelope.js";

export interface PrimaryKeyOpts {
  readonly sthis: SuperThis;
  readonly deviceIdKey?: DeviceIdKey;
  readonly idxStrategy?: IdxStrategy;
  readonly idxService?: IdxServiceImpl;
}

// export interface TickPrimaryKey {
//   readonly key: string;
//   readonly dbname: string;
//   readonly cidUrl: string;
//   readonly meta?: MetaEntry[];
// }

// export interface TickOpts {
//   readonly primaryKey: TickPrimaryKey;
//   readonly idxService?: IdxServiceImpl;
// }

export class PrimaryKeyStrategy implements IdxStrategy {
  #opts: Omit<PrimaryKeyOpts, "idxStrategy" | "idxService"> & {
    readonly idxStrategy: IdxStrategy;
    readonly idxService: IdxServiceImpl;
  };

  readonly deviceFingerPrint = Lazy(async () => {
    if (this.#opts.deviceIdKey) {
      return this.#opts.deviceIdKey.fingerPrint();
    }
    const rKey = await new DeviceIdClient(this.#opts.sthis).ensureDeviceIdWithoutCert();
    if (rKey.isErr()) throw rKey.Err();
    return rKey.Ok().fingerPrint();
  });

  constructor(opts: PrimaryKeyOpts) {
    this.#opts = {
      ...opts,
      idxStrategy: opts.idxStrategy ?? defaultIdxStrategy,
      idxService: opts.idxService ?? IdxService(),
    };
  }

  getDocFileMeta(meta: MetaEntry[] = []): (QSDocMeta | QSFileMeta)[] {
    return meta.reduce(
      (cids, m) => {
        if (isQSDocMeta(m) || isQSFileMeta(m)) {
          cids.push(m);
        }
        return cids;
      },
      [] as (QSDocMeta | QSFileMeta)[],
    );
  }

  async write(tx: IdxTransaction, opts: AddToIdxOpts, _serializedKey: string): Promise<Result<IdxEntry>> {
    const r = await exception2Result(async (): Promise<Result<IdxEntry>> => {
      const deviceId = await this.deviceFingerPrint();
      const rIdx = await this.#opts.idxService.addToIdx({
        strategy: this.#opts.idxStrategy,
        dbname: opts.dbname,
        idxName: "_id",
        keys: opts.keys,
        meta: opts.meta,
        tx,
      });
      if (rIdx.isErr()) return Result.Err(rIdx);

      const deviceIdMetas: MetaEntry[] = [];
      for (const m of this.getDocFileMeta(opts.meta)) {
        const rCid = await this.#opts.idxService.addToIdx({
          strategy: this.#opts.idxStrategy,
          tx,
          dbname: opts.dbname,
          idxName: "_cid",
          keys: [m.payload.cid],
          meta: [
            {
              type: "qs.device.meta",
              key: deviceId,
              payload: {
                idxName: "_cid",
                url: m.payload.url,
                who: "me",
                cid: m.payload.cid,
                created: new Date().toISOString(),
                deleted: false,
              },
            } satisfies QSDeviceMeta,
          ],
        });
        if (rCid.isErr()) return Result.Err(rCid);
        deviceIdMetas.push(...(rCid.Ok().meta ?? []));
      }

      return Result.Ok({ ...rIdx.Ok(), meta: [...(rIdx.Ok().meta ?? []), ...deviceIdMetas] });
    });
    return r;
  }
}
