import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Menu } from '../components/Menu'
import { Tooltip } from '../components/Tooltip'
import { Icon } from '../components/Icon'
import { ConfirmDialogProvider } from '../components/ConfirmDialog'
import { useConfirmDialog } from '../components/ConfirmDialog/useConfirmDialog'
const meta = { title: 'Overlays/Surfaces' } satisfies Meta
export default meta
export const Dialog: StoryObj = {
  render: function Example() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open modal</Button>
        {open && (
          <Modal title="Project settings" onClose={() => setOpen(false)}>
            <div style={{ padding: 24 }}>
              <p>
                A real Grafetto modal. Escape, backdrop and keyboard focus are
                active.
              </p>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </Modal>
        )}
      </>
    )
  },
}
export const DropdownMenu: StoryObj = {
  render: function Example() {
    const [visible, setVisible] = useState(true)
    return (
      <div className="workshop-column">
        <Menu
          trigger={
            <>
              <Icon name="more_vert" />
              Actions
            </>
          }
          triggerLabel="Actions"
          align="left"
          actions={[
            { label: 'Copy link', icon: 'content_copy', onClick: () => {} },
            {
              label: 'Visible',
              icon: 'visibility',
              checked: visible,
              onClick: () => setVisible(!visible),
            },
            {
              label: 'Unavailable',
              icon: 'lock',
              disabled: true,
              onClick: () => {},
            },
            {
              label: 'Delete',
              icon: 'delete',
              danger: true,
              separatorBefore: true,
              onClick: () => {},
            },
          ]}
        />
        <output>{visible ? 'Visible' : 'Hidden'}</output>
      </div>
    )
  },
}
export const Tooltips: StoryObj = {
  render: () => (
    <div className="workshop-row" style={{ padding: 60 }}>
      {(['auto', 'above', 'below', 'left', 'right'] as const).map(
        (placement) => (
          <Tooltip
            key={placement}
            placement={placement}
            content="Help opens on hover, focus or tap. Escape dismisses it."
          >
            <Button variant="secondary">{placement}</Button>
          </Tooltip>
        ),
      )}
    </div>
  ),
}
function ConfirmExample() {
  const { confirm } = useConfirmDialog()
  const [result, setResult] = useState('')
  return (
    <div className="workshop-column">
      <Button
        variant="danger"
        onClick={() =>
          void confirm({
            title: 'Delete brush?',
            message: 'This example does not delete project data.',
            confirmLabel: 'Delete',
            danger: true,
          }).then((ok) => setResult(ok ? 'Confirmed' : 'Cancelled'))
        }
      >
        Open destructive confirmation
      </Button>
      <output>{result}</output>
    </div>
  )
}
export const Confirmation: StoryObj = {
  render: () => (
    <ConfirmDialogProvider>
      <ConfirmExample />
    </ConfirmDialogProvider>
  ),
}
