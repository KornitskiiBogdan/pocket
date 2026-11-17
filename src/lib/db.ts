import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Card, ReadingText } from '../types'

interface PocketDB extends DBSchema {
  cards: {
    key: string
    value: Card
  }
  texts: {
    key: string
    value: ReadingText
  }
}

let promise: Promise<IDBPDatabase<PocketDB>> | null = null

function database() {
  if (!promise) {
    promise = openDB<PocketDB>('pocket', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore('cards', { keyPath: 'id' })
        if (oldVersion < 2) db.createObjectStore('texts', { keyPath: 'id' })
      },
    })
  }
  return promise
}

export async function allCards(): Promise<Card[]> {
  return (await database()).getAll('cards')
}

export async function putCards(cards: Card[]): Promise<void> {
  if (!cards.length) return
  const db = await database()
  const tx = db.transaction('cards', 'readwrite')
  await Promise.all([...cards.map((card) => tx.store.put(card)), tx.done])
}

export async function deleteCard(id: string): Promise<void> {
  await (await database()).delete('cards', id)
}

export async function deleteCards(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = await database()
  const tx = db.transaction('cards', 'readwrite')
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
}

export async function clearCards(): Promise<void> {
  await (await database()).clear('cards')
}

export async function allTexts(): Promise<ReadingText[]> {
  return (await database()).getAll('texts')
}

export async function putTexts(texts: ReadingText[]): Promise<void> {
  if (!texts.length) return
  const db = await database()
  const tx = db.transaction('texts', 'readwrite')
  await Promise.all([...texts.map((text) => tx.store.put(text)), tx.done])
}

export async function deleteText(id: string): Promise<void> {
  await (await database()).delete('texts', id)
}
