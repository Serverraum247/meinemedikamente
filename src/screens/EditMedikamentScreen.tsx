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
        sync_status: 1, // Änderung ausstehend
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
});
