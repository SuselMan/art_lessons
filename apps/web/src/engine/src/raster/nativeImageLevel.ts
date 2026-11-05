import { scaleIntegerImageU8, type IntegerImageSize } from './integerImageScale'

const SCALE_EPSILON = 1e-6
const MAX_PLANE_BYTES = 4 * 1024 * 1024

export interface NativeImageLevelSelection {
  scale: number
  nativeWidth: number
  nativeHeight: number
}
export interface NativeImageLevel extends NativeImageLevelSelection {
  /** Dimensions include the transparent one-pixel workaround border. */
  width: number
  height: number
  pixels: Uint8Array
}

function checkSourceSize(size: IntegerImageSize): void {
  if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height)
    || size.width < 1 || size.height < 1 || size.width > 4096 || size.height > 4096
    || size.width * size.height > MAX_PLANE_BYTES) throw new RangeError('Invalid native source image dimensions')
}
const roundedAxis = (size: number, scale: number) => Math.floor(size * scale + .5)

/** Metadata-only selection matching pinned KisQImagePyramid's finite levels.
 * https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/libs/brush/kis_qimage_pyramid.cpp
 * physicalLongest must describe a UNIFORM scaling of the original image.
 * Extra tip-ratio deformation/shear is not inferred from its bounding box.
 * The epsilon is absolute in source scale, not in pixels or log2 units. */
export function selectNativeImageLevel(sourceSize: IntegerImageSize, physicalLongest: number): NativeImageLevelSelection {
  checkSourceSize(sourceSize)
  if (!Number.isFinite(physicalLongest) || physicalLongest <= 0) throw new RangeError('Invalid physical image extent')
  const requested = physicalLongest / Math.max(sourceSize.width, sourceSize.height)
  const extent = (scale: number) => ({
    scale, nativeWidth: roundedAxis(sourceSize.width, scale), nativeHeight: roundedAxis(sourceSize.height, scale),
  })
  let scale = 1
  // Native enlargement is capped at8 and admitted when EITHER rounded axis
  // fits512; a thin image may therefore have a much longer other axis.
  for (const enlarged of [8, 4, 2]) {
    const size = extent(enlarged)
    if (size.nativeWidth <= 512 || size.nativeHeight <= 512) { scale = enlarged; break }
  }
  while (true) {
    const next = extent(scale * .5)
    if (!next.nativeWidth || !next.nativeHeight) break
    if (next.scale > requested || Math.abs(next.scale - requested) < SCALE_EPSILON) scale = next.scale
    else break
  }
  return extent(scale)
}

/** Build ONLY the requested grayscale coverage derivative, directly from the
 * immutable original extent (no recursive half-size pyramid or POT padding).
 * Recover native brightness before Qt's integer filter, invert only afterward,
 * then add the one-pixel transparent QPainter-workaround border. RGB/lightness
 * image conversion and the subsequent QPainter transform are outside this API.
 * Output≤4MiB; underlying scaler additionally bounds dimensions and work. */
export function buildNativeImageLevel(
  originalCoverage: Uint8Array, sourceSize: IntegerImageSize, physicalLongest: number,
): NativeImageLevel {
  const selected = selectNativeImageLevel(sourceSize, physicalLongest)
  const width = selected.nativeWidth + 2, height = selected.nativeHeight + 2
  if (width * height > MAX_PLANE_BYTES) throw new RangeError('Native image level exceeds the plane budget')
  // The identity copy validates layout and preserves caller-owned bytes,
  // including Uint8Array subclasses whose slice() could return a view.
  const brightness = scaleIntegerImageU8(originalCoverage, sourceSize, sourceSize)
  for (let i = 0; i < brightness.length; i++) brightness[i] = 255 - brightness[i]
  const scaled = selected.nativeWidth === sourceSize.width && selected.nativeHeight === sourceSize.height
    ? brightness
    : scaleIntegerImageU8(brightness, sourceSize, { width: selected.nativeWidth, height: selected.nativeHeight })
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < selected.nativeHeight; y++) {
    const sourceRow = y * selected.nativeWidth, destinationRow = (y + 1) * width + 1
    for (let x = 0; x < selected.nativeWidth; x++) pixels[destinationRow + x] = 255 - scaled[sourceRow + x]
  }
  return { ...selected, width, height, pixels }
}
