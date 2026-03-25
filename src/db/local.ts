import * as SQLite from 'expo-sqlite';
import { QueuedEntry } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('bitacora_local.db');
    await initDatabase(db);
  }
  return db;
}

async function initDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS queued_entries (
      id              TEXT PRIMARY KEY,
      body_text       TEXT,
      audio_local_uri TEXT,
      device_datetime TEXT NOT NULL,
      sync_status     TEXT NOT NULL DEFAULT 'queued',
      supabase_id     TEXT,
      error_message   TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);
}

export async function insertQueuedEntry(entry: {
  id: string;
  bodyText: string | null;
  audioLocalUri: string | null;
  deviceDatetime: string;
}): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT INTO queued_entries (id, body_text, audio_local_uri, device_datetime, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'queued', ?, ?)`,
    [entry.id, entry.bodyText, entry.audioLocalUri, entry.deviceDatetime, now, now],
  );
}

export async function getQueuedEntries(
  status?: string,
): Promise<QueuedEntry[]> {
  const database = await getDatabase();

  if (status) {
    return database.getAllAsync<QueuedEntry>(
      'SELECT * FROM queued_entries WHERE sync_status = ? ORDER BY created_at ASC',
      [status],
    );
  }

  return database.getAllAsync<QueuedEntry>(
    'SELECT * FROM queued_entries ORDER BY created_at DESC',
  );
}

export async function getPendingEntries(): Promise<QueuedEntry[]> {
  const database = await getDatabase();
  return database.getAllAsync<QueuedEntry>(
    `SELECT * FROM queued_entries
     WHERE sync_status IN ('queued', 'uploaded', 'error')
     ORDER BY created_at ASC`,
  );
}

export async function updateQueuedEntryStatus(
  id: string,
  status: QueuedEntry['sync_status'],
  extra?: { supabaseId?: string; errorMessage?: string },
): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `UPDATE queued_entries
     SET sync_status = ?,
         supabase_id = COALESCE(?, supabase_id),
         error_message = ?,
         updated_at = ?
     WHERE id = ?`,
    [status, extra?.supabaseId ?? null, extra?.errorMessage ?? null, now, id],
  );
}

export async function deleteQueuedEntry(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM queued_entries WHERE id = ?', [id]);
}

export async function getQueuedEntryCount(): Promise<number> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM queued_entries WHERE sync_status != ?',
    ['synced'],
  );
  return result?.count ?? 0;
}
