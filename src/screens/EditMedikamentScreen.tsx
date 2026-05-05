/**
 * EditMedikamentScreen.tsx – Bestehendes Medikament bearbeiten
 *
 * Alle Zahlenfelder unterstuetzen Float (halbe Tabletten = 0.5).
 * Senioren-freundlich: Groesse Eingabefelder, klare Labels, Zurück-Button.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
  Switch,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMedikamente } from '../context/MedikamentContext';
import { MedikamentRow } from '../database/Database';
import { parseDeFloat } from '../utils/FloatUtils';
import { announceChange } from '../utils/AccessibilityHelpers';
import {
  EinnahmeSlot,
  TageszeitSlot,
  SLOT_META,
  SLOT_REIHENFOLGE,
  toggleSlot,
  setSlotDosis,
  serializeEinnahmeplan,
  parseEinnahmeplan,
  getAllDefaultUhrzeiten,
} from '../utils/Einnahmeplan';

type Props = NativeStackScreenProps<RootStackParamList, 'EditMedikament'>;

export default function EditMedikamentScreen({ route, navigation }: Props) {
  const { medikamentId } = route.params;
  const { medikamente, bearbeiteMedikament } = useMedikamente();

  const [medikament, setMedikament] = useState<MedikamentRow | null>(null);

  const [name, setName] = useState('');
  const [bestand, setBestand] = useState('');
  const [einzeldosis, setEinzeldosis] = useState('');
  const [einheit, setEinheit] = useState('Tabletten');
  const [pzn, setPzn] = useState('');
  const [packungsgroesse, setPackungsgroesse] = useState('');
  const [warnungAb, setWarnungAb] = useState('');
  // Erinnerung & Auto-Abzug
  const [erinnerungAktiv, setErinnerungAktiv] = useState(false);
  const [einnahmePlan, setEinnahmePlan] = useState<EinnahmeSlot[]>([]);
  const [defaultUhrzeiten, setDefaultUhrzeiten] = useState<Record<TageszeitSlot, string>>({
    morgens: '08:00', mittags: '12:00', abends: '18:00', nachts: '22:00',
  });
  const [autoAbzugAktiv, setAutoAbzugAktiv] = useState(false);

  // Medikament-Daten laden

  // Default-Uhrzeiten aus Einstellungen laden
  useEffect(() => {
    (async () => {
      const stored = await getAllDefaultUhrzeiten();
      setDefaultUhrzeiten(stored);
    })();
  }, []);
  useEffect(() => {
    const found = medikamente.find(m => m.id === medikamentId);
    if (found) {
      setMedikament(found);
      setName(found.name);
      setBestand(String(found.aktueller_bestand));
      setEinzeldosis(String(found.einzeldosis));
      setEinheit(found.einheit);
      setPzn(found.pzn);
      setPackungsgroesse(String(found.packungsgroesse));
      setWarnungAb(String(found.warnung_ab_bestand));
      setErinnerungAktiv(found.erinnerung_aktiv === 1);
      try {
        const plan = parseEinnahmeplan(found.einnahme_uhrzeiten || '[]');
        setEinnahmePlan(plan);
      } catch { setEinnahmePlan([]); }
      setAutoAbzugAktiv(found.auto_abzug_aktiv === 1);
      navigation.setOptions({ title: found.name + ' bearbeiten' });
    }
  }, [medikamente, medikamentId, navigation]);

  const handleSave = async () => {
    if (!medikament) return;

    if (!name.trim()) {
      Alert.alert('Pflichtfeld', 'Bitte gib den Namen ein.');
      return;
    }

    const bestandFloat = parseDeFloat(bestand);
    const dosisFloat = parseDeFloat(einzeldosis);
    const packungsFloat = parseDeFloat(packungsgroesse);
    const warnungFloat = parseDeFloat(warnungAb);

    if (isNaN(bestandFloat) || bestandFloat < 0) {
      Alert.alert('Ungültig', 'Bestand muss eine gueltige Zahl >= 0 sein.');
      return;
    }
    if (isNaN(dosisFloat) || dosisFloat <= 0) {
      Alert.alert('Ungültig', 'Einzeldosis muss größer als 0 sein.');
      return;
    }

    try {
      await bearbeiteMedikament(medikament.id, {
        name: name.trim(),
        aktueller_bestand: bestandFloat,
        einzeldosis: dosisFloat,
        einheit,
        pzn: pzn.trim(),
        packungsgroesse: isNaN(packungsFloat) ? 0 : packungsFloat,
        warnung_ab_bestand: isNaN(warnungFloat) ? 7 : warnungFloat,
        sync_status: 1,
        erinnerung_aktiv: erinnerungAktiv ? 1 : 0,
        einnahme_uhrzeiten: serializeEinnahmeplan(einnahmePlan),
        auto_abzug_aktiv: autoAbzugAktiv ? 1 : 0,
      });

      announceChange('Änderungen wurden gespeichert');
      Alert.alert(
        'Gespeichert',
        `"${name.trim()}" wurde aktualisiert.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Fehler', 'Änderung konnte nicht gespeichert werden.');
      console.error(error);
    }
  };

  if (!medikament) {
    return (
      <View style={styles.center}>
        <Text>Lade Medikament...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Name des Medikaments *</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Name des Medikaments"
            value={name}
            onChangeText={setName}
            placeholder="z.B. Aspirin"
            placeholderTextColor="#999"
          />
        </View>

        {/* Bestand */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Aktueller Bestand</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Aktueller Bestand"
            value={bestand}
            onChangeText={setBestand}
            placeholder="z.B. 28.5"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>Halbe Tabletten als 0.5 eingeben</Text>
        </View>

        {/* Einzeldosis */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Einzeldosis *</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Einzeldosis"
            value={einzeldosis}
            onChangeText={setEinzeldosis}
            placeholder="z.B. 0.5"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Einheit */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Einheit</Text>
          <View style={styles.einheitRow}>
            {['Tabletten', 'Kapseln', 'Tropfen', 'Stueck'].map(e => (
              <TouchableOpacity
                key={e}
                style={[styles.einheitButton, einheit === e && styles.einheitActive]}
                onPress={() => setEinheit(e)}
                activeOpacity={0.7}
              >
                <Text style={[styles.einheitText, einheit === e && styles.einheitTextActive]}>
                  {e}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Packungsgroesse */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Packungsgröße</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Packungsgröße"
            value={packungsgroesse}
            onChangeText={setPackungsgroesse}
            placeholder="z.B. 50"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Warnung ab */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Warnung ab Bestand</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Warnung ab Bestand"
            value={warnungAb}
            onChangeText={setWarnungAb}
            placeholder="z.B. 7"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
          />
        </View>

        {/* PZN */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>PZN / Barcode</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="PZN / Barcode"
            value={pzn}
            onChangeText={setPzn}
            placeholder="Optional"
            placeholderTextColor="#999"
            keyboardType="number-pad"
          />
        </View>

        {/* === ABSCHNITT: Erinnerung === */}
        <Text style={styles.sectionTitle} accessibilityRole="header">Erinnerung</Text>

        <View style={styles.switchRow}>
          <Text style={styles.label}>Erinnerung aktivieren</Text>
          <Switch
            value={erinnerungAktiv}
            accessibilityRole="switch"
            accessibilityLabel="Erinnerung aktivieren"
            accessibilityState={{ checked: erinnerungAktiv }}
            onValueChange={setErinnerungAktiv}
            trackColor={{ false: '#ccc', true: '#1a1a2e' }}
            thumbColor={erinnerungAktiv ? '#fff' : '#f4f4f4'}
            style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
          />
        </View>

        {erinnerungAktiv && (
          <>
            {/* Tageszeit-Auswahl */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Wann wird das Medikament eingenommen?</Text>
              <Text style={styles.hint}>Alle aktiven Tageszeiten antippen</Text>

              {SLOT_REIHENFOLGE.map(slot => {
                const meta = SLOT_META[slot];
                const isActive = einnahmePlan.some(s => s.slot === slot);
                const eintrag = einnahmePlan.find(s => s.slot === slot);

                return (
                  <View key={slot} style={styles.tageszeitRow}>
                    <TouchableOpacity
                      style={[styles.tageszeitButton, isActive && styles.tageszeitButtonActive]}
                      accessibilityRole="switch"
                      accessibilityLabel={`${meta.label} ${isActive ? 'aktiv' : 'inaktiv'}`}
                      accessibilityState={{ checked: isActive }}
                      onPress={async () => {
                        const newPlan = await toggleSlot(einnahmePlan, slot);
                        setEinnahmePlan(newPlan);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.tageszeitEmoji} accessibilityElementsHidden>{meta.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tageszeitLabel, isActive && styles.tageszeitLabelActive]}>
                          {meta.label}
                        </Text>
                        <Text style={styles.tageszeitUhrzeit}>{defaultUhrzeiten[slot]} Uhr</Text>
                      </View>
                      <Text style={[styles.tageszeitCheck, isActive && styles.tageszeitCheckActive]}>
                        {isActive ? '✓' : '○'}
                      </Text>
                    </TouchableOpacity>

                    {isActive && (
                      <View style={styles.slotDosisRow}>
                        <Text style={styles.slotDosisLabel}>Dosis:</Text>
                        <TextInput
                          style={styles.slotDosisInput}
                          accessibilityLabel={`Dosis für ${meta.label}`}
                          value={eintrag?.dosis !== undefined ? String(eintrag.dosis) : ''}
                          onChangeText={text => {
                            const val = parseDeFloat(text);
                            if (!isNaN(val) || text === '' || text === ',' || text === '.') {
                              setEinnahmePlan(prev =>
                                setSlotDosis(prev, slot, text === '' ? undefined : val)
                              );
                            }
                          }}
                          placeholder={`${einzeldosis} (Standard)`}
                          placeholderTextColor="#999"
                          keyboardType="decimal-pad"
                        />
                        <Text style={styles.slotDosisEinheit}>{einheit}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {einnahmePlan.length > 0 && (
              <View style={styles.tagesdosisBox}>
                <Text style={styles.tagesdosisLabel}>
                  Tagesdosis gesamt: {(() => {
                    const dosis = parseDeFloat(einzeldosis) || 1;
                    const total = einnahmePlan.reduce((sum, s) =>
                      sum + (s.dosis !== undefined ? s.dosis : dosis), 0);
                    return Math.round(total * 1e10) / 1e10;
                  })()} {einheit}
                </Text>
              </View>
            )}

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Automatischer Abzug</Text>
                <Text style={styles.hint}>Bestand wird bei jeder Erinnerung automatisch reduziert</Text>
              </View>
              <Switch
                value={autoAbzugAktiv}
                accessibilityRole="switch"
                accessibilityLabel="Automatischer Bestandsabzug"
                accessibilityState={{ checked: autoAbzugAktiv }}
                onValueChange={setAutoAbzugAktiv}
                trackColor={{ false: '#ccc', true: '#1a1a2e' }}
                thumbColor={autoAbzugAktiv ? '#fff' : '#f4f4f4'}
                style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
              />
            </View>
          </>
        )}

        {/* Speichern */}
        <TouchableOpacity
          style={styles.saveButton}
          accessibilityLabel="Änderungen speichern"
          accessibilityRole="button"
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>Änderungen speichern</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 52,
  },
  hint: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  einheitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  einheitButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 48,
    justifyContent: 'center',
  },
  einheitActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  einheitText: {
    fontSize: 16,
    color: '#555',
  },
  einheitTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#f39c12',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 56,
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Abschnitts-Ueberschrift
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    marginTop: 16,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#1a1a2e',
  },

  // Erinnerung-Styles
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingVertical: 8,
  },

  // Tageszeit-Toggle
  tageszeitRow: { marginBottom: 12 },
  tageszeitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 3,
    borderColor: '#ddd',
    minHeight: 68,
  },
  tageszeitButtonActive: {
    borderColor: '#1a1a2e',
    backgroundColor: '#f0f0ee',
  },
  tageszeitEmoji: { fontSize: 32, marginRight: 14 },
  tageszeitLabel: { fontSize: 22, fontWeight: '600', color: '#888' },
  tageszeitLabelActive: { color: '#1a1a2e' },
  tageszeitUhrzeit: { fontSize: 16, color: '#999' },
  tageszeitCheck: { fontSize: 28, color: '#ccc' },
  tageszeitCheckActive: { color: '#27ae60' },

  // Individuelle Dosis pro Slot
  slotDosisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 56,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 8,
  },
  slotDosisLabel: { fontSize: 18, color: '#666' },
  slotDosisInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 20,
    color: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#ccc',
    minHeight: 48,
  },
  slotDosisEinheit: { fontSize: 16, color: '#888' },

  // Tagesdosis-Vorschau
  tagesdosisBox: {
    backgroundColor: '#eaf2f8',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  tagesdosisLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
    textAlign: 'center',
  },
});
