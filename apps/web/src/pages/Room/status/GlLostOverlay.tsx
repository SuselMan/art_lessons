import { useEffect, useState, type RefObject } from 'react'

import { RoomFailureOverlay } from './RoomFailureOverlay'

/** How long a lost WebGL context may take to come back on its own before the
 *  room says so. Chrome usually restores within a second when it can. */
const GL_LOST_GRACE_MS = 3000

/** (#536, ADR 011 §17.50) Whether the canvas's WebGL context is lost and has
 *  stayed lost. Found on a Surface (Intel Iris Xe, D3D11) during a
 *  four-device test: the GPU was reset under load, the context never came
 *  back, and the room went on "working" — every stroke a no-op on a frozen
 *  picture, with nothing on screen to say why. The engine keeps its own flag;
 *  this listens to the same canvas events for the one thing the engine
 *  cannot do, telling the person. */
export function useGlContextLost(canvasRef: RefObject<HTMLCanvasElement | null>, engineEpoch: number): boolean {
  const [lost, setLost] = useState(false)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let timer = 0
    const onLost = (): void => {
      clearTimeout(timer)
      timer = window.setTimeout(() => setLost(true), GL_LOST_GRACE_MS)
    }
    const onRestored = (): void => { clearTimeout(timer); setLost(false) }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      clearTimeout(timer)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  // Re-run whenever the engine is (re)created: the canvas is not mounted yet
  // on the first render (the join form comes first).
  }, [canvasRef, engineEpoch])
  return lost
}

/** The screen for it: the drawing is on the server, a reload brings it back. */
export function GlLostOverlay(): React.JSX.Element {
  return (
    <RoomFailureOverlay
      icon="error"
      titleKey="room.glLost.title"
      bodyKey="room.glLost.body"
      retryKey="room.glLost.retry"
      onRetry={() => { location.reload() }}
    />
  )
}
