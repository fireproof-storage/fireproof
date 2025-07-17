import { expectType } from "tsd";
import pLimit from "./index.js";

const limit = pLimit(1);

const input = [limit(async () => "foo"), limit(async () => "bar"), limit(async () => undefined)];

expectType<Promise<(string | undefined)[]>>(Promise.all(input));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
expectType<Promise<string>>(limit((a: string) => "", "test"));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
expectType<Promise<string>>(limit(async (a: string, b: number) => "", "test", 1));

expectType<number>(limit.activeCount);
expectType<number>(limit.pendingCount);

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
expectType<void>(limit.clearQueue());
