import { describe, expect, it } from 'vitest'
import { humanizeLabel } from '@/lib/ui/labels'
import {
  CATEGORY_AXIS,
  CATEGORY_Y_AXIS,
  CHART_MARGIN,
  CHART_MARGIN_LABELLED,
  VALUE_AXIS,
  formatCategoryTick,
  formatCompactNumber,
  truncateLabel,
} from '@/components/ui/chart-defaults'
import { formatCostTick } from '@/components/analytics/ai-usage-format'

describe('humanizeLabel', () => {
  it('uses the label map for known machine keys', () => {
    expect(humanizeLabel('score_job')).toBe('Job scoring')
    expect(humanizeLabel('cv_requirement_fit')).toBe('CV requirement fit')
    expect(humanizeLabel('company_site')).toBe('Company site')
    expect(humanizeLabel('linkedin')).toBe('LinkedIn')
  })

  it('sentence-cases unknown snake, kebab and camel keys', () => {
    expect(humanizeLabel('job_board_feed')).toBe('Job board feed')
    expect(humanizeLabel('ai-cv-check')).toBe('AI CV check')
    expect(humanizeLabel('weeklyDigest')).toBe('Weekly digest')
    expect(humanizeLabel('travel')).toBe('Travel')
  })

  it('leaves human text, dates and buckets alone', () => {
    expect(humanizeLabel('Netflix')).toBe('Netflix')
    expect(humanizeLabel('Sep 27')).toBe('Sep 27')
    expect(humanizeLabel('0-3')).toBe('0-3')
    expect(humanizeLabel('ACT Fibernet')).toBe('ACT Fibernet')
  })

  it('handles empty input', () => {
    expect(humanizeLabel(null)).toBe('')
    expect(humanizeLabel(undefined)).toBe('')
    expect(humanizeLabel('  ')).toBe('')
  })
})

describe('chart defaults', () => {
  it('never uses negative margins (they clipped y-axis ticks)', () => {
    for (const m of [CHART_MARGIN, CHART_MARGIN_LABELLED]) {
      expect(Math.min(m.top, m.right, m.bottom, m.left)).toBeGreaterThanOrEqual(0)
    }
    expect(CHART_MARGIN_LABELLED.top).toBeGreaterThan(CHART_MARGIN.top)
  })

  it('sizes value axes to their ticks and labels every category', () => {
    expect(VALUE_AXIS.width).toBe('auto')
    expect(CATEGORY_AXIS.interval).toBe(0)
    expect(CATEGORY_Y_AXIS.interval).toBe(0)
    expect(CATEGORY_Y_AXIS.width).toBe('auto')
  })

  it('truncates long labels with an ellipsis', () => {
    expect(truncateLabel('Apollo Pharmacy', 10)).toBe('Apollo Ph…')
    expect(truncateLabel('Rent', 10)).toBe('Rent')
    expect(formatCategoryTick('cv_requirement_fit')).toBe('CV requiremen…')
  })

  it('formats compact counts', () => {
    expect(formatCompactNumber(0)).toBe('0')
    expect(formatCompactNumber(1200)).toBe('1.2k')
    expect(formatCompactNumber(3_000_000)).toBe('3m')
  })
})

describe('formatCostTick', () => {
  it('keeps sub-cent ticks distinct', () => {
    expect(formatCostTick(0)).toBe('$0')
    expect(formatCostTick(0.002)).toBe('$0.002')
    expect(formatCostTick(0.00038)).toBe('$0.00038')
    expect(formatCostTick(0.25)).toBe('$0.25')
    expect(formatCostTick(12.4)).toBe('$12')
  })
})
