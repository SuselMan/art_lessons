// Standalone DEV scheduler: fixed material operations, extra bounded work between frames.
// The existing canonical/settle slices fence GPU work and retain their own budgets.
export function installDryPump(engine) {
  const fifo = engine._wcCanonical, queue = engine._settleQueue;
  const schedule = fifo.ctx.schedule, unschedule = fifo.ctx.unschedule;
  const scheduleTick = queue.scheduleTick;
  const previousContinuations = queue.continuationTasksEnabled;
  let active = false, disposed = false, nextHandle = -1;
  const tasks = new Map();
  const stats = { tasks: 0, frames: 0, solverTasks: 0 };
  const post = run => {
    const id = nextHandle--, controller = new AbortController();
    const item = { controller, timer: null };
    tasks.set(id, item);
    const callback = () => {
      if (!tasks.delete(id) || controller.signal.aborted || disposed) return;
      run();
    };
    if (globalThis.scheduler?.postTask) void globalThis.scheduler.postTask(callback, {
      signal: controller.signal, priority: 'user-visible',
    }).catch(error => {
      if (controller.signal.aborted || disposed) return;
      tasks.delete(id); fifo.cancel(false); fifo.ctx.failed(error);
    });
    else item.timer = setTimeout(callback, 0);
    return id;
  };
  queue.scheduleTick = function() {
    const job = queue.current;
    if (!active || disposed || engine._strokeLayerId || engine._contextLost
      || engine.gl.isContextLost()) return scheduleTick.call(queue);
    if (!job || job.raf) return;
    job.raf = post(() => {
      if (queue.current !== job) return;
      job.raf = 0;
      if (engine._strokeLayerId || !active) { scheduleTick.call(queue); return; }
      stats.solverTasks++;
      // Existing tick preserves operator order and its one-unit/8ms batching rules.
      queue.tick(true);
      if (!engine._contextLost && !engine.gl.isContextLost()) engine.gl.finish();
    });
  };
  fifo.ctx.schedule = callback => {
    // A blocked FIFO must not poll in a tight task loop while its solver owns the field.
    // Real pen input always returns to the ordinary frame scheduler.
    if (!active || disposed || engine._strokeLayerId || engine._settle
      || engine._contextLost || engine.gl.isContextLost()) {
      stats.frames++;
      return schedule(callback);
    }
    const id = nextHandle--, controller = new AbortController();
    const item = { controller, timer: null };
    tasks.set(id, item);
    const run = () => {
      if (!tasks.delete(id) || controller.signal.aborted || disposed) return;
      if (engine._strokeLayerId || engine._settle) {
        stats.frames++;
        fifo.frame = schedule(callback);
        return;
      }
      stats.tasks++;
      callback();
    };
    const scheduler = globalThis.scheduler;
    if (scheduler?.postTask) void scheduler.postTask(run, {
      signal: controller.signal, priority: 'user-visible',
    }).catch(error => {
      if (controller.signal.aborted || disposed) return;
      tasks.delete(id);
      fifo.cancel(false);
      fifo.ctx.failed(error);
    });
    else item.timer = setTimeout(run, 0);
    return id;
  };
  fifo.ctx.unschedule = id => {
    const item = tasks.get(id);
    if (!item) { if (id >= 0) unschedule(id); return; }
    tasks.delete(id); item.controller.abort();
    if (item.timer !== null) clearTimeout(item.timer);
  };
  return {
    stats,
    start() {
      active = true; queue.continuationTasksEnabled = false;
      const job = queue.current;
      if (job?.raf > 0) { cancelAnimationFrame(job.raf); job.raf = 0; }
      queue.scheduleTick();
    },
    stop() { active = false; queue.continuationTasksEnabled = previousContinuations; },
    dispose() {
      if (disposed) return;
      active = false; disposed = true;
      for (const id of [...tasks.keys()]) fifo.ctx.unschedule(id);
      fifo.ctx.schedule = schedule; fifo.ctx.unschedule = unschedule;
      queue.scheduleTick = scheduleTick;
      queue.continuationTasksEnabled = previousContinuations;
    },
  };
}
