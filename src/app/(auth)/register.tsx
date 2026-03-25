import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { signUpWithEmail } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleRegister() {
    if (!email || !password) {
      Alert.alert('Error', 'Completá todos los campos');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setIsLoading(true);
    try {
      const { user } = await signUpWithEmail(email.trim(), password);

      if (user) {
        // Create profile with is_approved = false
        await supabase.from('user_profiles').insert({
          id: user.id,
          full_name: '',
          onboarding_completed: false,
          is_approved: false,
        });
      }

      router.replace('/');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo crear la cuenta');
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
          Crear Cuenta
        </Text>
        <Text className="text-gray-400 text-center mb-10">
          Empezá tu bitácora personal
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
          className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base"
        />

        <TextInput
          placeholder="Confirmar contraseña"
          placeholderTextColor="#6B7280"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          className="bg-surface text-white px-4 py-3 rounded-lg mb-6 text-base"
        />

        <Pressable
          onPress={handleRegister}
          disabled={isLoading}
          className="bg-primary py-3 rounded-lg mb-4"
          style={{ opacity: isLoading ? 0.6 : 1 }}
        >
          <Text className="text-white text-center font-bold text-base">
            {isLoading ? 'Creando cuenta...' : 'Crear cuenta'}
          </Text>
        </Pressable>

        <View className="flex-row justify-center mt-4">
          <Text className="text-gray-400">¿Ya tenés cuenta? </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text className="text-primary font-bold">Iniciá sesión</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
