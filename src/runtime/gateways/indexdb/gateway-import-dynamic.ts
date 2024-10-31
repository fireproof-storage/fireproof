// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function gatewayImport(): Promise<any> {
  const gwimpl = "./web/gateway-impl.js";
  return import(/* @vite-ignore */ gwimpl);
}
