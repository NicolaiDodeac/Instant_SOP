import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { DraftSOP } from './types'

interface SOPDB extends DBSchema {
  drafts: {
    key: string
    value: DraftSOP
    indexes: { 'by-lastModified': number }
  }
  videos: {
    key: string
    value: { blob: Blob; stepId: string; sopId: string; uploaded: boolean }
  }
  images: {
    key: string
    value: { blob: Blob; stepId: string; sopId: string; uploaded: boolean }
  }
}

let dbPromise: Promise<IDBPDatabase<SOPDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<SOPDB>('sop-builder', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('drafts')) {
            const draftStore = db.createObjectStore('drafts', {
              keyPath: 'id',
            })
            draftStore.createIndex('by-lastModified', 'lastModified')
          }
          if (!db.objectStoreNames.contains('videos')) {
            db.createObjectStore('videos', { keyPath: 'stepId' })
          }
        }
        if (oldVersion < 3 && !db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'stepId' })
        }
      },
    }).catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

export async function saveDraft(sop: DraftSOP): Promise<void> {
  const db = await getDB()
  await db.put('drafts', {
    ...sop,
    lastModified: Date.now(),
  })
}

export async function getDraft(sopId: string): Promise<DraftSOP | undefined> {
  const db = await getDB()
  return db.get('drafts', sopId)
}

export async function listDrafts(): Promise<DraftSOP[]> {
  const db = await getDB()
  const index = db.transaction('drafts').store.index('by-lastModified')
  return index.getAll()
}

export async function deleteDraft(sopId: string): Promise<void> {
  const db = await getDB()
  await db.delete('drafts', sopId)
}

export async function saveVideoBlob(
  stepId: string,
  sopId: string,
  blob: Blob
): Promise<void> {
  const db = await getDB()
  await db.put('videos', {
    stepId,
    sopId,
    blob,
    uploaded: false,
  })
}

export async function getVideoBlob(
  stepId: string
): Promise<Blob | undefined> {
  const db = await getDB()
  const video = await db.get('videos', stepId)
  return video?.blob
}

export async function markVideoUploaded(stepId: string): Promise<void> {
  const db = await getDB()
  const video = await db.get('videos', stepId)
  if (video) {
    await db.put('videos', { ...video, uploaded: true })
  }
}

export async function listPendingUploads(): Promise<
  Array<{ stepId: string; sopId: string; blob: Blob }>
> {
  const db = await getDB()
  const videos = await db.getAll('videos')
  return videos
    .filter((v) => !v.uploaded)
    .map((v) => ({ stepId: v.stepId, sopId: v.sopId, blob: v.blob }))
}

export async function deleteVideoBlob(stepId: string): Promise<void> {
  const db = await getDB()
  await db.delete('videos', stepId)
}

export async function saveImageBlob(
  stepId: string,
  sopId: string,
  blob: Blob
): Promise<void> {
  const db = await getDB()
  await db.put('images', {
    stepId,
    sopId,
    blob,
    uploaded: false,
  })
}

export async function getImageBlob(
  stepId: string
): Promise<Blob | undefined> {
  const db = await getDB()
  const row = await db.get('images', stepId)
  return row?.blob
}

export async function markImageUploaded(stepId: string): Promise<void> {
  const db = await getDB()
  const row = await db.get('images', stepId)
  if (row) {
    await db.put('images', { ...row, uploaded: true })
  }
}

export async function deleteImageBlob(stepId: string): Promise<void> {
  const db = await getDB()
  await db.delete('images', stepId)
}
