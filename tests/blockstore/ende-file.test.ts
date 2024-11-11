// import { encodeFile } from "@ipld/unixfs/src/codec"
import { CID } from "multiformats"
import { encodeFile } from "../../src/runtime/files"
import * as json from 'multiformats/codecs/json'
import { sha256 } from 'multiformats/hashes/sha2'

describe("EndeFile", () => {
    it("encodeFile", async () => {
        const input = new Blob(Array(20).fill(0).map((_, i) => `part-${i}`))
        const hash = await sha256.digest(new Uint8Array(await input.arrayBuffer()))
        const expCid = CID.create(1, json.code, hash)
        const res = await encodeFile(input)
        expect(res).toEqual({
            "cid": expCid,
            blocks: [{
                bytes: new Uint8Array(await input.arrayBuffer()),
                "cid": expCid,
                    // "/": "bafkreigqhecnoquqdegydvbppocuty4zv2arcihwm35yibt3tbzgt3jzj4",
                // }
            }]
        })
    })
    it("decodeFile", () => {
        // decodeFile({}, "cid", { size: 0, type: "" })
        // TODO
    })
})