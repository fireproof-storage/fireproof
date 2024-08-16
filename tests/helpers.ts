import { runtimeFn, toCryptoRuntime, URI } from "@adviser/cement";
import { dataDir, rt } from "@fireproof/core";
import { renderHook, RenderHookResult } from "@testing-library/react";
import { Database, useFireproof } from "use-fireproof";
import type { UseFireproof, ConfigOpts } from "use-fireproof";


export { dataDir };

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function toFileWithCid(buffer: Uint8Array, name: string, opts: FilePropertyBag): Promise<FileWithCid> {
  return {
    file: new File([new Blob([buffer])], name, opts),
    cid: (await rt.files.encodeFile(new File([new Blob([buffer])], name, opts))).cid.toString(),
  };
}

export interface FileWithCid {
  file: File;
  cid: string;
}
export async function buildBlobFiles(): Promise<FileWithCid[]> {
  const cp = toCryptoRuntime();
  return [
    await toFileWithCid(cp.randomBytes(Math.random() * 51283), `image.jpg`, { type: "image/jpeg" }),
    await toFileWithCid(cp.randomBytes(Math.random() * 51283), `fireproof.png`, { type: "image/png" }),
  ];
}

export function storageURL(): URI {
  const old = rt.SysContainer.env.get("FP_STORAGE_URL");
  if (runtimeFn().isBrowser) {
    return URI.merge(`indexdb://fp`, old);
  }
  return URI.merge(`./dist/env`, old);
}

export type Todo = Partial<{
  readonly text: string;
  readonly date: number;
  readonly completed: boolean;
}>;

export const defaultTodo: Todo = {
  text: "",
  date: Date.now(),
  completed: false,
};

export function generateTexts(): string[] {
  const texts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const text = ">" + Math.random().toString(36).substring(7);
    texts.push(text);
  }
  return texts;
};

export async function populateDatabase(db: Database, texts: string[]) {
  for (const text of texts) {
    const ok = await db.put<Todo>({ text, date: Date.now(), completed: false });
    expect(ok.id).toBeDefined();
  }
}

type UseFireproofProps = [Partial<string | Database>, Partial<ConfigOpts>];
export function getUseFireproofHook(db: Database): RenderHookResult<UseFireproof, UseFireproofProps> {
  return renderHook(() => useFireproof(db));
}
