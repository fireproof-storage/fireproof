import { KeyedResolvOnce, Logger, ResolveSeq, Result } from "@adviser/cement";
import { CryptoRuntime, KeyWithFingerPrint } from "../blockstore/types.js";
import { SysContainer, SysFileSystem } from "./sys-container.js";
import { runtimeFn } from "./runtime.js";
import { toCryptoRuntime } from "./crypto.js";
import { ensureLogger, getPathname, sanitizeURL } from "../utils.js";
import { isNotFoundError } from "../blockstore/gateway.js";
import { base58btc } from "multiformats/bases/base58";
// import { getFileSystem } from "./gateways/file/gateway.js";

export class KeyBag {
    readonly logger: Logger;
    constructor(readonly rt: KeyBagRuntime) {
        this.logger = ensureLogger(rt, "KeyBag", {
            id: rt.id()
        })
        this.logger.Debug().Msg("KeyBag created");
    }
    async subtleKey(key: string) {
        return await this.rt.crypto.importKey(
            "raw", // raw or jwk
            base58btc.decode(key),
            // hexStringToUint8Array(key), // raw data
            "AES-GCM",
            false, // extractable
            ["encrypt", "decrypt"],
        );
    }

    async toKeyWithFingerPrint(key: string): Promise<Result<KeyWithFingerPrint>> {
        const material = base58btc.decode(key); //
        return Result.Ok({
            key: await this.subtleKey(key),
            fingerPrint: base58btc.encode(new Uint8Array(await this.rt.crypto.digestSHA256(material)))
        })
    }

    readonly _seq = new ResolveSeq<Result<KeyWithFingerPrint>>();
    async setNamedKey(name: string, key: string): Promise<Result<KeyWithFingerPrint>> {
        return this._seq.add(() => this._setNamedKey(name, key));
    }

    // avoid deadlock
    async _setNamedKey(name: string, key: string): Promise<Result<KeyWithFingerPrint>> {
        const item = {
            name,
            key: key
        }
        const bag = await this.rt.getBag()
        this.logger.Debug().Str("name", name).Msg("setNamedKey");
        await bag.set(name, item);
        return await this.toKeyWithFingerPrint(item.key);
    }

    async getNamedKey(name: string, failIfNotFound = false): Promise<Result<KeyWithFingerPrint>> {
        return this._seq.add(async () => {
            const bag = await this.rt.getBag()
            const named = await bag.get(name);
            if (named) {
                this.logger.Debug().Str("name", name).Msg("found getNamedKey");
                return await this.toKeyWithFingerPrint(named.key);
            }
            if (failIfNotFound) {
                this.logger.Debug().Str("name", name).Msg("failIfNotFound getNamedKey");
                return Result.Err(new Error(`Key not found: ${name}`));
            }
            this.logger.Debug().Str("name", name).Msg("createKey getNamedKey");
            return this._setNamedKey(name, base58btc.encode(this.rt.crypto.randomBytes(this.rt.keyLength)));
        })
    }
}

export interface KeyItem {
    readonly name: string;
    readonly key: string;
}
export type KeyBagFile = Record<string, KeyItem>;

export interface KeyBagOpts {
    // in future you can encrypt the keybag with ?masterkey=xxxxx
    readonly url: string; // default: "file://$HOME/.fireproof/keybag"
    // readonly key: string; // key to encrypt the keybag
    readonly crypto: CryptoRuntime;
    readonly keyLength: number; // default: 16
    readonly logger: Logger;
    readonly keyRuntime: KeyBagRuntime
}

export interface KeyBagRuntime {
    readonly url: URL;
    readonly crypto: CryptoRuntime;
    readonly logger: Logger;
    readonly keyLength: number;
    // readonly key?: FPCryptoKey;
    getBag(): Promise<KeyBagProvider>;
    id(): string;
}

interface KeyBagCtx {
    readonly dirName: string;
    readonly sysFS: SysFileSystem
    readonly fName: string;
}
class KeyBagProvider {
    async _prepare(id: string): Promise<KeyBagCtx> {
        let sysFS: SysFileSystem;
        switch (this.url.protocol) {
            case "file:": {
                const { getFileSystem } = await import("./gateways/file/gateway.js");
                sysFS = await getFileSystem(this.url);
                break;
            }
            default:
                throw this.logger.Error().Url(this.url).Msg("unsupported protocol").AsError();
        }
        const dirName = getPathname(this.url);
        await sysFS.mkdir(dirName, { recursive: true })
        return {
            dirName,
            sysFS,
            fName: SysContainer.join(dirName, `${id.replace(/[^a-zA-Z0-9]/g, "_")}.json`)
        }
    }

    constructor(private readonly url: URL, readonly logger: Logger) {
    }

    async get(id: string): Promise<KeyItem | undefined> {
        const ctx = await this._prepare(id);
        try {
            const p = await ctx.sysFS.readfile(ctx.fName);
            return JSON.parse((new TextDecoder()).decode(p)) as KeyItem;
        } catch (e) {
            if (isNotFoundError(e)) {
                return undefined;
            }
            throw this.logger.Error().Err(e).Str("file", ctx.dirName).Msg("read bag failed").AsError();
        }
    }

    async set(id: string, item: KeyItem): Promise<void> {
        const ctx = await this._prepare(id);
        const p = (new TextEncoder()).encode(JSON.stringify(item, null, 2));
        await ctx.sysFS.writefile(ctx.fName, p);
    }
}

function defaultKeyBagOpts(kbo: Partial<KeyBagOpts>): KeyBagRuntime {
    if (kbo.keyRuntime) {
        return kbo.keyRuntime;
    }
    if (runtimeFn().isBrowser) {
        throw new Error("KeyBag is not available in the browser");
    }
    let url: URL;
    if (kbo.url) {
        url = new URL(kbo.url);
    } else {
        let bagFname = SysContainer.env.get("FP_KEYBAG_URL")
        if (!bagFname) {
            const home = SysContainer.env.get("HOME")
            bagFname = `${home}/.fireproof/keybag`
            url = new URL(`file://${bagFname}`);
        } else {
            try {
                url = new URL(bagFname);
            } catch (e) {
                url = new URL(`file://${bagFname}`);
            }
        }
    }
    const logger = ensureLogger(kbo, "KeyBag")
    if (url.protocol !== "file:") {
        throw logger.Error().Url(url).Msg("only supports file protocol").AsError();
    }
    if (url.searchParams.has("masterkey")) {
        throw logger.Error().Url(url).Msg("masterkey is not supported").AsError();
    }
    return {
        url,
        crypto: kbo.crypto || toCryptoRuntime({}),
        logger,
        keyLength: kbo.keyLength || 16,
        getBag: async () => {
            return new KeyBagProvider(url, logger);
        },
        id: () => { sanitizeURL(url); return url.toString(); }
    }
}

const _keyBags = new KeyedResolvOnce<KeyBag>();
export async function getKeyBag(kbo: Partial<KeyBagOpts> = {}): Promise<KeyBag> {
    await SysContainer.start();
    const rt = defaultKeyBagOpts(kbo);
    return _keyBags.get(rt.id()).once(async () => new KeyBag(rt));
}

