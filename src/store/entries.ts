import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { RawEntry, Segment } from '../types';

interface EntriesState {
  entries: RawEntry[];
  segments: Segment[];
  isLoading: boolean;
  isProcessing: boolean;

  fetchEntries: (limit?: number) => Promise<void>;
  fetchSegments: (filters?: {
    categorySlug?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  }) => Promise<void>;
  fetchRecentSegments: (days?: number) => Promise<Segment[]>;
  getSegmentsByEntry: (entryId: string) => Promise<Segment[]>;
  setProcessing: (v: boolean) => void;
}

export const useEntriesStore = create<EntriesState>((set) => ({
  entries: [],
  segments: [],
  isLoading: false,
  isProcessing: false,

  fetchEntries: async (limit = 50) => {
    set({ isLoading: true });
    try {
      const { data } = await supabase
        .from('raw_entries')
        .select('*')
        .order('device_datetime', { ascending: false })
        .limit(limit);

      if (data) set({ entries: data as RawEntry[] });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchSegments: async (filters) => {
    set({ isLoading: true });
    try {
      let query = supabase
        .from('segments')
        .select('*')
        .order('entry_date', { ascending: false });

      if (filters?.categorySlug) {
        query = query.eq('category_slug', filters.categorySlug);
      }
      if (filters?.fromDate) {
        query = query.gte('entry_date', filters.fromDate);
      }
      if (filters?.toDate) {
        query = query.lte('entry_date', filters.toDate);
      }
      if (filters?.search) {
        query = query.ilike('content', `%${filters.search}%`);
      }

      const { data } = await query.limit(100);
      if (data) set({ segments: data as Segment[] });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchRecentSegments: async (days = 30) => {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const { data } = await supabase
      .from('segments')
      .select('*')
      .gte('entry_date', fromDate.toISOString().split('T')[0])
      .order('entry_date', { ascending: false });

    return (data as Segment[]) ?? [];
  },

  getSegmentsByEntry: async (entryId) => {
    const { data } = await supabase
      .from('segments')
      .select('*')
      .eq('raw_entry_id', entryId)
      .order('created_at', { ascending: true });

    return (data as Segment[]) ?? [];
  },

  setProcessing: (v) => set({ isProcessing: v }),
}));
