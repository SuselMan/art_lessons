import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, IconButton } from '../components/Button'
import { TextInput } from '../components/TextInput'
import { Icon } from '../components/Icon'

const meta = {
  title: 'Controls/Button',
  component: Button,
  args: { type: 'button', disabled: false, children: 'Continue', variant: 'primary', size: 'md' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'subtle', 'danger'],
    },
    type: { type: { name: 'enum', value: ['button', 'submit', 'reset'] }, control: 'select', options: ['button', 'submit', 'reset'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    onClick: { action: 'click' },
  },
} satisfies Meta<typeof Button>
export default meta
export const Playground: StoryObj<typeof meta> = {}
export const AllVariants: StoryObj<typeof meta> = {
  render: () => (
    <>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <section key={size}>
          <h3>{size}</h3>
          <div className="workshop-row">
            {(
              ['primary', 'secondary', 'ghost', 'subtle', 'danger'] as const
            ).map((variant) => (
              <Button key={variant} variant={variant} size={size}>
                {variant}
              </Button>
            ))}
          </div>
          <div className="workshop-row">
            {(
              ['primary', 'secondary', 'ghost', 'subtle', 'danger'] as const
            ).map((variant) => (
              <Button key={variant} variant={variant} size={size} disabled>
                {variant}
              </Button>
            ))}
          </div>
        </section>
      ))}
    </>
  ),
}
export const WithIcon: StoryObj<typeof meta> = {
  args: {
    children: (
      <>
        <Icon name="add" />
        Add brush
      </>
    ),
  },
}
export const Subtle: StoryObj<typeof meta> = {
  args: { variant: 'subtle', children: 'Reset to defaults' },
}

export const FormBehavior: StoryObj<typeof meta> = {
  parameters: { controls: { disable: true } },
  render: function Example() {
    const [submissions, setSubmissions] = useState(0)
    const [actions, setActions] = useState(0)
    return (
      <form className="workshop-column" onSubmit={event => {
        event.preventDefault()
        setSubmissions(count => count + 1)
      }}>
        <label htmlFor="button-form-project">Project name</label>
        <TextInput id="button-form-project" name="projectName" defaultValue="Untitled" required />
        <div className="workshop-row">
          <Button onClick={() => setActions(count => count + 1)}>Default action</Button>
          <Button type="submit">Save</Button>
          <Button variant="secondary" type="reset">Reset form</Button>
          <Button type="submit" disabled>Disabled submit</Button>
        </div>
        <output aria-live="polite">Submissions: {submissions}; actions: {actions}</output>
      </form>
    )
  },
}

export const IconActions: StoryObj<typeof meta> = {
  render: function Example() {
    const [selected, setSelected] = useState(false)
    return <div className="workshop-row">
      <IconButton icon="star" variant="ghost" aria-label="Favorite" aria-pressed={selected} onClick={() => setSelected(value => !value)} />
      <IconButton icon="star" variant="ghost" aria-label="Disabled favorite" disabled />
      <IconButton icon="star" variant="ghost" aria-label="Disabled selected favorite" aria-pressed="true" disabled />
      <IconButton icon="close" variant="secondary" aria-label="Close" />
    </div>
  },
}
