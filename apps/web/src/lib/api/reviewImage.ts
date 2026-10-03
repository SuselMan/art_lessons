import type { RouteBody } from '@grafetto/shared'

import { api, apiResponse } from './api'

type ReviewBounds = RouteBody<'POST /api/rooms/:roomId/review'>['bounds']

export async function uploadReviewImage(boardId: string, image: { blob: Blob; bounds: ReviewBounds }): Promise<void> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') { reject(new Error('Invalid image')); return }
      resolve(reader.result.slice(reader.result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(image.blob)
  })
  await api('POST /api/rooms/:roomId/review', { params: { roomId: boardId }, body: { data, bounds: image.bounds } })
}

/** Object URL owned by the caller, ready to display. */
export async function fetchReviewImage(boardId: string, signal: AbortSignal): Promise<{ url: string; bounds: ReviewBounds }> {
  const response = await apiResponse('GET /api/rooms/:roomId/review', { params: { roomId: boardId } }, { signal })
  const values = ['X', 'Y', 'Width', 'Height'].map(key => {
    const value = response.headers.get(`X-Review-${key}`)
    return value === null ? NaN : Number(value)
  })
  const [x, y, width, height] = values
  if (!values.every(Number.isFinite) || width < 1 || height < 1) throw new Error('Invalid review bounds')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (signal.aborted || image.naturalWidth !== width || image.naturalHeight !== height) throw new Error('Invalid review image')
    return { url, bounds: { x, y, width, height } }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}
