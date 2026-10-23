// The page side of replay.mts, kept plain JS: tsx would inject helpers into
// a function passed to page.evaluate.
async ({ job, tailMax }) => {
    const W = window.__wc, sim = W.sim, brush = W.brush
    const MS = 1000 / 480
    sim.clear()
    const at = (dabs, t) => {
      let i = 1
      while (i < dabs.length - 1 && dabs[i][4] < t) i++
      const a = dabs[i - 1], b = dabs[Math.min(i, dabs.length - 1)]
      const f = b[4] > a[4] ? Math.min(1, Math.max(0, (t - a[4]) / (b[4] - a[4]))) : 1
      return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, r: a[2] + (b[2] - a[2]) * f, p: a[3] + (b[3] - a[3]) * f }
    }
    const total = Math.ceil((job[job.length - 1].start + job[job.length - 1].dabs[job[job.length - 1].dabs.length - 1][4]) / MS) + 1
    let s = 0, cur = -1
    const t0 = performance.now()
    for (; s < total; s++) {
      const t = s * MS
      let seg = null
      for (let j = 0; j < job.length; j++) {
        const st = job[j], end = st.start + st.dabs[st.dabs.length - 1][4]
        if (t >= st.start && t <= end + MS) {
          if (cur !== j) { cur = j; brush.reservoir = 1; brush.seed = j * 13.7; brush.water = st.water; brush.pigment = st.pigment; brush.slot = st.slot }
          const a = at(st.dabs, t - st.start), b = at(st.dabs, t - st.start + MS)
          brush.size = b.r / (brush.scale * (0.35 + 0.65 * Math.max(0.05, b.p)))
          seg = brush.segment(a, b)
          break
        }
      }
      sim.brush = seg
      sim.step()
      if (s % 256 === 255) { sim.finish(); await new Promise(r => setTimeout(r, 0)) }
    }
    sim.brush = null
    let tail = 0
    for (; tail < tailMax && sim.region; tail++) {
      sim.step()
      if (tail % 256 === 255) { sim.finish(); await new Promise(r => setTimeout(r, 0)) }
    }
    const wetLeft = !!sim.region
    sim.dryAll()
    W.renderNow()
    const png = document.getElementById('c').toDataURL('image/png')
    return { png, steps: s, tail, wetLeft, sec: (performance.now() - t0) / 1000 }
  }
