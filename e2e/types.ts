// TypeScript declarations for Fireproof E2E tests

interface FireproofDoc {
  _id: string;
  [key: string]: unknown;
}

interface FireproofDocResponse {
  id: string;
  ok: boolean;
}

interface FireproofAllDocsResult {
  rows: {
    key: string;
    value: FireproofDoc;
  }[];
  clock: unknown[];
}

declare global {
  interface Window {
    fpInit: () => Promise<unknown>;
    fpPut: (id: string, data: Record<string, unknown>) => Promise<FireproofDocResponse>;
    fpGet: (id: string) => Promise<FireproofDoc>;
    fpAllDocs: () => Promise<FireproofAllDocsResult>;
  }
}

export {};
