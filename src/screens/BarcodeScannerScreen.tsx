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
import { lookupPzn } from '../services/PznLookupService';

type Props = NativeStackScreenProps<RootStackParamList, 'BarcodeScanner'>;

export default function BarcodeScannerScreen({ navigation }: Props) {
  const [pznInput, setPznInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<string | null>(null);

  const handleUebernehmen = async () => {
    const trimmed = pznInput.trim();
    if (!trimmed) {
      Alert.alert('Leer', 'Bitte gib eine PZN oder Barcode ein.');
      return;
    }

    // Premium-Gate: Barcode-Scan-Limit pruefen
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
        'Pruefziffer falsch',
        'Die eingegebene PZN scheint ungueltig zu sein. Trotzdem uebernehmen?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Trotzdem uebernehmen',
            onPress: () => {
              navigation.navigate('AddMedikament', { scannedPZN: trimmed });
            },
          },
        ]
      );
      return;
    }

    // PZN-Lookup: Versuche den Medikamentennamen herauszufinden
    setIsLookingUp(true);
    setLookupResult(null);
    try {
      const result = await lookupPzn(trimmed);
      setIsLookingUp(false);

      if (result.found && result.name) {
        setLookupResult(result.name);
        // Automatisch zum AddMedikament-Screen weiterleiten mit Name + PZN
        Alert.alert(
          'Medikament erkannt',
          `${result.name}${result.hersteller ? '\nHersteller: ' + result.hersteller : ''}${result.darreichungsform ? '\nForm: ' + result.darreichungsform : ''}`,
          [
            {
              text: 'Uebernehmen',
              onPress: () => {
                navigation.navigate('AddMedikament', {
                  scannedPZN: trimmed,
                  suggestedName: result.name,
                });
              },
            },
            {
              text: 'Aendern',
              style: 'cancel',
              onPress: () => {
                navigation.navigate('AddMedikament', {
                  scannedPZN: trimmed,
                });
              },
            },
          ]
        );
      } else {
        // PZN nicht gefunden – normal weiter ohne Name
        navigation.navigate('AddMedikament', { scannedPZN: trimmed });
      }
    } catch {
      setIsLookingUp(false);
      // Fallback: ohne Lookup weiter
      navigation.navigate('AddMedikament', { scannedPZN: trimmed });
    }
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
          style={[
            styles.uebernehmenButton,
            isLookingUp && styles.uebernehmenButtonDisabled,
          ]}
          onPress={handleUebernehmen}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isLookingUp ? 'Suche Medikament...' : 'PZN uebernehmen'}
          disabled={isLookingUp}
        >
          <Text style={styles.uebernehmenButtonText}>
            {isLookingUp ? 'Suche Medikament...' : 'Uebernehmen'}
          </Text>
        </TouchableOpacity>

        {lookupResult && !isLookingUp && (
          <View style={styles.lookupResult}>
            <Text style={styles.lookupResultLabel}>Gefunden:</Text>
            <Text style={styles.lookupResultName}>{lookupResult}</Text>
          </View>
        )}
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
  uebernehmenButtonDisabled: {
    backgroundColor: '#95e6b5',
  },
  uebernehmenButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  lookupResult: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#e8f8e8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27ae60',
  },
  lookupResultLabel: {
    fontSize: 16,
    color: '#27ae60',
    fontWeight: '600',
    marginBottom: 4,
  },
  lookupResultName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
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
