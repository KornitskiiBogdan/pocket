export function speakEnglish(text: string) {
  if (!text.trim() || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.92
  const voice = window.speechSynthesis
    .getVoices()
    .find((item) => item.lang === 'en-US' || item.lang.startsWith('en'))
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

export function canDictate(): boolean {
  return recognitionCtor() !== null
}

export function dictate(handlers: {
  onText: (text: string) => void
  onEnd: () => void
  onError: (message: string) => void
}): () => void {
  const Ctor = recognitionCtor()
  if (!Ctor) {
    handlers.onError('Этот браузер не умеет распознавать речь')
    handlers.onEnd()
    return () => {}
  }
  const recognition = new Ctor()
  recognition.lang = 'en-US'
  recognition.interimResults = true
  recognition.continuous = false
  recognition.onresult = (event) => {
    let text = ''
    for (let index = 0; index < event.results.length; index++) text += event.results[index][0].transcript
    handlers.onText(text.trim())
  }
  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return
    handlers.onError(event.error === 'not-allowed' ? 'Нет доступа к микрофону' : 'Не расслышал, попробуйте ещё раз')
  }
  recognition.onend = handlers.onEnd
  recognition.start()
  return () => recognition.stop()
}
