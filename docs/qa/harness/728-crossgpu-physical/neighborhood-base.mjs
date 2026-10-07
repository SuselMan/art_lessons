/** QA-only synchronous tiny readback. No operators, textures or uniforms changed. */
export function worldRead(meta, point, radius = 2) {
  const [wx, wy] = point;
  const topX = Math.floor((wx + 0.5 - meta.x0) / meta.S);
  const topY = Math.floor((wy + 0.5 - meta.y0) / meta.S);
  const center = [topX, meta.h - 1 - topY];
  if (center[0] < 0 || center[1] < 0 || center[0] >= meta.w || center[1] >= meta.h) return null;
  const x = Math.max(0, center[0] - radius), y = Math.max(0, center[1] - radius);
  return {x, y, w:Math.min(meta.w - x, center[0] + radius + 1 - x), h:Math.min(meta.h - y, center[1] + radius + 1 - y), center};
}
