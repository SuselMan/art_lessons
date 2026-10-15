/* Shared controls for the archive and the per-stroke version comparison. */
globalThis.GalleryControls = {
  versionHash(version) {
    const commit = String(version?.commit || '').trim()
    if (/^[a-f\d]{7,40}$/i.test(commit)) return commit
    return String(version?.id || '').match(/^[a-f\d]{7,40}(?=-|$)/i)?.[0] || ''
  },
  async copy(text, button, status) {
    if (!text) return
    const active = document.activeElement
    let fallback = false
    button.disabled = true
    try {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // The fallback must live inside an open dialog's top layer to receive focus.
        fallback = true
        const field = document.createElement('textarea')
        field.value = text
        field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0'
        ;(button.closest('dialog') || document.body).appendChild(field)
        try {
          field.select()
          if (!document.execCommand('copy')) throw new Error('Copy unavailable')
        } finally {
          field.remove()
        }
      }
      status.textContent = 'Скопировано: ' + text
    } catch {
      status.textContent = 'Не удалось скопировать автоматически. Выдели текст: ' + text
    } finally {
      button.disabled = false
      if (fallback) active?.focus({ preventScroll: true })
    }
  },
}
