import { describe, it, expect } from 'vitest'
const { plannerUrl } = await import('../server/planner.js')

describe('the link to a card in Planner (roadmap 146)', () => {
  it('builds the web link from the plan and task IDs, with the tenant when known', () => {
    expect(plannerUrl('PLAN1', 'TASK1', 'tenant-guid')).toBe('https://planner.cloud.microsoft/webui/plan/PLAN1/view/board/task/TASK1?tid=tenant-guid')
    expect(plannerUrl('PLAN1', 'TASK1')).toBe('https://planner.cloud.microsoft/webui/plan/PLAN1/view/board/task/TASK1')
    expect(plannerUrl(null, 'TASK1')).toBe(null)
  })
})
