import type { Meta, StoryObj } from '@storybook/react-vite'
import { Notice } from '../components/Notice/Notice'
import { ErrorState, EmptyState } from '../components/ListState'
const meta = {
  title: 'Feedback/Notice',
  component: Notice,
  args: { variant: 'neutral', message: 'Project settings saved.' },
} satisfies Meta<typeof Notice>
export default meta
export const Playground: StoryObj<typeof meta> = {}
export const AllVariants: StoryObj<typeof meta> = {
  render: () => (
    <div className="workshop-column">
      {(['neutral', 'success', 'warning', 'error'] as const).map((variant) => (
        <Notice
          key={variant}
          variant={variant}
          message={`${variant}: example notification`}
          action={{ label: 'Retry', onClick: () => {} }}
          onDismiss={() => {}}
        />
      ))}
    </div>
  ),
}
export const ListStates: StoryObj<typeof meta> = {
  render: () => (
    <div className="workshop-column">
      <EmptyState icon="brush" message="No brushes yet." />
      <ErrorState message="Could not load brushes." onRetry={() => {}} />
    </div>
  ),
}
