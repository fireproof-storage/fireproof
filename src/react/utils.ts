/**
 * Deep clone a value
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone !== "undefined") {
    return structuredClone(value);
  } else {
    // Fallback if structuredClone is not available (older browsers, older Node versions, etc.)
    return JSON.parse(JSON.stringify(value));
  }
}
