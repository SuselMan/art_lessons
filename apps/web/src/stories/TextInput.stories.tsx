import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextInput } from '../components/TextInput'
const meta = {
  title: 'Controls/TextInput',
  component: TextInput,
  args: { placeholder: 'Search brushes', 'aria-label': 'Search brushes' },
} satisfies Meta<typeof TextInput>
export default meta
export const Playground: StoryObj<typeof meta> = {}
export const AllStates: StoryObj<typeof meta> = {
  render: () => (
    <div className="workshop-column">
      <TextInput aria-label="Empty" placeholder="Empty field" />
      <TextInput aria-label="Search" placeholder="Search" icon="search" />
      <TextInput aria-label="Filled" defaultValue="Graphite pencil" />
      <TextInput aria-label="Disabled" defaultValue="Disabled" disabled />
      <TextInput aria-label="Read only" defaultValue="Read only" readOnly />
      <TextInput
        aria-label="Password"
        type="password"
        defaultValue="example"
        icon="lock"
      />
      <TextInput
        aria-label="Invalid"
        defaultValue="Invalid example"
        aria-invalid="true"
      />
    </div>
  ),
}
