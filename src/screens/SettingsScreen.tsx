/**
 * SettingsScreen.tsx – App-Einstellungen
 *
 * - Standard-Uhrzeiten fuer Tageszeit-Slots
 * - Arztkontaktdaten pflegen (Free: 1 Arzt, Premium: unbegrenzt)
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
import { announceChange } from '../utils/AccessibilityHelpers';
import {
  getAllAerzte,
  createArzt,
  updateArzt,
  deleteArzt,
  getMaxAerzte,
  type ArztRow,
} from '../database/ArztController';
import { isPremium } from '../services/PremiumService';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  // Uhrzeiten-State
  const [uhrzeiten, setUhrzeiten] = useState<Record<TageszeitSlot, string>>({
    morgens: '08:00',
    mittags: '12:00',
    abends: '18:00',
    nachts: '22:00',
  });
  const [geaendert, setGeaendert] = useState<Set<TageszeitSlot>>(new Set());

  // Aerzte-State
  const [aerzte, setAerzte] = useState<ArztRow[]>([]);
  const [premium, setPremiumStatus] = useState(false);
  const [maxAerzte, setMaxAerzteState] = useState(1);
  const [editArzt, setEditArzt] = useState<ArztRow | null>(null);
  const [neuerArzt, setNeuerArzt] = useState(false);

  // Uhrzeiten + Aerzte laden
  useEffect(() => {
    (async () => {
      const stored = await getAllDefaultUhrzeiten();
      setUhrzeiten(stored);
      await loadAerzte();
    })();
  }, []);

  const loadAerzte = async () => {
    const [list, isPrem, max] = await Promise.all([
      getAllAerzte(),
      isPremium(),
      getMaxAerzte(),
    ]);
    setAerzte(list);
    setPremiumStatus(isPrem);
    setMaxAerzteState(max);
  };

  // Uhrzeit validieren (HH:MM)
  const isValidTime = (t: string): boolean => {
    return /^\d{1,2}:\d{2}$/.test(t) && (() => {
      const [h, m] = t.split(':').map(Number);
      return h >= 0 && h < 24 && m >= 0 && m < 60;
    })();
  };

  const handleUhrzeitChange = useCallback((slot: TageszeitSlot, value: string) => {
    setUhrzeiten(prev => ({ ...prev, [slot]: value }));
    setGeaendert(prev => new Set(prev).add(slot));
  }, []);

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
      announceChange('Einstellungen gespeichert');
      Alert.alert('Gespeichert', 'Standard-Uhrzeiten wurden aktualisiert.');
    } catch (_e) {
      Alert.alert('Fehler', 'Uhrzeiten konnten nicht gespeichert werden.');
    }
  }, [geaendert, uhrzeiten]);

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

  // === Arzt-Handler ===

  const handleAddArzt = () => {
    if (aerzte.length >= maxAerzte) {
      Alert.alert(
        'Premium erforderlich',
        `Kostenlose Version: nur 1 Arzt. Premium = unbegrenzte Ärzte.`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Premium', onPress: () => navigation.navigate('Premium') },
        ],
      );
      return;
    }
    setNeuerArzt(true);
    setEditArzt({ id: '', name: '', telefon: '', adresse: '', fachgebiet: '', created_at: '' });
  };

  const handleSaveArzt = async () => {
    if (!editArzt || !editArzt.name.trim()) {
      Alert.alert('Pflichtfeld', 'Bitte gib einen Namen ein.');
      return;
    }

    try {
      if (neuerArzt) {
        const result = await createArzt({
          name: editArzt.name.trim(),
          telefon: editArzt.telefon.trim(),
          adresse: editArzt.adresse.trim(),
          fachgebiet: editArzt.fachgebiet.trim(),
        });
        if (!result.success) {
          Alert.alert('Limit erreicht', result.error || 'Fehler beim Anlegen.');
          return;
        }
      } else {
        await updateArzt(editArzt.id, {
          name: editArzt.name.trim(),
          telefon: editArzt.telefon.trim(),
          adresse: editArzt.adresse.trim(),
          fachgebiet: editArzt.fachgebiet.trim(),
        });
      }
      setEditArzt(null);
      setNeuerArzt(false);
      await loadAerzte();
    } catch (_e) {
      Alert.alert('Fehler', 'Arzt konnte nicht gespeichert werden.');
    }
  };

  const handleDeleteArzt = (arzt: ArztRow) => {
    Alert.alert(
      'Arzt löschen',
      `"${arzt.name}" wirklich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await deleteArzt(arzt.id);
            await loadAerzte();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* === Meine Aerzte === */}
        <Text style={styles.title}>Einstellungen</Text>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              👨‍⚕️ Meine Ärzte
            </Text>
            <TouchableOpacity onPress={handleAddArzt} accessibilityRole="button" accessibilityLabel="Arzt hinzufügen">
              <Text style={styles.addButton}>+ Hinzufügen</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionHint}>
            Hinterlege Kontaktdaten deiner Ärzte.{'\n'}
            {premium
              ? 'Premium: unbegrenzte Ärzte.'
              : `Kostenlos: 1 Arzt. Premium = unbegrenzt.`
            }
          </Text>

          {aerzte.length === 0 && !editArzt && (
            <Text style={styles.emptyText}>Noch kein Arzt hinterlegt.</Text>
          )}

          {aerzte.map(arzt => (
            <View key={arzt.id} style={styles.arztCard}>
              <View style={styles.arztInfo}>
                <Text style={styles.arztName}>{arzt.name}</Text>
                {arzt.fachgebiet ? (
                  <Text style={styles.arztDetail}>{arzt.fachgebiet}</Text>
                ) : null}
                {arzt.telefon ? (
                  <Text style={styles.arztDetail}>📞 {arzt.telefon}</Text>
                ) : null}
                {arzt.adresse ? (
                  <Text style={styles.arztDetail}>📍 {arzt.adresse}</Text>
                ) : null}
              </View>
              <View style={styles.arztActions}>
                <TouchableOpacity
                  onPress={() => { setNeuerArzt(false); setEditArzt({ ...arzt }); }}
                  accessibilityLabel={`${arzt.name} bearbeiten`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.arztEditButton}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteArzt(arzt)}
                  accessibilityLabel={`${arzt.name} löschen`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.arztDeleteButton}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Arzt bearbeiten/hinzufuegen Formular */}
          {editArzt && (
            <View style={styles.arztForm}>
              <Text style={styles.arztFormTitle}>
                {neuerArzt ? 'Neuer Arzt' : 'Arzt bearbeiten'}
              </Text>

              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.fieldInput}
                value={editArzt.name}
                onChangeText={t => setEditArzt({ ...editArzt, name: t })}
                placeholder="Dr. Müller"
                placeholderTextColor="#999"
              />

              <Text style={styles.fieldLabel}>Fachgebiet</Text>
              <TextInput
                style={styles.fieldInput}
                value={editArzt.fachgebiet}
                onChangeText={t => setEditArzt({ ...editArzt, fachgebiet: t })}
                placeholder="Hausarzt, Kardiologie..."
                placeholderTextColor="#999"
              />

              <Text style={styles.fieldLabel}>Telefon</Text>
              <TextInput
                style={styles.fieldInput}
                value={editArzt.telefon}
                onChangeText={t => setEditArzt({ ...editArzt, telefon: t })}
                placeholder="0681 123456"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Adresse</Text>
              <TextInput
                style={styles.fieldInput}
                value={editArzt.adresse}
                onChangeText={t => setEditArzt({ ...editArzt, adresse: t })}
                placeholder="Musterstraße 1, 66111 Saarbrücken"
                placeholderTextColor="#999"
              />

              <View style={styles.arztFormButtons}>
                <TouchableOpacity
                  style={[styles.arztFormBtn, styles.arztFormCancel]}
                  onPress={() => { setEditArzt(null); setNeuerArzt(false); }}
                >
                  <Text style={styles.arztFormCancelText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.arztFormBtn, styles.arztFormSave]}
                  onPress={handleSaveArzt}
                >
                  <Text style={styles.arztFormSaveText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* === Standard-Uhrzeiten === */}
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
                  <Text style={styles.uhrzeitEmoji} accessibilityElementsHidden>{meta.emoji}</Text>
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

        {/* Cloud-Backup */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Cloud-Backup"
          style={styles.backupButton}
          onPress={() => navigation.navigate('Backup')}
          activeOpacity={0.7}
        >
          <Text style={styles.backupButtonText}>☁️ Cloud-Backup</Text>
        </TouchableOpacity>

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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
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

  // Arzt-Liste
  addButton: {
    fontSize: 16,
    color: '#27ae60',
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 12,
  },
  arztCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  arztInfo: {
    flex: 1,
  },
  arztName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  arztDetail: {
    fontSize: 15,
    color: '#666',
    marginTop: 2,
  },
  arztActions: {
    flexDirection: 'row',
    gap: 12,
    paddingLeft: 12,
  },
  arztEditButton: {
    fontSize: 22,
  },
  arztDeleteButton: {
    fontSize: 22,
  },

  // Arzt-Formular
  arztForm: {
    backgroundColor: '#f9f9f8',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#27ae60',
  },
  arztFormTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
    marginTop: 8,
  },
  fieldInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  arztFormButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  arztFormBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arztFormCancel: {
    backgroundColor: '#f0f0f0',
  },
  arztFormCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  arztFormSave: {
    backgroundColor: '#27ae60',
  },
  arztFormSaveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Uhrzeiten
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
  backupButton: {
    backgroundColor: '#2980b9',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 56,
    justifyContent: 'center',
  },
  backupButtonText: {
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
