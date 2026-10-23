import { writeFileSync } from 'node:fs'
import type { Reporter, TestCase, TestResult, TestStep, FullResult } from '@playwright/test/reporter'
export default class Progress implements Reporter {
  private state: Record<string, unknown> = {}
  private save(event: Record<string, unknown>) { this.state = { ...this.state, ...event, at: new Date().toISOString() }; writeFileSync('temp/stock-e2e/progress.json', JSON.stringify(this.state, null, 2)) }
  onTestBegin(test: TestCase) { this.save({ test: test.title, state: 'running' }) }
  onStepBegin(_test: TestCase, _result: TestResult, step: TestStep) { this.save({ step: step.title, category: step.category }) }
  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep) { this.save({ lastFinishedStep: step.title, durationMs: step.duration, stepError: step.error?.message }) }
  onTestEnd(_test: TestCase, result: TestResult) { this.save({ state: result.status, durationMs: result.duration, errors: result.errors }) }
  onEnd(result: FullResult) { this.save({ suite: result.status }) }
}
