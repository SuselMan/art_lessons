/** Samples outer WebGL1/2 method intervals; never synchronously waits for GPU. */
export class GpuMethodTimer {
  constructor(gl, { everyNth = 8, maxPending = 32, timeoutMs = 15000, now = () => performance.now() } = {}) {
    this.gl = gl; this.everyNth = Math.max(1, everyNth); this.maxPending = maxPending;
    this.timeoutMs = timeoutMs; this.now = now; this.pending = []; this.rows = []; this.counts = {}; this.restores = [];
    const e2 = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const e = e2 || gl.getExtension('EXT_disjoint_timer_query'); this.ext = e;
    if (!e) { this.unavailable = 'Timer query extension absent'; return; }
    this.api = e2 ? {
      create: () => gl.createQuery(), del: q => gl.deleteQuery(q), begin: q => gl.beginQuery(e.TIME_ELAPSED_EXT, q), end: () => gl.endQuery(e.TIME_ELAPSED_EXT),
      available: q => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE), result: q => gl.getQueryParameter(q, gl.QUERY_RESULT),
      current: () => gl.getQuery(e.TIME_ELAPSED_EXT, gl.CURRENT_QUERY), bits: () => gl.getQuery(e.TIME_ELAPSED_EXT, e.QUERY_COUNTER_BITS_EXT),
    } : {
      create: () => e.createQueryEXT(), del: q => e.deleteQueryEXT(q), begin: q => e.beginQueryEXT(e.TIME_ELAPSED_EXT, q), end: () => e.endQueryEXT(e.TIME_ELAPSED_EXT),
      available: q => e.getQueryObjectEXT(q, e.QUERY_RESULT_AVAILABLE_EXT), result: q => e.getQueryObjectEXT(q, e.QUERY_RESULT_EXT),
      current: () => e.getQueryEXT(e.TIME_ELAPSED_EXT, e.CURRENT_QUERY_EXT), bits: () => e.getQueryEXT(e.TIME_ELAPSED_EXT, e.QUERY_COUNTER_BITS_EXT),
    };
    if (!(this.api.bits() > 0)) this.unavailable = 'Elapsed query counter has zero bits';
  }
  wrap(object, names) {
    for (const name of names) {
      const original = object[name]; if (typeof original !== 'function') continue;
      const timer = this;
      const wrapped = function (...args) {
        const c = timer.counts[name] ||= { calls: 0, sampled: 0, nested: 0, capacity: 0 };
        c.calls++;
        if (timer.unavailable || c.calls % timer.everyNth !== 0) return original.apply(this, args);
        if (timer.active || timer.api.current()) { c.nested++; return original.apply(this, args); }
        if (timer.pending.length >= timer.maxPending) { c.capacity++; return original.apply(this, args); }
        if (timer.gl.isContextLost() || timer.gl.getParameter(timer.ext.GPU_DISJOINT_EXT)) return original.apply(this, args);
        const query = timer.api.create(); if (!query) return original.apply(this, args);
        const row = { method: name, call: c.calls, started: timer.now(), stack: new Error().stack,
          width: args[0]?.width, height: args[0]?.height, mode: name === 'fieldOp' ? args[3] : undefined };
        timer.active = query; timer.api.begin(query); c.sampled++;
        try { return original.apply(this, args); }
        catch (error) { row.invalid = 'Method threw'; throw error; }
        finally { timer.api.end(); timer.active = null; row.cpuSubmissionMs = timer.now() - row.started; timer.pending.push({ query, row }); }
      };
      object[name] = wrapped;
      this.restores.push(() => { if (object[name] === wrapped) object[name] = original; });
    }
  }
  poll(forceReason) {
    if (!this.api) return;
    const invalid = forceReason || (this.gl.isContextLost() ? 'Context lost' : this.gl.getParameter(this.ext.GPU_DISJOINT_EXT) ? 'GPU disjoint' : undefined);
    this.pending = this.pending.filter(({ query, row }) => {
      const reason = invalid || row.invalid || (this.now() - row.started > this.timeoutMs ? 'Query timeout' : undefined);
      if (!reason && !this.api.available(query)) return true;
      if (reason) row.invalid = reason;
      else { const ns = this.api.result(query); if (Number.isFinite(ns) && ns >= 0) row.gpuMs = ns / 1e6; else row.invalid = 'Invalid query result'; }
      this.api.del(query); this.rows.push(row); return false;
    });
  }
  dispose() { this.poll('Disposed before result'); for (const restore of this.restores.splice(0)) restore(); }
  report() { return { unavailable: this.unavailable || null, everyNth: this.everyNth, counts: this.counts, rows: this.rows, pending: this.pending.length,
    interpretation: 'GPU elapsed between outer method markers; CPU submission is separate. Includes GPU scheduling, excludes compositor/presentation. Sampled calls cannot be summed as total frame time.' }; }
}
