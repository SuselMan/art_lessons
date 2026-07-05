const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // reference photos from a phone camera easily exceed this; no resize/recompress pipeline yet, just a clear rejection instead of silently bloating the Operation Log

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    // reader.error's own message is usually more specific than nothing (e.g.
    // "NotReadableError" for a cloud-only photo not yet downloaded to the
    // device — a real iOS/iCloud Photos gotcha) — surface it instead of a
    // generic string so a report of this actually points somewhere.
    reader.onerror = () => reject(new Error(`failed to read file: ${reader.error?.message || reader.error?.name || 'unknown error'}`))
    reader.readAsDataURL(file)
  })
}

function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('failed to decode image — is it a valid image file?'))
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
