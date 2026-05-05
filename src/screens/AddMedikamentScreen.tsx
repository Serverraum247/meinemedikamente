/**
 * AddMedikamentScreen.tsx – Neues Medikament anlegen
 *
 * Senioren-optimiert: Ein-Spalten-Layout, sehr große Textfelder,
 * klare Abschnitte, 44x44+ Touch-Ziele, WCAG AA Kontrast.
 *
 * Alle Zahlenfelder unterstuetzen Float (halbe Tabletten = 0.5).
 */

import React, { useState } from 'react';
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
import { parseDeFloat } from '../utils/FloatUtils';
import { Switch, Platform } from 'react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'AddMedikament'>;

export default function AddMedikamentScreen({ navigation, route }: Props) {
  const { addMedikament } = useMedikamente();

  const [name, setName] = useState('');
  const [bestand, setBestand] = useState('');
  const [einzeldosis, setEinzeldosis] = useState('1');
  const [einheit, setEinheit] = useState('Tabletten');
  const [pzn, setPzn] = useState('');
  const [packungsgroesse, setPackungsgroesse] = useState('');
  const [warnungAb, setWarnungAb] = useState('7');
  // Erinnerung & Auto-Abzug
  const [erinnerungAktiv, setErinnerungAktiv] = useState(false);
  const [einnahmeUhrzeiten, setEinnahmeUhrzeiten] = useState<string[]>(['08:00']);
  const [autoAbzugAktiv, setAutoAbzugAktiv] = useState(false);
  const [neueUhrzeit, setNeueUhrzeit] = useState('');

  // Gescannte PZN aus BarcodeScanner übernehmen
  React.useEffect(() => {
    const scannedPZN = route.params?.scannedPZN;
    if (scannedPZN && !pzn) {
      setPzn(scannedPZN);
    }
  }, [route.params?.scannedPZN]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Pflichtfeld', 'Bitte gib den Namen des Medikaments ein.');
      return;
    }

    const bestandFloat = parseDeFloat(bestand) || 0;
    const dosisFloat = parseDeFloat(einzeldosis) || 1;
    const packungsFloat = parseDeFloat(packungsgroesse) || 0;
    const warnungFloat = parseDeFloat(warnungAb) || 7;

    if (bestandFloat < 0) {
      Alert.alert('Ungültig', 'Bestand darf nicht negativ sein.');
      return;
    }
    if (dosisFloat <= 0) {
      Alert.alert('Ungültig', 'Einzeldosis muss groesser als 0 sein.');
      return;
    }

    try {
      const id = generateUUID();
      await addMedikament({
        id,
        name: name.trim(),
        aktueller_bestand: bestandFloat,
        einzeldosis: dosisFloat,
        einheit,
        pzn: pzn.trim(),
        packungsgroesse: packungsFloat,
        warnung_ab_bestand: warnungFloat,
        sync_status: 0,
        erinnerung_aktiv: erinnerungAktiv ? 1 : 0,
        einnahme_uhrzeiten: JSON.stringify(einnahmeUhrzeiten),
        auto_abzug_aktiv: autoAbzugAktiv ? 1 : 0,
      });

      Alert.alert(
        'Gespeichert',
        `"${name.trim()}" wurde hinzugefuegt.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Fehler', 'Medikament konnte nicht gespeichert werden.');
      console.error(error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* === ABSCHNITT: Medikament === */}
        <Text style={styles.sectionTitle}>Medikament</Text>

        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Name des Medikaments *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="z.B. Aspirin 100"
            placeholderTextColor="#999"
            autoFocus
          />
        </View>

        {/* PZN / Barcode */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>PZN / Barcode</Text>
          <View style={styles.pznRow}>
            <TextInput
              style={[styles.input, styles.pznInput]}
              value={pzn}
              onChangeText={setPzn}
              placeholder="Optional"
              placeholderTextColor="#999"
              keyboardType="number-pad"
            />
            {/* Scanner-Button – wird in Phase 3 aktiviert */}
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => navigation.navigate('BarcodeScanner')}
              activeOpacity={0.7}
            >
              <Text style={styles.scanButtonText}>Scan</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* === ABSCHNITT: Dosierung === */}
        <Text style={styles.sectionTitle}>Dosierung</Text>

        {/* Einzeldosis */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Einzeldosis *</Text>
          <TextInput
            style={styles.input}
            value={einzeldosis}
            onChangeText={setEinzeldosis}
            placeholder="z.B. 0,5 für halbe Tablette"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>Halbe Tabletten als 0.5 eingeben</Text>
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

        {/* === ABSCHNITT: Bestand === */}
        <Text style={styles.sectionTitle}>Bestand</Text>

        {/* Aktueller Bestand */}
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
          <Text style={styles.hint}>Warnung wenn Bestand darunter faellt</Text>
        </View>

        {/* === ABSCHNITT: Erinnerung === */}
        <Text style={styles.sectionTitle}>Erinnerung</Text>

        {/* Erinnerung aktivieren */}
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
            {/* Einnahme-Uhrzeiten */}
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

            {/* Auto-Abzug */}
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
          <Text style={styles.saveButtonText}>Medikament speichern</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- Styles (Senioren-optimiert) ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f6',
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },

  // Abschnitts-Ueberschriften
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
    marginTop: 16,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#1a1a2e',
  },

  // Feld-Gruppen
  fieldGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    fontSize: 24,
    color: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#ccc',
    minHeight: 64, // Große Touch-Ziele für Senioren
  },
  hint: {
    fontSize: 18,
    color: '#777',
    marginTop: 6,
  },

  // PZN mit Scanner-Button
  pznRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pznInput: {
    flex: 1,
  },
  scanButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    minWidth: 80,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Einheit-Auswahl
  einheitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  einheitButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: '#ccc',
    minHeight: 56, // 56px Touch-Ziel
    justifyContent: 'center',
    alignItems: 'center',
  },
  einheitActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  einheitText: {
    fontSize: 20,
    color: '#555',
  },
  einheitTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Speichern-Button
  saveButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    marginTop: 16,
    minHeight: 64,
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
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
