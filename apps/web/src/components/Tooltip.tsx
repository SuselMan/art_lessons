import { cloneElement, useCallback, useId, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { usePopupAnchor } from '../lib/input/usePopupAnchor'
import styles from './Tooltip.module.css'

interface TooltipProps {
  content: ReactNode
  children: ReactElement<{ 'aria-describedby'?: string }>
  placement?: 'above' | 'below' | 'left' | 'right' | 'auto'
}

/** Shared hover/focus/tap help, portaled above dialogs and clamped to the viewport. */
export function Tooltip({ content, children, placement = 'auto' }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const dismiss = useCallback(() => setOpen(false), [])
  const { triggerRef, popupRef, style } = usePopupAnchor<HTMLSpanElement, HTMLDivElement>(open, dismiss, {
    placement, align: 'center', remeasureKey: content,
  })
  return (
    <span ref={triggerRef} className={styles.trigger}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true) }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') setOpen(false) }}
      onFocus={() => setOpen(true)} onBlur={dismiss}
      onClick={() => setOpen(true)}
      onKeyDownCapture={event => {
        if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss() }
      }}
    >
      {cloneElement(children, { 'aria-describedby': open ? [children.props['aria-describedby'], id].filter(Boolean).join(' ') : children.props['aria-describedby'] })}
      {open && createPortal(<div ref={popupRef} id={id} role="tooltip" className={styles.tip} style={style}>{content}</div>, document.body)}
    </span>
  )
}
