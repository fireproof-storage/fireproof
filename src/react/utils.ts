/**
 * Deep clone a value
 */
export function deepClone<T>(value: T): T {
  return (structuredClone ?? ((v: T) => JSON.parse(JSON.stringify(v))))(value);
}
