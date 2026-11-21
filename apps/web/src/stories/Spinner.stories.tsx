import type { Meta, StoryObj } from '@storybook/react-vite'
import { Spinner } from '../components/Spinner'

const meta = {
  title: 'Components/Spinner',
  component: Spinner,
  args: { size: 40 },
  argTypes: { size: { control: { type: 'range', min: 16, max: 160, step: 4 } } },
} satisfies Meta<typeof Spinner>

export default meta
export const Default: StoryObj<typeof meta> = {}
export const Sizes: StoryObj<typeof meta> = {
  render: () => <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}><Spinner size={28} /><Spinner /><Spinner size={80} /></div>,
}
