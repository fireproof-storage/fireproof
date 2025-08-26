// Legacy compatibility layer
import { fetchJWKS } from "./validator.js";

/**
 * Legacy function for backward compatibility
 * @deprecated Use fetchJWKS or fetchAndValidateJWKS instead
 */
export async function fetchJwks(url: string) {
  const result = await fetchJWKS(url);
  if (result.is_err()) {
    throw result.unwrap_err();
  }
  return result.unwrap();
}
