
export type QueueFunction<T = void> = () => Promise<T>;

export interface CommitQueueIf<T = void> {
    waitIdle(): Promise<void>;
    enqueue(fn: QueueFunction<T>): Promise<T>;
    processNext(): void
}
