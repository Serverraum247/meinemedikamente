/**
 * BarcodeScannerScreen.tsx – Barcode/PZN-Scanner
 *
 * Aktuell: Manuelle PZN-Eingabe mit Hinweis auf kommenden Scanner.
 * Geplant: react-native-vision-camera + vision-camera-code-scanner
 *          für native Kamera-Integration (Phase 3.1).
 *
 * Der Screen wird vom AddMedikamentScreen aufgerufen und gibt
 * die gescannte/eingegebene PZN per Navigation-Param zurück.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { validatePZN } from '../services/BarcodeScannerService';
import { canScanBarcode, recordBarcodeScan } from '../services/PremiumService';

type Props = NativeStackScreenProps<RootStackParamList, 'BarcodeScanner'>;

export default function BarcodeScannerScreen({ navigation }: Props) {
  const [pznInput, setPznInput] = useState('');

  const handleUebernehmen = async () => {
    const trimmed = pznInput.trim();
    if (!trimmed) {
      Alert.alert('Leer', 'Bitte gib eine PZN oder Barcode ein.');
      return;
    }

    // Premium-Gate: Barcode-Scan-Limit prüfen
    const { allowed } = await canScanBarcode();
    if (!allowed) {
      Alert.alert(
        'Premium erforderlich',
        'Du hast bereits 3 Barcodes heute gescannt. Premium = unbegrenzt Scans.',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Premium', onPress: () => navigation.navigate('Premium') },
        ]
      );
      return;
    }
    await recordBarcodeScan();

    // PZN-Validierung (optional – nur Hinweis)
    if (/^\d{7,8}$/.test(trimmed) && !validatePZN(trimmed)) {
      Alert.alert(
        'Prüfziffer falsch',
        'Die eingegebene PZN scheint ungültig zu sein. Trotzdem übernehmen?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Trotzdem übernehmen',
            onPress: () => {
              navigation.navigate('AddMedikament', { scannedPZN: trimmed });
            },
          },
        ]
      );
      return;
    }

    navigation.navigate('AddMedikament', { scannedPZN: trimmed });
  };

  return (
    <SafeAreaView style={styles.container}>
        <View style={styles.header}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.headerIcon}>📷</Text>
          <Text style={styles.headerText} accessibilityRole="header">Barcode / PZN eingeben</Text>
        <Text style={styles.headerSubtext}>
          Kamera-Scanner folgt in einem kommenden Update
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>PZN oder Barcode</Text>
          <TextInput
            style={styles.input}
            value={pznInput}
            onChangeText={setPznInput}
            placeholder="z.B. 12345678"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            accessibilityLabel="PZN oder Barcode eingeben"
            autoFocus
          />
          <Text style={styles.hint}>
            Die Nummer steht auf der Medikamentenpackung
          </Text>
        </View>

        <TouchableOpacity
          style={styles.uebernehmenButton}
          onPress={handleUebernehmen}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="PZN übernehmen"
        >
          <Text style={styles.uebernehmenButtonText}>Übernehmen</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Abbrechen"
      >
        <Text style={styles.cancelButtonText}>Abbrechen</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f6',
  },
  header: {
    padding: 28,
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  headerText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSubtext: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 24,
  },
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
    fontSize: 28,
    color: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#ccc',
    minHeight: 64,
    textAlign: 'center',
  },
  hint: {
    fontSize: 18,
    color: '#777',
    marginTop: 8,
    textAlign: 'center',
  },
  uebernehmenButton: {
    backgroundColor: '#27ae60',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
  },
  uebernehmenButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelButton: {
    backgroundColor: '#e74c3c',
    padding: 20,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
