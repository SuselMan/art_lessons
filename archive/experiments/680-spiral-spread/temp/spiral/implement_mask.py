p='apps/web/src/engine/src/raster/shaders.ts';s=open(p).read();s=s.replace('float wcCarryWeight(float ci, vec2 uvj) {','float wcCarryWeight(float ci, vec2 uvi, vec2 uvj) {\n    if (u_band.y > 1.5 && texture2D(u_e, uvi).r < 0.5) return 0.0;').replace('wcCarryWeight(ci, v_uv + wcCarryDir(k) * u_dir)','wcCarryWeight(ci, v_uv, v_uv + wcCarryDir(k) * u_dir)').replace('wcCarryWeight(cj, uvj + wcCarryDir(mm) * u_dir)','wcCarryWeight(cj, uvj, uvj + wcCarryDir(mm) * u_dir)').replace('if (u_band.y > 0.5) {','if (u_band.y > 0.5 && u_band.y < 1.5) {')
s+='''\n/** Isolated experimental topology marker; no change to bookkeeping shader. */
export const WC_INTERIOR_MARKER_FRAG = `
 precision highp float;
 uniform sampler2D u_cost;
 uniform sampler2D u_blocked;
 uniform vec2 u_texel;
 uniform float u_top;
 uniform float u_stage;
 varying vec2 v_uv;
 float zeroAt(vec2 uv) {
   if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
   return 1.0-step(0.5/255.0,texture2D(u_cost,uv).r);
 }
 vec2 axis(int k) {
   if(k==0)return vec2(1.0,0.0);
   if(k==1)return vec2(-1.0,0.0);
   if(k==2)return vec2(0.0,1.0);
   return vec2(0.0,-1.0);
 }
 void main() {
   float m=zeroAt(v_uv);
   if(u_stage<0.5) {
     for(int k=0;k<4;k++)m*=zeroAt(v_uv+axis(k)*u_texel*u_top);
   } else {
     float connected=texture2D(u_blocked,v_uv).r;
     for(int j=0;j<3;j++) {
       float stride=16.0*pow(2.0,float(j));
       if(stride>u_top)continue;
       for(int k=0;k<4;k++) {
         vec2 delta=axis(k)*u_texel*stride;
         float path=zeroAt(v_uv+delta)*zeroAt(v_uv+delta*0.25)*zeroAt(v_uv+delta*0.5)*zeroAt(v_uv+delta*0.75);
         connected=max(connected,path*texture2D(u_blocked,v_uv+delta).r);
       }
     }
     m*=connected;
   }
   gl_FragColor=vec4(m,0.0,0.0,1.0);
 }
`;
''';open(p,'w').write(s)
p='apps/web/src/engine/src/raster/WatercolorPasses.ts';s=open(p).read().replace('WC_RESAMPLE_FRAG }','WC_RESAMPLE_FRAG, WC_INTERIOR_MARKER_FRAG }');s=s.replace('private _fieldOpPosLoc = -1','private _interiorMarkerProg: WebGLProgram | null = null\n  private _interiorMarkerUni: Record<string, WebGLUniformLocation | null> = {}\n  private _interiorMarkerPos = -1\n\n  private _fieldOpPosLoc = -1');s=s.replace('if (mode === 18 && opts.e)', 'if ((mode === 18 || mode === 15 || mode === 16) && opts.e)');s=s.replace("['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_origin', 'u_size', 'u_band', 'u_world'])\n    this._fieldOpCarryColourUni", "['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_e', 'u_origin', 'u_size', 'u_band', 'u_world'])\n    this._fieldOpCarryColourUni");s=s.replace("this._fieldOpCarryColourUni = getUniforms(gl, this._fieldOpCarryColourProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d',", "this._fieldOpCarryColourUni = getUniforms(gl, this._fieldOpCarryColourProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_e',")
method='''  /** Two stages: blocked interior, then zero-cost cells fed by that interior. */
  interiorMarker(out: AccumulationBuffer, cost: AccumulationBuffer, blocked: AccumulationBuffer, top: number, stage: number): void {
    const { gl } = this
    if (!this._interiorMarkerProg) {
      this._interiorMarkerProg = createProgram(gl, DISPLAY_VERT, WC_INTERIOR_MARKER_FRAG)
      this._interiorMarkerUni = getUniforms(gl, this._interiorMarkerProg, ['u_cost', 'u_blocked', 'u_texel', 'u_top', 'u_stage'])
      this._interiorMarkerPos = gl.getAttribLocation(this._interiorMarkerProg, 'a_position')
    }
    const u = this._interiorMarkerUni
    out.beginReplaceDraw()
    gl.useProgram(this._interiorMarkerProg)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(this._interiorMarkerPos)
    gl.vertexAttribPointer(this._interiorMarkerPos, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cost.texture); gl.uniform1i(u.u_cost, 0)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blocked.texture); gl.uniform1i(u.u_blocked, 1)
    gl.uniform2f(u.u_texel, 1 / out.width, 1 / out.height)
    gl.uniform1f(u.u_top, top); gl.uniform1f(u.u_stage, stage)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    out.endDraw()
  }

'''
s=s.replace('  initFieldPrograms(): void {',method+'  initFieldPrograms(): void {').replace('this._resampleProg, this._diffuseProg, this._brushDragProg, this._waterFrontProg].includes(current)', 'this._resampleProg, this._diffuseProg, this._brushDragProg, this._waterFrontProg, this._interiorMarkerProg].includes(current)').replace('    this.gl.deleteProgram(this._waterFrontProg)','    this.gl.deleteProgram(this._waterFrontProg)\n    if (this._interiorMarkerProg) this.gl.deleteProgram(this._interiorMarkerProg)\n    this._interiorMarkerProg = null');open(p,'w').write(s)
p='apps/web/src/engine/src/raster/WatercolorSettlePlan.ts';s=open(p).read().replace('const snapshots = new Map','let interiorMarker: AccumulationBuffer | null = null\n    let blockedMarker: AccumulationBuffer | null = null\n    const snapshots = new Map');s=s.replace('const carry = watercolorCarryStrides(budgetPx)','const carry = watercolorCarryStrides(budgetPx)\n        const originalCarryLength = carry.length');s=s.replace('let src = c, dst = a','''if (pulseAt.size) {
          blockedMarker = this.ctx.pool().acquire(field.w, field.h)
          interiorMarker = this.ctx.pool().acquire(field.w, field.h)
          const blocked = blockedMarker, marker = interiorMarker
          ops.push(() => this.ctx.passes().interiorMarker(blocked, field.pressure, field.pressure, topStride, 0))
          ops.push(() => this.ctx.passes().interiorMarker(marker, field.pressure, blocked, topStride, 1))
          carry.push(...[64, 32, 16].filter(s => s <= topStride))
        }
        let src = c, dst = a''');s=s.replace('interior?: boolean; src:', 'interior?: boolean; resweep?: boolean; src:').replace('plan.push({ s: carry[i + j], src, dst, csrc, cdst })','plan.push({ s: carry[i + j], resweep: i + j >= originalCarryLength, src, dst, csrc, cdst })').replace('if (pulseAt.has(s)) {','if (i + j < originalCarryLength && pulseAt.has(s)) {').replace('p.interior ? 1 : 0]','p.interior ? 1 : p.resweep ? 2 : 0]').replace('const opts = { d: field.pressure,','const opts = { e: p.resweep ? interiorMarker! : undefined, d: field.pressure,');s=s.replace('if (ca0) this.ctx.pool().release(ca0)','if (ca0) this.ctx.pool().release(ca0)\n      if (blockedMarker) this.ctx.pool().release(blockedMarker)\n      if (interiorMarker) this.ctx.pool().release(interiorMarker)');open(p,'w').write(s)
