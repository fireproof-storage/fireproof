import { expectType } from "tsd";
import pLimit from "./index.js";

const limit = pLimit(1);

const input = [limit(() => "foo"), limit(() => "bar"), limit(() => undefined)];

expectType<Promise<(string | undefined)[]>>(Promise.all(input));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
expectType<Promise<string>>(limit((a: string) => "", "test"));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
expectType<Promise<string>>(limit((a: string, b: number) => "", "test", 1));

expectType<number>(limit.activeCount);
expectType<number>(limit.pendingCount);

 
limit.clearQueue();
