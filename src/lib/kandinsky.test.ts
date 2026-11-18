import { describe, expect, it } from 'vitest'
import { artistFor, imageFromStatus, isQuotaResponse, KandinskyError, pipelineIdFrom } from './kandinsky'

describe('artistFor', () => {
  const open = { wantsDrawing: true, hasKandinsky: false, kandinskyBlocked: false }

  it('leaves concrete words to photo search', () => {
    expect(artistFor({ ...open, wantsDrawing: false, hasKandinsky: true })).toBe('photo')
  })

  it('draws abstract words with Kandinsky when the keys are set', () => {
    expect(artistFor({ ...open, hasKandinsky: true })).toBe('kandinsky')
  })

  it('returns to photos after the free month is used up', () => {
    expect(artistFor({ ...open, hasKandinsky: true, kandinskyBlocked: true })).toBe('photo')
  })

  it('uses a photo when Kandinsky is not configured', () => {
    expect(artistFor(open)).toBe('photo')
  })
})

describe('pipelineIdFrom', () => {
  it('reads the pipeline uuid from the current list', () => {
    expect(pipelineIdFrom([{ uuid: 'pipe-1', type: 'TEXT2IMAGE', status: 'ACTIVE' }])).toBe('pipe-1')
  })

  it('reads an id when the list uses the older field', () => {
    expect(pipelineIdFrom({ data: [{ id: '42', type: 'TEXT2IMAGE' }] })).toBe('42')
  })

  it('refuses an empty list', () => {
    expect(() => pipelineIdFrom([])).toThrow(KandinskyError)
  })
})

describe('imageFromStatus', () => {
  it('wraps a finished base64 file as a jpeg data url', () => {
    expect(imageFromStatus({ status: 'DONE', result: { files: ['abc'], censored: false } })).toBe('data:image/jpeg;base64,abc')
  })

  it('keeps a data url that is already complete', () => {
    expect(imageFromStatus({ status: 'DONE', files: ['data:image/png;base64,aaa'] })).toBe('data:image/png;base64,aaa')
  })

  it('waits while the task is still running', () => {
    expect(imageFromStatus({ status: 'PROCESSING' })).toBeNull()
  })

  it('rejects a censored result', () => {
    expect(() => imageFromStatus({ status: 'DONE', result: { files: ['abc'], censored: true } })).toThrow(KandinskyError)
  })
})

describe('isQuotaResponse', () => {
  it('notices a rate limit', () => {
    expect(isQuotaResponse(429, '')).toBe(true)
    expect(isQuotaResponse(403, 'monthly limit exceeded')).toBe(true)
    expect(isQuotaResponse(500, 'busy')).toBe(false)
  })
})
