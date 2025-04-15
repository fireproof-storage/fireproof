import type { MultihashDigest, Link, ByteView, MultibaseEncoder, ToString } from "multiformats";
import { CID } from "multiformats/cid";
import { SuperThis } from "./types.js";

class NoopHashDigest implements MultihashDigest<0x4711> {
    readonly code = 0x4711;
    readonly digest = new Uint8Array(0);
    readonly size = 0;
    readonly bytes = new Uint8Array(0);
}

export class CIDPeer implements Link<unknown, 0x4711, 0x4711, 0> {
    readonly version = 0;
    readonly code = 0x4711 ;
    readonly multihash = new NoopHashDigest()
    readonly byteOffset = 0;
    readonly byteLength = 0;
    readonly bytes = new Uint8Array()

    readonly cid: CID;
    readonly peer: string;
    constructor(cid: CID, peer: string) {
        this.cid = cid;
        this.peer = peer;
    }

    static parse(data: ByteView<Uint8Array>, sthis: SuperThis): CIDPeer {
        const colonTxt = sthis.txt.decode(data);
        const split = colonTxt.split(":");
        if (split.length !== 2) {
            throw sthis.logger.Error().Any({data}).Msg("Invalid CIDPeer format").AsError();
        }
        const cid = CID.parse(split[0]);
        const peer = split[1];
        return new CIDPeer(cid, peer);
    }

    equals(other: unknown): other is Link<unknown, 0x4711, 0x4711, 0> {
        if (!(other instanceof CIDPeer)) {
            return false;
        }
        return this.cid.toString() === other.cid.toString() && this.peer === other.peer;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    toString<Prefix extends string>(_base?: MultibaseEncoder<Prefix> | undefined): ToString<Link<unknown, 0x4711, 0x4711, 0>, Prefix> {
        return `${this.cid.toString()}:${this.peer}` as ToString<Link<unknown, 0x4711, 0x4711, 0>, Prefix>;
    }
    link(): Link<unknown, 0x4711, 0x4711, 0> {
        throw new Error("Method not implemented.");
    }
    toV1(): Link<unknown, 0x4711, 0x4711, 1> {
        throw new Error("Method not implemented.");
    }
  }
