import type { TryCanvas, TryTool } from './tryCanvas'

/** (#246) The part of the try-it sheet that ships with the page: the toolbar,
 *  the "Try it" button over the paper, wired up. The engine behind them
 *  (tryCanvas.ts) is a separate chunk fetched on the first action, so reading
 *  the landing costs nothing extra.
 *
 *  The toolbar is visible from the start — the tools are what tell a reader
 *  what this block is. Any first action opens the sheet: picking a tool opens
 *  it with that tool, the button or a tap on the paper opens it with the
 *  pencil. The button then goes away; it only ever meant "start here". */

const root = document.querySelector<HTMLElement>('[data-try]')
if (root) wire(root)

function wire(root: HTMLElement): void {
  const start = root.querySelector<HTMLButtonElement>('.try-start')
  const stage = root.querySelector<HTMLElement>('.try-stage')
  const canvasEl = root.querySelector<HTMLCanvasElement>('.try-canvas')
  const status = root.querySelector<HTMLElement>('.try-status')
  const toolbar = root.querySelector<HTMLElement>('.try-tools')
  if (!start || !stage || !canvasEl || !status || !toolbar) return

  let sheet: TryCanvas | null = null
  let opening: Promise<TryCanvas | null> | null = null
  let tool: TryTool = 'pencil'

  const markPressed = (): void => {
    for (const b of toolbar.querySelectorAll<HTMLElement>('[data-tool]')) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === tool))
    }
  }

  // One load no matter how many clicks arrive while it runs; the tool picked
  // last wins, because that's the one the person is now holding.
  const open = (): Promise<TryCanvas | null> => opening ??= (async () => {
    root.dataset.state = 'loading'
    status.textContent = 'Laying out the paper…'
    status.hidden = false
    try {
      const { mountTryCanvas } = await import('./tryCanvas')
      canvasEl.hidden = false
      const mounted = mountTryCanvas(canvasEl)
      await mounted.ready
      sheet = mounted.canvas
      sheet.setTool(tool)
      root.dataset.state = 'live'
      status.hidden = true
      return sheet
    } catch {
      // No WebGL, or the paper didn't arrive. Say so plainly and point to the
      // one place that will tell them more — the app itself.
      root.dataset.state = 'failed'
      canvasEl.hidden = true
      status.textContent = 'This browser couldn’t open the sheet. Try it in the app instead.'
      return null
    }
  })()

  start.addEventListener('click', () => {
    tool = 'pencil'
    markPressed()
    void open()
  })
  // A tap on the bare paper means the same as the button. Once the canvas is
  // up it takes the pointer itself, so this only ever fires before that.
  stage.addEventListener('pointerdown', e => {
    if (e.target === stage) start.click()
  })

  toolbar.addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!button) return
    const { tool: picked, action } = button.dataset
    if (picked) {
      tool = picked as TryTool
      markPressed()
      if (sheet) sheet.setTool(tool)
      else void open()
    } else if (sheet) {
      if (action === 'undo') sheet.undo()
      else if (action === 'clear') sheet.clear()
    }
  })
}
