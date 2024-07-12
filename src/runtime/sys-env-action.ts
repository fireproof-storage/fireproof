interface EnvActions {
  get(key: string): string | undefined;
  set(key: string, value?: string): void;
  del(key: string): void;
  use(): boolean;
}

class NodeEnvActions implements EnvActions {
  readonly #node = globalThis as unknown as { process: { env: Record<string, string> } };
  use(): boolean {
    return typeof this.#node === "object" && typeof this.#node.process === "object" && typeof this.#node.process.env === "object";
  }
  readonly #env = this.use() ? process.env : {};
  get(key: string): string | undefined {
    return this.#env[key];
  }
  set(key: string, value?: string): void {
    if (value) {
      this.#env[key] = value;
    }
  }
  del(key: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.#env[key];
  }
}

class DenoEnvActions implements EnvActions {
  readonly #deno = globalThis as unknown as { Deno: { env: Map<string, string> } };

  readonly #env: Map<string, string>;
  constructor(env?: Map<string, string>) {
    if (env) {
      this.#env = env;
    } else {
      this.#env = this.use() ? this.#deno.Deno.env : new Map();
    }
  }
  use(): boolean {
    return typeof this.#deno === "object" && typeof this.#deno.Deno === "object" && typeof this.#deno.Deno.env === "object";
  }
  get(key: string): string | undefined {
    return this.#env.get(key);
  }
  set(key: string, value?: string): void {
    if (value) {
      this.#env.set(key, value);
    }
  }
  del(key: string): void {
    this.#env.delete(key);
  }
}

class BrowserEnvActions extends DenoEnvActions {
  static readonly sym = Symbol.for("FP_ENV");
  static getEnv() {
    const browser = globalThis as unknown as { [BrowserEnvActions.sym]: Map<string, string> };
    if (typeof browser === "object" && browser[BrowserEnvActions.sym]) {
      return browser[BrowserEnvActions.sym];
    }
    browser[BrowserEnvActions.sym] = new Map();
    return browser[BrowserEnvActions.sym];
  }

  constructor() {
    // not perfect the globalThis will be polluted
    // also in the case it is not need.
    // better we have a lazy init
    super(BrowserEnvActions.getEnv());
  }
  use(): boolean {
    return true;
  }
}

function envFactory(): EnvActions {
  const found = [new NodeEnvActions(), new DenoEnvActions(), new BrowserEnvActions()].find((env) => env.use());
  if (!found) {
    throw new Error("SysContainer:envFactory: no env available");
  }
  return found;
}
const envImpl = envFactory();
export class EnvImpl {
  get(key: string): string | undefined {
    return envImpl.get(key);
  }
  set(key: string, value?: string): void {
    value && envImpl.set(key, value);
  }
  del(key: string): void {
    envImpl.del(key);
  }
}
