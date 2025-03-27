import { rt } from "@fireproof/core";
import { envKeyDefaults } from "../src/runtime/sts-service/index.js";

const key = await rt.sts.SessionTokenService.generateKeyPair("ES256", { extractable: true });

// eslint-disable-next-line no-console
console.log(`${envKeyDefaults.PUBLIC}=${key.strings.publicKey}`);
// eslint-disable-next-line no-console
console.log(`${envKeyDefaults.SECRET}=${key.strings.privateKey}`);
