import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../components/Button'
import { SettingsPanel } from '../components/SettingsPanel'
const meta = {
  title: 'Examples/Settings',
  parameters: { controls: { disable: true } },
} satisfies Meta
export default meta
export const PersonalSettings: StoryObj = {
  render: function Example() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open settings</Button>
        {open && <SettingsPanel onClose={() => setOpen(false)} />}
      </>
    )
  },
}
