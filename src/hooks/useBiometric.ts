import { useState, useEffect, useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

export function useBiometric() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAvailability();
  }, []);

  async function checkAvailability() {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setIsAvailable(compatible && enrolled);
  }

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!isAvailable) {
      setIsAuthenticated(true);
      return true;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Verificá tu identidad para acceder',
      cancelLabel: 'Usar contraseña',
      fallbackLabel: 'Usar contraseña',
      disableDeviceFallback: false,
    });

    setIsAuthenticated(result.success);
    return result.success;
  }, [isAvailable]);

  return { isAvailable, isAuthenticated, authenticate };
}
