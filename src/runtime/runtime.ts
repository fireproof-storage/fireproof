export interface Runtime {
  isNodeIsh: boolean;
  isBrowser: boolean;
  isDeno: boolean;
  isReactNative: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSet(value: string, ref: any = globalThis): boolean {
  const [head, ...tail] = value.split(".");
  if (["object", "function"].includes(typeof ref) && ref && ["object", "function"].includes(typeof ref[head]) && ref[head]) {
    if (tail.length <= 1) {
      return true;
    }
    return isSet(tail.join("."), ref[head]);
  }
  return false;
}

export function runtimeFn(): Runtime {
  const isNodeIsh = isSet("process.versions.node");
  const isDeno = isSet("Deno");
  return {
    isNodeIsh,
    isBrowser: !(isNodeIsh || isDeno),
    isDeno,
    isReactNative: false,
  };
}
