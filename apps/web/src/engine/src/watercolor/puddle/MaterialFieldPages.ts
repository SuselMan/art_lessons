/** Logical finite RGBA8 field. Rows increase in GL bottom-up Y order. No world mapping. */
export interface MaterialRect { x: number; y: number; width: number; height: number }
export type MaterialBoundary = 'clamp' | 'zero';
type Page = { readonly uniform: readonly number[]; readonly word: number } | { readonly bytes: Uint8Array };
const integer = (n: number) => Number.isSafeInteger(n);
function rectCheck(r: MaterialRect): void {
  if (![r.x, r.y, r.width, r.height].every(integer) || r.width < 0 || r.height < 0)
    throw new RangeError('Invalid material rectangle');
}
function compress(bytes: Uint8Array): Page {
  // Owned pages are aligned RGBA storage. Native words preserve exact byte order.
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  const word = words[0]!;
  for (let i = 1; i < words.length; i++) if (words[i] !== word) return { bytes };
  return { uniform: Array.from(bytes.subarray(0, 4)), word };
}
export interface MaterialFieldSnapshot {
  readonly width: number; readonly height: number; readonly pageSize: number; readonly revision: number;
  readRect(rect: MaterialRect, boundary?: MaterialBoundary): Uint8Array;
}
class ImmutableMaterialFieldSnapshot implements MaterialFieldSnapshot {
  readonly #pages: ReadonlyMap<number, Page>;
  readonly width: number;
  readonly height: number;
  readonly pageSize: number;
  readonly revision: number;
  constructor(width: number, height: number, pageSize: number,
    revision: number, pages: ReadonlyMap<number, Page>) {
    this.width = width; this.height = height; this.pageSize = pageSize;
    this.revision = revision; this.#pages = new Map(pages);
  }
  /** Always returns owned storage, including for an exact page read. */
  readRect(rect: MaterialRect, boundary: MaterialBoundary = 'clamp'): Uint8Array {
    rectCheck(rect);
    const out = new Uint8Array(rect.width * rect.height * 4);
    const columns = Math.ceil(this.width / this.pageSize);
    const words = new Uint32Array(out.buffer);
    for (let y = 0; y < rect.height; y++) {
      let gy = rect.y + y;
      if (boundary === 'zero' && (gy < 0 || gy >= this.height)) continue;
      gy = Math.min(this.height - 1, Math.max(0, gy));
      const py = Math.floor(gy / this.pageSize);
      for (let x = 0; x < rect.width;) {
        const worldX = rect.x + x;
        const gx = Math.min(this.width - 1, Math.max(0, worldX));
        const px = Math.floor(gx / this.pageSize);
        const outside = worldX < 0 || worldX >= this.width;
        const count = Math.min(rect.width - x, worldX < 0 ? -worldX : worldX >= this.width
          ? rect.width - x : Math.min(this.width, (px + 1) * this.pageSize) - gx);
        const page = this.#pages.get(py * columns + px);
        if (page && !(outside && boundary === 'zero')) {
          const w = Math.min(this.pageSize, this.width - px * this.pageSize);
          const source = ((gy % this.pageSize) * w + gx % this.pageSize) * 4;
          const target = (y * rect.width + x) * 4;
          if ('uniform' in page || outside) {
            const value = 'uniform' in page ? page.word
              : new Uint32Array(page.bytes.buffer, page.bytes.byteOffset + source, 1)[0]!;
            words.fill(value, target / 4, target / 4 + count);
          } else out.set(page.bytes.subarray(source, source + count * 4), target);
        }
        x += count;
      }
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
  private readonly field: MaterialFieldPages;
  private readonly expected: number;
  private pages: Map<number, Page>;
  private readonly publish: (pages: Map<number, Page>, expected: number) => number;
  constructor(field: MaterialFieldPages, expected: number,
    pages: Map<number, Page>, publish: (pages: Map<number, Page>, expected: number) => number) {
    this.field = field; this.expected = expected; this.pages = pages; this.publish = publish;
  }
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
        const fullPage = rect.x <= ox && rect.y <= oy && rect.x + rect.width >= ox + w && rect.y + rect.height >= oy + h;
        if (old && !fullPage) {
          if ('bytes' in old) bytes.set(old.bytes);
          else if (old.word !== 0) new Uint32Array(bytes.buffer).fill(old.word);
        }
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
