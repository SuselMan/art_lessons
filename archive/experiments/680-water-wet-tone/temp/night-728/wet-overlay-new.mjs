function wetOverlayWorkspace(pixels) {
  return { rowMax: new Float32Array(pixels), rgba: new Uint8Array(pixels * 4) };
}
function wetOverlayPixels(cells, pools, w, h, workspace) {
  const { rowMax, rgba } = workspace;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let max = 0;
      const end = row + Math.min(w - 1, x + 2);
      for (let i = row + Math.max(0, x - 2); i <= end; i++) {
        if (cells[i] > max) max = cells[i];
      }
      rowMax[row + x] = max;
    }
  }
  const tent = (field, x, y, i) => {
    if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
      return (field[i] * 4 + (field[i + w] + field[i - w] + field[i + 1] + field[i - 1]) * 2 + field[i + w + 1] + field[i + w - 1] + field[i - w + 1] + field[i - w - 1]) * 0.0625;
    }
    const at = (xx, yy) => xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : field[yy * w + xx];
    return (at(x, y) * 4 + (at(x, y + 1) + at(x, y - 1) + at(x + 1, y) + at(x - 1, y)) * 2 + at(x + 1, y + 1) + at(x - 1, y + 1) + at(x + 1, y - 1) + at(x - 1, y - 1)) * 0.0625;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let body = 0;
      for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2); yy++) {
        const v = rowMax[yy * w + x];
        if (v > body) body = v;
      }
      const o = i * 4;
      rgba[o] = rgba[o + 2] = Math.round(Math.min(tent(cells, x, y, i), 1) * 255);
      rgba[o + 1] = Math.round(Math.min(tent(pools, x, y, i), 1) * 255);
      rgba[o + 3] = Math.round(Math.min(body, 1) * 255);
    }
  }
  return rgba;
}
export {
  wetOverlayPixels,
  wetOverlayWorkspace
};
