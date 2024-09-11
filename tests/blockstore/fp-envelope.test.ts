import { encode } from "cborg";
import { bs, Result } from '@fireproof/core'
import { CID } from "multiformats";

it("unknown bytes", () => {
    expect(bs.FPMsgMatch2Envelope(Uint8Array.from([1, 2, 3]), "bla").Err().message).toStrictEqual(
        "failed to decode envelope: Error: CBOR decode error: too many terminals, data makes no sense"
    );
});

it("unknown type", () => {
    expect(bs.FPMsgMatch2Envelope(encode({ type: "blax", payload: 4 }), "bla"))
    .toStrictEqual(Result.Err("expected type to be bla"));
})

it("no type", () => {
    expect(bs.FPMsgMatch2Envelope(encode({ type: "blax", payload: 4 })))
    .toStrictEqual(Result.Ok({ type: "blax", payload: 4 }));
})

it("car type", () => {
    expect(bs.FPMsg2Car(bs.Car2FPMsg(Uint8Array.from([1, 2, 3]))).Ok()).toStrictEqual(Uint8Array.from([1, 2, 3]));
})

it("file type", () => {
    expect(bs.FPMsg2File(bs.File2FPMsg(Uint8Array.from([1, 2, 3]))).Ok()).toStrictEqual(Uint8Array.from([1, 2, 3]));
})

it("meta type", () => {
    const ref = {
        cid: "CID",
        data: Uint8Array.from([1, 2, 3]),
        parents: ["C1", "C2"]
    };
    expect(bs.FPMsg2Meta(bs.Meta2FPMsg(ref)).Ok()).toStrictEqual(ref);
})

it("wal type", () => {
    const ref: bs.FPWAL = {
        operations: [
            {
                cars: [
                    CID.parse("bag4yvqabciqdzvfxrxfi6feubspyz666zegmp3z5w556mr4ykya2kkdm22r7pyy")
                ]
            },
            {
                cars: [
                    CID.parse("bag4yvqabciqd2ul2tw4mdcpvfq2pdqhvnqp2ktuyrtcl3j3gwhxbjzjt62xzeaq")
                ]
            }
        ]
    };
    const res = bs.FPMsg2WAL(bs.WAL2FPMsg(ref)).Ok();
    expect(res).toStrictEqual(ref);
    expect(res.operations[0].cars[0].version).toStrictEqual(1);
})