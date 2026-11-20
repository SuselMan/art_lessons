import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'

const meta = {
  title: 'Controls/Button',
  component: Button,
  args: { disabled: false, children: 'Continue', type: 'primary', size: 'md' },
  argTypes: {
    type: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'subtle', 'danger'],
    },
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
            ).map((type) => (
              <Button key={type} type={type} size={size}>
                {type}
              </Button>
            ))}
          </div>
          <div className="workshop-row">
            {(
              ['primary', 'secondary', 'ghost', 'subtle', 'danger'] as const
            ).map((type) => (
              <Button key={type} type={type} size={size} disabled>
                {type}
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
  args: { type: 'subtle', children: 'Reset to defaults' },
}
