import { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { useProcessEntry } from '../../hooks/useProcessEntry';
import { SENTIMENT_COLORS } from '../../lib/constants';
import { formatDateFull, getDeviceDatetime } from '../../lib/dates';
import * as FileSystem from 'expo-file-system';

export default function NewEntry() {
  const [bodyText, setBodyText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { processEntry, isProcessing, result } = useProcessEntry();

  const now = new Date();
  const dateStr = formatDateFull(now.toISOString());

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Error', 'Se necesita permiso para grabar audio');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);
      setAudioDuration(0);

      timerRef.current = setInterval(() => {
        setAudioDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      setAudioUri(uri);
      setIsRecording(false);
      recordingRef.current = null;
    } catch (err) {
      setIsRecording(false);
    }
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async function handleSubmit() {
    if (!bodyText.trim() && !audioUri) {
      Alert.alert('Error', 'Escribí algo o grabá un audio');
      return;
    }

    let audioBase64: string | undefined;
    let audioMimeType: string | undefined;

    if (audioUri) {
      try {
        audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
          encoding: 'base64',
        });
        audioMimeType = 'audio/m4a';
      } catch {
        Alert.alert('Error', 'No se pudo leer el archivo de audio');
        return;
      }
    }

    await processEntry(bodyText.trim() || null, audioUri, audioBase64, audioMimeType);

    // Reset form
    setBodyText('');
    setAudioUri(null);
    setAudioDuration(0);
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <View className="px-5 pt-14">
        <Text className="text-white text-2xl font-bold mb-1">Nueva Entrada</Text>
        <Text className="text-gray-400 text-sm mb-6 capitalize">{dateStr}</Text>

        {/* Text input */}
        <TextInput
          placeholder="¿Cómo fue tu día? Contá lo que quieras..."
          placeholderTextColor="#6B7280"
          value={bodyText}
          onChangeText={setBodyText}
          multiline
          numberOfLines={8}
          textAlignVertical="top"
          className="bg-surface text-white px-4 py-3 rounded-lg mb-4 text-base min-h-[160px]"
        />

        {/* Audio recorder */}
        <View className="flex-row items-center gap-3 mb-6">
          <Pressable
            onPress={isRecording ? stopRecording : startRecording}
            className={`px-5 py-3 rounded-lg flex-row items-center ${
              isRecording ? 'bg-danger' : 'bg-surface'
            }`}
          >
            <Text className="text-white mr-2">{isRecording ? '⏹️' : '🎤'}</Text>
            <Text className="text-white">
              {isRecording ? 'Detener' : 'Grabar audio'}
            </Text>
          </Pressable>

          {(isRecording || audioUri) && (
            <Text className="text-gray-400">{formatDuration(audioDuration)}</Text>
          )}

          {audioUri && !isRecording && (
            <Pressable onPress={() => { setAudioUri(null); setAudioDuration(0); }}>
              <Text className="text-danger">Eliminar</Text>
            </Pressable>
          )}
        </View>

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={isProcessing}
          className={`py-4 rounded-lg mb-6 ${isProcessing ? 'bg-primary/50' : 'bg-primary'}`}
        >
          <Text className="text-white text-center font-bold text-base">
            {isProcessing ? 'Procesando...' : 'Enviar Entrada'}
          </Text>
        </Pressable>

        {/* Results */}
        {result && !result.error && (
          <View>
            <Text className="text-green-400 mb-4">Guardado localmente</Text>
          </View>
        )}

        {result?.error && (
          <Text className="text-red-400 mb-4">Error: {result.error}</Text>
        )}

        {result?.segmentation?.segments && result.segmentation.segments.length > 0 && (
          <View>
            <Text className="text-gray-300 font-bold mb-3 text-sm uppercase">
              Segmentos detectados
            </Text>
            {result.segmentation.segments.map((seg, i) => (
              <View key={i} className="bg-surface rounded-lg p-3 mb-2">
                <View className="flex-row items-center mb-1">
                  <Text className="text-xs font-bold text-gray-400 mr-2">
                    {seg.category_slug}
                  </Text>
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: SENTIMENT_COLORS[seg.sentiment] || '#6B7280',
                    }}
                  />
                  <Text className="text-xs text-gray-500 ml-2">
                    Intensidad: {seg.intensity}
                  </Text>
                </View>
                <Text className="text-gray-200 text-sm">{seg.content}</Text>
              </View>
            ))}
          </View>
        )}

        {result?.segmentation?.goal_events && result.segmentation.goal_events.length > 0 && (
          <View className="mt-4">
            {result.segmentation.goal_events.map((evt, i) => (
              <View
                key={i}
                className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-2"
              >
                <Text className="text-warning font-bold text-sm">
                  Evento detectado: {evt.event_type}
                </Text>
                {evt.notes && (
                  <Text className="text-gray-300 text-xs mt-1">{evt.notes}</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
