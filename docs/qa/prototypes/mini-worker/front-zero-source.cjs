'use strict';
// Shared QA-only transformation for the installer AND the opt-in build plugin.
// Keep the old final expression verbatim, including G/B/A and cost division.
const FRONT_ZERO_GUARD = `    if (best == 0.0 && u_costMax > 0.0 && u_costMax <= 65536.0
        && u_stride >= 0.0 && u_stride <= 65536.0
        && u_floor >= 0.0 && u_floor <= 65536.0
        && u_dryCost >= 0.0 && u_dryCost <= 65536.0
        && u_climb >= 0.0 && u_climb <= 65536.0) {
      gl_FragColor = vec4(min(best, u_costMax) / u_costMax, hj, texture2D(u_cost, v_uv).b, 1.0);
      return;
    }
`;
function transformFrontZeroSource(source) {
  if (typeof source !== 'string') throw new TypeError('Water-front source must be a string');
  const anchor = '    float hj = wcFrontHeightAt(px);\n    float climb = u_climb';
  if (source.split(anchor).length !== 2) throw new Error('Water-front zero shortcut source anchor changed');
  return source.replace(anchor, '    float hj = wcFrontHeightAt(px);\n' + FRONT_ZERO_GUARD + '    float climb = u_climb');
}
// Copy the jump's original result expression: there is no local hj in it.
const FRONT_JUMP_ZERO_GUARD = FRONT_ZERO_GUARD.replace(
  'gl_FragColor = vec4(min(best, u_costMax) / u_costMax, hj, texture2D(u_cost, v_uv).b, 1.0);',
  'gl_FragColor=vec4(min(best,u_costMax)/u_costMax,wcFrontHeightAt(v_uv*u_resolution),texture2D(u_cost,v_uv).b,1.0);'
);
const FRONT_JUMP_ZERO_ANCHOR = ' void main(){float best=texture2D(u_cost,v_uv).r*u_costMax;vec4 e0=';
function transformFrontJumpZeroSource(source) {
  if (typeof source !== 'string') throw new TypeError('Water-front jump source must be a string');
  if (source.split(FRONT_JUMP_ZERO_ANCHOR).length !== 2) throw new Error('Water-front jump zero shortcut source anchor changed');
  return source.replace(FRONT_JUMP_ZERO_ANCHOR,
    ' void main(){float best=texture2D(u_cost,v_uv).r*u_costMax;\n' + FRONT_JUMP_ZERO_GUARD + 'vec4 e0=');
}
module.exports = {FRONT_ZERO_GUARD, transformFrontZeroSource, FRONT_JUMP_ZERO_ANCHOR, FRONT_JUMP_ZERO_GUARD, transformFrontJumpZeroSource};
