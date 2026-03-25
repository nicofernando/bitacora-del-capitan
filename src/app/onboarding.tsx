import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/auth';
import { supabase } from '../lib/supabase';
import { COACH_PRESETS } from '../lib/constants';
import { GeminiProvider } from '../lib/llm/gemini';
import { getTimezone } from '../lib/dates';

type Step = 'profile' | 'physical' | 'goal' | 'coach' | 'apikey';
const STEPS: Step[] = ['profile', 'physical', 'goal', 'coach', 'apikey'];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  // Profile
  const [fullName, setFullName] = useState('');
  const [birthdate, setBirthdate] = useState('');

  // Physical
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');

  // Goal
  const [goalName, setGoalName] = useState('');
  const [goalType, setGoalType] = useState<'avoid' | 'limit' | 'achieve'>('avoid');
  const [goalHint, setGoalHint] = useState('');
  const [goalCategory, setGoalCategory] = useState('personal_growth');

  // Coach
  const [coachPreset, setCoachPreset] = useState<string>('engineer');
  const [customPrompt, setCustomPrompt] = useState('');

  // API Key
  const [apiKey, setApiKey] = useState('');
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const currentStep = STEPS[step];

  async function handleNext() {
    if (currentStep === 'profile') {
      if (!fullName.trim()) {
        Alert.alert('Error', 'Ingresá tu nombre');
        return;
      }
    }

    if (currentStep === 'apikey') {
      await finishOnboarding();
      return;
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function validateKey() {
    if (!apiKey.trim()) return;
    setIsValidating(true);
    try {
      const provider = new GeminiProvider(apiKey.trim());
      const valid = await provider.validateApiKey();
      setKeyValid(valid);
      if (!valid) Alert.alert('Error', 'La API key no es válida');
    } catch {
      setKeyValid(false);
    } finally {
      setIsValidating(false);
    }
  }

  async function finishOnboarding() {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Necesitás una API key de Gemini para continuar');
      return;
    }

    try {
      // Save API key securely
      await SecureStore.setItemAsync('llm_api_key', apiKey.trim());

      // Update profile
      await updateProfile({
        full_name: fullName.trim(),
        birthdate: birthdate || null,
        height_cm: heightCm ? parseInt(heightCm) : null,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
        timezone: getTimezone(),
        coach_preset: coachPreset as any,
        coach_custom_prompt: coachPreset === 'custom' ? customPrompt : null,
        onboarding_completed: true,
      });

      // Create initial weight log if provided
      if (weightKg && user) {
        await supabase.from('weight_logs').insert({
          user_id: user.id,
          weight_kg: parseFloat(weightKg),
          source: 'manual',
          notes: 'Peso inicial (onboarding)',
        });
      }

      // Create first goal if provided
      if (goalName.trim() && user) {
        await supabase.from('goals').insert({
          user_id: user.id,
          name: goalName.trim(),
          type: goalType,
          category_slug: goalCategory,
          ai_detection_hint: goalHint || `Detectar eventos relacionados con: ${goalName}`,
          is_active: true,
        });
      }

      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo completar el onboarding');
    }
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1 }}>
      <View className="flex-1 px-6 pt-16 pb-8">
        {/* Progress */}
        <View className="flex-row mb-8 gap-2">
          {STEPS.map((_, i) => (
            <View
              key={i}
              className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-surface'}`}
            />
          ))}
        </View>

        {/* Step: Profile */}
        {currentStep === 'profile' && (
          <View>
            <Text className="text-white text-2xl font-bold mb-2">Tu perfil</Text>
            <Text className="text-gray-400 mb-8">Contanos un poco sobre vos</Text>

            <Text className="text-gray-300 mb-2">Nombre completo *</Text>
            <TextInput
              placeholder="Ej: Nicolás Canales"
              placeholderTextColor="#6B7280"
              value={fullName}
              onChangeText={setFullName}
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />

            <Text className="text-gray-300 mb-2">Fecha de nacimiento</Text>
            <TextInput
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#6B7280"
              value={birthdate}
              onChangeText={setBirthdate}
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />
          </View>
        )}

        {/* Step: Physical */}
        {currentStep === 'physical' && (
          <View>
            <Text className="text-white text-2xl font-bold mb-2">Datos físicos</Text>
            <Text className="text-gray-400 mb-8">Opcional — podés saltear este paso</Text>

            <Text className="text-gray-300 mb-2">Altura (cm)</Text>
            <TextInput
              placeholder="175"
              placeholderTextColor="#6B7280"
              value={heightCm}
              onChangeText={setHeightCm}
              keyboardType="numeric"
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />

            <Text className="text-gray-300 mb-2">Peso (kg)</Text>
            <TextInput
              placeholder="80"
              placeholderTextColor="#6B7280"
              value={weightKg}
              onChangeText={setWeightKg}
              keyboardType="decimal-pad"
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />
          </View>
        )}

        {/* Step: Goal */}
        {currentStep === 'goal' && (
          <View>
            <Text className="text-white text-2xl font-bold mb-2">Tu primera meta</Text>
            <Text className="text-gray-400 mb-8">¿Qué querés trackear?</Text>

            <Text className="text-gray-300 mb-2">Nombre de la meta</Text>
            <TextInput
              placeholder="Ej: Sin pornografía"
              placeholderTextColor="#6B7280"
              value={goalName}
              onChangeText={setGoalName}
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />

            <Text className="text-gray-300 mb-3">Tipo</Text>
            <View className="flex-row gap-2 mb-4">
              {(['avoid', 'limit', 'achieve'] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setGoalType(t)}
                  className={`flex-1 py-2 rounded-lg ${goalType === t ? 'bg-primary' : 'bg-surface'}`}
                >
                  <Text className="text-white text-center text-sm">
                    {t === 'avoid' ? 'Evitar' : t === 'limit' ? 'Limitar' : 'Lograr'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text className="text-gray-300 mb-2">¿Qué debe detectar la IA?</Text>
            <TextInput
              placeholder="Ej: Detectar si vio pornografía o tuvo impulsos"
              placeholderTextColor="#6B7280"
              value={goalHint}
              onChangeText={setGoalHint}
              multiline
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />
          </View>
        )}

        {/* Step: Coach */}
        {currentStep === 'coach' && (
          <View>
            <Text className="text-white text-2xl font-bold mb-2">Tu coach</Text>
            <Text className="text-gray-400 mb-6">Elegí el estilo de tu coach personal</Text>

            {Object.entries(COACH_PRESETS).map(([key, preset]) => (
              <Pressable
                key={key}
                onPress={() => setCoachPreset(key)}
                className={`p-4 rounded-lg mb-3 border ${
                  coachPreset === key ? 'border-primary bg-primary/10' : 'border-surface bg-surface'
                }`}
              >
                <Text className="text-white font-bold mb-1">{preset.label}</Text>
                <Text className="text-gray-400 text-sm">{preset.description}</Text>
              </Pressable>
            ))}

            {coachPreset === 'custom' && (
              <TextInput
                placeholder="Escribí cómo querés que te hable el coach..."
                placeholderTextColor="#6B7280"
                value={customPrompt}
                onChangeText={setCustomPrompt}
                multiline
                numberOfLines={4}
                className="bg-surface text-white px-4 py-3 rounded-lg mt-2 text-base"
              />
            )}
          </View>
        )}

        {/* Step: API Key */}
        {currentStep === 'apikey' && (
          <View>
            <Text className="text-white text-2xl font-bold mb-2">API Key de Gemini</Text>
            <Text className="text-gray-400 mb-2">
              Necesitás una API key gratuita de Google Gemini.
            </Text>
            <Text className="text-gray-500 text-sm mb-6">
              Andá a aistudio.google.com → Get API Key → Create API Key
            </Text>

            <TextInput
              placeholder="Pegá tu API key acá"
              placeholderTextColor="#6B7280"
              value={apiKey}
              onChangeText={(v) => {
                setApiKey(v);
                setKeyValid(null);
              }}
              className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
            />

            <Pressable
              onPress={validateKey}
              disabled={isValidating || !apiKey.trim()}
              className="bg-surface py-3 rounded-lg mb-4"
              style={{ opacity: isValidating ? 0.6 : 1 }}
            >
              <Text className="text-white text-center">
                {isValidating ? 'Verificando...' : 'Verificar key'}
              </Text>
            </Pressable>

            {keyValid === true && (
              <Text className="text-green-400 text-center mb-4">API key válida</Text>
            )}
            {keyValid === false && (
              <Text className="text-red-400 text-center mb-4">API key inválida</Text>
            )}

            <Text className="text-gray-500 text-xs text-center">
              La key se guarda encriptada en tu dispositivo. Nunca la compartimos.
            </Text>
          </View>
        )}

        {/* Navigation */}
        <View className="mt-auto pt-8">
          <Pressable
            onPress={handleNext}
            className="bg-primary py-3 rounded-lg mb-3"
          >
            <Text className="text-white text-center font-bold text-base">
              {currentStep === 'apikey' ? 'Finalizar' : 'Siguiente'}
            </Text>
          </Pressable>

          {step > 0 && (
            <Pressable onPress={() => setStep((s) => s - 1)} className="py-2">
              <Text className="text-gray-400 text-center">Atrás</Text>
            </Pressable>
          )}

          {(currentStep === 'physical' || currentStep === 'goal') && (
            <Pressable onPress={() => setStep((s) => s + 1)} className="py-2">
              <Text className="text-gray-500 text-center">Saltar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
