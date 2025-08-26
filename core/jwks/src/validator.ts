import { Result, Option } from "@adviser/cement";
import { importJWK } from "jose";

// Basic JWKS interfaces
export interface JWK {
  kty: string;
  use?: string;
  kid?: string;
  alg?: string;
  n?: string; // RSA modulus
  e?: string; // RSA exponent
  crv?: string; // EC curve
  x?: string; // EC x coordinate
  y?: string; // EC y coordinate
  k?: string; // Symmetric key
}

export interface JWKS {
  keys: JWK[];
}

export interface JWKSValidationOptions {
  allowedKeyTypes?: string[];
  allowedUse?: string[];
  requireKeyId?: boolean;
  maxKeys?: number;
}

export interface KeyValidationResult {
  isValid: boolean;
  isCurrent: boolean;
  keyId?: string;
  validationErrors: string[];
  warningMessages: string[];
  originalKey: JWK;
}

export interface JWKSValidationResult {
  isValid: boolean;
  validKeysCount: number;
  currentKeysCount: number;
  totalKeysCount: number;
  validationErrors: string[];
  warningMessages: string[];
  keyResults: KeyValidationResult[];
}

export class JWKSValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "JWKSValidationError";
  }
}

export class JWKSFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "JWKSFetchError";
  }
}

// Simple URL builder that works with Clerk
export function buildJWKSUrl(config: string): string {
  if (config.startsWith("http://") || config.startsWith("https://")) {
    // Validate URL to prevent
    return config;
  }

  // Handle Clerk-style strings (both "trusted-glowworm-5" and "*.clerk.accounts.dev")
  if (config.includes("clerk") || (!config.includes(".") && config.length > 0)) {
    const domain = config.includes(".") ? config : `${config}.clerk.accounts.dev`;
    return `https://${domain}/.well-known/jwks.json`;
  }

  throw new JWKSValidationError("Invalid JWKS configuration", "INVALID_CONFIG", { config });
}

// Fetch JWKS with retries
export async function fetchJWKS(
  config: string,
  options?: {
    timeout?: number;
    retries?: number;
    userAgent?: string;
  },
): Promise<Result<JWKS, JWKSFetchError>> {
  try {
    const url = buildJWKSUrl(config);
    const timeout = options?.timeout ?? 5000;
    const retries = options?.retries ?? 3;
    const userAgent = options?.userAgent ?? "fireproof-jwks-fetcher/1.0";

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": userAgent,
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new JWKSFetchError(`HTTP ${response.status}: ${response.statusText}`, response.status, url);
        }

        const jsonData = await response.json();

        if (!jsonData?.keys || !Array.isArray(jsonData.keys)) {
          throw new JWKSFetchError("Response does not contain a 'keys' array", response.status, url);
        }

        return Result.Ok(jsonData as JWKS);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors
        if (error instanceof JWKSFetchError && error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        // Wait before retry
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new JWKSFetchError(`Failed to fetch JWKS after ${retries + 1} attempts`, undefined, url, lastError);
  } catch (error) {
    if (error instanceof JWKSFetchError) {
      return Result.Err(error);
    }
    return Result.Err(
      new JWKSFetchError(
        error instanceof Error ? error.message : String(error),
        undefined,
        undefined,
        error instanceof Error ? error : undefined,
      ),
    );
  }
}

// Validate individual key
export async function validateJWKSKey(key: JWK, options: JWKSValidationOptions = {}): Promise<KeyValidationResult> {
  const result: KeyValidationResult = {
    isValid: false,
    isCurrent: false,
    keyId: key.kid,
    validationErrors: [],
    warningMessages: [],
    originalKey: key,
  };

  const allowedKeyTypes = options.allowedKeyTypes ?? ["RSA", "EC"];
  const allowedUse = options.allowedUse ?? ["sig"];
  const requireKeyId = options.requireKeyId ?? true;

  // Basic validations
  if (!key.kty) {
    result.validationErrors.push("Missing required field 'kty'");
  } else if (!allowedKeyTypes.includes(key.kty)) {
    result.validationErrors.push(`Unsupported key type: ${key.kty}`);
  }

  if (requireKeyId && !key.kid) {
    result.validationErrors.push("Missing required field 'kid'");
  }

  if (key.use && !allowedUse.includes(key.use)) {
    result.validationErrors.push(`Unsupported key use: ${key.use}`);
  }

  // Key-specific validations
  if (key.kty === "RSA" && (!key.n || !key.e)) {
    result.validationErrors.push("RSA key missing n or e parameters");
  }

  if (key.kty === "EC" && (!key.crv || !key.x || !key.y)) {
    result.validationErrors.push("EC key missing crv, x, or y parameters");
  }

  // Try to import the key
  try {
    await importJWK(key, key.alg as string | undefined);
    result.isCurrent = result.validationErrors.length === 0;
  } catch (error) {
    result.validationErrors.push(`Key import failed: ${error instanceof Error ? error.message : error}`);
  }

  result.isValid = result.validationErrors.length === 0;
  return result;
}

// Validate JWKS
export async function validateJWKS(jwks: JWKS, options: JWKSValidationOptions = {}): Promise<JWKSValidationResult> {
  const result: JWKSValidationResult = {
    isValid: false,
    validKeysCount: 0,
    currentKeysCount: 0,
    totalKeysCount: jwks.keys.length,
    validationErrors: [],
    warningMessages: [],
    keyResults: [],
  };

  if (jwks.keys.length === 0) {
    result.validationErrors.push("JWKS contains no keys");
    return result;
  }

  const maxKeys = options.maxKeys ?? 10;
  if (jwks.keys.length > maxKeys) {
    result.validationErrors.push(`Too many keys: ${jwks.keys.length} (max: ${maxKeys})`);
    return result;
  }

  // Validate each key
  for (const key of jwks.keys) {
    const keyResult = await validateJWKSKey(key, options);
    result.keyResults.push(keyResult);

    if (keyResult.isValid) result.validKeysCount++;
    if (keyResult.isCurrent) result.currentKeysCount++;
  }

  result.isValid = result.validationErrors.length === 0 && result.validKeysCount > 0;
  return result;
}

// Main function
export async function fetchAndValidateJWKS(
  config: string,
  validationOptions: JWKSValidationOptions = {},
  fetchOptions?: {
    timeout?: number;
    retries?: number;
    userAgent?: string;
  },
): Promise<Result<{ jwks: JWKS; validation: JWKSValidationResult }, JWKSFetchError | JWKSValidationError>> {
  const fetchResult = await fetchJWKS(config, fetchOptions);
  if (fetchResult.is_err()) {
    return Result.Err(fetchResult.unwrap_err());
  }

  const jwks = fetchResult.unwrap();
  const validation = await validateJWKS(jwks, validationOptions);

  return Result.Ok({ jwks, validation });
}

// Utility functions
export function getCurrentKeys(validationResult: JWKSValidationResult): JWK[] {
  return validationResult.keyResults.filter((result) => result.isCurrent && result.isValid).map((result) => result.originalKey);
}

export function findKeyById(jwks: JWKS, keyId: string): Option<JWK> {
  const key = jwks.keys.find((k) => k.kid === keyId);
  return key ? Option.Some(key) : Option.None();
}
