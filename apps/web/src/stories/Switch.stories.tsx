import { useArgs } from 'storybook/preview-api'
import { fn } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Switch } from '../components/Switch'
const meta = {
  title: 'Controls/Switch',
  component: Switch,
  args: { onChange: fn(), checked: false, label: 'Sound' },
  argTypes: { onChange: { action: 'change' } },
} satisfies Meta<typeof Switch>
export default meta
export const Playground: StoryObj<typeof meta> = {
  render: function Example(args) {
    const [, updateArgs] = useArgs()
    return (
      <div className="workshop-column">
        <Switch
          {...args}
          onChange={(checked) => {
            args.onChange(checked)
            updateArgs({ checked })
          }}
        />
      </div>
    )
  },
}
export const AllStates: StoryObj<typeof meta> = {
  render: () => (
    <>
      {(['horizontal', 'vertical'] as const).map((orientation) => (
        <section key={orientation}>
          <h3>{orientation}</h3>
          <div
            className={
              orientation === 'horizontal' ? 'workshop-column' : 'workshop-row'
            }
          >
            {[false, true].flatMap((checked) =>
              [false, true].map((disabled) => (
                <Switch
                  key={`${checked}-${disabled}`}
                  checked={checked}
                  disabled={disabled}
                  orientation={orientation}
                  label={`${checked ? 'On' : 'Off'}${disabled ? ' · disabled' : ''}`}
                  onChange={() => {}}
                />
              )),
            )}
          </div>
        </section>
      ))}
    </>
  ),
}
