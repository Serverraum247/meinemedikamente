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
  Modal,
  Linking,
  Platform,
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
import { isPremium, setDevPremiumOverride, getDevPremiumOverride } from '../services/PremiumService';
import { usePersonen } from '../context/PersonenContext';
import { AVATAR_EMOJIS } from '../database/PersonenController';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';
import { version as APP_VERSION } from '../../package.json';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  // Personen
  const {
    personen, aktivePerson, setAktivePerson,
    addPerson, editPerson, removePerson,
    maxPersonen,
  } = usePersonen();
  const [neuePersonName, setNeuePersonName] = useState('');
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [editPersonName, setEditPersonName] = useState('');
  const [editPersonEmoji, setEditPersonEmoji] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null); // person id oder 'new'

  // Dev-Premium-Override (nur in __DEV__)
  const [devOverride, setDevOverrideState] = useState<string>('');

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

    // Dev-Override laden
    if (__DEV__) {
      getDevPremiumOverride().then(setDevOverrideState);
    }
  }, []);

  const loadAerzte = async () => {
    const [list, isPrem, max] = await Promise.all([
      getAllAerzte(),
      isPremium(),
      getMaxAerzte(),
    ]);
    setAerzte(list);
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
      showPremiumRequiredAlert('Mehr als ein Arzt ist nur mit Premium möglich.', navigation);
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
          showPremiumRequiredAlert(result.error || 'Weitere Ärzte sind nur mit Premium möglich.', navigation);
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

  const handleSupportMail = async () => {
    const constants = Platform.constants as Record<string, unknown>;
    const geraet = [constants.Manufacturer, constants.Brand, constants.Model]
      .filter(Boolean)
      .join(' ');
    const body = [
      '',
      '',
      'Supportdaten:',
      `App-Version: ${APP_VERSION}`,
      `Plattform: ${Platform.OS}`,
      `Systemversion: ${String(Platform.Version)}`,
      `Gerät: ${geraet || 'unbekannt'}`,
    ].join('\n');
    const url = `mailto:kontakt@serverraum247.dev?subject=${encodeURIComponent('Anfrage Mein MediPlan')}&body=${encodeURIComponent(body)}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('E-Mail nicht verfügbar', 'Auf diesem Gerät ist keine E-Mail-App eingerichtet.');
        return;
      }
      await Linking.openURL(url);
    } catch (_e) {
      Alert.alert('E-Mail nicht verfügbar', 'Die E-Mail-App konnte nicht geöffnet werden.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        <Text style={styles.title}>Einstellungen</Text>

        {/* === Personen / Patienten === */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              👥 Personen
            </Text>
            <TouchableOpacity
              onPress={async () => {
                if (!neuePersonName.trim()) return;
                const result = await addPerson({ name: neuePersonName.trim() });
                if (result.success) {
                  setNeuePersonName('');
                  announceChange('Person hinzugefügt');
                } else {
                  showPremiumRequiredAlert('Mehrere Personen sind nur mit Premium möglich.', navigation);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Person hinzufügen"
            >
              <Text style={styles.addButton}>+ Hinzufügen</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionHint}>
            Verwalte Medikamente für mehrere Personen.
          </Text>

          {/* Neue Person anlegen (nur wenn Premium oder < max) */}
          {personen.length < maxPersonen && (
            <View style={styles.inlineForm}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={neuePersonName}
                onChangeText={setNeuePersonName}
                placeholder="Name der neuen Person"
                placeholderTextColor="#999"
                accessibilityLabel="Name der neuen Person"
              />
            </View>
          )}

          {/* Personen-Liste */}
          {personen.map(person => {
            const isEditing = editPersonId === person.id;
            const isActive = aktivePerson?.id === person.id;
            return (
              <View key={person.id} style={styles.personRow}>
                {isEditing ? (
                  <View style={styles.inlineForm}>
                    <TouchableOpacity
                      onPress={() => setShowEmojiPicker(person.id)}
                      accessibilityRole="button"
                      accessibilityLabel="Avatar ändern"
                    >
                      <Text style={styles.personEmoji}>{person.avatar_emoji}</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editPersonName}
                      onChangeText={setEditPersonName}
                      placeholder="Name"
                      placeholderTextColor="#999"
                      accessibilityLabel="Name bearbeiten"
                    />
                    <TouchableOpacity
                      onPress={async () => {
                        if (!editPersonName.trim()) return;
                        await editPerson(person.id, {
                          name: editPersonName.trim(),
                          avatar_emoji: editPersonEmoji || person.avatar_emoji,
                        });
                        setEditPersonId(null);
                        announceChange('Person aktualisiert');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Speichern"
                    >
                      <Text style={styles.saveButton}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditPersonId(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Abbrechen"
                    >
                      <Text style={styles.cancelButton}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.inlineForm}>
                    <TouchableOpacity
                      onPress={() => setShowEmojiPicker(person.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Avatar von ${person.name} ändern`}
                    >
                      <Text style={styles.personEmoji}>
                        {person.avatar_uri ? '📷' : person.avatar_emoji}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        setAktivePerson(person);
                        announceChange(`${person.name} ausgewählt`);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${person.name}${isActive ? ' (aktiv)' : ''}. Tippen zum Auswählen.`}
                    >
                      <Text style={[
                        styles.personNameText,
                        isActive && styles.personNameActive,
                      ]}>
                        {person.name} {isActive && '(aktiv)'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setEditPersonId(person.id);
                        setEditPersonName(person.name);
                        setEditPersonEmoji(person.avatar_emoji);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${person.name} bearbeiten`}
                    >
                      <Text style={styles.editIcon}>✏️</Text>
                    </TouchableOpacity>
                    {person.ist_standard !== 1 && (
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            `${person.name} löschen?`,
                            'Medikamente dieser Person werden der Hauptperson zugeordnet.',
                            [
                              { text: 'Abbrechen', style: 'cancel' },
                              {
                                text: 'Löschen',
                                style: 'destructive',
                                onPress: async () => {
                                  const result = await removePerson(person.id);
                                  if (!result.success) {
                                    Alert.alert('Fehler', result.error);
                                  } else {
                                    announceChange('Person gelöscht');
                                  }
                                },
                              },
                            ]
                          );
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${person.name} löschen`}
                      >
                        <Text style={styles.deleteIcon}>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {/* Emoji-Picker Modal */}
          <Modal visible={!!showEmojiPicker} transparent animationType="fade">
            <View style={styles.emojiPickerOverlay}>
              <View style={styles.emojiPickerCard}>
                <Text style={styles.emojiPickerTitle}>Avatar auswählen</Text>
                <View style={styles.emojiGrid}>
                  {AVATAR_EMOJIS.map(emoji => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.emojiOption}
                      onPress={async () => {
                        if (showEmojiPicker === 'new') {
                          // wird beim Erstellen gesetzt
                        } else if (showEmojiPicker) {
                          await editPerson(showEmojiPicker, { avatar_emoji: emoji });
                          if (editPersonId === showEmojiPicker) {
                            setEditPersonEmoji(emoji);
                          }
                        }
                        setShowEmojiPicker(null);
                        announceChange('Avatar geändert');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Avatar ${emoji}`}
                    >
                      <Text style={styles.emojiOptionText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => setShowEmojiPicker(null)}
                  style={styles.emojiPickerClose}
                  accessibilityRole="button"
                  accessibilityLabel="Avatar-Auswahl schließen"
                >
                  <Text style={styles.emojiPickerCloseText}>Schließen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>

        {/* === Meine Aerzte === */}
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
            Hinterlege Kontaktdaten deiner Ärzte.
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

        <View
          style={styles.disclaimerSection}
          accessibilityRole="summary"
          accessibilityLabel="Wichtiger Hinweis zur Medikamenteneinnahme"
        >
          <Text style={styles.disclaimerTitle}>Wichtiger Hinweis</Text>
          <Text style={styles.disclaimerText}>
            Diese App unterstützt nur bei Übersicht, Erinnerung und Bestandsplanung. Sie ersetzt keine ärztliche oder pharmazeutische Beratung.
          </Text>
          <Text style={styles.disclaimerText}>
            Wir übernehmen keine Haftung für eine fehlerhafte Einnahme von Medikamenten. Jeder Nutzer ist selbst dafür verantwortlich, Medikamente nach ärztlicher Vorgabe einzunehmen.
          </Text>
        </View>

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

        {/* === DEV-MODE: Premium-Override (nur in Debug-Builds) === */}
        {__DEV__ && (
          <View style={styles.devSection}>
            <Text style={styles.devSectionTitle}>🛠 Entwicklungsmodus</Text>
            <Text style={styles.devSectionInfo}>
              Premium-Status simulieren zum Testen.{'\n'}
              Nur sichtbar in Debug-Builds.
            </Text>
            <View style={styles.devButtonRow}>
              <TouchableOpacity
                style={[styles.devButton, devOverride === 'premium' && styles.devButtonActive]}
                onPress={async () => {
                  await setDevPremiumOverride('premium');
                  setDevOverrideState('premium');
                  await loadAerzte();
                }}
                accessibilityRole="button"
                accessibilityLabel="Premium simulieren"
              >
                <Text style={styles.devButtonText}>
                  {devOverride === 'premium' ? '✓ Premium' : '⭐ Premium'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devButton, devOverride === 'free' && styles.devButtonActive]}
                onPress={async () => {
                  await setDevPremiumOverride('free');
                  setDevOverrideState('free');
                  await loadAerzte();
                }}
                accessibilityRole="button"
                accessibilityLabel="Free simulieren"
              >
                <Text style={styles.devButtonText}>
                  {devOverride === 'free' ? '✓ Free' : '🔒 Free'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devButton, devOverride === '' && styles.devButtonActive]}
                onPress={async () => {
                  await setDevPremiumOverride('');
                  setDevOverrideState('');
                  await loadAerzte();
                }}
                accessibilityRole="button"
                accessibilityLabel="Override entfernen"
              >
                <Text style={styles.devButtonText}>
                  {devOverride === '' ? '✓ Echtes' : '↩ Echtes'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.devStatusText}>
              Aktiv: {devOverride === 'premium' ? '⭐ Premium (simuliert)' : devOverride === 'free' ? '🔒 Free (simuliert)' : '📡 Echte IAP-Prüfung'}
            </Text>
          </View>
        )}

        <View
          style={styles.contactSection}
          accessibilityRole="summary"
          accessibilityLabel="Kontakt und Herausgeber"
        >
          <Text style={styles.contactTitle}>Kontakt</Text>
          <Text style={styles.contactText}>Serverraum247</Text>
          <TouchableOpacity
            onPress={handleSupportMail}
            accessibilityRole="link"
            accessibilityLabel="E-Mail an kontakt@serverraum247.dev schreiben"
          >
            <Text style={styles.contactMail}>kontakt@serverraum247.dev</Text>
          </TouchableOpacity>
          <Text style={styles.contactHint}>
            App aus dem Saarland. Fragen, Vorschläge und Verbesserungsvorschläge kannst du an diese Adresse senden.
          </Text>
        </View>
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
  // Personen
  personRow: {
    marginBottom: 8,
  },
  personEmoji: {
    fontSize: 32,
    marginRight: 8,
  },
  personNameText: {
    fontSize: 18,
    color: '#333',
    paddingVertical: 4,
  },
  personNameActive: {
    color: '#155724',
    fontWeight: '600',
  },
  editIcon: {
    fontSize: 20,
    padding: 8,
  },
  deleteIcon: {
    fontSize: 20,
    padding: 8,
  },
  saveButton: {
    fontSize: 24,
    color: '#28a745',
    padding: 8,
    fontWeight: '700',
  },
  cancelButton: {
    fontSize: 22,
    color: '#999',
    padding: 8,
  },
  // Emoji-Picker
  emojiPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiPickerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  emojiPickerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 16,
    textAlign: 'center',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  emojiOption: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
  },
  emojiOptionText: {
    fontSize: 32,
  },
  emojiPickerClose: {
    marginTop: 20,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
  },
  emojiPickerCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inlineForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fafafa',
    minHeight: 44,
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
  disclaimerSection: {
    backgroundColor: '#FFF8E1',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3D27A',
  },
  disclaimerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4B3A10',
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 15,
    color: '#5D4A1A',
    lineHeight: 21,
    marginBottom: 6,
  },
  contactSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DADDE2',
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  contactText: {
    fontSize: 16,
    color: '#1a1a2e',
    lineHeight: 22,
    fontWeight: '600',
  },
  contactMail: {
    fontSize: 16,
    color: '#0066CC',
    lineHeight: 24,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  contactHint: {
    fontSize: 15,
    color: '#555',
    lineHeight: 21,
    marginTop: 6,
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
  // Dev-Mode Styles
  devSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FF9800',
    borderStyle: 'dashed',
  },
  devSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 6,
  },
  devSectionInfo: {
    fontSize: 14,
    color: '#BF360C',
    marginBottom: 12,
    lineHeight: 20,
  },
  devButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  devButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFB74D',
    minHeight: 48,
    justifyContent: 'center',
  },
  devButtonActive: {
    backgroundColor: '#FF9800',
    borderColor: '#E65100',
  },
  devButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  devStatusText: {
    fontSize: 14,
    color: '#E65100',
    fontWeight: '600',
    textAlign: 'center',
  },
});
