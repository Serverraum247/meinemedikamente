/**
 * SettingsScreen.tsx – App-Einstellungen
 *
 * Aktuell: Standard-Uhrzeiten fuer Tageszeit-Slots anpassen
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  SLOT_META,
  SLOT_REIHENFOLGE,
  getAllDefaultUhrzeiten,
  setDefaultUhrzeit,
  resetDefaultUhrzeiten,
  type TageszeitSlot,
} from '../utils/Einnahmeplan';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const [uhrzeiten, setUhrzeiten] = useState<Record<TageszeitSlot, string>>({
    morgens: '08:00',
    mittags: '12:00',
    abends: '18:00',
    nachts: '22:00',
  });
  const [geaendert, setGeaendert] = useState<Set<TageszeitSlot>>(new Set());

  // Uhrzeiten beim Oeffnen laden
  useEffect(() => {
    (async () => {
      const stored = await getAllDefaultUhrzeiten();
      setUhrzeiten(stored);
    })();
  }, []);

  // Uhrzeit validieren (HH:MM)
  const isValidTime = (t: string): boolean => {
    return /^\d{1,2}:\d{2}$/.test(t) && (() => {
      const [h, m] = t.split(':').map(Number);
      return h >= 0 && h < 24 && m >= 0 && m < 60;
    })();
  };

  // Uhrzeit-Aenderung speichern
  const handleUhrzeitChange = useCallback((slot: TageszeitSlot, value: string) => {
    setUhrzeiten(prev => ({ ...prev, [slot]: value }));
    setGeaendert(prev => new Set(prev).add(slot));
  }, []);

  // Alle Aenderungen speichern
  const handleSpeichern = useCallback(async () => {
    try {
      for (const slot of geaendert) {
        const uhrzeit = uhrzeiten[slot];
        if (!isValidTime(uhrzeit)) {
          const meta = SLOT_META[slot];
          Alert.alert(
            'Ungültige Uhrzeit',
            `"${uhrzeit}" ist keine gültige Uhrzeit für ${meta.label}.\nBitte im Format HH:MM eingeben (z.B. 08:00).`,
          );
          return;
        }
        await setDefaultUhrzeit(slot, uhrzeit);
      }
      setGeaendert(new Set());
      Alert.alert('Gespeichert', 'Standard-Uhrzeiten wurden aktualisiert.');
    } catch (e) {
      Alert.alert('Fehler', 'Uhrzeiten konnten nicht gespeichert werden.');
    }
  }, [geaendert, uhrzeiten]);

  // Zuruecksetzen
  const handleReset = useCallback(() => {
    Alert.alert(
      'Zurücksetzen',
      'Alle Uhrzeiten auf die Standardwerte zurücksetzen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Zurücksetzen',
          style: 'destructive',
          onPress: async () => {
            await resetDefaultUhrzeiten();
            const defaults = await getAllDefaultUhrzeiten();
            setUhrzeiten(defaults);
            setGeaendert(new Set());
          },
        },
      ],
    );
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={styles.title}>Einstellungen</Text>

        {/* Standard-Uhrzeiten */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Standard-Uhrzeiten</Text>
          <Text style={styles.sectionHint}>
            Diese Uhrzeiten werden verwendet, wenn du bei einem Medikament
            eine Tageszeit aktivierst. Du kannst sie hier anpassen.
          </Text>

          {SLOT_REIHENFOLGE.map(slot => {
            const meta = SLOT_META[slot];
            return (
              <View key={slot} style={styles.uhrzeitRow}>
                <View style={styles.uhrzeitLabelContainer}>
                  <Text style={styles.uhrzeitEmoji}>{meta.emoji}</Text>
                  <Text style={styles.uhrzeitLabel}>{meta.label}</Text>
                </View>
                <TextInput
                  accessibilityLabel={`${meta.label} Standard-Uhrzeit`}
                  style={[
                    styles.uhrzeitInput,
                    geaendert.has(slot) && styles.uhrzeitInputChanged,
                  ]}
                  value={uhrzeiten[slot]}
                  onChangeText={text => handleUhrzeitChange(slot, text)}
                  placeholder="HH:MM"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            );
          })}
        </View>

        {/* Speichern-Button */}
        {geaendert.size > 0 && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Änderungen speichern"
            style={styles.speichernButton}
            onPress={handleSpeichern}
            activeOpacity={0.7}
          >
            <Text style={styles.speichernButtonText}>
              Speichern ({geaendert.size} geändert)
            </Text>
          </TouchableOpacity>
        )}

        {/* Zuruecksetzen */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Auf Standard zurücksetzen"
          style={styles.resetButton}
          onPress={handleReset}
          activeOpacity={0.7}
        >
          <Text style={styles.resetButtonText}>Auf Standard zurücksetzen</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f3',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 24,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 15,
    color: '#666',
    marginBottom: 20,
    lineHeight: 22,
  },
  uhrzeitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  uhrzeitLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  uhrzeitEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  uhrzeitLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  uhrzeitInput: {
    backgroundColor: '#f5f5f3',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
    minWidth: 90,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  uhrzeitInputChanged: {
    borderColor: '#3498db',
    backgroundColor: '#eef6fd',
  },
  speichernButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 56,
    justifyContent: 'center',
  },
  speichernButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  resetButton: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ccc',
    minHeight: 52,
    justifyContent: 'center',
  },
  resetButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
});
