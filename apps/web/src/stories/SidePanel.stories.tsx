import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SidePanel } from '../components/SidePanel'

const meta = {
  title: 'Examples/Side panel',
  args: { side: 'right' as 'left' | 'right' },
  argTypes: { side: { control: 'select', options: ['left', 'right'] } },
  render: function Example({ side }) {
    const [active, setActive] = useState<string | null>('layers')
    return <div style={{ display: 'flex', height: 360 }}>
      <SidePanel side={side} active={active} onSelect={setActive} tabs={[
        { id: 'layers', icon: 'layers', title: 'Layers', content: <p>Layer controls</p> },
        { id: 'people', icon: 'group', title: 'People', content: <p>Participants</p>, badge: 3, badgeLabel: '3 pending requests' },
      ]} />
    </div>
  },
} satisfies Meta<{ side: 'left' | 'right' }>
export default meta
export const Playground: StoryObj<typeof meta> = {}
