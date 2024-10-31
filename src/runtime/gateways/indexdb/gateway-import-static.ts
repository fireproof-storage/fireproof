// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function gatewayImport(): Promise<any> {
  return import("./web/gateway-impl.js");
}
