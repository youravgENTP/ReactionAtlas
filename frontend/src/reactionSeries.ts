import type { ReactionSeries } from './types'

export const reactionSeriesLabel: Record<ReactionSeries, string> = {
  general: 'General',
  special: 'Named',
  scaffold: 'Scaffold',
}

export const reactionDisplayCode = (series: ReactionSeries, number: number) => ({
  general: 'Rxn',
  special: 'Rxn*',
  scaffold: 'SRxn',
}[series] + number)
