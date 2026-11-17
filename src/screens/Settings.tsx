import { useEffect, useState } from 'react'
import type { Direction, ImageSource } from '../types'
import { useDeck } from '../context'
import { formatMinutes, plural } from '../lib/format'
import { formatBytes, isInstalled, storageStatus, type StorageStatus } from '../lib/storage'
import { drawnThisMonth, pingKey } from '../lib/gemini'
import { LADDER_MINUTES } from '../lib/srs'
import { clampGoal, clampLimit, currentModel, DEFAULT_SETTINGS } from '../lib/settings'

const DIRECTIONS: { id: Direction; label: string; hint: string }[] = [
  { id: 'mix', label: 'Чередовать', hint: 'После каждого удачного ответа карточка меняет сторону: то пропуск в английском, то русская фраза, которую нужно сказать по-английски.' },
  { id: 'cloze', label: 'Пропуск', hint: 'Всегда английское предложение с пропуском. Тренирует узнавание.' },
  { id: 'reverse', label: 'С русского', hint: 'Всегда русская фраза, которую нужно сказать по-английски. Сложнее, но ближе к речи.' },
]

const IMAGE_SOURCES: { id: ImageSource; label: string; hint: string }[] = [
  { id: 'smart', label: 'Фото + Gemini', hint: 'Конкретные слова (bridesmaid, plastic bag) получают бесплатное фото, абстрактные (reluctant, outcome) рисует Gemini. Обычно это треть слов, около $0,03 за картинку. Без оплаты ключа абстрактные тоже получат фото.' },
  { id: 'photo', label: 'Только фото', hint: 'Бесплатно и быстро: фото ищется по самому слову в открытых библиотеках Openverse и Wikimedia. Если не подошло, в карточке можно вписать другой запрос.' },
  { id: 'gemini', label: 'Всё рисует Gemini', hint: 'Рисует картинку под смысл каждого слова. Нужен платный тариф ключа, несколько секунд на карточку. Если квота закрыта, приложение возьмёт фото.' },
  { id: 'off', label: 'Без картинок', hint: 'Карточки без картинок. Свою можно добавить вручную в редактировании.' },
]

const BACKUP_DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function Settings() {
  const { cards, settings, updateSettings, importFile, toast, backup, backupAt } = useDeck()
  const [showKey, setShowKey] = useState(false)
  const [checking, setChecking] = useState(false)
  const [replace, setReplace] = useState(false)

  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const installed = isInstalled()
  const drawn = drawnThisMonth()

  useEffect(() => {
    void storageStatus().then(setStorage)
  }, [cards.length, backupAt])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const count = parsed && typeof parsed === 'object' && Array.isArray((parsed as { cards?: unknown }).cards)
        ? (parsed as { cards: unknown[] }).cards.length
        : 0
      const confirmed = window.confirm(replace
        ? `Заменить текущие ${cards.length} карточек на ${count} из файла?`
        : `Добавить ${count} карточек из файла? Если карточка уже есть, останется более свежая.`)
      if (!confirmed) return
      await importFile(parsed, replace)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Файл не прочитался')
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Настройки</p>
      <h1>Ключ, ритм, файл</h1>
      <label className="field">
        <span>Ключ Gemini</span>
        <input
          type={showKey ? 'text' : 'password'}
          value={settings.apiKey}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => updateSettings({ ...settings, apiKey: event.target.value })}
          placeholder="AIza..."
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={showKey} onChange={(event) => setShowKey(event.target.checked)} />
        Показать ключ
      </label>
      <p className="hint">Ключ живёт только в этом браузере и в файл колоды не попадает. Если запрос блокируется, снимите ограничение ключа по сайту или добавьте этот адрес.</p>
      <div className="row-actions">
        <button
          className="ghost"
          type="button"
          disabled={checking || !settings.apiKey.trim()}
          onClick={() => {
            setChecking(true)
            pingKey(settings)
              .then(() => toast('Ключ отвечает'))
              .catch((error: Error) => toast(error.message))
              .finally(() => setChecking(false))
          }}
        >
          {checking ? 'Проверяю…' : 'Проверить ключ'}
        </button>
      </div>
      <label className="field">
        <span>Новых карточек в день</span>
        <input
          type="number"
          min={1}
          max={40}
          value={settings.dailyNewLimit}
          onChange={(event) => updateSettings({ ...settings, dailyNewLimit: clampLimit(Number(event.target.value)) })}
        />
      </label>
      <label className="field">
        <span>Цель на день, минут</span>
        <input
          type="number"
          min={1}
          max={180}
          value={settings.dailyGoalMinutes}
          onChange={(event) => updateSettings({ ...settings, dailyGoalMinutes: clampGoal(Number(event.target.value)) })}
        />
      </label>
      <p className="hint">День идёт в серию, когда вы набрали столько минут. Время считается, пока приложение открыто и вы что-то делаете: после 3 минут без касаний счёт встаёт на паузу.</p>
      <div className="field">
        <span>Направление повтора</span>
        <div className="segmented" role="radiogroup">
          {DIRECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={settings.direction === item.id}
              className={settings.direction === item.id ? 'on' : ''}
              onClick={() => updateSettings({ ...settings, direction: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="hint">{DIRECTIONS.find((item) => item.id === settings.direction)?.hint}</p>
      </div>
      <div className="field">
        <span>Картинка при импорте</span>
        <div className="segmented" role="radiogroup">
          {IMAGE_SOURCES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={settings.imageSource === item.id}
              className={settings.imageSource === item.id ? 'on' : ''}
              onClick={() => updateSettings({ ...settings, imageSource: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="hint">{IMAGE_SOURCES.find((item) => item.id === settings.imageSource)?.hint}</p>
        {drawn.count > 0 && (
          <p className="hint">
            В этом месяце Gemini нарисовал {drawn.count} {plural(drawn.count, 'картинку', 'картинки', 'картинок')}, примерно ${drawn.usd.toFixed(2)}.
          </p>
        )}
      </div>
      <details className="models">
        <summary>Модели</summary>
        <label className="field">
          <span>Перевод карточек (быстрая)</span>
          <input value={currentModel(settings.fastModel, DEFAULT_SETTINGS.fastModel)} onChange={(event) => updateSettings({ ...settings, fastModel: event.target.value.trim() })} />
        </label>
        <label className="field">
          <span>Проверка фраз и тексты (умная)</span>
          <input value={currentModel(settings.textModel, DEFAULT_SETTINGS.textModel)} onChange={(event) => updateSettings({ ...settings, textModel: event.target.value.trim() })} />
        </label>
        <label className="field">
          <span>Картинка</span>
          <input value={currentModel(settings.imageModel, DEFAULT_SETTINGS.imageModel)} onChange={(event) => updateSettings({ ...settings, imageModel: event.target.value.trim() })} />
        </label>
      </details>

      <h2>Кривая</h2>
      <p className="lead">После «Хорошо» карточка уходит на следующую ступень. «Легко» сразу ставит интервал от одного дня. «Снова» возвращает её в эту сессию и снимает две ступени. «Трудно» оставляет ступень и укорачивает срок на 40%.</p>
      <ol className="ladder">
        {LADDER_MINUTES.map((minutes, index) => (
          <li key={minutes}><span>{index + 1}</span>{formatMinutes(minutes)}</li>
        ))}
        <li><span>+</span>дальше вдвое, не дольше 180 дней</li>
      </ol>

      <h2>Где хранятся данные</h2>
      <p className="lead">Всё лежит на этом устройстве, внутри приложения: сервера нет. Основное место — телефон. Чтобы продолжить на компьютере, сохраните копию и откройте её там.</p>
      <ul className="storage">
        <li className={installed ? 'ok' : 'warn'}>
          <strong>{installed ? 'Установлено на экран' : 'Открыто во вкладке браузера'}</strong>
          <span>
            {installed
              ? 'Данные принадлежат приложению и не чистятся вместе с вкладками.'
              : 'На телефоне установите приложение: в Safari «Поделиться» → «На экран „Домой“», в Chrome меню ⋮ → «Установить приложение». Иначе Safari может стереть данные после недели без заходов.'}
          </span>
        </li>
        <li className={storage?.persisted ? 'ok' : 'warn'}>
          <strong>{storage?.persisted ? 'Защищено от автоочистки' : storage?.persisted === false ? 'Без защиты от автоочистки' : 'Защита от автоочистки неизвестна'}</strong>
          <span>
            {storage?.persisted
              ? 'Браузер не удалит данные сам, даже если на устройстве кончается место.'
              : 'Браузер выдаёт защиту установленным приложениям и сайтам, которыми часто пользуются. Пока её нет, держите свежую копию.'}
          </span>
        </li>
        <li className={backupAt && Date.now() - backupAt < 7 * 24 * 60 * 60 * 1000 ? 'ok' : 'warn'}>
          <strong>{backupAt ? `Копия от ${BACKUP_DATE.format(backupAt)}` : 'Копий ещё не было'}</strong>
          <span>
            {storage?.usage ? `Занято ${formatBytes(storage.usage)}. ` : ''}
            Копия — один JSON с карточками, картинками, текстами и временем по дням. Ключ Gemini в неё не попадает.
          </span>
        </li>
      </ul>
      <div className="row-actions">
        <button className="primary" type="button" onClick={() => { void backup() }} disabled={!cards.length}>Сохранить копию</button>
        <label className="ghost file">
          Открыть файл
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void onFile(file)
            }}
          />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
        Заменить колоду целиком
      </label>
      <p className="hint">На телефоне «Сохранить копию» открывает меню «Поделиться»: можно положить файл в «Файлы», на Google Диск или себе в Telegram. На компьютере откройте этот файл здесь же: прогресс сольётся, у каждой карточки останется более свежая оценка, а минуты с разных устройств сложатся.</p>
    </section>
  )
}
