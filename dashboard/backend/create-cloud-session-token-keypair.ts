import { generateKeyPair } from "jose/key/generate/keypair";
import { jwk2env } from "./jwk-helper.ts";
import { exportJWK } from "jose";

const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });

// console.log(">", await exportJWK(privateKey))

console.log("Public:", await jwk2env(publicKey));
console.log("Private:", await jwk2env(privateKey));

// const txtEncoder = new TextEncoder()
// const inPubKey = await exportJWK(publicKey)
// const publicTxt =base64.encode(txtEncoder.encode(JSON.stringify(inPubKey)))
// console.log("Public:", publicTxt)
// const inPrivKey = await exportJWK(privateKey)
// const privateTxt =base64.encode(txtEncoder.encode(JSON.stringify(inPrivKey)))
// console.log("Private:", privateTxt)

// const txtDecoder = new TextDecoder()

// const publicJWT = JSON.parse(txtDecoder.decode(base64.decode(publicTxt)))
// console.log("Public=", await exportJWK(await importJWK(publicJWT, "Ed25519")), inPubKey)

// const privateJWT = JSON.parse(txtDecoder.decode(base64.decode(privateTxt)))
// console.log("Private=", await exportJWK(await importJWK(privateJWT, "Ed25519", { extractable: true})), inPrivKey)
