/** Exact finite-domain contact optimization, verified on Adreno full P/C fixtures.
 * All textures are finite UNORM8, gain is finite and denominators are positive.
 * Zero face exposure or zero wet contact makes both transport terms exactly zero.
 * No pulse, capacity constraint, rounding or nonzero arithmetic is changed. */
export function brushDragEarlyZero(source: string): string {
  return source
  .replace('    vec3 flow = flowAt(from);', `    vec3 flow = flowAt(from);
    vec3 targetFlow = flowAt(to);
    float doseB = min(flow.b, targetFlow.b);
    if (doseB <= 0.0) return 0.0;`)
  .replace('    contact *= step(0.015, texture2D(u_water, (from + to) * 0.5).a);', `    contact *= step(0.015, texture2D(u_water, (from + to) * 0.5).a);
    if (contact <= 0.0) return 0.0;`)
  .replace('    float doseB = min(flow.b, flowAt(to).b);\n', '')
  .replace('(flowAt(to).rg * 2.0 - 1.0)', '(targetFlow.rg * 2.0 - 1.0)')

}
