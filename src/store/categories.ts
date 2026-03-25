import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Category, CategorySuggestion } from '../types';

interface CategoriesState {
  categories: Category[];
  suggestions: CategorySuggestion[];
  isLoading: boolean;

  fetchCategories: () => Promise<void>;
  fetchSuggestions: () => Promise<void>;
  toggleCategory: (id: string, isActive: boolean) => Promise<void>;
  approveSuggestion: (suggestion: CategorySuggestion) => Promise<void>;
  rejectSuggestion: (id: string) => Promise<void>;
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  categories: [],
  suggestions: [],
  isLoading: false,

  fetchCategories: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!error && data) {
        set({ categories: data as Category[] });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  fetchSuggestions: async () => {
    const { data } = await supabase
      .from('category_suggestions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (data) {
      set({ suggestions: data as CategorySuggestion[] });
    }
  },

  toggleCategory: async (id, isActive) => {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: isActive })
      .eq('id', id);

    if (!error) {
      await get().fetchCategories();
    }
  },

  approveSuggestion: async (suggestion) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    // Create the category
    await supabase.from('categories').insert({
      user_id: userData.user.id,
      slug: suggestion.suggested_slug,
      label: suggestion.suggested_label,
      icon: suggestion.suggested_icon,
      color: suggestion.suggested_color,
      description: suggestion.suggested_description,
    });

    // Mark suggestion as approved
    await supabase
      .from('category_suggestions')
      .update({ status: 'approved' })
      .eq('id', suggestion.id);

    await get().fetchCategories();
    await get().fetchSuggestions();
  },

  rejectSuggestion: async (id) => {
    await supabase
      .from('category_suggestions')
      .update({ status: 'rejected' })
      .eq('id', id);

    await get().fetchSuggestions();
  },
}));
