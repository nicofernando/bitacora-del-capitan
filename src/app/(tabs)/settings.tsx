import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/auth';
import { useCategoriesStore } from '../../store/categories';
import { useGoalsStore } from '../../store/goals';
import { supabase } from '../../lib/supabase';
import { COACH_PRESETS } from '../../lib/constants';
import { generateToken, sha256 } from '../../lib/crypto';
import { GeminiProvider } from '../../lib/llm/gemini';
import { scheduleDailyReminder } from '../../lib/notifications';

export default function Settings() {
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const categories = useCategoriesStore((s) => s.categories);
  const toggleCategory = useCategoriesStore((s) => s.toggleCategory);
  const goals = useGoalsStore((s) => s.goals);
  const fetchGoals = useGoalsStore((s) => s.fetchGoals);

  const [section, setSection] = useState<string | null>(null);

  // Editable fields
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [apiKey, setApiKey] = useState('');
  const [notifHour, setNotifHour] = useState(String(profile?.notification_hour || 20));
  const [coachPreset, setCoachPreset] = useState<'engineer' | 'psychologist' | 'spartan' | 'custom'>(profile?.coach_preset || 'engineer');
  const [customPrompt, setCustomPrompt] = useState(profile?.coach_custom_prompt || '');
  const [newToken, setNewToken] = useState<string | null>(null);

  async function handleSaveProfile() {
    try {
      await updateProfile({ full_name: fullName.trim() });
      Alert.alert('Listo', 'Perfil actualizado');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  async function handleSaveApiKey() {
    if (!apiKey.trim()) return;
    try {
      const provider = new GeminiProvider(apiKey.trim());
      const valid = await provider.validateApiKey();
      if (!valid) {
        Alert.alert('Error', 'API key inválida');
        return;
      }
      await SecureStore.setItemAsync('llm_api_key', apiKey.trim());
      Alert.alert('Listo', 'API key actualizada');
      setApiKey('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  async function handleSaveCoach() {
    try {
      await updateProfile({
        coach_preset: coachPreset as any,
        coach_custom_prompt: coachPreset === 'custom' ? customPrompt : null,
      });
      Alert.alert('Listo', 'Coach actualizado');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  async function handleSaveNotifications() {
    const hour = parseInt(notifHour);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      Alert.alert('Error', 'Hora inválida (0-23)');
      return;
    }
    await updateProfile({ notification_hour: hour });
    await scheduleDailyReminder(hour);
    Alert.alert('Listo', `Recordatorio diario a las ${hour}:00`);
  }

  async function handleGenerateToken() {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const token = generateToken();
    const hash = await sha256(token);

    const { error } = await supabase.from('api_tokens').insert({
      user_id: user.id,
      token_hash: hash,
      label: 'default',
    });

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setNewToken(token);
    Alert.alert(
      'Token generado',
      'Copialo ahora — no se mostrará de nuevo.',
    );
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  function renderSection() {
    switch (section) {
      case 'profile':
        return (
          <View>
            <Text className="text-gray-300 mb-2">Nombre</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />
            <Pressable onPress={handleSaveProfile} className="bg-primary py-3 rounded-lg">
              <Text className="text-white text-center font-bold">Guardar</Text>
            </Pressable>
          </View>
        );

      case 'coach':
        return (
          <View>
            {Object.entries(COACH_PRESETS).map(([key, preset]) => (
              <Pressable
                key={key}
                onPress={() => setCoachPreset(key as typeof coachPreset)}
                className={`p-3 rounded-lg mb-2 border ${
                  coachPreset === key ? 'border-primary bg-primary/10' : 'border-surface bg-surface'
                }`}
              >
                <Text className="text-white font-bold text-sm">{preset.label}</Text>
                <Text className="text-gray-400 text-xs">{preset.description}</Text>
              </Pressable>
            ))}
            {coachPreset === 'custom' && (
              <TextInput
                value={customPrompt}
                onChangeText={setCustomPrompt}
                multiline
                placeholder="Describí el estilo..."
                placeholderTextColor="#6B7280"
                className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
              />
            )}
            <Pressable onPress={handleSaveCoach} className="bg-primary py-3 rounded-lg mt-2">
              <Text className="text-white text-center font-bold">Guardar</Text>
            </Pressable>
          </View>
        );

      case 'apikey':
        return (
          <View>
            <Text className="text-gray-400 text-sm mb-4">
              Tu key actual: ****{apiKey.slice(-4) || '****'}
            </Text>
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Nueva API key"
              placeholderTextColor="#6B7280"
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />
            <Pressable onPress={handleSaveApiKey} className="bg-primary py-3 rounded-lg">
              <Text className="text-white text-center font-bold">Verificar y guardar</Text>
            </Pressable>
          </View>
        );

      case 'categories':
        return (
          <View>
            {categories.map((cat) => (
              <View key={cat.id} className="flex-row items-center justify-between py-3 border-b border-gray-800">
                <Text className="text-white text-sm">
                  {cat.icon} {cat.label}
                </Text>
                <Switch
                  value={cat.is_active}
                  onValueChange={(v) => toggleCategory(cat.id, v)}
                  trackColor={{ false: '#374151', true: '#3B82F6' }}
                />
              </View>
            ))}
          </View>
        );

      case 'notifications':
        return (
          <View>
            <Text className="text-gray-300 mb-2">Hora del recordatorio (0-23)</Text>
            <TextInput
              value={notifHour}
              onChangeText={setNotifHour}
              keyboardType="numeric"
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />
            <Pressable onPress={handleSaveNotifications} className="bg-primary py-3 rounded-lg">
              <Text className="text-white text-center font-bold">Guardar</Text>
            </Pressable>
          </View>
        );

      case 'api':
        return (
          <View>
            <Pressable onPress={handleGenerateToken} className="bg-primary py-3 rounded-lg mb-4">
              <Text className="text-white text-center font-bold">Generar token</Text>
            </Pressable>
            {newToken && (
              <View className="bg-surface p-4 rounded-lg">
                <Text className="text-warning text-xs mb-2">
                  Copiá este token. No se mostrará de nuevo.
                </Text>
                <Text className="text-white text-xs font-mono" selectable>
                  {newToken}
                </Text>
              </View>
            )}
          </View>
        );

      case 'security':
        return (
          <View>
            <View className="flex-row items-center justify-between py-3">
              <Text className="text-white">Biometría</Text>
              <Switch
                value={profile?.biometric_enabled ?? false}
                onValueChange={(v) => updateProfile({ biometric_enabled: v })}
                trackColor={{ false: '#374151', true: '#3B82F6' }}
              />
            </View>
          </View>
        );

      default:
        return null;
    }
  }

  const menuItems = [
    { key: 'profile', label: 'Perfil', icon: '👤' },
    { key: 'coach', label: 'Coach', icon: '🤖' },
    { key: 'apikey', label: 'API Key (LLM)', icon: '🔑' },
    { key: 'categories', label: 'Categorías', icon: '📂' },
    { key: 'notifications', label: 'Notificaciones', icon: '🔔' },
    { key: 'api', label: 'API Externa', icon: '🔗' },
    { key: 'security', label: 'Seguridad', icon: '🔐' },
  ];

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 100 }}>
      <View className="px-5 pt-14">
        <Text className="text-white text-2xl font-bold mb-6">Configuración</Text>

        {!section ? (
          <View>
            {menuItems.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setSection(item.key)}
                className="bg-surface p-4 rounded-lg mb-2 flex-row items-center"
              >
                <Text className="text-lg mr-3">{item.icon}</Text>
                <Text className="text-white">{item.label}</Text>
                <Text className="text-gray-500 ml-auto">›</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={handleSignOut}
              className="bg-danger/10 border border-danger/30 p-4 rounded-lg mt-6"
            >
              <Text className="text-danger text-center font-bold">Cerrar sesión</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Pressable onPress={() => setSection(null)} className="mb-4">
              <Text className="text-primary">← Volver</Text>
            </Pressable>
            <Text className="text-white text-lg font-bold mb-4">
              {menuItems.find((i) => i.key === section)?.icon}{' '}
              {menuItems.find((i) => i.key === section)?.label}
            </Text>
            {renderSection()}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
