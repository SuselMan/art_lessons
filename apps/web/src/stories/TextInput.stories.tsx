import { useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextInput } from '../components/TextInput'
import { Button } from '../components/Button'
const meta = {
  title: 'Controls/TextInput',
  component: TextInput,
  args: { label: 'Brush name', placeholder: 'Graphite pencil' },
  argTypes: { controlSize: { control: 'select', options: ['sm', 'md', 'lg'] } },
} satisfies Meta<typeof TextInput>
export default meta
export const Playground: StoryObj<typeof meta> = {}
export const AllStates: StoryObj<typeof meta> = {
  render: () => (
    <div className="workshop-column">
      <TextInput label="Empty" placeholder="Empty field" description="Choose a descriptive name." />
      <TextInput label="Search" placeholder="Search" type="search" icon="search" />
      <TextInput label="Filled" defaultValue="Graphite pencil" />
      <TextInput label="Disabled" defaultValue="Disabled" disabled />
      <TextInput label="Read only" defaultValue="Read only" readOnly />
      <TextInput label="Password" type="password" defaultValue="example" icon="lock" />
      <TextInput label="Invalid" defaultValue="Invalid example" description="Use a unique name." error="This name already exists." required />
      <TextInput label="External error" aria-invalid="true" />
      <TextInput label="Width" type="number" min={100} max={4096} defaultValue={800} endAdornment="px" />
    </div>
  ),
}
export const Sizes: StoryObj<typeof meta> = {
  render: () => <div className="workshop-column">{(['sm', 'md', 'lg'] as const).map(controlSize => <TextInput key={controlSize} label={controlSize} controlSize={controlSize} defaultValue="Brush name" />)}</div>,
}
export const NativeInput: StoryObj<typeof meta> = {
  render: function Example() {
    const ref = useRef<HTMLInputElement>(null)
    return <div className="workshop-column">
      <span id="native-help">External help remains connected.</span>
      <TextInput ref={ref} id="native-email" name="email" label="Email" type="email" autoComplete="email" required description="We send a sign-in code." aria-describedby="native-help" />
      <Button onClick={() => ref.current?.focus()}>Focus input</Button>
    </div>
  },
}
