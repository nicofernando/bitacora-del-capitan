import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useCoachStore } from '../../store/coach';
import { useAuthStore } from '../../store/auth';
import { useGoalsStore } from '../../store/goals';
import { useEntriesStore } from '../../store/entries';
import { useCategoriesStore } from '../../store/categories';
import { getLLMProvider } from '../../lib/llm';
import { calculateAge, calculateProcessDay } from '../../lib/dates';
import { CategorySummary, UserCoachContext, CoachPersonality, Segment } from '../../types';

export default function Coach() {
  const [message, setMessage] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const profile = useAuthStore((s) => s.profile);
  const {
    conversations,
    currentConversation,
    messages,
    isSending,
    fetchConversations,
    createConversation,
    setCurrentConversation,
    fetchMessages,
    addMessage,
    setIsSending,
  } = useCoachStore();

  const goalsWithStreaks = useGoalsStore((s) => s.goalsWithStreaks);
  const fetchGoalsWithStreaks = useGoalsStore((s) => s.fetchGoalsWithStreaks);
  const fetchRecentSegments = useEntriesStore((s) => s.fetchRecentSegments);
  const categories = useCategoriesStore((s) => s.categories);

  useEffect(() => {
    fetchConversations();
    fetchGoalsWithStreaks();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  async function handleSend() {
    if (!message.trim() || isSending) return;

    const text = message.trim();
    setMessage('');
    setIsSending(true);

    try {
      let conv = currentConversation;
      if (!conv) {
        conv = await createConversation();
      }

      // Save user message
      await addMessage({
        conversationId: conv.id,
        role: 'user',
        content: text,
      });

      // Build context
      const recentSegments = await fetchRecentSegments(30);
      const summaryByCategory = buildCategorySummary(recentSegments, categories);

      const context: UserCoachContext = {
        fullName: profile?.full_name || 'Usuario',
        age: calculateAge(profile?.birthdate || null),
        processDay: profile?.process_start_date
          ? calculateProcessDay(profile.process_start_date)
          : 1,
        summaryByCategory,
        goalsWithStreaks,
        recentSegments: recentSegments.slice(0, 5),
      };

      const personality: CoachPersonality = {
        preset: (profile?.coach_preset as any) || 'engineer',
        customPrompt: profile?.coach_custom_prompt || null,
      };

      // Get conversation history for context
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const apiKey = await SecureStore.getItemAsync('llm_api_key');
      if (!apiKey) throw new Error('No API key');

      const provider = getLLMProvider({ provider: 'gemini', apiKey });
      const response = await provider.chatWithCoach(text, history, context, personality);

      await addMessage({
        conversationId: conv.id,
        role: 'assistant',
        content: response.content,
        groundingSources: response.groundingSources,
      });
    } catch (err: any) {
      await addMessage({
        conversationId: currentConversation?.id || '',
        role: 'assistant',
        content: `Error: ${err.message}`,
      });
    } finally {
      setIsSending(false);
    }
  }

  async function handleNewConversation() {
    const conv = await createConversation();
    setCurrentConversation(conv);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-background"
      keyboardVerticalOffset={90}
    >
      <View className="flex-1">
        {/* Header */}
        <View className="px-5 pt-14 pb-3 flex-row justify-between items-center border-b border-gray-800">
          <Text className="text-white text-xl font-bold">Coach</Text>
          <Pressable onPress={handleNewConversation} className="bg-surface px-3 py-1.5 rounded-lg">
            <Text className="text-gray-300 text-sm">+ Nueva</Text>
          </Pressable>
        </View>

        {/* Conversation list if no current */}
        {!currentConversation && conversations.length > 0 && (
          <ScrollView className="flex-1 px-5 pt-4">
            {conversations.map((conv) => (
              <Pressable
                key={conv.id}
                onPress={() => setCurrentConversation(conv)}
                className="bg-surface p-4 rounded-lg mb-2"
              >
                <Text className="text-white" numberOfLines={1}>
                  {conv.title || 'Conversación sin título'}
                </Text>
                <Text className="text-gray-500 text-xs mt-1">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Chat messages */}
        {(currentConversation || conversations.length === 0) && (
          <>
            <ScrollView
              ref={scrollRef}
              className="flex-1 px-5 pt-4"
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              {messages.length === 0 && (
                <View className="items-center py-12">
                  <Text className="text-4xl mb-4">🤖</Text>
                  <Text className="text-gray-400 text-center">
                    Hablá con tu coach.{'\n'}Tiene contexto de toda tu bitácora.
                  </Text>
                </View>
              )}

              {messages.map((msg) => (
                <View
                  key={msg.id}
                  className={`mb-3 max-w-[85%] ${
                    msg.role === 'user' ? 'self-end' : 'self-start'
                  }`}
                >
                  <View
                    className={`p-3 rounded-xl ${
                      msg.role === 'user' ? 'bg-primary' : 'bg-surface'
                    }`}
                  >
                    <Text className="text-white text-sm">{msg.content}</Text>
                  </View>
                  {msg.grounding_sources && msg.grounding_sources.length > 0 && (
                    <View className="mt-1">
                      {msg.grounding_sources.map((source, i) => (
                        <Text key={i} className="text-gray-500 text-xs">
                          📎 {source.title}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ))}

              {isSending && (
                <View className="self-start mb-3">
                  <View className="bg-surface p-3 rounded-xl">
                    <ActivityIndicator size="small" color="#6B7280" />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Input */}
            <View className="px-5 py-3 border-t border-gray-800 flex-row gap-2">
              <TextInput
                placeholder="Escribí tu mensaje..."
                placeholderTextColor="#6B7280"
                value={message}
                onChangeText={setMessage}
                multiline
                className="flex-1 bg-surface text-white px-4 py-2 rounded-lg text-sm max-h-24"
              />
              <Pressable
                onPress={handleSend}
                disabled={isSending || !message.trim()}
                className="bg-primary w-10 h-10 rounded-lg items-center justify-center self-end"
                style={{ opacity: isSending || !message.trim() ? 0.5 : 1 }}
              >
                <Text className="text-white">▶</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function buildCategorySummary(
  segments: Segment[],
  categories: { slug: string; label: string }[],
): CategorySummary[] {
  const map: Record<string, { count: number; sentiments: Record<string, number> }> = {};

  for (const seg of segments) {
    if (!map[seg.category_slug]) {
      map[seg.category_slug] = { count: 0, sentiments: {} };
    }
    map[seg.category_slug].count++;
    if (seg.sentiment) {
      map[seg.category_slug].sentiments[seg.sentiment] =
        (map[seg.category_slug].sentiments[seg.sentiment] || 0) + 1;
    }
  }

  return Object.entries(map).map(([slug, data]) => {
    const cat = categories.find((c) => c.slug === slug);
    const predominant = Object.entries(data.sentiments).sort((a, b) => b[1] - a[1])[0];
    return {
      slug,
      label: cat?.label || slug,
      count: data.count,
      predominantSentiment: predominant?.[0] || 'neutral',
    };
  });
}
