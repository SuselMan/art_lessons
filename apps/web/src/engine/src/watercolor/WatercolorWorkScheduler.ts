/** Short post-lift tasks share the event loop with input and animation frames. */
export class WatercolorWorkScheduler {
    private enabled = false;
    private epoch = 0;
    // Samsung comparison: 8ms doubled Dry time; 48ms retains standalone throughput.
    private taskTimeSinceFrame = 0;
    private disposed = false;
    private nextId = 1;
    private readonly pending = new Map<number, {
        controller: AbortController;
        timer?: ReturnType<typeof setTimeout>;
        frame?: number;
    }>();
    readonly stats = { tasks: 0, frames: 0 };
    private readonly ctx: {
        canRunTasks(): boolean;
        failed(error: unknown): void;
    };
    constructor(ctx: {
        canRunTasks(): boolean;
        failed(error: unknown): void;
    }) { this.ctx = ctx; }
    get active(): boolean { return this.enabled; }
    start(): number { this.enabled = true; return ++this.epoch; }
    stop(epoch?: number): void { if (epoch === undefined || epoch === this.epoch) this.enabled = false; }
    schedule(callback: (task: boolean) => void, allowTask = true): number {
        if (this.disposed)
            return 0;
        const id = this.nextId++, entry: {
            controller: AbortController;
            timer?: ReturnType<typeof setTimeout>;
            frame?: number;
        } = { controller: new AbortController() };
        this.pending.set(id, entry);
        const frame = (): void => {
            entry.frame = requestAnimationFrame(() => {
                if (!this.pending.delete(id))
                    return;
                this.taskTimeSinceFrame = 0;
                this.stats.frames++;
                callback(false);
            });
        };
        if (!allowTask || !this.enabled || !this.ctx.canRunTasks()) {
            frame();
            return id;
        }
        const run = (): void => {
            if (!this.pending.has(id) || entry.controller.signal.aborted || this.disposed)
                return;
            // Input may have arrived after a task was posted; retain this cancellable handle.
            if (!this.enabled || !this.ctx.canRunTasks()) {
                frame();
                return;
            }
            if (this.taskTimeSinceFrame >= 48) {
                // Render the frame first; do not move GPU work into its rAF callback.
                entry.frame = requestAnimationFrame(() => {
                    if (!this.pending.has(id) || this.disposed) return;
                    entry.frame = undefined;
                    this.taskTimeSinceFrame = 0;
                    this.stats.frames++;
                    entry.timer = setTimeout(run, 0);
                });
                return;
            }
            this.pending.delete(id);
            this.stats.tasks++;
            const started = performance.now();
            try {
                callback(true);
            }
            catch (error) {
                this.ctx.failed(error);
            }
            finally { this.taskTimeSinceFrame += performance.now() - started; }
        };
        const scheduler = (globalThis as typeof globalThis & {
            scheduler?: {
                postTask(callback: () => void, options: {
                    signal: AbortSignal;
                    priority: 'user-visible';
                }): Promise<unknown>;
            };
        }).scheduler;
        if (scheduler)
            void scheduler.postTask(run, { signal: entry.controller.signal, priority: 'user-visible' }).catch(error => {
                if (entry.controller.signal.aborted || this.disposed)
                    return;
                this.pending.delete(id);
                this.ctx.failed(error);
            });
        else
            entry.timer = setTimeout(run, 0);
        return id;
    }
    cancel(id: number): void {
        const entry = this.pending.get(id);
        if (!entry)
            return;
        this.pending.delete(id);
        entry.controller.abort();
        if (entry.frame !== undefined)
            cancelAnimationFrame(entry.frame);
        if (entry.timer !== undefined)
            clearTimeout(entry.timer);
    }
    cancelAll(): void { for (const id of this.pending.keys())
        this.cancel(id); }
    destroy(): void { this.stop(); this.cancelAll(); this.disposed = true; }
}
