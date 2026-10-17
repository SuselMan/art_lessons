/** Logical finite RGBA8 field. Rows increase in GL bottom-up Y order. No world mapping. */
export interface MaterialRect { x: number; y: number; width: number; height: number }
export type MaterialBoundary = 'clamp' | 'zero';
type Page = { readonly uniform: readonly number[] } | { readonly bytes: Uint8Array };
const integer = (n: number) => Number.isSafeInteger(n);
function rectCheck(r: MaterialRect): void {
  if (![r.x, r.y, r.width, r.height].every(integer) || r.width < 0 || r.height < 0)
    throw new RangeError('Invalid material rectangle');
}
function compress(bytes: Uint8Array): Page {
  for (let i = 4; i < bytes.length; i++) if (bytes[i] !== bytes[i % 4]) return { bytes };
  return { uniform: Array.from(bytes.subarray(0, 4)) };
}
export interface MaterialFieldSnapshot {
  readonly width: number; readonly height: number; readonly pageSize: number; readonly revision: number;
  readRect(rect: MaterialRect, boundary?: MaterialBoundary): Uint8Array;
}
class ImmutableMaterialFieldSnapshot implements MaterialFieldSnapshot {
  readonly #pages: ReadonlyMap<number, Page>;
  constructor(readonly width: number, readonly height: number, readonly pageSize: number,
    readonly revision: number, pages: ReadonlyMap<number, Page>) { this.#pages = new Map(pages); }
  /** Always returns owned storage, including for an exact page read. */
  readRect(rect: MaterialRect, boundary: MaterialBoundary = 'clamp'): Uint8Array {
    rectCheck(rect);
    const out = new Uint8Array(rect.width * rect.height * 4);
    const columns = Math.ceil(this.width / this.pageSize);
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      let gx = rect.x + x, gy = rect.y + y;
      if (boundary === 'zero' && (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height)) continue;
      gx = Math.min(this.width - 1, Math.max(0, gx));
      gy = Math.min(this.height - 1, Math.max(0, gy));
      const px = Math.floor(gx / this.pageSize), py = Math.floor(gy / this.pageSize);
      const page = this.#pages.get(py * columns + px);
      if (!page) continue;
      const w = Math.min(this.pageSize, this.width - px * this.pageSize);
      const source = ((gy % this.pageSize) * w + gx % this.pageSize) * 4;
      const target = (y * rect.width + x) * 4;
      for (let c = 0; c < 4; c++) out[target + c] = 'uniform' in page ? page.uniform[c]! : page.bytes[source + c]!;
    }
    return out;
  }
}
export class MaterialFieldPages {
  readonly width: number;
  readonly height: number;
  readonly pageSize: number;
  #revision = 0;
  #pages = new Map<number, Page>();
  constructor(options: { width: number; height: number; pageSize?: number }) {
    const { width, height, pageSize = 512 } = options;
    if (![width, height, pageSize].every(n => integer(n) && n > 0)) throw new RangeError('Invalid material dimensions');
    this.width = width; this.height = height; this.pageSize = pageSize;
  }
  get revision(): number { return this.#revision; }
  snapshot(): MaterialFieldSnapshot {
    return new ImmutableMaterialFieldSnapshot(this.width, this.height, this.pageSize, this.#revision, this.#pages);
  }
  beginWrite(expectedRevision = this.#revision): MaterialFieldWrite {
    // Maps and immutable page payloads are shared; modified pages are always copied.
    return new OwnedMaterialFieldWrite(this, expectedRevision, new Map(this.#pages), (pages, expected) => {
      if (expected !== this.#revision) throw new Error('Stale material field revision');
      this.#pages = pages; return ++this.#revision;
    });
  }
  writeRect(rect: MaterialRect, data: Uint8Array): number {
    const write = this.beginWrite(); write.writeRect(rect, data); return write.commit();
  }
}
export interface MaterialFieldWrite {
  writeRect(rect: MaterialRect, data: Uint8Array): void;
  commit(): number;
  abort(): void;
}
class OwnedMaterialFieldWrite implements MaterialFieldWrite {
  #closed = false;
  constructor(private readonly field: MaterialFieldPages, private readonly expected: number,
    private pages: Map<number, Page>, private readonly publish: (pages: Map<number, Page>, expected: number) => number) {}
  writeRect(rect: MaterialRect, data: Uint8Array): void {
    if (this.#closed) throw new Error('Material write is closed');
    rectCheck(rect);
    const f = this.field;
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > f.width || rect.y + rect.height > f.height || data.length !== rect.width * rect.height * 4)
      throw new RangeError('Material write outside field or wrong byte length');
    if (!rect.width || !rect.height) return;
    const columns = Math.ceil(f.width / f.pageSize);
    for (let py = Math.floor(rect.y / f.pageSize); py <= Math.floor((rect.y + rect.height - 1) / f.pageSize); py++)
      for (let px = Math.floor(rect.x / f.pageSize); px <= Math.floor((rect.x + rect.width - 1) / f.pageSize); px++) {
        const ox = px * f.pageSize, oy = py * f.pageSize;
        const w = Math.min(f.pageSize, f.width - ox), h = Math.min(f.pageSize, f.height - oy);
        const key = py * columns + px, old = this.pages.get(key);
        const bytes = new Uint8Array(w * h * 4);
        if (old) { if ('bytes' in old) bytes.set(old.bytes); else for (let i = 0; i < bytes.length; i++) bytes[i] = old.uniform[i % 4]!; }
        for (let y = Math.max(oy, rect.y); y < Math.min(oy + h, rect.y + rect.height); y++) {
          const start = Math.max(ox, rect.x), end = Math.min(ox + w, rect.x + rect.width);
          bytes.set(data.subarray(((y - rect.y) * rect.width + start - rect.x) * 4,
            ((y - rect.y) * rect.width + end - rect.x) * 4), ((y - oy) * w + start - ox) * 4);
        }
        const page = compress(bytes);
        if ('uniform' in page && page.uniform.every(n => n === 0)) this.pages.delete(key); else this.pages.set(key, page);
      }
  }
  commit(): number {
    if (this.#closed) throw new Error('Material write is closed');
    this.#closed = true;
    try { return this.publish(this.pages, this.expected); } finally { this.pages = new Map(); }
  }
  abort(): void { this.#closed = true; this.pages.clear(); }
}
