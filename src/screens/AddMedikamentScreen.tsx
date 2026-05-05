/**
 * AddMedikamentScreen.tsx – Neues Medikament anlegen
 *
 * Alle Zahlenfelder unterstützen Float-Eingabe (für halbe Tabletten).
 * Senioren-freundlich: Große Eingabefelder, klare Labels.
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

type Props = NativeStackScreenProps<RootStackParamList, 'AddMedikament'>;

export default function AddMedikamentScreen({ navigation }: Props) {
  const { addMedikament } = useMedikamente();

  const [name, setName] = useState('');
  const [bestand, setBestand] = useState('');
  const [einzeldosis, setEinzeldosis] = useState('1');
  const [einheit, setEinheit] = useState('Tabletten');
  const [pzn, setPzn] = useState('');
  const [packungsgroesse, setPackungsgroesse] = useState('');
  const [warnungAb, setWarnungAb] = useState('7');

  const handleSave = async () => {
    // Validierung
    if (!name.trim()) {
      Alert.alert('Pflichtfeld', 'Bitte gib den Namen des Medikaments ein.');
      return;
    }

    const bestandFloat = parseFloat(bestand) || 0;
    const dosisFloat = parseFloat(einzeldosis) || 1;
    const packungsFloat = parseFloat(packungsgroesse) || 0;
    const warnungFloat = parseFloat(warnungAb) || 7;

    if (bestandFloat < 0) {
      Alert.alert('Ungültig', 'Bestand darf nicht negativ sein.');
      return;
    }

    if (dosisFloat <= 0) {
      Alert.alert('Ungültig', 'Einzeldosis muss größer als 0 sein.');
      return;
    }

    try {
      const id = generateUUID();
      await addMedikament({
        id,
        name: name.trim(),
        aktueller_bestand: bestandFloat,  // Float: z.B. 28.5
        einzeldosis: dosisFloat,          // Float: z.B. 0.5
        einheit,
        pzn: pzn.trim(),
        packungsgroesse: packungsFloat,   // Float
        warnung_ab_bestand: warnungFloat, // Float
      });

      Alert.alert(
        'Gespeichert ✓',
        `"${name.trim()}" wurde hinzugefügt.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Fehler', 'Medikament konnte nicht gespeichert werden.');
      console.error(error);
    }
  };

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
            autoFocus
          />
        </View>

        {/* Bestand */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Aktueller Bestand</Text>
          <TextInput
            style={styles.input}
            value={bestand}
            onChangeText={setBestand}
            placeholder="z.B. 28.5 (für halbe Tabletten)"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>Tipp: Halbe Tabletten als 0.5 eingeben</Text>
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
            {['Tabletten', 'Kapseln', 'Tropfen', 'Stück'].map(e => (
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

        {/* Packungsgröße */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Packungsgröße</Text>
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
            placeholder="Optional – kann später gescannt werden"
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

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    // Mindesthöhe für Senioren
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
    // Min 44x44 Touch
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
    backgroundColor: '#1a1a2e',
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
