import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useBiometric } from '../hooks/useBiometric';

export default function BiometricScreen() {
  const { isAvailable, isAuthenticated, authenticate } = useBiometric();

  useEffect(() => {
    if (!isAvailable) {
      router.replace('/(tabs)');
      return;
    }
    authenticate();
  }, [isAvailable]);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <Text className="text-6xl mb-8">🔐</Text>
      <Text className="text-white text-xl font-bold text-center mb-4">
        Verificá tu identidad
      </Text>
      <Text className="text-gray-400 text-center mb-8">
        Usá tu huella digital o reconocimiento facial para acceder
      </Text>

      <Pressable
        onPress={authenticate}
        className="bg-primary px-8 py-3 rounded-lg mb-4"
      >
        <Text className="text-white font-bold text-base">Reintentar</Text>
      </Pressable>

      <Pressable
        onPress={() => router.replace('/(tabs)')}
        className="px-8 py-3"
      >
        <Text className="text-gray-400">Saltar por ahora</Text>
      </Pressable>
    </View>
  );
}
