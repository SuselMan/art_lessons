import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHref } from 'react-router-dom'
import { IconButton } from '../../../components/Button'
import { useT } from '../../../i18n'
import { useDraggablePosition } from '../../../lib/input/useDraggablePosition'
import styles from './TeacherMonitor.module.css'

/** Deliberately owns a separate realm: Room and the brush library have one
 * board scope each. Unmounting the iframe releases its socket and renderer. */
export function TeacherMonitor({ lessonId, boardId, open, onClose }: { lessonId: string; boardId: string; open: boolean; onClose: () => void }) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState({ x: 140, y: 76 })
  useEffect(() => { if (open) setCollapsed(false) }, [open])
  const panel = useRef<HTMLElement>(null)
  const href = useHref({ pathname: `/room/${encodeURIComponent(boardId)}`, search: `?observe=${encodeURIComponent(lessonId)}` })
  const clamp = useCallback(({ x, y }: { x: number; y: number }) => ({
    x: Math.max(0, Math.min(x, window.innerWidth - (panel.current?.offsetWidth ?? 320))),
    y: Math.max(0, Math.min(y, window.innerHeight - (panel.current?.offsetHeight ?? 44))),
  }), [])
  const drag = useDraggablePosition(position, { onChange: setPosition, clamp })
  useEffect(() => {
    const resize = () => setPosition(p => clamp(p))
    window.addEventListener('resize', resize)
    resize()
    return () => window.removeEventListener('resize', resize)
  }, [clamp, collapsed, open])
  return <>
    {open && createPortal(
      <section ref={panel} className={styles.panel} style={{ left: position.x, top: position.y }} aria-label={t('class.monitor.open')}>
        <div className={styles.header} {...drag}>
          <span>{t('class.teacherBoard')}</span>
          <IconButton variant="ghost" size="sm" icon={collapsed ? 'visibility' : 'expand_more'}
            aria-label={t(collapsed ? 'class.monitor.restore' : 'class.monitor.minimize')} onClick={() => setCollapsed(v => !v)} />
          <IconButton variant="ghost" size="sm" icon="close" aria-label={t('class.monitor.close')} onClick={onClose} />
        </div>
        {!collapsed && <iframe key={boardId} className={styles.frame} src={href} title={t('class.teacherBoard')}
          tabIndex={-1} sandbox="allow-scripts allow-same-origin" />}
      </section>, document.body)}
  </>
}
