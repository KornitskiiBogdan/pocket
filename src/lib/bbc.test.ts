import { describe, expect, it } from 'vitest'
import { cleanTranscript } from './bbc'

const sample = `6 Minute English
Working from home
This is not a word-for-word transcript
Neil
Hello. This is 6 Minute English from BBC Learning English. I'm Neil.
Beth
And I'm Beth. Many people were reluctant to go back to the office.
Neil
That's true, and some never want to give up working from home.
Beth
It's a big shift.
VOCABULARY
reluctant
not wanting to do something
give up
stop doing something you have done for a long time
shift
a change in position or direction`

describe('6 Minute English transcript', () => {
  it('drops speaker names and boilerplate, keeps turns as paragraphs', () => {
    const result = cleanTranscript(sample)
    expect(result.detected).toBe(true)
    expect(result.title).toBe('Working from home')
    expect(result.body.split('\n\n')).toEqual([
      "Hello. This is 6 Minute English from BBC Learning English. I'm Neil.",
      "And I'm Beth. Many people were reluctant to go back to the office.",
      "That's true, and some never want to give up working from home.",
      "It's a big shift.",
    ])
    expect(result.vocabulary).toEqual(['reluctant', 'give up', 'shift'])
  })

  it('reads "Name: text" transcripts too', () => {
    const result = cleanTranscript('Neil: Hello there.\nSam: Hi Neil.\nNeil: Let us begin.\nSam: Sure.')
    expect(result.body.split('\n\n')).toEqual(['Hello there.', 'Hi Neil.', 'Let us begin.', 'Sure.'])
  })

  it('leaves an ordinary article alone', () => {
    const result = cleanTranscript('Cities are changing.\nMore people cycle to work.')
    expect(result.detected).toBe(false)
    expect(result.body).toBe('Cities are changing. More people cycle to work.')
  })
})
