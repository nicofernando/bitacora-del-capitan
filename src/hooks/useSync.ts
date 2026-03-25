import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getPendingEntries } from '../db/local';
import { useProcessEntry } from './useProcessEntry';

export function useSync() {
  const { processEntry } = useProcessEntry();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Sync on mount
    syncPendingEntries();

    // Sync when app comes to foreground
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  function handleAppStateChange(nextState: AppStateStatus) {
    if (appState.current.match(/inactive|background/) && nextState === 'active') {
      syncPendingEntries();
    }
    appState.current = nextState;
  }

  async function syncPendingEntries() {
    try {
      const pending = await getPendingEntries();
      for (const entry of pending) {
        if (entry.sync_status === 'queued') {
          await processEntry(entry.body_text, entry.audio_local_uri);
        }
      }
    } catch (err) {
      console.error('Sync error:', err);
    }
  }

  return { syncPendingEntries };
}
