import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, RefreshControl } from 'react-native';
import { useEntriesStore } from '../../store/entries';
import { useCategoriesStore } from '../../store/categories';
import { SENTIMENT_COLORS } from '../../lib/constants';
import { Segment } from '../../types';

export default function History() {
  const segments = useEntriesStore((s) => s.segments);
  const isLoading = useEntriesStore((s) => s.isLoading);
  const fetchSegments = useEntriesStore((s) => s.fetchSegments);
  const categories = useCategoriesStore((s) => s.categories);
  const fetchCategories = useCategoriesStore((s) => s.fetchCategories);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchCategories();
    loadSegments();
  }, []);

  useEffect(() => {
    loadSegments();
  }, [selectedCategory]);

  async function loadSegments() {
    await fetchSegments({
      categorySlug: selectedCategory || undefined,
      search: search || undefined,
    });
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadSegments();
    setRefreshing(false);
  }

  function handleSearch() {
    loadSegments();
  }

  // Group by date
  const grouped = segments.reduce<Record<string, Segment[]>>((acc, s) => {
    if (!acc[s.entry_date]) acc[s.entry_date] = [];
    acc[s.entry_date].push(s);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <View className="flex-1 bg-background">
      <View className="px-5 pt-14 pb-2">
        <Text className="text-white text-2xl font-bold mb-4">Historial</Text>

        {/* Search */}
        <View className="flex-row gap-2 mb-4">
          <TextInput
            placeholder="Buscar..."
            placeholderTextColor="#6B7280"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            className="flex-1 bg-surface text-white px-4 py-2 rounded-lg text-sm"
          />
          <Pressable onPress={handleSearch} className="bg-primary px-4 py-2 rounded-lg">
            <Text className="text-white">🔍</Text>
          </Pressable>
        </View>

        {/* Category pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-full ${
                !selectedCategory ? 'bg-primary' : 'bg-surface'
              }`}
            >
              <Text className="text-white text-xs">Todas</Text>
            </Pressable>
            {categories
              .filter((c) => c.is_active)
              .map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() =>
                    setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug)
                  }
                  className={`px-3 py-1.5 rounded-full ${
                    selectedCategory === cat.slug ? 'bg-primary' : 'bg-surface'
                  }`}
                >
                  <Text className="text-white text-xs">
                    {cat.icon} {cat.label}
                  </Text>
                </Pressable>
              ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {sortedDates.map((date) => (
          <View key={date} className="mb-4">
            <Text className="text-gray-500 text-xs font-bold mb-2 uppercase">{date}</Text>
            {grouped[date].map((seg) => {
              const cat = categories.find((c) => c.slug === seg.category_slug);
              return (
                <View key={seg.id} className="bg-surface rounded-lg p-3 mb-2">
                  <View className="flex-row items-center mb-1">
                    <Text className="text-sm mr-1">{cat?.icon || '📝'}</Text>
                    <Text className="text-xs font-bold text-gray-400 mr-2">
                      {cat?.label || seg.category_slug}
                    </Text>
                    {seg.sentiment && (
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: SENTIMENT_COLORS[seg.sentiment] }}
                      />
                    )}
                    {seg.entry_time && (
                      <Text className="text-xs text-gray-500 ml-auto">{seg.entry_time}</Text>
                    )}
                  </View>
                  <Text className="text-gray-200 text-sm">{seg.content}</Text>
                </View>
              );
            })}
          </View>
        ))}

        {segments.length === 0 && !isLoading && (
          <View className="items-center py-12">
            <Text className="text-gray-500 text-center">Sin registros</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
