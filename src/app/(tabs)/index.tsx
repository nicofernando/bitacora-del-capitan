import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useGoalsStore } from '../../store/goals';
import { useEntriesStore } from '../../store/entries';
import { useCategoriesStore } from '../../store/categories';
import { calculateProcessDay } from '../../lib/dates';
import { SENTIMENT_COLORS } from '../../lib/constants';
import { Segment } from '../../types';

export default function Dashboard() {
  const { profile } = useAuth();
  const goalsWithStreaks = useGoalsStore((s) => s.goalsWithStreaks);
  const fetchGoalsWithStreaks = useGoalsStore((s) => s.fetchGoalsWithStreaks);
  const fetchSegments = useEntriesStore((s) => s.fetchSegments);
  const segments = useEntriesStore((s) => s.segments);
  const suggestions = useCategoriesStore((s) => s.suggestions);
  const fetchSuggestions = useCategoriesStore((s) => s.fetchSuggestions);
  const fetchCategories = useCategoriesStore((s) => s.fetchCategories);
  const [refreshing, setRefreshing] = useState(false);

  const processDay = profile?.process_start_date
    ? calculateProcessDay(profile.process_start_date)
    : 1;

  const firstName = profile?.full_name?.split(' ')[0] || 'Usuario';

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    await Promise.all([
      fetchGoalsWithStreaks(),
      fetchSegments({ fromDate: sevenDaysAgo.toISOString().split('T')[0] }),
      fetchSuggestions(),
      fetchCategories(),
    ]);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  // Group segments by date for the week dots
  const segmentsByDate = segments.reduce<Record<string, Segment[]>>((acc, s) => {
    if (!acc[s.entry_date]) acc[s.entry_date] = [];
    acc[s.entry_date].push(s);
    return acc;
  }, {});

  // Last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
      }
    >
      <View className="px-5 pt-14">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-white text-2xl font-bold">
              Hola, {firstName}
            </Text>
            <Text className="text-gray-400 mt-1">Día {processDay} del proceso</Text>
          </View>
        </View>

        {/* Goals */}
        {goalsWithStreaks.length > 0 && (
          <View className="mb-6">
            <Text className="text-gray-300 font-bold mb-3 text-sm uppercase">
              Metas Activas
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3">
                {goalsWithStreaks.map((goal) => (
                  <View
                    key={goal.id}
                    className="bg-surface rounded-xl p-4 min-w-[120px]"
                  >
                    <Text className="text-gray-400 text-xs mb-1">
                      {goal.type === 'avoid' ? '🚫' : goal.type === 'limit' ? '⚖️' : '🎯'}{' '}
                      {goal.name}
                    </Text>
                    <Text className="text-white text-2xl font-bold">{goal.streak}</Text>
                    <Text className="text-gray-500 text-xs">días</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Week activity */}
        <View className="bg-surface rounded-xl p-4 mb-6">
          <Text className="text-gray-300 font-bold mb-3 text-sm uppercase">
            Últimos 7 días
          </Text>
          <View className="flex-row justify-between">
            {last7Days.map((date, i) => {
              const daySegments = segmentsByDate[date] || [];
              const hasEntry = daySegments.length > 0;
              const dayOfWeek = new Date(date + 'T12:00:00').getDay();
              const label = dayLabels[dayOfWeek === 0 ? 6 : dayOfWeek - 1];

              return (
                <View key={date} className="items-center">
                  <Text className="text-gray-500 text-xs mb-2">{label}</Text>
                  <View
                    className={`w-8 h-8 rounded-full items-center justify-center ${
                      hasEntry ? 'bg-primary' : 'bg-gray-700'
                    }`}
                  >
                    <Text className="text-white text-xs">{daySegments.length || ''}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Category suggestions */}
        {suggestions.length > 0 && (
          <View className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6">
            <Text className="text-warning font-bold mb-1">
              Nueva categoría sugerida
            </Text>
            <Text className="text-gray-300 text-sm">
              "{suggestions[0].suggested_label}" — {suggestions[0].sample_content.slice(0, 60)}...
            </Text>
            <View className="flex-row gap-3 mt-3">
              <Pressable className="bg-warning/20 px-4 py-2 rounded-lg">
                <Text className="text-warning text-sm">Ver</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Recent segments */}
        <Text className="text-gray-300 font-bold mb-3 text-sm uppercase">
          Registros recientes
        </Text>
        {segments.slice(0, 10).map((seg) => (
          <View key={seg.id} className="bg-surface rounded-lg p-3 mb-2">
            <View className="flex-row items-center mb-1">
              <Text className="text-xs text-gray-500 mr-2">{seg.entry_date}</Text>
              <Text className="text-xs font-bold text-gray-400">{seg.category_slug}</Text>
              {seg.sentiment && (
                <View
                  className="w-2 h-2 rounded-full ml-2"
                  style={{ backgroundColor: SENTIMENT_COLORS[seg.sentiment] }}
                />
              )}
            </View>
            <Text className="text-gray-200 text-sm">{seg.content}</Text>
          </View>
        ))}

        {segments.length === 0 && (
          <View className="items-center py-8">
            <Text className="text-gray-500 text-center">
              Aún no hay registros.{'\n'}Creá tu primera entrada.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
