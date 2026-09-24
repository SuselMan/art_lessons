import type { TryCanvas, TryTool } from './tryCanvas'

/** (#246) The part of the try-it sheet that ships with the page: a button and a
 *  toolbar, wired up. The engine behind them (tryCanvas.ts) is a separate chunk
 *  fetched on the first press, so reading the landing costs nothing extra. */

const root = document.querySelector<HTMLElement>('[data-try]')
if (root) wire(root)

function wire(root: HTMLElement): void {
  const start = root.querySelector<HTMLButtonElement>('.try-start')
  const canvasEl = root.querySelector<HTMLCanvasElement>('.try-canvas')
  const status = root.querySelector<HTMLElement>('.try-status')
  const toolbar = root.querySelector<HTMLElement>('.try-tools')
  if (!start || !canvasEl || !status || !toolbar) return

  let sheet: TryCanvas | null = null

  start.addEventListener('click', async () => {
    start.disabled = true
    status.textContent = 'Laying out the paper…'
    status.hidden = false
    root.dataset.state = 'loading'
    try {
      const { mountTryCanvas } = await import('./tryCanvas')
      canvasEl.hidden = false
      const mounted = mountTryCanvas(canvasEl)
      await mounted.ready
      sheet = mounted.canvas
      root.dataset.state = 'live'
      status.hidden = true
      toolbar.hidden = false
    } catch {
      // No WebGL, or the paper didn't arrive. Say so plainly and point to the
      // one place that will tell them more — the app itself.
      root.dataset.state = 'failed'
      canvasEl.hidden = true
      status.textContent = 'This browser couldn’t open the sheet. Try it in the app instead.'
    }
  })

  toolbar.addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!button || !sheet) return
    const { tool, action } = button.dataset
    if (action === 'undo') sheet.undo()
    else if (action === 'clear') sheet.clear()
    else if (tool) {
      sheet.setTool(tool as TryTool)
      for (const b of toolbar.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b === button))
    }
  })
}
