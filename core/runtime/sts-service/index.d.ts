import { Result } from "@adviser/cement";
import { JWTVerifyResult } from "jose";
import { GenerateKeyPairOptions } from "jose/key/generate/keypair";
import { SuperThis } from "@fireproof/core-types";
import { BaseTokenParam, FPCloudClaim, TokenForParam } from "@fireproof/core-types/protocols/cloud";
export declare const envKeyDefaults: {
    SECRET: string;
    PUBLIC: string;
};
interface SessionTokenServiceParam extends Partial<BaseTokenParam> {
    readonly token: string;
}
interface SessionTokenServiceFromEnvParam extends Partial<BaseTokenParam> {
    readonly privateEnvKey?: string;
    readonly publicEnvKey?: string;
}
export declare function jwk2env(jwk: CryptoKey, sthis?: SuperThis): Promise<string>;
export declare function env2jwk(env: string, alg: string, sthis?: SuperThis): Promise<CryptoKey>;
export interface KeysResult {
    readonly material: CryptoKeyPair;
    readonly strings: {
        readonly publicKey: string;
        readonly privateKey: string;
    };
}
export declare class SessionTokenService {
    #private;
    static generateKeyPair(alg?: string, options?: GenerateKeyPairOptions, generateKeyPairFN?: (alg: string, options: GenerateKeyPairOptions) => Promise<import("jose").GenerateKeyPairResult>): Promise<KeysResult>;
    static createFromEnv(sthis: SuperThis, sp?: SessionTokenServiceFromEnvParam): Promise<SessionTokenService>;
    static create(stsparam: SessionTokenServiceParam, sthis?: SuperThis): Promise<SessionTokenService>;
    private constructor();
    get validFor(): number;
    get alg(): string;
    get isssuer(): string;
    get audience(): string;
    validate(token: string): Promise<Result<JWTVerifyResult<FPCloudClaim>>>;
    tokenFor(p: TokenForParam): Promise<string>;
}
export {};
//# sourceMappingURL=index.d.ts.map