import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { CoachConversation, CoachMessage } from '../types';

interface CoachState {
  conversations: CoachConversation[];
  currentConversation: CoachConversation | null;
  messages: CoachMessage[];
  isSending: boolean;

  fetchConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<CoachConversation>;
  setCurrentConversation: (conv: CoachConversation | null) => void;
  fetchMessages: (conversationId: string) => Promise<void>;
  addMessage: (message: {
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    groundingSources?: any[] | null;
  }) => Promise<void>;
  setIsSending: (v: boolean) => void;
}

export const useCoachStore = create<CoachState>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  isSending: false,

  fetchConversations: async () => {
    const { data } = await supabase
      .from('coach_conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (data) set({ conversations: data as CoachConversation[] });
  },

  createConversation: async (title) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('coach_conversations')
      .insert({
        user_id: userData.user.id,
        title: title || null,
      })
      .select()
      .single();

    if (error) throw error;
    const conv = data as CoachConversation;
    set((state) => ({
      conversations: [conv, ...state.conversations],
      currentConversation: conv,
      messages: [],
    }));
    return conv;
  },

  setCurrentConversation: (conv) => {
    set({ currentConversation: conv, messages: [] });
    if (conv) get().fetchMessages(conv.id);
  },

  fetchMessages: async (conversationId) => {
    const { data } = await supabase
      .from('coach_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (data) set({ messages: data as CoachMessage[] });
  },

  addMessage: async (message) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data, error } = await supabase
      .from('coach_messages')
      .insert({
        user_id: userData.user.id,
        conversation_id: message.conversationId,
        role: message.role,
        content: message.content,
        grounding_sources: message.groundingSources ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    set((state) => ({
      messages: [...state.messages, data as CoachMessage],
    }));

    // Update conversation title from first user message
    if (message.role === 'user' && get().messages.length <= 1) {
      const title = message.content.slice(0, 80);
      await supabase
        .from('coach_conversations')
        .update({ title })
        .eq('id', message.conversationId);
    }
  },

  setIsSending: (v) => set({ isSending: v }),
}));
