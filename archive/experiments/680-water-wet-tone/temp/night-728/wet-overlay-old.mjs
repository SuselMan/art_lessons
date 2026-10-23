export function old(cells,pools,w,h){
    const poolAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : pools[y * w + x]
    const data = new Uint8Array(w * h * 4)
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : cells[y * w + x]
    const rowMax = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0
        for (let i = -2; i <= 2; i++) { const v = at(x + i, y); if (v > m) m = v }
        rowMax[y * w + x] = m
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tent = (
          at(x, y) * 4
          + (at(x, y + 1) + at(x, y - 1) + at(x + 1, y) + at(x - 1, y)) * 2
          + at(x + 1, y + 1) + at(x - 1, y + 1) + at(x + 1, y - 1) + at(x - 1, y - 1)
        ) * 0.0625
        let body = 0
        for (let j = -2; j <= 2; j++) { const yy = y + j; if (yy < 0 || yy >= h) continue; const v = rowMax[yy * w + x]; if (v > body) body = v }
        // The pool as the tint's own tent, not the body's 5x5 max: the pool is
        // drawn as a tone now (s17.83), and its edge must be the grey's.
        const pool = (
          poolAt(x, y) * 4
          + (poolAt(x, y + 1) + poolAt(x, y - 1) + poolAt(x + 1, y) + poolAt(x - 1, y)) * 2
          + poolAt(x + 1, y + 1) + poolAt(x - 1, y + 1) + poolAt(x + 1, y - 1) + poolAt(x - 1, y - 1)
        ) * 0.0625
        const o = (y * w + x) * 4
        data[o] = data[o + 2] = Math.round(Math.min(tent, 1) * 255)
        data[o + 1] = Math.round(Math.min(pool, 1) * 255)
        data[o + 3] = Math.round(Math.min(body, 1) * 255)
      }
    }

return data;
}
