import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../hooks/useAuth';

export default function Index() {
  const { isAuthenticated, isLoading, isOnboarded, isApproved, profile } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!isApproved) {
    return <Redirect href="/pending-approval" />;
  }

  if (!isOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  if (profile?.biometric_enabled) {
    return <Redirect href="/biometric" />;
  }

  return <Redirect href="/(tabs)" />;
}
