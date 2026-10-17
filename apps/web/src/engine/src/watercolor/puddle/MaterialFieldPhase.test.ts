import { describe, expect, it } from 'vitest';
import { MaterialFieldPages } from './MaterialFieldPages';
import { executeMaterialFieldPhase, type MaterialPhaseWindow } from './MaterialFieldPhase';
const width = 17, height = 14, pageSize = 5; // 4 by 3 pages, both edges partial
const full = { x: 0, y: 0, width, height };
const initial = () => Uint8Array.from({ length: width * height * 4 }, (_, i) => (i * 37 + Math.floor(i / 7)) % 256);
const offsets = (r: number) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]];
function reference(data: Uint8Array, radius: number): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (const [dx, dy] of offsets(radius)) {
      const sx = Math.max(0, Math.min(width - 1, x + dx!));
      const sy = Math.max(0, Math.min(height - 1, y + dy!));
      sum += data[(sy * width + sx) * 4 + c]!;
    }
    out[(y * width + x) * 4 + c] = Math.floor(sum / 9);
  }
  return out;
}
function stencil(radius: number) {
  return ({ rect, interior, inputs }: MaterialPhaseWindow) => {
    const out = new Uint8Array(inputs[0]!.length);
    for (let y = interior.y; y < interior.y + interior.height; y++)
      for (let x = interior.x; x < interior.x + interior.width; x++) for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (const [dx, dy] of offsets(radius)) sum += inputs[0]![((y + dy!) * rect.width + x + dx!) * 4 + c]!;
        out[(y * rect.width + x) * 4 + c] = Math.floor(sum / 9);
      }
    return out;
  };
}
function field() { const f = new MaterialFieldPages({ width, height, pageSize }); f.writeRect(full, initial()); return f; }
function exhaust(g: Generator<unknown, number, void>) { let v = g.next(); while (!v.done) v = g.next(); return v.value; }
describe('material phase pages', () => {
  it('matches independent whole-field reference over sequential diagonal phases in either order, including aliasing', () => {
    const forward = field(), reverse = field(); let expected: Uint8Array = initial();
    for (const halo of [1, 3, 2, 6]) {
      expected = reference(expected, halo);
      for (const [output, order] of [[forward, 'forward'], [reverse, 'reverse']] as const) {
        const revision = output.revision;
        const g = executeMaterialFieldPhase({ inputs: [output], output, halo, order, run: stencil(halo) });
        const frozen = output.snapshot(), frozenBytes = frozen.readRect(full);
        expect(exhaust(g)).toBe(revision + 1);
        expect(output.snapshot().readRect(full)).toEqual(expected);
        expect(frozen.revision).toBe(revision);
        expect(frozen.readRect(full)).toEqual(frozenBytes);
      }
    }
  });
  it('freezes all inputs at invocation and owns callback arrays', () => {
    const input = field(), output = field(), old = input.snapshot().readRect(full);
    const g = executeMaterialFieldPhase({ inputs: [input, input], output, halo: 0, run: ({ inputs }) => {
      expect(inputs[0]).toEqual(inputs[1]); inputs[1]!.fill(0); return inputs[0]!;
    } });
    input.writeRect(full, new Uint8Array(old.length)); exhaust(g);
    expect(output.snapshot().readRect(full)).toEqual(old);
  });
  it('never publishes on return, throw, callback error, bad result, or stale revision', () => {
    for (const mode of ['return', 'throw', 'callback', 'length', 'stale']) {
      const output = field(), before = output.snapshot().readRect(full), revision = output.revision;
      const g = executeMaterialFieldPhase({ inputs: [output], output, halo: 1, run: w => {
        if (mode === 'callback') throw new Error('failed');
        return mode === 'length' ? new Uint8Array(1) : w.inputs[0]!;
      } });
      if (mode === 'callback' || mode === 'length') expect(() => g.next()).toThrow();
      else {
        g.next(); expect(output.revision).toBe(revision);
        if (mode === 'return') g.return(0);
        if (mode === 'throw') expect(() => g.throw(new Error('stop'))).toThrow('stop');
        if (mode === 'stale') {
          output.writeRect({ x: 0, y: 0, width: 1, height: 1 }, new Uint8Array([4, 3, 2, 1]));
          const concurrent = output.snapshot().readRect(full);
          expect(() => exhaust(g)).toThrow('Stale');
          expect(output.snapshot().readRect(full)).toEqual(concurrent); continue;
        }
      }
      expect(output.revision).toBe(revision); expect(output.snapshot().readRect(full)).toEqual(before);
    }
  });
  it('waits until exhausted, including after the last page yield', () => {
    const output = field(), revision = output.revision;
    const g = executeMaterialFieldPhase({ inputs: [output], output, halo: 1, run: stencil(1) });
    for (let i = 0; i < 12; i++) { expect(g.next().done).toBe(false); expect(output.revision).toBe(revision); }
    g.return(0); expect(output.revision).toBe(revision);
  });
  it('copies writes and reads, preserves snapshots, handles global clamp/zero and sparse zeros', () => {
    const f = new MaterialFieldPages({ width: 6, height: 7, pageSize: 3 });
    const bytes = new Uint8Array([1, 2, 3, 4]); f.writeRect({ x: 0, y: 0, width: 1, height: 1 }, bytes);
    const old = f.snapshot(); bytes.fill(99);
    old.readRect({ x: 0, y: 0, width: 1, height: 1 }).fill(88);
    f.writeRect({ x: 0, y: 0, width: 6, height: 7 }, new Uint8Array(6 * 7 * 4));
    expect(old.readRect({ x: -1, y: -1, width: 1, height: 1 })).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(old.readRect({ x: -1, y: -1, width: 1, height: 1 }, 'zero')).toEqual(new Uint8Array(4));
    expect(f.snapshot().readRect({ x: 0, y: 0, width: 6, height: 7 })).toEqual(new Uint8Array(168));
  });
});
