import type { WatercolorPassField, WatercolorPassesContext } from '../../../../../apps/web/src/engine/src/raster/WatercolorPassTypes';
import { AccumulationBuffer } from '../../../../../apps/web/src/engine/src/buffers/AccumulationBuffer';
import { DISPLAY_VERT, WC_WATER_FRONT_FRAG } from '../../../../../apps/web/src/engine/src/raster/shaders';
import { createProgram, getUniforms } from '../../../../../apps/web/src/engine/src/raster/utils';
// Versioned native material path. Native pigment/colour/rims/brush remain untouched.
export function fastFrontSchedule(steps: number, mode: 'prefix4' | 'prefix8' = 'prefix8'): number[] {
    const stride = mode === 'prefix4' ? 4 : 8;
    if (steps <= 16)
        return Array.from({ length: steps }, () => 1);
    return [...Array.from({ length: Math.ceil(steps / stride) }, () => stride), ...Array(8).fill(1)];
}
type Uniforms = Record<string, WebGLUniformLocation | null>;
type FrontArgs = [
    WatercolorPassField,
    number,
    number,
    number,
    AccumulationBuffer,
    AccumulationBuffer,
    number,
    number,
    number,
    number?,
    number?,
    (WebGLTexture | null)?
];
const prefix = WC_WATER_FRONT_FRAG.slice(0, WC_WATER_FRONT_FRAG.indexOf('  void main()'));
const packing = `
 vec2 encodeCost(float cost) {float q=ceil(clamp(cost/u_costMax,0.0,1.0)*65535.0);return vec2(floor(q/256.0),mod(q,256.0))/255.0;}
 float decodeCost(vec2 value){return dot(floor(value*255.0+0.5),vec2(256.0,1.0))*u_costMax/65535.0;}
 float unitEdge(vec2 px,vec2 direction){
  vec2 uv=px/u_resolution; vec2 far=px+direction;
  if(far.x<0.0||far.y<0.0||far.x>=u_resolution.x||far.y>=u_resolution.y)return u_costMax;
  float climb=u_climb*(1.0+WC_FRONT_FEATHER*smoothstep(WC_FRONT_FEATHER_LO,WC_FRONT_FEATHER_HI,wcFbm((px+u_paperOrigin)*WC_FRONT_FEATHER_SCALE+vec2(41.0,7.0))));
  float relief=max(u_floor,1.0+climb*(wcFrontHeightAt(px)-wcFrontHeightAt(far)));
  float film=smoothstep(WC_FILM_LO,WC_FILM_HI,max(texture2D(u_film,uv).a,u_foreignWet*texture2D(u_foreignFilm,uv).r));
  return length(direction)*relief*mix(u_dryCost,1.0,film);
 }
`;
const buildShader = prefix + packing + `
 uniform vec2 u_directionA;uniform vec2 u_directionB;uniform float u_buildStride;
 void main(){vec2 px=v_uv*u_resolution;vec2 a,b;
 if(u_buildStride<0.5){a=encodeCost(unitEdge(px,u_directionA));b=encodeCost(unitEdge(px,u_directionB));}
 else {vec4 here=texture2D(u_cost,v_uv);vec2 ua=v_uv+u_directionA*u_buildStride/u_resolution,ub=v_uv+u_directionB*u_buildStride/u_resolution;
 float ca=decodeCost(here.rg),cb=decodeCost(here.ba);
 ca+=ua.x<0.0||ua.y<0.0||ua.x>1.0||ua.y>1.0?u_costMax:decodeCost(texture2D(u_cost,ua).rg);
 cb+=ub.x<0.0||ub.y<0.0||ub.x>1.0||ub.y>1.0?u_costMax:decodeCost(texture2D(u_cost,ub).ba);
 a=encodeCost(ca);b=encodeCost(cb);}
 gl_FragColor=vec4(a,b);}
`;
const jumpShader = prefix + packing + `
 uniform sampler2D u_edges0;uniform sampler2D u_edges1;uniform sampler2D u_edges2;uniform sampler2D u_edges3;
 void main(){float best=texture2D(u_cost,v_uv).r*u_costMax;vec4 e0=texture2D(u_edges0,v_uv),e1=texture2D(u_edges1,v_uv),e2=texture2D(u_edges2,v_uv),e3=texture2D(u_edges3,v_uv);
 for(int k=0;k<8;k++){vec2 o;float edge;
 if(k==0){o=vec2(1,0);edge=decodeCost(e0.rg);}else if(k==1){o=vec2(-1,0);edge=decodeCost(e0.ba);}else if(k==2){o=vec2(0,1);edge=decodeCost(e1.rg);}else if(k==3){o=vec2(0,-1);edge=decodeCost(e1.ba);}else if(k==4){o=vec2(1,1);edge=decodeCost(e2.rg);}else if(k==5){o=vec2(-1,1);edge=decodeCost(e2.ba);}else if(k==6){o=vec2(1,-1);edge=decodeCost(e3.rg);}else{o=vec2(-1,-1);edge=decodeCost(e3.ba);}
 vec2 uv=v_uv+o*u_stride/u_resolution;if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)continue;
 float ci=texture2D(u_cost,uv).r;if(ci<.999)best=min(best,ci*u_costMax+edge);}
 gl_FragColor=vec4(min(best,u_costMax)/u_costMax,wcFrontHeightAt(v_uv*u_resolution),texture2D(u_cost,v_uv).b,1.0);}
`;
const directions: Array<[
    [
        number,
        number
    ],
    [
        number,
        number
    ]
]> = [[[1, 0], [-1, 0]], [[0, 1], [0, -1]], [[1, 1], [-1, 1]], [[1, -1], [-1, -1]]];
export function createWatercolorFrontPaths(ctx: WatercolorPassesContext, original: (...args: FrontArgs) => void) {
    const gl = ctx.gl();
    const names = ['u_wcNoiseTex', 'u_cost', 'u_paperHeightMap', 'u_resolution', 'u_paperOrigin', 'u_paperTexSize', 'u_paperScale', 'u_climb', 'u_floor', 'u_costMax', 'u_film', 'u_dryCost', 'u_stride', 'u_foreignFilm', 'u_foreignWet', 'u_directionA', 'u_directionB', 'u_buildStride', 'u_edges0', 'u_edges1', 'u_edges2', 'u_edges3'];
    const build = createProgram(gl, DISPLAY_VERT, buildShader), jump = createProgram(gl, DISPLAY_VERT, jumpShader), bu = getUniforms(gl, build, names), ju = getUniforms(gl, jump, names);
    let buffers: AccumulationBuffer[] = [], scratch: AccumulationBuffer | null = null, cached: unknown[] | null = null, disposed = false;
    const stats = { buildDraws: 0, jumpDraws: 0, nativeDraws: 0, cacheBuilds: 0, extraBytes: 0 };
    const bind = (unit: number, texture: WebGLTexture, u: Uniforms, name: string) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(u[name], unit); };
    function common(program: WebGLProgram, u: Uniforms, args: FrontArgs) { const [field, x0, y0, dryCost, src, , max, climb, floor, stride = 1, scale = 1, foreign = null] = args; const { w, h } = ctx.paperWorldSize(); gl.useProgram(program); ctx.stamps().bindNoise(u.u_wcNoiseTex); gl.bindBuffer(gl.ARRAY_BUFFER, ctx.screenBuf()); const pos = gl.getAttribLocation(program, 'a_position'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0); bind(0, src.texture, u, 'u_cost'); bind(1, ctx.paperTex(), u, 'u_paperHeightMap'); bind(2, field.coverage.texture, u, 'u_film'); bind(3, foreign ?? ctx.paperTex(), u, 'u_foreignFilm'); gl.uniform1f(u.u_foreignWet, foreign ? 1 : 0); gl.uniform2f(u.u_resolution, field.w, field.h); gl.uniform2f(u.u_paperOrigin, x0 / scale, -(y0 / scale + field.h)); gl.uniform2f(u.u_paperTexSize, w / scale, h / scale); gl.uniform2f(u.u_paperScale, ctx.paperScale(), ctx.paperScale()); gl.uniform1f(u.u_climb, climb); gl.uniform1f(u.u_floor, floor); gl.uniform1f(u.u_costMax, max); gl.uniform1f(u.u_dryCost, dryCost); gl.uniform1f(u.u_stride, stride); }
    function draw(dst: AccumulationBuffer, program: WebGLProgram, u: Uniforms, args: FrontArgs, setup: () => void) {
        const dithered = program === build && gl.isEnabled(gl.DITHER);
        if (program === build) gl.disable(gl.DITHER);
        let begun = false;
        try {
            dst.beginReplaceDraw(); begun = true;
            common(program, u, args); setup(); gl.drawArrays(gl.TRIANGLES, 0, 6);
        } finally {
            try { if (begun) dst.endDraw(); } finally {
                if (dithered) gl.enable(gl.DITHER);
                if (program === jump) ctx.stamps().bindNoise(null);
                gl.activeTexture(gl.TEXTURE0);
            }
        }
    }
    function ensure(field: WatercolorPassField) { if (buffers[0]?.width === field.w && buffers[0]?.height === field.h)
        return; for (const b of buffers)
        b.destroy(); scratch?.destroy(); buffers = Array.from({ length: 4 }, () => new AccumulationBuffer(gl, field.w, field.h, 'nearest')); scratch = new AccumulationBuffer(gl, field.w, field.h, 'nearest'); stats.extraBytes = field.w * field.h * 4 * 5; cached = null; }
    function releaseTextures():number {
        const bytes=stats.extraBytes;
        for(const buffer of buffers)buffer.destroy();scratch?.destroy();
        buffers=[];scratch=null;cached=null;stats.extraBytes=0;
        return bytes;
    }
    const step = (...args: FrontArgs) => {
        if (disposed)
            throw new Error('Disposed fast-front');
        const [field, x0, y0, dryCost, , dst, max, climb, floor, stride = 1, scale = 1, foreign = null] = args;
        if (stride === 1) {
            cached = null;
            stats.nativeDraws++;
            return original(...args);
        }
        if (stride !== 4 && stride !== 8)
            throw new Error('Prefix front supports stride4/8 only');
        ensure(field);
        const key = [field, x0, y0, dryCost, max, climb, floor, stride, scale, foreign];
        if (!cached || key.some((v, i) => v !== cached![i])) {
            stats.cacheBuilds++;
            for (let pair = 0; pair < 4; pair++) {
                draw(buffers[pair]!, build, bu, args, () => {
                gl.uniform2fv(bu.u_directionA, directions[pair]![0]!);
                gl.uniform2fv(bu.u_directionB, directions[pair]![1]!);
                gl.uniform1f(bu.u_buildStride, 0);
                });
                stats.buildDraws++;
                for (let length = 1; length < stride; length *= 2) {
                    draw(scratch!, build, bu, args, () => {
                    bind(0, buffers[pair]!.texture, bu, 'u_cost');
                    gl.uniform2fv(bu.u_directionA, directions[pair]![0]!);
                    gl.uniform2fv(bu.u_directionB, directions[pair]![1]!);
                    gl.uniform1f(bu.u_buildStride, length);
                    });
                    stats.buildDraws++;
                    const old = buffers[pair]!;
                    buffers[pair] = scratch!;
                    scratch = old;
                }
            }
            cached = key;
        }
        draw(dst, jump, ju, args, () => {
        for (let i = 0; i < 4; i++)
            bind(4 + i, buffers[i]!.texture, ju, 'u_edges' + i);
        });
        stats.jumpDraws++;
    };
    return { step, stats, releaseTextures, forget() { disposed = true; buffers = []; scratch = null; cached = null; }, invalidate() { cached = null; }, dispose() { if (disposed)
            return; disposed = true; const current = gl.getParameter(gl.CURRENT_PROGRAM); if (current === build || current === jump)
            gl.useProgram(null); for (const b of buffers)
            b.destroy(); scratch?.destroy(); gl.deleteProgram(build); gl.deleteProgram(jump); stats.extraBytes = 0; } };
}
