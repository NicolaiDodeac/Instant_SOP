const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ContextSopsQueryOk = {
  stationCode: number | null
  stationId: string | null
  trainingModuleId: string | null
}

export type ContextSopsQueryParseResult =
  | ({ ok: true } & ContextSopsQueryOk)
  | {
      ok: false
      error: 'invalid_station_code' | 'invalid_station_id' | 'both_station_selectors' | 'invalid_training_module'
    }

export function buildContextSopsFetchKey(
  machineId: string,
  stationCode: number | null,
  stationId: string | null,
  trainingModuleId: string | null
): string {
  return `${machineId}|sc:${stationCode ?? ''}|sid:${stationId ?? ''}|tm:${trainingModuleId ?? ''}`
}

/** Same validation as GET `/api/context/sops` (station / topic query only; `machineId` is separate). */
export function parseContextSopsQueryStrings(raw: {
  stationCode: string | null | undefined
  stationId: string | null | undefined
  trainingModuleId: string | null | undefined
}): ContextSopsQueryParseResult {
  const stationCodeRaw =
    raw.stationCode != null && raw.stationCode.trim() !== '' ? raw.stationCode.trim() : null
  const stationIdRaw =
    raw.stationId != null && raw.stationId.trim() !== '' ? raw.stationId.trim() : null

  const stationCodeParsed = stationCodeRaw != null ? Number(stationCodeRaw) : null
  if (stationCodeRaw != null && (stationCodeParsed == null || Number.isNaN(stationCodeParsed))) {
    return { ok: false, error: 'invalid_station_code' }
  }

  const stationId = stationIdRaw
  if (stationId && !UUID_RE.test(stationId)) {
    return { ok: false, error: 'invalid_station_id' }
  }

  if (stationCodeParsed != null && stationId) {
    return { ok: false, error: 'both_station_selectors' }
  }

  const tmRaw =
    raw.trainingModuleId != null && raw.trainingModuleId.trim() !== ''
      ? raw.trainingModuleId.trim()
      : null
  const trainingModuleId = tmRaw
  if (trainingModuleId && !UUID_RE.test(trainingModuleId)) {
    return { ok: false, error: 'invalid_training_module' }
  }

  return {
    ok: true,
    stationCode: stationCodeParsed,
    stationId: stationId || null,
    trainingModuleId: trainingModuleId || null,
  }
}

export function contextSopsParseErrorMessage(
  error: Extract<ContextSopsQueryParseResult, { ok: false }>['error']
): string {
  switch (error) {
    case 'invalid_station_code':
      return 'Invalid stationCode'
    case 'invalid_station_id':
      return 'Invalid stationId'
    case 'both_station_selectors':
      return 'Use either stationCode or stationId, not both'
    case 'invalid_training_module':
      return 'Invalid trainingModuleId'
    default:
      return 'Bad request'
  }
}
