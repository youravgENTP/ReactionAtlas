export interface ReactionIdentity { display_code: string }

export function exactReactionForRoute<T extends ReactionIdentity>(records: T[], code: string) {
  return records.find((record) => record.display_code.toLowerCase() === code.toLowerCase()) ?? null
}

export function automaticReactionSelection<T extends ReactionIdentity>(records: T[]) {
  const record = records[0] ?? null
  return { record, route: record ? { code: record.display_code, mode: 'replace' as const } : null }
}

export function explicitReactionRoute(record: ReactionIdentity) {
  return { code: record.display_code, mode: 'push' as const }
}

export function isLatestRequest(request: number, latestRequest: number) {
  return request === latestRequest
}
