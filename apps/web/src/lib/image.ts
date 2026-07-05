const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // reference photos from a phone camera easily exceed this; no resize/recompress pipeline yet, just a clear rejection instead of silently bloating the Operation Log

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('failed to read file'))
    reader.readAsDataURL(file)
  })
}

function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('failed to decode image'))
    img.src = dataUrl
  })
}

/** Reads an image file into the shape `image_import` (#88) needs — a data
 *  URL plus its natural size — throwing on anything too large rather than
 *  embedding a huge base64 blob in the Operation Log (there's no object
 *  storage yet, see ImageImportOperation's doc comment in packages/shared). */
export async function readImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB)`)
  }
  const dataUrl = await readAsDataUrl(file)
  const { width, height } = await loadImageSize(dataUrl)
  return { dataUrl, width, height }
}
