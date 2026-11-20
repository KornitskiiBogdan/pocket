import { describe, expect, it } from 'vitest'
import { parseJson } from './gemini'
import { DEFAULT_SETTINGS, textModel } from './settings'
import { hasYandex, modelUri } from './yandex'
import type { Settings } from '../types'

describe('textModel', () => {
  it('replaces a saved Gemini or GigaChat name with the Yandex default', () => {
    expect(textModel('gemini-3.8-flash', DEFAULT_SETTINGS.textModel)).toBe('aliceai-llm')
    expect(textModel('GigaChat-2-Pro', DEFAULT_SETTINGS.fastModel)).toBe('aliceai-llm-flash')
    expect(textModel('aliceai-llm', DEFAULT_SETTINGS.textModel)).toBe('aliceai-llm')
  })
})

describe('modelUri', () => {
  it('builds a Yandex model address from the folder and the model name', () => {
    expect(modelUri('b1gfolder', 'aliceai-llm-flash')).toBe('gpt://b1gfolder/aliceai-llm-flash')
  })
})

describe('parseJson', () => {
  it('reads JSON when the model wraps it in prose', () => {
    expect(parseJson('Вот текст:\n```json\n{"title":"Work","paragraphs":["One"]}\n```')).toEqual({
      title: 'Work',
      paragraphs: ['One'],
    })
  })
})

describe('hasYandex', () => {
  it('needs the key, the folder, and the function address', () => {
    const settings = { ...DEFAULT_SETTINGS, yandexKey: 'key', yandexFolder: 'folder', yandexFunction: 'https://functions.yandexcloud.net/abc' } satisfies Settings
    expect(hasYandex(settings)).toBe(true)
    expect(hasYandex({ ...settings, yandexFunction: '' })).toBe(false)
  })
})
