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
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMedikamente } from '../context/MedikamentContext';
import { MedikamentRow } from '../database/Database';
import { parseDeFloat } from '../utils/FloatUtils';
import { Switch } from 'react-native';

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
  const [einnahmeUhrzeiten, setEinnahmeUhrzeiten] = useState<string[]>([]);
  const [autoAbzugAktiv, setAutoAbzugAktiv] = useState(false);
  const [neueUhrzeit, setNeueUhrzeit] = useState('');

  // Medikament-Daten laden
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
        const uhrzeiten = JSON.parse(found.einnahme_uhrzeiten || '[]');
        setEinnahmeUhrzeiten(Array.isArray(uhrzeiten) ? uhrzeiten : []);
      } catch { setEinnahmeUhrzeiten([]); }
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
      Alert.alert('Ungültig', 'Einzeldosis muss groesser als 0 sein.');
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
        einnahme_uhrzeiten: JSON.stringify(einnahmeUhrzeiten),
        auto_abzug_aktiv: autoAbzugAktiv ? 1 : 0,
      });

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
          <Text style={styles.label}>Packungsgroesse</Text>
          <TextInput
            style={styles.input}
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
            value={pzn}
            onChangeText={setPzn}
            placeholder="Optional"
            placeholderTextColor="#999"
            keyboardType="number-pad"
          />
        </View>

        {/* === ABSCHNITT: Erinnerung === */}
        <Text style={styles.sectionTitle}>Erinnerung</Text>

        <View style={styles.switchRow}>
          <Text style={styles.label}>Erinnerung aktivieren</Text>
          <Switch
            value={erinnerungAktiv}
            onValueChange={setErinnerungAktiv}
            trackColor={{ false: '#ccc', true: '#1a1a2e' }}
            thumbColor={erinnerungAktiv ? '#fff' : '#f4f4f4'}
            style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
          />
        </View>

        {erinnerungAktiv && (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Einnahme-Uhrzeiten</Text>
              {einnahmeUhrzeiten.map((uhrzeit, idx) => (
                <View key={idx} style={styles.uhrzeitRow}>
                  <Text style={styles.uhrzeitText}>{uhrzeit} Uhr</Text>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => setEinnahmeUhrzeiten(prev => prev.filter((_, i) => i !== idx))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {einnahmeUhrzeiten.length < 5 && (
                <View style={styles.addUhrzeitRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={neueUhrzeit}
                    onChangeText={setNeueUhrzeit}
                    placeholder="z.B. 20:00"
                    placeholderTextColor="#999"
                    keyboardType="numbers-and-punctuation"
                  />
                  <TouchableOpacity
                    style={styles.addUhrzeitButton}
                    onPress={() => {
                      const trimmed = neueUhrzeit.trim();
                      if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
                        setEinnahmeUhrzeiten(prev => [...prev, trimmed]);
                        setNeueUhrzeit('');
                      } else {
                        Alert.alert('Ungültig', 'Bitte im Format HH:MM eingeben, z.B. 08:00');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addUhrzeitText}>+ Hinzufügen</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Automatischer Abzug</Text>
                <Text style={styles.hint}>Bestand wird bei jeder Erinnerung automatisch reduziert</Text>
              </View>
              <Switch
                value={autoAbzugAktiv}
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
  uhrzeitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  uhrzeitText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  removeButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontSize: 22,
    color: '#cc3333',
  },
  addUhrzeitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  addUhrzeitButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
    justifyContent: 'center',
  },
  addUhrzeitText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});
