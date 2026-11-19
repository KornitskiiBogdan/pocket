import { describe, expect, it } from 'vitest'
import { basicAuthorization, contentFrom, directAccessToken, expiryMs, proxyTokenUrl } from './gigachat'
import { DEFAULT_SETTINGS, textModel } from './settings'

describe('basicAuthorization', () => {
  it('adds the Basic prefix once', () => {
    expect(basicAuthorization('abc')).toBe('Basic abc')
    expect(basicAuthorization('Basic abc')).toBe('Basic abc')
    expect(basicAuthorization('basic abc')).toBe('Basic abc')
  })
})

describe('directAccessToken', () => {
  it('uses a cabinet access token as-is and ignores an authorization key', () => {
    expect(directAccessToken('eyJhbGci.payload.sig')).toBe('eyJhbGci.payload.sig')
    expect(directAccessToken('Bearer eyJhbGci.payload.sig')).toBe('eyJhbGci.payload.sig')
    expect(directAccessToken('NmYwYjEyOTE')).toBeNull()
  })
})

describe('proxyTokenUrl', () => {
  it('points the long key at the laptop token server', () => {
    expect(proxyTokenUrl('')).toBeNull()
    expect(proxyTokenUrl(' https://192.168.0.10:8443/ ')).toBe('https://192.168.0.10:8443/token')
    expect(proxyTokenUrl('192.168.0.10:8443')).toBe('https://192.168.0.10:8443/token')
  })
})

describe('expiryMs', () => {
  it('reads unix seconds and milliseconds', () => {
    expect(expiryMs(1_700_000_000)).toBe(1_700_000_000_000)
    expect(expiryMs(1_700_000_000_000)).toBe(1_700_000_000_000)
  })
})

describe('contentFrom', () => {
  it('reads the assistant message', () => {
    expect(contentFrom({ choices: [{ message: { content: '{"ok":true}' } }] })).toBe('{"ok":true}')
    expect(contentFrom({})).toBe('')
  })
})

describe('textModel', () => {
  it('replaces a saved Gemini name with the GigaChat default', () => {
    expect(textModel('gemini-3.8-flash', DEFAULT_SETTINGS.textModel)).toBe('GigaChat-2-Pro')
    expect(textModel('GigaChat-2-Max', DEFAULT_SETTINGS.fastModel)).toBe('GigaChat-2-Max')
  })
})
