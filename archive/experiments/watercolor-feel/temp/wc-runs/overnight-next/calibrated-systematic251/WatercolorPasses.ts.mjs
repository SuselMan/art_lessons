import { DISPLAY_VERT, WC_DIFFUSE_FRAG, WC_FIELD_OP_FRAG, WC_FIELD_OP_HIGH_FRAG, WC_FIELD_OP_CARRY_FRAG, WC_FIELD_OP_CARRY_COLOUR_FRAG, WC_WATER_FRONT_FRAG, WC_BRUSH_DRAG_FRAG, WC_RESAMPLE_FRAG } from "/src/engine/src/raster/shaders.ts";
import { createProgram, getUniforms } from "/src/engine/src/raster/utils.ts";
import { WET_DIFFUSE_D, WET_DIFFUSE_B } from "/src/engine/src/watercolor/wetDiffusion.ts";
/** Watercolor field GPU primitives. Scheduling and working textures stay with
* the engine. Separate init stages preserve the existing GL call order. */
export class WatercolorPasses {
	ctx;
	constructor(ctx) {
		this.ctx = ctx;
	}
	get gl() {
		return this.ctx.gl();
	}
	/** (#536, §17.17) WC_FIELD_OP_FRAG — the diffusion's fixed/mobile split. */
	_fieldOpProg;
	_fieldOpUni;
	/** (#685) Modes 10-20 except the carry (15/16), linked separately. */
	_fieldOpHighProg;
	_fieldOpHighUni;
	_fieldOpHighPosLoc;
	_fieldOpCarryProg;
	_fieldOpCarryUni;
	_fieldOpCarryPosLoc;
	_fieldOpCarryColourProg;
	_fieldOpCarryColourUni;
	_fieldOpCarryColourPosLoc;
	_fieldOpPosLoc = -1;
	/** (#536, §17.44) WC_RESAMPLE_FRAG - tile <-> half-resolution settle field. */
	_resampleProg;
	_resampleUni;
	_resamplePosLoc = -1;
	/** (#536) One step of pigment diffusion in standing water — see
	*  WC_DIFFUSE_FRAG and wetDiffusion.ts. */
	_diffuseProg;
	_brushDragProg;
	_brushDragUni;
	_brushDragPosLoc = -1;
	_waterFrontProg;
	_waterFrontUni;
	_waterFrontPosLoc = -1;
	_diffuseUni;
	_diffusePosLoc = -1;
	/** One WC_FIELD_OP_FRAG step between same-sized buffers — see the shader
	*  for the modes. `c` is mode 3's third input; `scissor` (bottom-up GL
	*  pixels) limits the write to a rect, everything outside it untouched. */
	fieldOp(out, a, b, mode, k, opts = {}) {
		const { gl } = this;
		out.beginReplaceDraw();
		if (opts.scissor) {
			gl.enable(gl.SCISSOR_TEST);
			gl.scissor(opts.scissor[0], opts.scissor[1], opts.scissor[2], opts.scissor[3]);
		}
		// (#685) Carry modes must never enter the bookkeeping program: its
		// combined control flow crashes the Galaxy Tab's Adreno linker.
		const high = mode >= 10;
		const prog = mode === 15 ? this._fieldOpCarryProg : mode === 16 ? this._fieldOpCarryColourProg : high ? this._fieldOpHighProg : this._fieldOpProg;
		const u = mode === 15 ? this._fieldOpCarryUni : mode === 16 ? this._fieldOpCarryColourUni : high ? this._fieldOpHighUni : this._fieldOpUni;
		const pos = mode === 15 ? this._fieldOpCarryPosLoc : mode === 16 ? this._fieldOpCarryColourPosLoc : high ? this._fieldOpHighPosLoc : this._fieldOpPosLoc;
		gl.useProgram(prog);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf());
		gl.enableVertexAttribArray(pos);
		gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, a.texture);
		gl.uniform1i(u.u_a, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, b.texture);
		gl.uniform1i(u.u_b, 1);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, (opts.c ?? b).texture);
		gl.uniform1i(u.u_c, 2);
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, (opts.d ?? b).texture);
		gl.uniform1i(u.u_d, 3);
		if (mode === 18 && opts.e) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, opts.e.texture); gl.uniform1i(u.u_e, 4); }
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1f(u.u_k, k);
		gl.uniform1f(u.u_mode, mode);
		gl.uniform2f(u.u_dir, opts.dir ? opts.dir[0] / out.width : 0, opts.dir ? opts.dir[1] / out.height : 0);
		gl.uniform2f(u.u_origin, opts.origin ? opts.origin[0] : 0, opts.origin ? opts.origin[1] : 0);
		gl.uniform2f(u.u_size, opts.size ? opts.size[0] : out.width, opts.size ? opts.size[1] : out.height);
		gl.uniform2f(u.u_band, opts.band ? opts.band[0] : 0, opts.band ? opts.band[1] : 0);
		gl.uniform3fv(u.u_tau, opts.tau ?? [
			0,
			0,
			0
		]);
		gl.uniform3fv(u.u_world, opts.world ?? [
			0,
			0,
			0
		]);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		if (opts.scissor) gl.disable(gl.SCISSOR_TEST);
		out.endDraw();
	}
	/** (#536, §17.24) One relaxation step of the water front's cost (WC_WATER_FRONT_FRAG)
	*  over a settle field whose top-left is at world (x0, y0): src → dst. Shared by
	*  the settle's outward and inward passes and the group tide's inward one. */
	waterFrontStep(field, x0, y0, dryCost, src, dst, max, climb, floor, stride = 1, scale = 1, foreignWater = null) {
		const { gl } = this;
		const { w: paperTexW, h: paperTexH } = this.ctx.paperWorldSize();
		dst.beginReplaceDraw();
		gl.useProgram(this._waterFrontProg);
		this.ctx.stamps().bindNoise(this._waterFrontUni.u_wcNoiseTex);
		const u = this._waterFrontUni;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf());
		gl.enableVertexAttribArray(this._waterFrontPosLoc);
		gl.vertexAttribPointer(this._waterFrontPosLoc, 2, gl.FLOAT, false, 0, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, src.texture);
		gl.uniform1i(u.u_cost, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.ctx.paperTex());
		gl.uniform1i(u.u_paperHeightMap, 1);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, field.coverage.texture);
		gl.uniform1i(u.u_film, 2);
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, foreignWater ?? this.ctx.paperTex());
		gl.uniform1i(u.u_foreignFilm, 3);
		gl.uniform1f(u.u_foreignWet, foreignWater ? 1 : 0);
		gl.uniform1f(u.u_dryCost, dryCost);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform2f(u.u_resolution, field.w, field.h);
		gl.uniform2f(u.u_paperOrigin, x0 / scale, -(y0 / scale + field.h));
		gl.uniform2f(u.u_paperTexSize, paperTexW / scale, paperTexH / scale);
		gl.uniform2f(u.u_paperScale, this.ctx.paperScale(), this.ctx.paperScale());
		gl.uniform1f(u.u_climb, climb);
		gl.uniform1f(u.u_floor, floor);
		gl.uniform1f(u.u_costMax, max);
		gl.uniform1f(u.u_stride, stride);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		dst.endDraw();
	}
	/** (#536, §17.44) One WC_RESAMPLE_FRAG draw into `dst` over the GL rect
	*  (dx, dy, dw, dh). Mode 0 averages `src` down (ratio 2), mode 1 writes
	*  base + up(src) - up(old), mode 2 max(base, up(src)) (ratio 1/2). `dst`
	*  must not be `base`: modes 1 and 2 go through a temporary. */
	wcResample(dst, dx, dy, dw, dh, src, sx, sy, ratio, mode, old = null, base = null, clampRect = null) {
		if (dw <= 0 || dh <= 0) return;
		const { gl } = this;
		dst.beginReplaceDraw();
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(dx, dy, dw, dh);
		gl.useProgram(this._resampleProg);
		const u = this._resampleUni;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf());
		gl.enableVertexAttribArray(this._resamplePosLoc);
		gl.vertexAttribPointer(this._resamplePosLoc, 2, gl.FLOAT, false, 0, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, src.texture);
		gl.uniform1i(u.u_src, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, (old ?? src).texture);
		gl.uniform1i(u.u_old, 1);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, (base ?? src).texture);
		gl.uniform1i(u.u_base, 2);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform2f(u.u_srcSize, src.width, src.height);
		gl.uniform2f(u.u_baseSize, (base ?? dst).width, (base ?? dst).height);
		gl.uniform2f(u.u_dstOrigin, dx, dy);
		gl.uniform2f(u.u_srcOrigin, sx, sy);
		gl.uniform1f(u.u_ratio, ratio);
		gl.uniform1f(u.u_mode, mode);
		const cr = clampRect ?? [
			0,
			0,
			src.width,
			src.height
		];
		gl.uniform4f(u.u_clamp, cr[0], cr[1], cr[2], cr[3]);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.disable(gl.SCISSOR_TEST);
		dst.endDraw();
	}
	/** One diffusion draw; field origin and scale are fixed by the settle plan. */
	diffuseStep(field, x0, y0, S, paperTexW, paperTexH, src, dst, radius, knight, gate, density = src) {
		const { gl } = this;
		dst.beginReplaceDraw();
		gl.useProgram(this._diffuseProg);
		const u = this._diffuseUni;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf());
		gl.enableVertexAttribArray(this._diffusePosLoc);
		gl.vertexAttribPointer(this._diffusePosLoc, 2, gl.FLOAT, false, 0, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, src.texture);
		gl.uniform1i(u.u_ink, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, gate.texture);
		gl.uniform1i(u.u_coverage, 1);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, this.ctx.paperTex());
		gl.uniform1i(u.u_paperHeightMap, 2);
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, density.texture);
		gl.uniform1i(u.u_density, 3);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform2f(u.u_resolution, field.w, field.h);
		// The paper at the world position of a texel. A tile passes
		// (originX, -originY) and lets its height of 1024 fold into the paper's
		// period; a rect of any height has to say where its bottom row is.
		gl.uniform2f(u.u_paperOrigin, x0 / S, -(y0 / S + field.h));
		gl.uniform2f(u.u_paperTexSize, paperTexW / S, paperTexH / S);
		gl.uniform2f(u.u_paperScale, this.ctx.paperScale(), this.ctx.paperScale());
		gl.uniform1f(u.u_d, WET_DIFFUSE_D);
		gl.uniform1f(u.u_b, WET_DIFFUSE_B);
		gl.uniform1f(u.u_radius, Math.max(1, Math.round(radius / S)));
		gl.uniform1f(u.u_stencil, knight ? 1 : 0);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		dst.endDraw();
	}
	/** One chronological wet brush contact. Both records read the unchanged
	* pre-contact pigment record; the caller copies results back afterwards. */
	brushPass(field, flowTexture, radiusPx, S, source, out, pigment, flowRect, scissor, colorReference, pulseGain, phase) {
		const { gl } = this;
		out.beginReplaceDraw();
		gl.useProgram(this._brushDragProg);
		const u = this._brushDragUni;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf());
		gl.enableVertexAttribArray(this._brushDragPosLoc);
		gl.vertexAttribPointer(this._brushDragPosLoc, 2, gl.FLOAT, false, 0, 0);
		const textures = [
			source.texture,
			flowTexture,
			field.coverage.texture,
			pigment.texture
		];
		const names = [
			"u_paint",
			"u_flow",
			"u_water",
			"u_pigment"
		];
		for (let j = 0; j < textures.length; j++) {
			gl.activeTexture(gl.TEXTURE0 + j);
			gl.bindTexture(gl.TEXTURE_2D, textures[j]);
			gl.uniform1i(u[names[j]], j);
		}
		const step = Math.max(1, Math.round(radiusPx * .25 / S));
		gl.uniform2f(u.u_step, step / field.w, step / field.h);
		gl.uniform4fv(u.u_phase, phase);
        gl.uniform1f(u.u_contactGain, pulseGain);
		gl.uniform2f(u.u_texel, 1 / pigment.width, 1 / pigment.height);
		gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, colorReference.texture); gl.uniform1i(u.u_color, 4);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform4fv(u.u_flowRect, flowRect);
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(...scissor);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.disable(gl.SCISSOR_TEST);
		out.endDraw();
		gl.activeTexture(gl.TEXTURE0);
	}
	/** Single-paint shortcut: absorption times the settled pigment deposit. */
	pigmentColor(outColor, deposit, tau) {
		const { gl } = this;
		outColor.beginReplaceDraw();
		gl.useProgram(this._fieldOpProg);
		const fu = this._fieldOpUni;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf());
		gl.enableVertexAttribArray(this._fieldOpPosLoc);
		gl.vertexAttribPointer(this._fieldOpPosLoc, 2, gl.FLOAT, false, 0, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, deposit.texture);
		gl.uniform1i(fu.u_a, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, deposit.texture);
		gl.uniform1i(fu.u_b, 1);
		// Units 2 and 3 too: the program samples u_c and u_d, and whatever
		// the last field op left on those units — the rim's spare buffer,
		// which is this very output — would be a feedback loop.
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, deposit.texture);
		gl.uniform1i(fu.u_c, 2);
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, deposit.texture);
		gl.uniform1i(fu.u_d, 3);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1f(fu.u_k, 1);
		gl.uniform1f(fu.u_mode, 2);
		gl.uniform3fv(fu.u_tau, [
			tau[0],
			tau[1],
			tau[2]
		]);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		outColor.endDraw();
	}
	initFieldPrograms() {
		const { gl } = this;
		this._fieldOpProg = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_FRAG);
		this._fieldOpHighProg = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_HIGH_FRAG);
		this._fieldOpCarryProg = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_CARRY_FRAG);
		this._fieldOpCarryColourProg = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_CARRY_COLOUR_FRAG);
		this._resampleProg = createProgram(gl, DISPLAY_VERT, WC_RESAMPLE_FRAG);
	}
	initSettlePrograms() {
		const { gl } = this;
		this._diffuseProg = createProgram(gl, DISPLAY_VERT, WC_DIFFUSE_FRAG);
		this._brushDragProg = createProgram(gl, DISPLAY_VERT, WC_BRUSH_DRAG_FRAG);
		this._brushDragUni = getUniforms(gl, this._brushDragProg, [
			"u_paint",
			"u_flow",
			"u_water",
			"u_pigment",
			"u_step",
			"u_flowRect",
			"u_color",
			"u_phase",
            "u_contactGain",
			"u_texel"
		]);
		this._brushDragPosLoc = gl.getAttribLocation(this._brushDragProg, "a_position");
		this._waterFrontProg = createProgram(gl, DISPLAY_VERT, WC_WATER_FRONT_FRAG);
	}
	initFieldUniforms() {
		const { gl } = this;
		this._fieldOpUni = getUniforms(gl, this._fieldOpProg, [
			"u_a",
			"u_b",
			"u_c",
			"u_k",
			"u_mode",
			"u_tau",
			"u_dir",
			"u_d",
			"u_origin",
			"u_size",
			"u_band",
			"u_world"
		]);
		this._fieldOpHighUni = getUniforms(gl, this._fieldOpHighProg, [
			"u_a",
			"u_b",
			"u_c",
			"u_k",
			"u_mode",
			"u_tau",
			"u_dir",
			"u_d",
			"u_e",
			"u_origin",
			"u_size",
			"u_band",
			"u_world"
		]);
		this._fieldOpCarryUni = getUniforms(gl, this._fieldOpCarryProg, [
			"u_a",
			"u_b",
			"u_c",
			"u_k",
			"u_mode",
			"u_tau",
			"u_dir",
			"u_d",
			"u_origin",
			"u_size",
			"u_band",
			"u_world"
		]);
		this._fieldOpCarryColourUni = getUniforms(gl, this._fieldOpCarryColourProg, [
			"u_a",
			"u_b",
			"u_c",
			"u_k",
			"u_mode",
			"u_tau",
			"u_dir",
			"u_d",
			"u_origin",
			"u_size",
			"u_band",
			"u_world"
		]);
		this._resampleUni = getUniforms(gl, this._resampleProg, [
			"u_src",
			"u_old",
			"u_base",
			"u_srcSize",
			"u_baseSize",
			"u_dstOrigin",
			"u_srcOrigin",
			"u_ratio",
			"u_mode",
			"u_clamp"
		]);
		this._waterFrontUni = getUniforms(gl, this._waterFrontProg, [
			"u_wcNoiseTex",
			"u_cost",
			"u_paperHeightMap",
			"u_resolution",
			"u_paperOrigin",
			"u_paperTexSize",
			"u_paperScale",
			"u_climb",
			"u_floor",
			"u_costMax",
			"u_film",
			"u_dryCost",
			"u_stride",
			"u_foreignFilm",
			"u_foreignWet"
		]);
		this._diffuseUni = getUniforms(gl, this._diffuseProg, [
			"u_ink",
			"u_density",
			"u_coverage",
			"u_paperHeightMap",
			"u_resolution",
			"u_paperOrigin",
			"u_paperTexSize",
			"u_paperScale",
			"u_d",
			"u_b",
			"u_radius",
			"u_stencil"
		]);
	}
	initFieldAttributes() {
		const { gl } = this;
		this._fieldOpPosLoc = gl.getAttribLocation(this._fieldOpProg, "a_position");
		this._fieldOpHighPosLoc = gl.getAttribLocation(this._fieldOpHighProg, "a_position");
		this._fieldOpCarryPosLoc = gl.getAttribLocation(this._fieldOpCarryProg, "a_position");
		this._fieldOpCarryColourPosLoc = gl.getAttribLocation(this._fieldOpCarryColourProg, "a_position");
		this._resamplePosLoc = gl.getAttribLocation(this._resampleProg, "a_position");
	}
	initDiffusionAttributes() {
		const { gl } = this;
		this._diffusePosLoc = gl.getAttribLocation(this._diffuseProg, "a_position");
		this._waterFrontPosLoc = gl.getAttribLocation(this._waterFrontProg, "a_position");
	}
	destroy() {
		// Deleting the currently bound program is deferred until it is unbound.
		// A final field pass may still be active when a connected canvas is retired.
		const current = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
		if ([
			this._fieldOpProg,
			this._fieldOpHighProg,
			this._fieldOpCarryProg,
			this._fieldOpCarryColourProg,
			this._resampleProg,
			this._diffuseProg,
			this._brushDragProg,
			this._waterFrontProg
		].includes(current)) {
			this.gl.useProgram(null);
		}
		this.gl.deleteProgram(this._fieldOpProg);
		this.gl.deleteProgram(this._fieldOpHighProg);
		this.gl.deleteProgram(this._fieldOpCarryProg);
		this.gl.deleteProgram(this._fieldOpCarryColourProg);
		this.gl.deleteProgram(this._resampleProg);
		this.gl.deleteProgram(this._diffuseProg);
		this.gl.deleteProgram(this._brushDragProg);
		this.gl.deleteProgram(this._waterFrontProg);
	}
}

//# sourceMappingURL=data:application/json;base64,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cyI6WyJXYXRlcmNvbG9yUGFzc2VzLnRzIl0sInZlcnNpb24iOjMsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERJU1BMQVlfVkVSVCwgV0NfRElGRlVTRV9GUkFHLCBXQ19GSUVMRF9PUF9GUkFHLCBXQ19GSUVMRF9PUF9ISUdIX0ZSQUcsIFdDX0ZJRUxEX09QX0NBUlJZX0ZSQUcsIFdDX0ZJRUxEX09QX0NBUlJZX0NPTE9VUl9GUkFHLCBXQ19XQVRFUl9GUk9OVF9GUkFHLCBXQ19CUlVTSF9EUkFHX0ZSQUcsIFdDX1JFU0FNUExFX0ZSQUcgfSBmcm9tICcuL3NoYWRlcnMnXG5pbXBvcnQgeyBjcmVhdGVQcm9ncmFtLCBnZXRVbmlmb3JtcyB9IGZyb20gJy4vdXRpbHMnXG5pbXBvcnQgdHlwZSB7IEFjY3VtdWxhdGlvbkJ1ZmZlciB9IGZyb20gJy4uL2J1ZmZlcnMvQWNjdW11bGF0aW9uQnVmZmVyJ1xuaW1wb3J0IHR5cGUgeyBTdGFtcFBhaW50ZXIgfSBmcm9tICcuLi9kYWJzL1N0YW1wUGFpbnRlcidcbmltcG9ydCB7IFdFVF9ESUZGVVNFX0QsIFdFVF9ESUZGVVNFX0IgfSBmcm9tICcuLi93YXRlcmNvbG9yL3dldERpZmZ1c2lvbidcblxuZXhwb3J0IGludGVyZmFjZSBXYXRlcmNvbG9yUGFzc0ZpZWxkIHsgdzogbnVtYmVyOyBoOiBudW1iZXI7IGNvdmVyYWdlOiBBY2N1bXVsYXRpb25CdWZmZXIgfVxuZXhwb3J0IGludGVyZmFjZSBXYXRlcmNvbG9yUGFzc2VzQ29udGV4dCB7XG4gIGdsKCk6IFdlYkdMUmVuZGVyaW5nQ29udGV4dFxuICBzY3JlZW5CdWYoKTogV2ViR0xCdWZmZXJcbiAgcGFwZXJUZXgoKTogV2ViR0xUZXh0dXJlXG4gIHBhcGVyU2NhbGUoKTogbnVtYmVyXG4gIHBhcGVyV29ybGRTaXplKCk6IHsgdzogbnVtYmVyOyBoOiBudW1iZXIgfVxuICBzdGFtcHMoKTogU3RhbXBQYWludGVyXG59XG5cbi8qKiBXYXRlcmNvbG9yIGZpZWxkIEdQVSBwcmltaXRpdmVzLiBTY2hlZHVsaW5nIGFuZCB3b3JraW5nIHRleHR1cmVzIHN0YXkgd2l0aFxuICogdGhlIGVuZ2luZS4gU2VwYXJhdGUgaW5pdCBzdGFnZXMgcHJlc2VydmUgdGhlIGV4aXN0aW5nIEdMIGNhbGwgb3JkZXIuICovXG5leHBvcnQgY2xhc3MgV2F0ZXJjb2xvclBhc3NlcyB7XG4gIHByaXZhdGUgcmVhZG9ubHkgY3R4OiBXYXRlcmNvbG9yUGFzc2VzQ29udGV4dFxuICBjb25zdHJ1Y3RvcihjdHg6IFdhdGVyY29sb3JQYXNzZXNDb250ZXh0KSB7IHRoaXMuY3R4ID0gY3R4IH1cbiAgcHJpdmF0ZSBnZXQgZ2woKTogV2ViR0xSZW5kZXJpbmdDb250ZXh0IHsgcmV0dXJuIHRoaXMuY3R4LmdsKCkgfVxuXG4gIC8qKiAoIzUzNiwgwqcxNy4xNykgV0NfRklFTERfT1BfRlJBRyDigJQgdGhlIGRpZmZ1c2lvbidzIGZpeGVkL21vYmlsZSBzcGxpdC4gKi9cbiAgcHJpdmF0ZSBfZmllbGRPcFByb2chOiBXZWJHTFByb2dyYW1cblxuICBwcml2YXRlIF9maWVsZE9wVW5pITogUmVjb3JkPHN0cmluZywgV2ViR0xVbmlmb3JtTG9jYXRpb24gfCBudWxsPlxuXG4gIC8qKiAoIzY4NSkgTW9kZXMgMTAtMjAgZXhjZXB0IHRoZSBjYXJyeSAoMTUvMTYpLCBsaW5rZWQgc2VwYXJhdGVseS4gKi9cbiAgcHJpdmF0ZSBfZmllbGRPcEhpZ2hQcm9nITogV2ViR0xQcm9ncmFtXG5cbiAgcHJpdmF0ZSBfZmllbGRPcEhpZ2hVbmkhOiBSZWNvcmQ8c3RyaW5nLCBXZWJHTFVuaWZvcm1Mb2NhdGlvbiB8IG51bGw+XG5cbiAgcHJpdmF0ZSBfZmllbGRPcEhpZ2hQb3NMb2MhOiBudW1iZXJcblxuICBwcml2YXRlIF9maWVsZE9wQ2FycnlQcm9nITogV2ViR0xQcm9ncmFtXG5cbiAgcHJpdmF0ZSBfZmllbGRPcENhcnJ5VW5pITogUmVjb3JkPHN0cmluZywgV2ViR0xVbmlmb3JtTG9jYXRpb24gfCBudWxsPlxuXG4gIHByaXZhdGUgX2ZpZWxkT3BDYXJyeVBvc0xvYyE6IG51bWJlclxuXG4gIHByaXZhdGUgX2ZpZWxkT3BDYXJyeUNvbG91clByb2chOiBXZWJHTFByb2dyYW1cblxuICBwcml2YXRlIF9maWVsZE9wQ2FycnlDb2xvdXJVbmkhOiBSZWNvcmQ8c3RyaW5nLCBXZWJHTFVuaWZvcm1Mb2NhdGlvbiB8IG51bGw+XG5cbiAgcHJpdmF0ZSBfZmllbGRPcENhcnJ5Q29sb3VyUG9zTG9jITogbnVtYmVyXG5cbiAgcHJpdmF0ZSBfZmllbGRPcFBvc0xvYyA9IC0xXG5cbiAgLyoqICgjNTM2LCDCpzE3LjQ0KSBXQ19SRVNBTVBMRV9GUkFHIC0gdGlsZSA8LT4gaGFsZi1yZXNvbHV0aW9uIHNldHRsZSBmaWVsZC4gKi9cbiAgcHJpdmF0ZSBfcmVzYW1wbGVQcm9nITogV2ViR0xQcm9ncmFtXG5cbiAgcHJpdmF0ZSBfcmVzYW1wbGVVbmkhOiBSZWNvcmQ8c3RyaW5nLCBXZWJHTFVuaWZvcm1Mb2NhdGlvbiB8IG51bGw+XG5cbiAgcHJpdmF0ZSBfcmVzYW1wbGVQb3NMb2MgPSAtMVxuXG4gIC8qKiAoIzUzNikgT25lIHN0ZXAgb2YgcGlnbWVudCBkaWZmdXNpb24gaW4gc3RhbmRpbmcgd2F0ZXIg4oCUIHNlZVxuICAgKiAgV0NfRElGRlVTRV9GUkFHIGFuZCB3ZXREaWZmdXNpb24udHMuICovXG4gIHByaXZhdGUgX2RpZmZ1c2VQcm9nITogV2ViR0xQcm9ncmFtXG5cbiAgcHJpdmF0ZSBfYnJ1c2hEcmFnUHJvZyE6IFdlYkdMUHJvZ3JhbVxuXG4gIHByaXZhdGUgX2JydXNoRHJhZ1VuaSE6IFJlY29yZDxzdHJpbmcsIFdlYkdMVW5pZm9ybUxvY2F0aW9uIHwgbnVsbD5cblxuICBwcml2YXRlIF9icnVzaERyYWdQb3NMb2MgPSAtMVxuXG4gIHByaXZhdGUgX3dhdGVyRnJvbnRQcm9nITogV2ViR0xQcm9ncmFtXG5cbiAgcHJpdmF0ZSBfd2F0ZXJGcm9udFVuaSE6IFJlY29yZDxzdHJpbmcsIFdlYkdMVW5pZm9ybUxvY2F0aW9uIHwgbnVsbD5cblxuICBwcml2YXRlIF93YXRlckZyb250UG9zTG9jID0gLTFcblxuICBwcml2YXRlIF9kaWZmdXNlVW5pITogUmVjb3JkPHN0cmluZywgV2ViR0xVbmlmb3JtTG9jYXRpb24gfCBudWxsPlxuXG4gIHByaXZhdGUgX2RpZmZ1c2VQb3NMb2MgPSAtMVxuXG4gIC8qKiBPbmUgV0NfRklFTERfT1BfRlJBRyBzdGVwIGJldHdlZW4gc2FtZS1zaXplZCBidWZmZXJzIOKAlCBzZWUgdGhlIHNoYWRlclxuICAgKiAgZm9yIHRoZSBtb2Rlcy4gYGNgIGlzIG1vZGUgMydzIHRoaXJkIGlucHV0OyBgc2Npc3NvcmAgKGJvdHRvbS11cCBHTFxuICAgKiAgcGl4ZWxzKSBsaW1pdHMgdGhlIHdyaXRlIHRvIGEgcmVjdCwgZXZlcnl0aGluZyBvdXRzaWRlIGl0IHVudG91Y2hlZC4gKi9cbiAgZmllbGRPcChcbiAgICBvdXQ6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgYTogQWNjdW11bGF0aW9uQnVmZmVyLCBiOiBBY2N1bXVsYXRpb25CdWZmZXIsIG1vZGU6IDAgfCAxIHwgMiB8IDMgfCA0IHwgNSB8IDYgfCA3IHwgOCB8IDkgfCAxMCB8IDExIHwgMTIgfCAxMyB8IDE0IHwgMTUgfCAxNiB8IDE3IHwgMTggfCAxOSB8IDIwLCBrOiBudW1iZXIsXG4gICAgb3B0czogeyBjPzogQWNjdW11bGF0aW9uQnVmZmVyOyBzY2lzc29yPzogW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl07IGRpcj86IFtudW1iZXIsIG51bWJlcl07IGQ/OiBBY2N1bXVsYXRpb25CdWZmZXI7IG9yaWdpbj86IFtudW1iZXIsIG51bWJlcl07IGJhbmQ/OiBbbnVtYmVyLCBudW1iZXJdOyBzaXplPzogW251bWJlciwgbnVtYmVyXTsgdGF1PzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdOyB3b3JsZD86IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB9ID0ge30sXG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHsgZ2wgfSA9IHRoaXNcbiAgICBvdXQuYmVnaW5SZXBsYWNlRHJhdygpXG4gICAgaWYgKG9wdHMuc2Npc3Nvcikge1xuICAgICAgZ2wuZW5hYmxlKGdsLlNDSVNTT1JfVEVTVClcbiAgICAgIGdsLnNjaXNzb3Iob3B0cy5zY2lzc29yWzBdLCBvcHRzLnNjaXNzb3JbMV0sIG9wdHMuc2Npc3NvclsyXSwgb3B0cy5zY2lzc29yWzNdKVxuICAgIH1cbiAgICAvLyAoIzY4NSkgQ2FycnkgbW9kZXMgbXVzdCBuZXZlciBlbnRlciB0aGUgYm9va2tlZXBpbmcgcHJvZ3JhbTogaXRzXG4gICAgLy8gY29tYmluZWQgY29udHJvbCBmbG93IGNyYXNoZXMgdGhlIEdhbGF4eSBUYWIncyBBZHJlbm8gbGlua2VyLlxuICAgIGNvbnN0IGhpZ2ggPSBtb2RlID49IDEwXG4gICAgY29uc3QgcHJvZyA9IG1vZGUgPT09IDE1ID8gdGhpcy5fZmllbGRPcENhcnJ5UHJvZyA6IG1vZGUgPT09IDE2ID8gdGhpcy5fZmllbGRPcENhcnJ5Q29sb3VyUHJvZyA6IGhpZ2ggPyB0aGlzLl9maWVsZE9wSGlnaFByb2cgOiB0aGlzLl9maWVsZE9wUHJvZ1xuICAgIGNvbnN0IHUgPSBtb2RlID09PSAxNSA/IHRoaXMuX2ZpZWxkT3BDYXJyeVVuaSA6IG1vZGUgPT09IDE2ID8gdGhpcy5fZmllbGRPcENhcnJ5Q29sb3VyVW5pIDogaGlnaCA/IHRoaXMuX2ZpZWxkT3BIaWdoVW5pIDogdGhpcy5fZmllbGRPcFVuaVxuICAgIGNvbnN0IHBvcyA9IG1vZGUgPT09IDE1ID8gdGhpcy5fZmllbGRPcENhcnJ5UG9zTG9jIDogbW9kZSA9PT0gMTYgPyB0aGlzLl9maWVsZE9wQ2FycnlDb2xvdXJQb3NMb2MgOiBoaWdoID8gdGhpcy5fZmllbGRPcEhpZ2hQb3NMb2MgOiB0aGlzLl9maWVsZE9wUG9zTG9jXG4gICAgZ2wudXNlUHJvZ3JhbShwcm9nKVxuICAgIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCB0aGlzLmN0eC5zY3JlZW5CdWYoKSlcbiAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShwb3MpXG4gICAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihwb3MsIDIsIGdsLkZMT0FULCBmYWxzZSwgMCwgMClcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKVxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGEudGV4dHVyZSlcbiAgICBnbC51bmlmb3JtMWkodS51X2EsIDApXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMSlcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBiLnRleHR1cmUpXG4gICAgZ2wudW5pZm9ybTFpKHUudV9iLCAxKVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTIpXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgKG9wdHMuYyA/PyBiKS50ZXh0dXJlKVxuICAgIGdsLnVuaWZvcm0xaSh1LnVfYywgMilcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUzKVxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIChvcHRzLmQgPz8gYikudGV4dHVyZSlcbiAgICBnbC51bmlmb3JtMWkodS51X2QsIDMpXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMClcbiAgICBnbC51bmlmb3JtMWYodS51X2ssIGspXG4gICAgZ2wudW5pZm9ybTFmKHUudV9tb2RlLCBtb2RlKVxuICAgIGdsLnVuaWZvcm0yZih1LnVfZGlyLCBvcHRzLmRpciA/IG9wdHMuZGlyWzBdIC8gb3V0LndpZHRoIDogMCwgb3B0cy5kaXIgPyBvcHRzLmRpclsxXSAvIG91dC5oZWlnaHQgOiAwKVxuICAgIGdsLnVuaWZvcm0yZih1LnVfb3JpZ2luLCBvcHRzLm9yaWdpbiA/IG9wdHMub3JpZ2luWzBdIDogMCwgb3B0cy5vcmlnaW4gPyBvcHRzLm9yaWdpblsxXSA6IDApXG4gICAgZ2wudW5pZm9ybTJmKHUudV9zaXplLCBvcHRzLnNpemUgPyBvcHRzLnNpemVbMF0gOiBvdXQud2lkdGgsIG9wdHMuc2l6ZSA/IG9wdHMuc2l6ZVsxXSA6IG91dC5oZWlnaHQpXG4gICAgZ2wudW5pZm9ybTJmKHUudV9iYW5kLCBvcHRzLmJhbmQgPyBvcHRzLmJhbmRbMF0gOiAwLCBvcHRzLmJhbmQgPyBvcHRzLmJhbmRbMV0gOiAwKVxuICAgIGdsLnVuaWZvcm0zZnYodS51X3RhdSwgb3B0cy50YXUgPz8gWzAsIDAsIDBdKVxuICAgIGdsLnVuaWZvcm0zZnYodS51X3dvcmxkLCBvcHRzLndvcmxkID8/IFswLCAwLCAwXSlcbiAgICBnbC5kcmF3QXJyYXlzKGdsLlRSSUFOR0xFUywgMCwgNilcbiAgICBpZiAob3B0cy5zY2lzc29yKSBnbC5kaXNhYmxlKGdsLlNDSVNTT1JfVEVTVClcbiAgICBvdXQuZW5kRHJhdygpXG4gIH1cblxuICAvKiogKCM1MzYsIMKnMTcuMjQpIE9uZSByZWxheGF0aW9uIHN0ZXAgb2YgdGhlIHdhdGVyIGZyb250J3MgY29zdCAoV0NfV0FURVJfRlJPTlRfRlJBRylcbiAgICogIG92ZXIgYSBzZXR0bGUgZmllbGQgd2hvc2UgdG9wLWxlZnQgaXMgYXQgd29ybGQgKHgwLCB5MCk6IHNyYyDihpIgZHN0LiBTaGFyZWQgYnlcbiAgICogIHRoZSBzZXR0bGUncyBvdXR3YXJkIGFuZCBpbndhcmQgcGFzc2VzIGFuZCB0aGUgZ3JvdXAgdGlkZSdzIGlud2FyZCBvbmUuICovXG4gIHdhdGVyRnJvbnRTdGVwKFxuICAgIGZpZWxkOiBXYXRlcmNvbG9yUGFzc0ZpZWxkLCB4MDogbnVtYmVyLCB5MDogbnVtYmVyLCBkcnlDb3N0OiBudW1iZXIsXG4gICAgc3JjOiBBY2N1bXVsYXRpb25CdWZmZXIsIGRzdDogQWNjdW11bGF0aW9uQnVmZmVyLCBtYXg6IG51bWJlciwgY2xpbWI6IG51bWJlciwgZmxvb3I6IG51bWJlciwgc3RyaWRlID0gMSxcbiAgICAvKiogKMKnMTcuNDQpIFdvcmxkIHB4IHBlciBmaWVsZCBjZWxsLiAqL1xuICAgIHNjYWxlID0gMSwgZm9yZWlnbldhdGVyOiBXZWJHTFRleHR1cmUgfCBudWxsID0gbnVsbCxcbiAgKTogdm9pZCB7XG4gICAgY29uc3QgeyBnbCB9ID0gdGhpc1xuICAgIGNvbnN0IHsgdzogcGFwZXJUZXhXLCBoOiBwYXBlclRleEggfSA9IHRoaXMuY3R4LnBhcGVyV29ybGRTaXplKClcbiAgICBkc3QuYmVnaW5SZXBsYWNlRHJhdygpXG4gICAgZ2wudXNlUHJvZ3JhbSh0aGlzLl93YXRlckZyb250UHJvZylcbiAgICB0aGlzLmN0eC5zdGFtcHMoKS5iaW5kTm9pc2UodGhpcy5fd2F0ZXJGcm9udFVuaS51X3djTm9pc2VUZXgpXG4gICAgY29uc3QgdSA9IHRoaXMuX3dhdGVyRnJvbnRVbmlcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy5jdHguc2NyZWVuQnVmKCkpXG4gICAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkodGhpcy5fd2F0ZXJGcm9udFBvc0xvYylcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHRoaXMuX3dhdGVyRnJvbnRQb3NMb2MsIDIsIGdsLkZMT0FULCBmYWxzZSwgMCwgMClcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKVxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHNyYy50ZXh0dXJlKVxuICAgIGdsLnVuaWZvcm0xaSh1LnVfY29zdCwgMClcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUxKVxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRoaXMuY3R4LnBhcGVyVGV4KCkpXG4gICAgZ2wudW5pZm9ybTFpKHUudV9wYXBlckhlaWdodE1hcCwgMSlcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUyKVxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGZpZWxkLmNvdmVyYWdlLnRleHR1cmUpXG4gICAgZ2wudW5pZm9ybTFpKHUudV9maWxtLCAyKVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTMpXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgZm9yZWlnbldhdGVyID8/IHRoaXMuY3R4LnBhcGVyVGV4KCkpXG4gICAgZ2wudW5pZm9ybTFpKHUudV9mb3JlaWduRmlsbSwgMylcbiAgICBnbC51bmlmb3JtMWYodS51X2ZvcmVpZ25XZXQsIGZvcmVpZ25XYXRlciA/IDEgOiAwKVxuICAgIGdsLnVuaWZvcm0xZih1LnVfZHJ5Q29zdCwgZHJ5Q29zdClcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKVxuICAgIGdsLnVuaWZvcm0yZih1LnVfcmVzb2x1dGlvbiwgZmllbGQudywgZmllbGQuaClcbiAgICBnbC51bmlmb3JtMmYodS51X3BhcGVyT3JpZ2luLCB4MCAvIHNjYWxlLCAtKHkwIC8gc2NhbGUgKyBmaWVsZC5oKSlcbiAgICBnbC51bmlmb3JtMmYodS51X3BhcGVyVGV4U2l6ZSwgcGFwZXJUZXhXIC8gc2NhbGUsIHBhcGVyVGV4SCAvIHNjYWxlKVxuICAgIGdsLnVuaWZvcm0yZih1LnVfcGFwZXJTY2FsZSwgdGhpcy5jdHgucGFwZXJTY2FsZSgpLCB0aGlzLmN0eC5wYXBlclNjYWxlKCkpXG4gICAgZ2wudW5pZm9ybTFmKHUudV9jbGltYiwgY2xpbWIpXG4gICAgZ2wudW5pZm9ybTFmKHUudV9mbG9vciwgZmxvb3IpXG4gICAgZ2wudW5pZm9ybTFmKHUudV9jb3N0TWF4LCBtYXgpXG4gICAgZ2wudW5pZm9ybTFmKHUudV9zdHJpZGUsIHN0cmlkZSlcbiAgICBnbC5kcmF3QXJyYXlzKGdsLlRSSUFOR0xFUywgMCwgNilcbiAgICBkc3QuZW5kRHJhdygpXG4gIH1cblxuICAvKiogKCM1MzYsIMKnMTcuNDQpIE9uZSBXQ19SRVNBTVBMRV9GUkFHIGRyYXcgaW50byBgZHN0YCBvdmVyIHRoZSBHTCByZWN0XG4gICAqICAoZHgsIGR5LCBkdywgZGgpLiBNb2RlIDAgYXZlcmFnZXMgYHNyY2AgZG93biAocmF0aW8gMiksIG1vZGUgMSB3cml0ZXNcbiAgICogIGJhc2UgKyB1cChzcmMpIC0gdXAob2xkKSwgbW9kZSAyIG1heChiYXNlLCB1cChzcmMpKSAocmF0aW8gMS8yKS4gYGRzdGBcbiAgICogIG11c3Qgbm90IGJlIGBiYXNlYDogbW9kZXMgMSBhbmQgMiBnbyB0aHJvdWdoIGEgdGVtcG9yYXJ5LiAqL1xuICB3Y1Jlc2FtcGxlKFxuICAgIGRzdDogQWNjdW11bGF0aW9uQnVmZmVyLCBkeDogbnVtYmVyLCBkeTogbnVtYmVyLCBkdzogbnVtYmVyLCBkaDogbnVtYmVyLFxuICAgIHNyYzogQWNjdW11bGF0aW9uQnVmZmVyLCBzeDogbnVtYmVyLCBzeTogbnVtYmVyLCByYXRpbzogbnVtYmVyLCBtb2RlOiAwIHwgMSB8IDIsXG4gICAgb2xkOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsID0gbnVsbCwgYmFzZTogQWNjdW11bGF0aW9uQnVmZmVyIHwgbnVsbCA9IG51bGwsXG4gICAgLyoqIFRoZSBzb3VyY2UgdGV4ZWxzIHRoZSBkcmF3IG1heSByZWFkOiBbeDAsIHkwLCB4MSwgeTEpLiBUaGUgd2hvbGUgc291cmNlIGJ5IGRlZmF1bHQuICovXG4gICAgY2xhbXBSZWN0OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXSB8IG51bGwgPSBudWxsLFxuICApOiB2b2lkIHtcbiAgICBpZiAoZHcgPD0gMCB8fCBkaCA8PSAwKSByZXR1cm5cbiAgICBjb25zdCB7IGdsIH0gPSB0aGlzXG4gICAgZHN0LmJlZ2luUmVwbGFjZURyYXcoKVxuICAgIGdsLmVuYWJsZShnbC5TQ0lTU09SX1RFU1QpXG4gICAgZ2wuc2Npc3NvcihkeCwgZHksIGR3LCBkaClcbiAgICBnbC51c2VQcm9ncmFtKHRoaXMuX3Jlc2FtcGxlUHJvZylcbiAgICBjb25zdCB1ID0gdGhpcy5fcmVzYW1wbGVVbmlcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy5jdHguc2NyZWVuQnVmKCkpXG4gICAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkodGhpcy5fcmVzYW1wbGVQb3NMb2MpXG4gICAgZ2wudmVydGV4QXR0cmliUG9pbnRlcih0aGlzLl9yZXNhbXBsZVBvc0xvYywgMiwgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTApOyBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBzcmMudGV4dHVyZSk7IGdsLnVuaWZvcm0xaSh1LnVfc3JjLCAwKVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTEpOyBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCAob2xkID8/IHNyYykudGV4dHVyZSk7IGdsLnVuaWZvcm0xaSh1LnVfb2xkLCAxKVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTIpOyBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCAoYmFzZSA/PyBzcmMpLnRleHR1cmUpOyBnbC51bmlmb3JtMWkodS51X2Jhc2UsIDIpXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMClcbiAgICBnbC51bmlmb3JtMmYodS51X3NyY1NpemUsIHNyYy53aWR0aCwgc3JjLmhlaWdodClcbiAgICBnbC51bmlmb3JtMmYodS51X2Jhc2VTaXplLCAoYmFzZSA/PyBkc3QpLndpZHRoLCAoYmFzZSA/PyBkc3QpLmhlaWdodClcbiAgICBnbC51bmlmb3JtMmYodS51X2RzdE9yaWdpbiwgZHgsIGR5KVxuICAgIGdsLnVuaWZvcm0yZih1LnVfc3JjT3JpZ2luLCBzeCwgc3kpXG4gICAgZ2wudW5pZm9ybTFmKHUudV9yYXRpbywgcmF0aW8pXG4gICAgZ2wudW5pZm9ybTFmKHUudV9tb2RlLCBtb2RlKVxuICAgIGNvbnN0IGNyID0gY2xhbXBSZWN0ID8/IFswLCAwLCBzcmMud2lkdGgsIHNyYy5oZWlnaHRdXG4gICAgZ2wudW5pZm9ybTRmKHUudV9jbGFtcCwgY3JbMF0sIGNyWzFdLCBjclsyXSwgY3JbM10pXG4gICAgZ2wuZHJhd0FycmF5cyhnbC5UUklBTkdMRVMsIDAsIDYpXG4gICAgZ2wuZGlzYWJsZShnbC5TQ0lTU09SX1RFU1QpXG4gICAgZHN0LmVuZERyYXcoKVxuICB9XG5cbiAgLyoqIE9uZSBkaWZmdXNpb24gZHJhdzsgZmllbGQgb3JpZ2luIGFuZCBzY2FsZSBhcmUgZml4ZWQgYnkgdGhlIHNldHRsZSBwbGFuLiAqL1xuICBkaWZmdXNlU3RlcChcbiAgICBmaWVsZDogV2F0ZXJjb2xvclBhc3NGaWVsZCwgeDA6IG51bWJlciwgeTA6IG51bWJlciwgUzogbnVtYmVyLCBwYXBlclRleFc6IG51bWJlciwgcGFwZXJUZXhIOiBudW1iZXIsXG4gICAgc3JjOiBBY2N1bXVsYXRpb25CdWZmZXIsIGRzdDogQWNjdW11bGF0aW9uQnVmZmVyLCByYWRpdXM6IG51bWJlciwga25pZ2h0OiBib29sZWFuLCBnYXRlOiBBY2N1bXVsYXRpb25CdWZmZXIsXG4gICAgZGVuc2l0eTogQWNjdW11bGF0aW9uQnVmZmVyID0gc3JjLFxuICApOiB2b2lkIHtcbiAgICBjb25zdCB7IGdsIH0gPSB0aGlzXG4gICAgZHN0LmJlZ2luUmVwbGFjZURyYXcoKVxuICAgIGdsLnVzZVByb2dyYW0odGhpcy5fZGlmZnVzZVByb2cpXG4gICAgY29uc3QgdSA9IHRoaXMuX2RpZmZ1c2VVbmlcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy5jdHguc2NyZWVuQnVmKCkpXG4gICAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkodGhpcy5fZGlmZnVzZVBvc0xvYylcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHRoaXMuX2RpZmZ1c2VQb3NMb2MsIDIsIGdsLkZMT0FULCBmYWxzZSwgMCwgMClcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKVxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHNyYy50ZXh0dXJlKVxuICAgIGdsLnVuaWZvcm0xaSh1LnVfaW5rLCAwKVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTEpXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgZ2F0ZS50ZXh0dXJlKVxuICAgIGdsLnVuaWZvcm0xaSh1LnVfY292ZXJhZ2UsIDEpXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMilcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCB0aGlzLmN0eC5wYXBlclRleCgpKVxuICAgIGdsLnVuaWZvcm0xaSh1LnVfcGFwZXJIZWlnaHRNYXAsIDIpXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMylcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBkZW5zaXR5LnRleHR1cmUpXG4gICAgZ2wudW5pZm9ybTFpKHUudV9kZW5zaXR5LCAzKVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTApXG4gICAgZ2wudW5pZm9ybTJmKHUudV9yZXNvbHV0aW9uLCBmaWVsZC53LCBmaWVsZC5oKVxuICAgIC8vIFRoZSBwYXBlciBhdCB0aGUgd29ybGQgcG9zaXRpb24gb2YgYSB0ZXhlbC4gQSB0aWxlIHBhc3Nlc1xuICAgIC8vIChvcmlnaW5YLCAtb3JpZ2luWSkgYW5kIGxldHMgaXRzIGhlaWdodCBvZiAxMDI0IGZvbGQgaW50byB0aGUgcGFwZXInc1xuICAgIC8vIHBlcmlvZDsgYSByZWN0IG9mIGFueSBoZWlnaHQgaGFzIHRvIHNheSB3aGVyZSBpdHMgYm90dG9tIHJvdyBpcy5cbiAgICBnbC51bmlmb3JtMmYodS51X3BhcGVyT3JpZ2luLCB4MCAvIFMsIC0oeTAgLyBTICsgZmllbGQuaCkpXG4gICAgZ2wudW5pZm9ybTJmKHUudV9wYXBlclRleFNpemUsIHBhcGVyVGV4VyAvIFMsIHBhcGVyVGV4SCAvIFMpXG4gICAgZ2wudW5pZm9ybTJmKHUudV9wYXBlclNjYWxlLCB0aGlzLmN0eC5wYXBlclNjYWxlKCksIHRoaXMuY3R4LnBhcGVyU2NhbGUoKSlcbiAgICBnbC51bmlmb3JtMWYodS51X2QsIFdFVF9ESUZGVVNFX0QpXG4gICAgZ2wudW5pZm9ybTFmKHUudV9iLCBXRVRfRElGRlVTRV9CKVxuICAgIGdsLnVuaWZvcm0xZih1LnVfcmFkaXVzLCBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHJhZGl1cyAvIFMpKSlcbiAgICBnbC51bmlmb3JtMWYodS51X3N0ZW5jaWwsIGtuaWdodCA/IDEgOiAwKVxuICAgIGdsLmRyYXdBcnJheXMoZ2wuVFJJQU5HTEVTLCAwLCA2KVxuICAgIGRzdC5lbmREcmF3KClcbiAgfVxuXG4gIC8qKiBPbmUgY2hyb25vbG9naWNhbCB3ZXQgYnJ1c2ggY29udGFjdC4gQm90aCByZWNvcmRzIHJlYWQgdGhlIHVuY2hhbmdlZFxuICAgKiBwcmUtY29udGFjdCBwaWdtZW50IHJlY29yZDsgdGhlIGNhbGxlciBjb3BpZXMgcmVzdWx0cyBiYWNrIGFmdGVyd2FyZHMuICovXG4gIGJydXNoUGFzcyhcbiAgICBmaWVsZDogV2F0ZXJjb2xvclBhc3NGaWVsZCwgZmxvd1RleHR1cmU6IFdlYkdMVGV4dHVyZSwgcmFkaXVzUHg6IG51bWJlciwgUzogbnVtYmVyLFxuICAgIHNvdXJjZTogQWNjdW11bGF0aW9uQnVmZmVyLCBvdXQ6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgcGlnbWVudDogQWNjdW11bGF0aW9uQnVmZmVyLFxuICAgIGZsb3dSZWN0OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgc2Npc3NvcjogW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHsgZ2wgfSA9IHRoaXNcbiAgICBvdXQuYmVnaW5SZXBsYWNlRHJhdygpXG4gICAgZ2wudXNlUHJvZ3JhbSh0aGlzLl9icnVzaERyYWdQcm9nKVxuICAgIGNvbnN0IHUgPSB0aGlzLl9icnVzaERyYWdVbmlcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy5jdHguc2NyZWVuQnVmKCkpXG4gICAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkodGhpcy5fYnJ1c2hEcmFnUG9zTG9jKVxuICAgIGdsLnZlcnRleEF0dHJpYlBvaW50ZXIodGhpcy5fYnJ1c2hEcmFnUG9zTG9jLCAyLCBnbC5GTE9BVCwgZmFsc2UsIDAsIDApXG4gICAgY29uc3QgdGV4dHVyZXMgPSBbc291cmNlLnRleHR1cmUsIGZsb3dUZXh0dXJlLCBmaWVsZC5jb3ZlcmFnZS50ZXh0dXJlLCBwaWdtZW50LnRleHR1cmVdXG4gICAgY29uc3QgbmFtZXMgPSBbJ3VfcGFpbnQnLCAndV9mbG93JywgJ3Vfd2F0ZXInLCAndV9waWdtZW50J11cbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRleHR1cmVzLmxlbmd0aDsgaisrKSB7XG4gICAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwICsgaik7IGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRleHR1cmVzW2pdKTsgZ2wudW5pZm9ybTFpKHVbbmFtZXNbal1dLCBqKVxuICAgIH1cbiAgICBjb25zdCBzdGVwID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChyYWRpdXNQeCAqIDAuMjUgLyBTKSlcbiAgICBnbC51bmlmb3JtMmYodS51X3N0ZXAsIHN0ZXAgLyBmaWVsZC53LCBzdGVwIC8gZmllbGQuaClcbiAgICBnbC51bmlmb3JtNGZ2KHUudV9mbG93UmVjdCwgZmxvd1JlY3QpXG4gICAgZ2wuZW5hYmxlKGdsLlNDSVNTT1JfVEVTVClcbiAgICBnbC5zY2lzc29yKC4uLnNjaXNzb3IpXG4gICAgZ2wuZHJhd0FycmF5cyhnbC5UUklBTkdMRVMsIDAsIDYpXG4gICAgZ2wuZGlzYWJsZShnbC5TQ0lTU09SX1RFU1QpXG4gICAgb3V0LmVuZERyYXcoKTsgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMClcbiAgfVxuXG4gIC8qKiBTaW5nbGUtcGFpbnQgc2hvcnRjdXQ6IGFic29ycHRpb24gdGltZXMgdGhlIHNldHRsZWQgcGlnbWVudCBkZXBvc2l0LiAqL1xuICBwaWdtZW50Q29sb3Iob3V0Q29sb3I6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgZGVwb3NpdDogQWNjdW11bGF0aW9uQnVmZmVyLCB0YXU6IHJlYWRvbmx5IG51bWJlcltdKTogdm9pZCB7XG4gICAgY29uc3QgeyBnbCB9ID0gdGhpc1xuICAgIG91dENvbG9yLmJlZ2luUmVwbGFjZURyYXcoKVxuICAgIGdsLnVzZVByb2dyYW0odGhpcy5fZmllbGRPcFByb2cpXG4gICAgY29uc3QgZnUgPSB0aGlzLl9maWVsZE9wVW5pXG4gICAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHRoaXMuY3R4LnNjcmVlbkJ1ZigpKVxuICAgIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KHRoaXMuX2ZpZWxkT3BQb3NMb2MpXG4gICAgZ2wudmVydGV4QXR0cmliUG9pbnRlcih0aGlzLl9maWVsZE9wUG9zTG9jLCAyLCBnbC5GTE9BVCwgZmFsc2UsIDAsIDApXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMClcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBkZXBvc2l0LnRleHR1cmUpXG4gICAgZ2wudW5pZm9ybTFpKGZ1LnVfYSwgMClcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUxKVxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGRlcG9zaXQudGV4dHVyZSlcbiAgICBnbC51bmlmb3JtMWkoZnUudV9iLCAxKVxuICAgIC8vIFVuaXRzIDIgYW5kIDMgdG9vOiB0aGUgcHJvZ3JhbSBzYW1wbGVzIHVfYyBhbmQgdV9kLCBhbmQgd2hhdGV2ZXJcbiAgICAvLyB0aGUgbGFzdCBmaWVsZCBvcCBsZWZ0IG9uIHRob3NlIHVuaXRzIOKAlCB0aGUgcmltJ3Mgc3BhcmUgYnVmZmVyLFxuICAgIC8vIHdoaWNoIGlzIHRoaXMgdmVyeSBvdXRwdXQg4oCUIHdvdWxkIGJlIGEgZmVlZGJhY2sgbG9vcC5cbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUyKVxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGRlcG9zaXQudGV4dHVyZSlcbiAgICBnbC51bmlmb3JtMWkoZnUudV9jLCAyKVxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTMpXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgZGVwb3NpdC50ZXh0dXJlKVxuICAgIGdsLnVuaWZvcm0xaShmdS51X2QsIDMpXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMClcbiAgICBnbC51bmlmb3JtMWYoZnUudV9rLCAxKVxuICAgIGdsLnVuaWZvcm0xZihmdS51X21vZGUsIDIpXG4gICAgZ2wudW5pZm9ybTNmdihmdS51X3RhdSwgW3RhdVswXSwgdGF1WzFdLCB0YXVbMl1dKVxuICAgIGdsLmRyYXdBcnJheXMoZ2wuVFJJQU5HTEVTLCAwLCA2KVxuICAgIG91dENvbG9yLmVuZERyYXcoKVxuICB9XG5cbiAgaW5pdEZpZWxkUHJvZ3JhbXMoKTogdm9pZCB7XG4gICAgY29uc3QgeyBnbCB9ID0gdGhpc1xuICAgIHRoaXMuX2ZpZWxkT3BQcm9nICAgICAgICAgPSBjcmVhdGVQcm9ncmFtKGdsLCBESVNQTEFZX1ZFUlQsIFdDX0ZJRUxEX09QX0ZSQUcpXG4gICAgdGhpcy5fZmllbGRPcEhpZ2hQcm9nICAgICA9IGNyZWF0ZVByb2dyYW0oZ2wsIERJU1BMQVlfVkVSVCwgV0NfRklFTERfT1BfSElHSF9GUkFHKVxuICAgIHRoaXMuX2ZpZWxkT3BDYXJyeVByb2cgICAgPSBjcmVhdGVQcm9ncmFtKGdsLCBESVNQTEFZX1ZFUlQsIFdDX0ZJRUxEX09QX0NBUlJZX0ZSQUcpXG4gICAgdGhpcy5fZmllbGRPcENhcnJ5Q29sb3VyUHJvZyA9IGNyZWF0ZVByb2dyYW0oZ2wsIERJU1BMQVlfVkVSVCwgV0NfRklFTERfT1BfQ0FSUllfQ09MT1VSX0ZSQUcpXG4gICAgdGhpcy5fcmVzYW1wbGVQcm9nICAgICAgICA9IGNyZWF0ZVByb2dyYW0oZ2wsIERJU1BMQVlfVkVSVCwgV0NfUkVTQU1QTEVfRlJBRylcbiAgfVxuXG4gIGluaXRTZXR0bGVQcm9ncmFtcygpOiB2b2lkIHtcbiAgICBjb25zdCB7IGdsIH0gPSB0aGlzXG4gICAgdGhpcy5fZGlmZnVzZVByb2cgICAgICAgICA9IGNyZWF0ZVByb2dyYW0oZ2wsIERJU1BMQVlfVkVSVCwgV0NfRElGRlVTRV9GUkFHKVxuICAgIHRoaXMuX2JydXNoRHJhZ1Byb2cgPSBjcmVhdGVQcm9ncmFtKGdsLCBESVNQTEFZX1ZFUlQsIFdDX0JSVVNIX0RSQUdfRlJBRylcbiAgICB0aGlzLl9icnVzaERyYWdVbmkgPSBnZXRVbmlmb3JtcyhnbCwgdGhpcy5fYnJ1c2hEcmFnUHJvZywgWyd1X3BhaW50JywgJ3VfZmxvdycsICd1X3dhdGVyJywgJ3VfcGlnbWVudCcsICd1X3N0ZXAnLCAndV9mbG93UmVjdCddKVxuICAgIHRoaXMuX2JydXNoRHJhZ1Bvc0xvYyA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHRoaXMuX2JydXNoRHJhZ1Byb2csICdhX3Bvc2l0aW9uJylcbiAgICB0aGlzLl93YXRlckZyb250UHJvZyAgICAgID0gY3JlYXRlUHJvZ3JhbShnbCwgRElTUExBWV9WRVJULCBXQ19XQVRFUl9GUk9OVF9GUkFHKVxuICB9XG5cbiAgaW5pdEZpZWxkVW5pZm9ybXMoKTogdm9pZCB7XG4gICAgY29uc3QgeyBnbCB9ID0gdGhpc1xuICAgIHRoaXMuX2ZpZWxkT3BVbmkgPSBnZXRVbmlmb3JtcyhnbCwgdGhpcy5fZmllbGRPcFByb2csIFsndV9hJywgJ3VfYicsICd1X2MnLCAndV9rJywgJ3VfbW9kZScsICd1X3RhdScsICd1X2RpcicsICd1X2QnLCAndV9vcmlnaW4nLCAndV9zaXplJywgJ3VfYmFuZCcsICd1X3dvcmxkJ10pXG4gICAgdGhpcy5fZmllbGRPcEhpZ2hVbmkgPSBnZXRVbmlmb3JtcyhnbCwgdGhpcy5fZmllbGRPcEhpZ2hQcm9nLCBbJ3VfYScsICd1X2InLCAndV9jJywgJ3VfaycsICd1X21vZGUnLCAndV90YXUnLCAndV9kaXInLCAndV9kJywgJ3Vfb3JpZ2luJywgJ3Vfc2l6ZScsICd1X2JhbmQnLCAndV93b3JsZCddKVxuICAgIHRoaXMuX2ZpZWxkT3BDYXJyeVVuaSA9IGdldFVuaWZvcm1zKGdsLCB0aGlzLl9maWVsZE9wQ2FycnlQcm9nLCBbJ3VfYScsICd1X2InLCAndV9jJywgJ3VfaycsICd1X21vZGUnLCAndV90YXUnLCAndV9kaXInLCAndV9kJywgJ3Vfb3JpZ2luJywgJ3Vfc2l6ZScsICd1X2JhbmQnLCAndV93b3JsZCddKVxuICAgIHRoaXMuX2ZpZWxkT3BDYXJyeUNvbG91clVuaSA9IGdldFVuaWZvcm1zKGdsLCB0aGlzLl9maWVsZE9wQ2FycnlDb2xvdXJQcm9nLCBbJ3VfYScsICd1X2InLCAndV9jJywgJ3VfaycsICd1X21vZGUnLCAndV90YXUnLCAndV9kaXInLCAndV9kJywgJ3Vfb3JpZ2luJywgJ3Vfc2l6ZScsICd1X2JhbmQnLCAndV93b3JsZCddKVxuICAgIHRoaXMuX3Jlc2FtcGxlVW5pID0gZ2V0VW5pZm9ybXMoZ2wsIHRoaXMuX3Jlc2FtcGxlUHJvZywgWyd1X3NyYycsICd1X29sZCcsICd1X2Jhc2UnLCAndV9zcmNTaXplJywgJ3VfYmFzZVNpemUnLCAndV9kc3RPcmlnaW4nLCAndV9zcmNPcmlnaW4nLCAndV9yYXRpbycsICd1X21vZGUnLCAndV9jbGFtcCddKVxuICAgIHRoaXMuX3dhdGVyRnJvbnRVbmkgPSBnZXRVbmlmb3JtcyhnbCwgdGhpcy5fd2F0ZXJGcm9udFByb2csIFtcbiAgICAgICd1X3djTm9pc2VUZXgnLCAndV9jb3N0JywgJ3VfcGFwZXJIZWlnaHRNYXAnLCAndV9yZXNvbHV0aW9uJywgJ3VfcGFwZXJPcmlnaW4nLCAndV9wYXBlclRleFNpemUnLCAndV9wYXBlclNjYWxlJyxcbiAgICAgICd1X2NsaW1iJywgJ3VfZmxvb3InLCAndV9jb3N0TWF4JywgJ3VfZmlsbScsICd1X2RyeUNvc3QnLCAndV9zdHJpZGUnLCAndV9mb3JlaWduRmlsbScsICd1X2ZvcmVpZ25XZXQnLFxuICAgIF0pXG4gICAgdGhpcy5fZGlmZnVzZVVuaSA9IGdldFVuaWZvcm1zKGdsLCB0aGlzLl9kaWZmdXNlUHJvZywgW1xuICAgICAgJ3VfaW5rJywgJ3VfZGVuc2l0eScsICd1X2NvdmVyYWdlJywgJ3VfcGFwZXJIZWlnaHRNYXAnLCAndV9yZXNvbHV0aW9uJyxcbiAgICAgICd1X3BhcGVyT3JpZ2luJywgJ3VfcGFwZXJUZXhTaXplJywgJ3VfcGFwZXJTY2FsZScsICd1X2QnLCAndV9iJywgJ3VfcmFkaXVzJywgJ3Vfc3RlbmNpbCcsXG4gICAgXSlcbiAgfVxuXG4gIGluaXRGaWVsZEF0dHJpYnV0ZXMoKTogdm9pZCB7XG4gICAgY29uc3QgeyBnbCB9ID0gdGhpc1xuICAgIHRoaXMuX2ZpZWxkT3BQb3NMb2MgICAgICAgID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24odGhpcy5fZmllbGRPcFByb2csICdhX3Bvc2l0aW9uJylcbiAgICB0aGlzLl9maWVsZE9wSGlnaFBvc0xvYyAgICA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHRoaXMuX2ZpZWxkT3BIaWdoUHJvZywgJ2FfcG9zaXRpb24nKVxuICAgIHRoaXMuX2ZpZWxkT3BDYXJyeVBvc0xvYyAgID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24odGhpcy5fZmllbGRPcENhcnJ5UHJvZywgJ2FfcG9zaXRpb24nKVxuICAgIHRoaXMuX2ZpZWxkT3BDYXJyeUNvbG91clBvc0xvYyA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHRoaXMuX2ZpZWxkT3BDYXJyeUNvbG91clByb2csICdhX3Bvc2l0aW9uJylcbiAgICB0aGlzLl9yZXNhbXBsZVBvc0xvYyAgICAgICA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHRoaXMuX3Jlc2FtcGxlUHJvZywgJ2FfcG9zaXRpb24nKVxuICB9XG5cbiAgaW5pdERpZmZ1c2lvbkF0dHJpYnV0ZXMoKTogdm9pZCB7XG4gICAgY29uc3QgeyBnbCB9ID0gdGhpc1xuICAgIHRoaXMuX2RpZmZ1c2VQb3NMb2MgICAgICAgID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24odGhpcy5fZGlmZnVzZVByb2csICdhX3Bvc2l0aW9uJylcbiAgICB0aGlzLl93YXRlckZyb250UG9zTG9jICAgICA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHRoaXMuX3dhdGVyRnJvbnRQcm9nLCAnYV9wb3NpdGlvbicpXG4gIH1cblxuICBkZXN0cm95KCk6IHZvaWQge1xuICAgIC8vIERlbGV0aW5nIHRoZSBjdXJyZW50bHkgYm91bmQgcHJvZ3JhbSBpcyBkZWZlcnJlZCB1bnRpbCBpdCBpcyB1bmJvdW5kLlxuICAgIC8vIEEgZmluYWwgZmllbGQgcGFzcyBtYXkgc3RpbGwgYmUgYWN0aXZlIHdoZW4gYSBjb25uZWN0ZWQgY2FudmFzIGlzIHJldGlyZWQuXG4gICAgY29uc3QgY3VycmVudCA9IHRoaXMuZ2wuZ2V0UGFyYW1ldGVyKHRoaXMuZ2wuQ1VSUkVOVF9QUk9HUkFNKVxuICAgIGlmIChbdGhpcy5fZmllbGRPcFByb2csIHRoaXMuX2ZpZWxkT3BIaWdoUHJvZywgdGhpcy5fZmllbGRPcENhcnJ5UHJvZywgdGhpcy5fZmllbGRPcENhcnJ5Q29sb3VyUHJvZyxcbiAgICAgIHRoaXMuX3Jlc2FtcGxlUHJvZywgdGhpcy5fZGlmZnVzZVByb2csIHRoaXMuX2JydXNoRHJhZ1Byb2csIHRoaXMuX3dhdGVyRnJvbnRQcm9nXS5pbmNsdWRlcyhjdXJyZW50KSkge1xuICAgICAgdGhpcy5nbC51c2VQcm9ncmFtKG51bGwpXG4gICAgfVxuICAgIHRoaXMuZ2wuZGVsZXRlUHJvZ3JhbSh0aGlzLl9maWVsZE9wUHJvZylcbiAgICB0aGlzLmdsLmRlbGV0ZVByb2dyYW0odGhpcy5fZmllbGRPcEhpZ2hQcm9nKVxuICAgIHRoaXMuZ2wuZGVsZXRlUHJvZ3JhbSh0aGlzLl9maWVsZE9wQ2FycnlQcm9nKVxuICAgIHRoaXMuZ2wuZGVsZXRlUHJvZ3JhbSh0aGlzLl9maWVsZE9wQ2FycnlDb2xvdXJQcm9nKVxuICAgIHRoaXMuZ2wuZGVsZXRlUHJvZ3JhbSh0aGlzLl9yZXNhbXBsZVByb2cpXG4gICAgdGhpcy5nbC5kZWxldGVQcm9ncmFtKHRoaXMuX2RpZmZ1c2VQcm9nKVxuICAgIHRoaXMuZ2wuZGVsZXRlUHJvZ3JhbSh0aGlzLl9icnVzaERyYWdQcm9nKVxuICAgIHRoaXMuZ2wuZGVsZXRlUHJvZ3JhbSh0aGlzLl93YXRlckZyb250UHJvZylcbiAgfVxufVxuIl19