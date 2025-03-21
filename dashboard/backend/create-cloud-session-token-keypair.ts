import { rt } from "@fireproof/core";

const key = await rt.sts.SessionTokenService.generateKeyPair("ES256", { extractable: true });

console.log("Public:", key.strings.publicKey);
console.log("Private:", key.strings.privateKey);
