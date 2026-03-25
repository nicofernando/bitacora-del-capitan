import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { signInWithEmail } from '../../lib/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Completá email y contraseña');
      return;
    }

    setIsLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace('/');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <View className="flex-1 bg-background justify-center px-8">
        <Text className="text-white text-3xl font-bold text-center mb-2">
          Bitácora del Capitán
        </Text>
        <Text className="text-gray-400 text-center mb-10">
          Tu diario personal con IA
        </Text>

        <TextInput
          placeholder="Email"
          placeholderTextColor="#6B7280"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
        />

        <TextInput
          placeholder="Contraseña"
          placeholderTextColor="#6B7280"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          className="bg-surface text-white px-4 py-3 rounded-lg mb-6 text-base"
        />

        <Pressable
          onPress={handleLogin}
          disabled={isLoading}
          className="bg-primary py-3 rounded-lg mb-4"
          style={{ opacity: isLoading ? 0.6 : 1 }}
        >
          <Text className="text-white text-center font-bold text-base">
            {isLoading ? 'Ingresando...' : 'Iniciar sesión'}
          </Text>
        </Pressable>

        <View className="flex-row justify-center mt-4">
          <Text className="text-gray-400">¿No tenés cuenta? </Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text className="text-primary font-bold">Registrate</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
