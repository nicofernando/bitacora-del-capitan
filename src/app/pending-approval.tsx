import { View, Text, Pressable } from 'react-native';
import { useAuthStore } from '../store/auth';

export default function PendingApproval() {
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <Text className="text-5xl mb-6">⏳</Text>
      <Text className="text-white text-xl font-bold text-center mb-4">
        Cuenta pendiente de aprobación
      </Text>
      <Text className="text-gray-400 text-center mb-8">
        Tu cuenta fue creada correctamente. Un administrador debe aprobarla antes de que puedas acceder.
      </Text>
      <Pressable
        onPress={signOut}
        className="bg-surface px-6 py-3 rounded-lg"
      >
        <Text className="text-gray-300">Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}
