import { format, parse } from "@ipld/dag-json";
import { EventBlock, decodeEventBlock } from "@web3-storage/pail/clock";
import { EventView } from "@web3-storage/pail/clock/api";
import { BaseStoreImpl, StoreOpts } from "./store.js";
import type { DbMeta, MetaStore, CarClockHead, DbMetaEventBlock, CarClockLink, LoadHandler } from "./types.js";
import { SuperThis, CRDTEntry, Falsy } from "../types.js";
import { Link } from "multiformats";
import { Result, URI } from "@adviser/cement";
import { ensureLogger, isNotFoundError } from "../utils.js";

export async function encodeGatewayDbMetaToBytes(sthis: SuperThis, dbMetas: DbMeta[]): Promise<Uint8Array> {
  const events = await Promise.all(dbMetas.map((dbMeta) => createDbMetaEventBlock(sthis, dbMeta, [])));
  return encodeEventsWithParents(sthis, events, []);
}

export async function decodeGatewayMetaBytesToDbMeta(sthis: SuperThis, byteHeads: Uint8Array) {
  const crdtEntries = JSON.parse(sthis.txt.decode(byteHeads)) as CRDTEntry[];
  if (!crdtEntries.length) {
    sthis.logger.Debug().Str("byteHeads", new TextDecoder().decode(byteHeads)).Msg("No CRDT entries found");
    return [];
  }
  if (!crdtEntries.map) {
    sthis.logger.Debug().Str("crdtEntries", JSON.stringify(crdtEntries)).Msg("No data in CRDT entries");
    return [];
  }
  return Promise.all(
    crdtEntries.map(async (crdtEntry) => {
      const eventBlock = await decodeEventBlock<{ dbMeta: Uint8Array }>(decodeFromBase64(crdtEntry.data));
      const dbMeta = parse<DbMeta>(sthis.txt.decode(eventBlock.value.data.dbMeta));
      return {
        eventCid: eventBlock.cid as CarClockLink,
        parents: crdtEntry.parents,
        dbMeta: dbMeta,
      };
    }),
  );
}

export async function setCryptoKeyFromGatewayMetaPayload(
  uri: URI,
  sthis: SuperThis,
  data: Uint8Array,
): Promise<Result<DbMeta | undefined>> {
  try {
    sthis.logger.Debug().Str("uri", uri.toString()).Msg("Setting crypto key from gateway meta payload");
    const keyInfo = await decodeGatewayMetaBytesToDbMeta(sthis, data);
    if (keyInfo.length) {
      const dbMeta = keyInfo[0].dbMeta;
      if (dbMeta.key) {
        const kb = await rt.kb.getKeyBag(sthis);
        const keyName = getStoreKeyName(uri);
        const res = await kb.setNamedKey(keyName, dbMeta.key);
        if (res.isErr()) {
          sthis.logger.Debug().Str("keyName", keyName).Str("dbMeta.key", dbMeta.key).Msg("Failed to set named key");
          throw res.Err();
        }
      }
      sthis.logger.Debug().Str("dbMeta.key", dbMeta.key).Str("uri", uri.toString()).Msg("Set crypto key from gateway meta payload");
      return Result.Ok(dbMeta);
    }
    sthis.logger.Debug().Str("data", new TextDecoder().decode(data)).Msg("No crypto in gateway meta payload");
    return Result.Ok(undefined);
  } catch (error) {
    sthis.logger.Debug().Err(error).Msg("Failed to set crypto key from gateway meta payload");
    return Result.Err(error as Error);
  }
}

export async function addCryptoKeyToGatewayMetaPayload(uri: URI, sthis: SuperThis, body: Uint8Array): Promise<Result<Uint8Array>> {
  try {
    sthis.logger.Debug().Str("uri", uri.toString()).Msg("Adding crypto key to gateway meta payload");
    const keyName = getStoreKeyName(uri);
    const kb = await rt.kb.getKeyBag(sthis);
    const res = await kb.getNamedExtractableKey(keyName, true);
    if (res.isErr()) {
      sthis.logger.Error().Str("keyName", keyName).Msg("Failed to get named extractable key");
      throw res.Err();
    }
    const keyData = await res.Ok().extract();
    const dbMetas = await decodeGatewayMetaBytesToDbMeta(sthis, body);
    const { dbMeta, parents } = dbMetas[0]; // as { dbMeta: DbMeta };
    const parentLinks = parents.map((p) => CID.parse(p) as CarClockLink);
    dbMeta.key = keyData.keyStr;
    const events = await Promise.all([dbMeta].map((dbMeta) => createDbMetaEventBlock(sthis, dbMeta, parentLinks)));
    const encoded = await encodeEventsWithParents(sthis, events, parentLinks);
    sthis.logger.Debug().Str("uri", uri.toString()).Msg("Added crypto key to gateway meta payload");
    return Result.Ok(encoded);
  } catch (error) {
    sthis.logger.Error().Err(error).Msg("Failed to add crypto key to gateway meta payload");
    return Result.Err(error as Error);
  }
}

function getStoreKeyName(url: URI): string {
  const storeKeyName = [url.getParam("localName") || url.getParam("name")];
  const idx = url.getParam("index");
  if (idx) {
    storeKeyName.push(idx);
  }
  storeKeyName.push("data");
  return `@${storeKeyName.join(":")}@`;
  return Promise.all(crdtEntries.map(async (crdtEntry) => decodeMetaBlock(sthis, crdtEntry)));
}

async function decodeMetaBlock(
  sthis: SuperThis,
  crdtEntry: CRDTEntry,
): Promise<{ eventCid: CarClockLink; dbMeta: DbMeta; parents: string[] }> {
  const eventBlock = await decodeEventBlock<{ dbMeta: Uint8Array }>(decodeFromBase64(crdtEntry.data));
  const dbMeta = parse<DbMeta>(sthis.txt.decode(eventBlock.value.data.dbMeta));
  return {
    eventCid: eventBlock.cid as CarClockLink,
    parents: crdtEntry.parents,
    dbMeta: dbMeta,
  };
}

async function createDbMetaEventBlock(sthis: SuperThis, dbMeta: DbMeta, parents: CarClockHead): Promise<DbMetaEventBlock> {
  // const toEncode: DbMeta = { cars: dbMeta.cars };
  const encodedMeta = format(dbMeta);
  const data = {
    dbMeta: sthis.txt.encode(encodedMeta),
  };
  const event = await EventBlock.create(data, parents as unknown as Link<EventView<{ dbMeta: Uint8Array }>, number, number, 1>[]);
  return event as EventBlock<{ dbMeta: Uint8Array }>;
}

async function encodeEventsWithParents(
  sthis: SuperThis,
  events: EventBlock<{ dbMeta: Uint8Array }>[],
  parents: CarClockHead,
): Promise<Uint8Array> {
  const crdtEntries = events.map((event) => {
    const base64String = encodeToBase64(event.bytes);
    return {
      cid: event.cid.toString(),
      data: base64String,
      parents: parents.map((p) => p.toString()),
    };
  });
  return sthis.txt.encode(JSON.stringify(crdtEntries));
}

export class MetaStoreImpl extends BaseStoreImpl implements MetaStore {
  readonly storeType = "meta";
  readonly subscribers = new Map<string, LoadHandler[]>();
  parents: CarClockHead = [];

  constructor(sthis: SuperThis, name: string, url: URI, opts: StoreOpts, remote?: boolean) {
    // const my = new URL(url.toString());
    // my.searchParams.set("storekey", 'insecure');
    super(
      name,
      url,
      {
        ...opts,
      },
      sthis,
      ensureLogger(sthis, "MetaStoreImpl"),
    );
    if (remote && opts.gateway.subscribe) {
      this.onStarted(async () => {
        this.logger.Debug().Str("url", this.url().toString()).Msg("Subscribing to the gateway");
        opts.gateway.subscribe?.(this.url(), async (message: Uint8Array) => {
          this.logger.Debug().Msg("Received message from gateway");
          const dbMetas = await decodeGatewayMetaBytesToDbMeta(this.sthis, message);
          await Promise.all(
            dbMetas.map((dbMeta) => this.loader?.taskManager?.handleEvent(dbMeta.eventCid, dbMeta.parents, dbMeta.dbMeta)),
          );
          this.updateParentsFromDbMetas(dbMetas);
        });
      });
    }
  }

  private updateParentsFromDbMetas(dbMetas: { eventCid: CarClockLink }[]) {
    const cids = dbMetas.map((m) => m.eventCid);
    const uniqueParentsMap = new Map([...this.parents, ...cids].map((p) => [p.toString(), p]));
    this.parents = Array.from(uniqueParentsMap.values());
  }

  async handleByteHeads(byteHeads: Uint8Array) {
    // try {
    return await decodeGatewayMetaBytesToDbMeta(this.sthis, byteHeads);
    // } catch (e) {
    //   throw this.logger.Error().Err(e).Msg("parseHeader").AsError();
    // }
  }

  // async handleEventByteHead(byteHead: Uint8Array) {
  //   const crdtEntry = JSON.parse(this.sthis.txt.decode(byteHead)) as CRDTEntry;
  //   const { eventCid, dbMeta, parents } = await decodeMetaBlock(this.sthis, crdtEntry);
  //   this.loader?.taskManager?.handleEvent(eventCid, parents, dbMeta);
  // }

  async load(): Promise<DbMeta[] | Falsy> {
    const branch = "main";
    const url = await this.gateway.buildUrl(this.url(), branch);
    if (url.isErr()) {
      throw this.logger.Error().Result("buidUrl", url).Str("branch", branch).Msg("got error from gateway.buildUrl").AsError();
    }
    const bytes = await this.gateway.get(url.Ok());
    if (bytes.isErr()) {
      if (isNotFoundError(bytes)) {
        return undefined;
      }
      throw this.logger.Error().Url(url.Ok()).Result("bytes:", bytes).Msg("gateway get").AsError();
    }
    const dbMetas = await this.handleByteHeads(bytes.Ok());
    await this.loader?.handleDbMetasFromStore(dbMetas.map((m) => m.dbMeta)); // the old one didn't await
    this.updateParentsFromDbMetas(dbMetas);
    return dbMetas.map((m) => m.dbMeta);
  }

  async save(meta: DbMeta, branch?: string): Promise<Result<void>> {
    branch = branch || "main";
    this.logger.Debug().Str("branch", branch).Any("meta", meta).Msg("saving meta");
    // below is same as: const bytes = await encodeGatewayDbMetaToBytes(this.sthis, [meta]) but we need the event cid
    const event = await createDbMetaEventBlock(this.sthis, meta, this.parents);
    const bytes = await encodeEventsWithParents(this.sthis, [event], this.parents);
    const url = await this.gateway.buildUrl(this.url(), branch);
    if (url.isErr()) {
      throw this.logger.Error().Err(url.Err()).Str("branch", branch).Msg("got error from gateway.buildUrl").AsError();
    }
    const res = await this.gateway.put(url.Ok(), bytes);
    if (res.isErr()) {
      throw this.logger.Error().Err(res.Err()).Msg("got error from gateway.put").AsError();
    }
    await this.loader?.handleDbMetasFromStore([meta]);
    this.parents = [event.cid];
    return res;
  }

  async close(): Promise<Result<void>> {
    await this.gateway.close(this.url());
    this._onClosed.forEach((fn) => fn());
    return Result.Ok(undefined);
  }
  async destroy(): Promise<Result<void>> {
    return this.gateway.destroy(this.url());
  }
}

function encodeToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  let i;
  for (i = 0; i < bytes.length - 2; i += 3) {
    base64 += chars[bytes[i] >> 2];
    base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    base64 += chars[bytes[i + 2] & 63];
  }
  if (i < bytes.length) {
    base64 += chars[bytes[i] >> 2];
    if (i === bytes.length - 1) {
      base64 += chars[(bytes[i] & 3) << 4];
      base64 += "==";
    } else {
      base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      base64 += chars[(bytes[i + 1] & 15) << 2];
      base64 += "=";
    }
  }
  return base64;
}

function decodeFromBase64(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new Uint8Array((base64.length * 3) / 4);
  let i;
  let j = 0;
  for (i = 0; i < base64.length; i += 4) {
    const a = chars.indexOf(base64[i]);
    const b = chars.indexOf(base64[i + 1]);
    const c = chars.indexOf(base64[i + 2]);
    const d = chars.indexOf(base64[i + 3]);
    bytes[j++] = (a << 2) | (b >> 4);
    if (base64[i + 2] !== "=") {
      bytes[j++] = ((b & 15) << 4) | (c >> 2);
    }
    if (base64[i + 3] !== "=") {
      bytes[j++] = ((c & 3) << 6) | d;
    }
  }
  return bytes.slice(0, j);
}
