import { MemoryRouter } from 'react-router-dom'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusCard } from '../components/StatusCard'
const meta = { title: 'Examples/Entry screens', parameters: { controls: { disable: true }, layout: 'fullscreen' } } satisfies Meta
export default meta
export const Status: StoryObj = { render: () => <MemoryRouter><StatusCard heading="Project unavailable" body="You can return home or try again." action={{ label: 'Try again', onClick: () => {} }} secondary={{ label: 'Home', to: '/' }} /></MemoryRouter> }
