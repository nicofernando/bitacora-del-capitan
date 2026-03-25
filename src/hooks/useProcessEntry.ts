import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import { insertQueuedEntry, updateQueuedEntryStatus } from '../db/local';
import { getLLMProvider } from '../lib/llm';
import { getDeviceDatetime, getTimezone } from '../lib/dates';
import { useCategoriesStore } from '../store/categories';
import { useGoalsStore } from '../store/goals';
import { useEntriesStore } from '../store/entries';
import { SegmentationResponse } from '../types';

interface ProcessResult {
  localId: string;
  segmentation: SegmentationResponse | null;
  error: string | null;
}

export function useProcessEntry() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);

  const categories = useCategoriesStore((s) => s.categories);
  const goals = useGoalsStore((s) => s.goals);

  async function processEntry(
    bodyText: string | null,
    audioLocalUri: string | null,
    audioBase64?: string,
    audioMimeType?: string,
  ): Promise<ProcessResult> {
    const localId = Crypto.randomUUID();
    const deviceDatetime = getDeviceDatetime();

    // 1. Save locally first (never lose data)
    await insertQueuedEntry({
      id: localId,
      bodyText,
      audioLocalUri,
      deviceDatetime,
    });

    setResult({ localId, segmentation: null, error: null });
    setIsProcessing(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // 2. Upload audio to Supabase Storage if present
      let audioUrl: string | null = null;
      if (audioBase64 && audioMimeType) {
        const audioPath = `${userData.user.id}/${localId}.m4a`;
        const { error: uploadError } = await supabase.storage
          .from('audio-entries')
          .upload(audioPath, decode(audioBase64), {
            contentType: audioMimeType,
          });
        if (uploadError) throw uploadError;
        audioUrl = audioPath;
      }

      // 3. Create raw_entry in Supabase
      const { data: rawEntry, error: insertError } = await supabase
        .from('raw_entries')
        .insert({
          user_id: userData.user.id,
          body_text: bodyText,
          audio_url: audioUrl,
          device_datetime: deviceDatetime,
          status: 'processing',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await updateQueuedEntryStatus(localId, 'uploaded', {
        supabaseId: rawEntry.id,
      });

      // 4. Call LLM for segmentation
      const apiKey = await SecureStore.getItemAsync('llm_api_key');
      if (!apiKey) throw new Error('No API key configured');

      const provider = getLLMProvider({ provider: 'gemini', apiKey });

      const text = bodyText || '[Audio adjunto - transcribir primero]';
      const activeCategories = categories.filter((c) => c.is_active);
      const activeGoals = goals.filter((g) => g.is_active);

      const segmentation = await provider.segmentEntry({
        text,
        audioBase64,
        audioMimeType,
        deviceDatetime,
        timezone: getTimezone(),
        categories: activeCategories,
        goals: activeGoals,
      });

      // 5. Save results to Supabase
      // Save segments
      if (segmentation.segments.length > 0) {
        const segmentsToInsert = segmentation.segments.map((s) => ({
          user_id: userData.user!.id,
          raw_entry_id: rawEntry.id,
          category_slug: s.category_slug,
          content: s.content,
          sentiment: s.sentiment,
          intensity: s.intensity,
          metadata: s.metadata || {},
          entry_date: s.entry_date,
          entry_time: s.entry_time,
        }));

        await supabase.from('segments').insert(segmentsToInsert);
      }

      // Save category suggestions
      if (segmentation.category_suggestions.length > 0) {
        const suggestionsToInsert = segmentation.category_suggestions.map((s) => ({
          user_id: userData.user!.id,
          raw_entry_id: rawEntry.id,
          suggested_slug: s.slug,
          suggested_label: s.label,
          suggested_icon: s.icon || '📌',
          suggested_color: s.color || '#6B7280',
          suggested_description: s.description,
          sample_content: s.sample_content,
        }));

        await supabase.from('category_suggestions').insert(suggestionsToInsert);
      }

      // Save goal events
      if (segmentation.goal_events.length > 0) {
        const eventsToInsert = segmentation.goal_events.map((e) => ({
          user_id: userData.user!.id,
          goal_id: e.goal_id,
          raw_entry_id: rawEntry.id,
          event_type: e.event_type,
          value: e.value || 0,
          entry_date: segmentation.segments[0]?.entry_date || new Date().toISOString().split('T')[0],
          notes: e.notes || null,
          source: 'ai' as const,
        }));

        await supabase.from('goal_events').insert(eventsToInsert);
      }

      // Update raw_entry status
      await supabase
        .from('raw_entries')
        .update({
          status: 'done',
          transcript: segmentation.transcript,
          llm_raw_response: segmentation,
        })
        .eq('id', rawEntry.id);

      await updateQueuedEntryStatus(localId, 'synced');

      const finalResult: ProcessResult = { localId, segmentation, error: null };
      setResult(finalResult);
      return finalResult;
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';
      await updateQueuedEntryStatus(localId, 'error', { errorMessage: errorMsg });
      const errorResult: ProcessResult = { localId, segmentation: null, error: errorMsg };
      setResult(errorResult);
      return errorResult;
    } finally {
      setIsProcessing(false);
    }
  }

  return { processEntry, isProcessing, result };
}

// Helper to decode base64 to Uint8Array for Supabase Storage upload
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
