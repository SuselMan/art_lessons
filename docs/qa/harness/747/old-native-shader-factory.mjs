// QA ONLY. Construct an independently compiled old pass set, never production.
// Caller MUST supply an explicit context that disables any corrected runtime
// sampling policy; absence is a hard error rather than a false old/new oracle.
export function createOldNativePasses(gl, WatercolorPasses, oldContext, assertOldPolicy) {
  if (typeof assertOldPolicy !== 'function' || assertOldPolicy(oldContext) !== true) throw Error('Old runtime policy not explicitly proved disabled');
  const original = gl.shaderSource;
  let changed = 0;
  const replacements = [];
  const passes = new WatercolorPasses(oldContext);
  gl.shaderSource = function(shader, source) {
    if (source.includes('float wcMode6CostOffset(')) {
      if (++changed !== 1) throw Error('More than one mode6 fragment was rewritten');
      const helper = /  \/\/ QA candidate: explicit bilinear[^\n]*\n[\s\S]*?(?=  uniform sampler2D u_e;)/;
      if (!helper.test(source)) throw Error('Unknown explicit mode6 helper shape');
      source = source.replace(helper, '');
      const pairs = [
        ['float costOut = texture2D(u_d, gl_FragCoord.xy / u_mode6Resolution).r;', 'float costOut = texture2D(u_d, v_uv).r;'],
        ['vec2 offsetPx = vec2(cos(ang), sin(ang)) * WC_TIDE_RING_TX * u_mode6DirPx;', 'vec2 o = vec2(cos(ang), sin(ang)) * WC_TIDE_RING_TX * u_dir;'],
        ['wcMode6CostOffset(offsetPx)', 'texture2D(u_d, v_uv + o).r'],
      ];
      for (const [from, to] of pairs) {
        if (source.split(from).length !== 2) throw Error('Old shader replacement is not unique: ' + from);
        source = source.replace(from, to); replacements.push(from);
      }
      if (/wcMode6CostOffset|u_mode6Resolution|u_mode6DirPx/.test(source)) throw Error('Corrected helper survived old shader construction');
    }
    return original.call(this, shader, source);
  };
  try {
    passes.initFieldPrograms(); passes.initSettlePrograms();
    passes.initFieldUniforms(); passes.initFieldAttributes(); passes.initDiffusionAttributes();
    if (changed !== 1 || replacements.length !== 3) throw Error('Old fragment was not independently reconstructed');
    return {passes, qualification:'QA source rewrite plus explicitly disabled corrected sampling context', replacements};
  } catch (error) { passes.destroy(); throw error; }
  finally { gl.shaderSource = original; }
}
