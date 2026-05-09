/**
 * BarcodeScannerScreen.tsx – Kamera-Barcode-Scanner + manuelle PZN-Eingabe
 *
 * Nutzt react-native-camera-kit für native Kamera-Barcode-Erkennung.
 * Senioren-freundlich: Großer Kamera-View, automatische Erkennung,
 * Fallback auf manuelle Eingabe per Tab.
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
  ActivityIndicator,
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { normalizePzn, validatePZN } from '../services/BarcodeScannerService';
import { canScanBarcode, recordBarcodeScan } from '../services/PremiumService';
import { lookupPzn } from '../services/PznLookupService';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';

type Props = NativeStackScreenProps<RootStackParamList, 'BarcodeScanner'>;

type TabMode = 'kamera' | 'manuell';

export default function BarcodeScannerScreen({ navigation }: Props) {
  const [tab, setTab] = useState<TabMode>('kamera');
  const [pznInput, setPznInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  // Barcode vom Kamera-Scanner verarbeiten
  const onBarcodeScanned = async (event: any) => {
    if (hasScanned) return; // Debounce: nur ein Scan pro Aktion

    const barcode = event.nativeEvent?.codeStringValue ?? '';
    if (!barcode) return;

    const scannedPzn = normalizePzn(barcode);
    if (!scannedPzn) return;

    setHasScanned(true);

    // Premium-Gate
    const { allowed } = await canScanBarcode();
    if (!allowed) {
      showPremiumRequiredAlert('Mehr als 3 Barcode-Scans pro Tag sind nur mit Premium möglich.', navigation);
      setHasScanned(false);
      return;
    }
    await recordBarcodeScan();

    await processPzn(scannedPzn);
  };

  // PZN verarbeiten (Lookup + Navigation)
  const processPzn = async (pzn: string) => {
    setIsLookingUp(true);
    setLookupResult(null);
    try {
      const result = await lookupPzn(pzn);
      setIsLookingUp(false);

      if (result.found && result.name) {
        setLookupResult(result.name);
        Alert.alert(
          'Medikament erkannt',
          `${result.name}${result.hersteller ? '\nHersteller: ' + result.hersteller : ''}${result.darreichungsform ? '\nForm: ' + result.darreichungsform : ''}`,
          [
            {
              text: 'Übernehmen',
              onPress: () => {
                navigation.navigate('AddMedikament', {
                  scannedPZN: pzn,
                  suggestedName: result.name,
                });
              },
            },
            {
              text: 'Ändern',
              style: 'cancel',
              onPress: () => {
                navigation.navigate('AddMedikament', { scannedPZN: pzn });
              },
            },
          ]
        );
      } else {
        navigation.navigate('AddMedikament', { scannedPZN: pzn });
      }
    } catch {
      setIsLookingUp(false);
      navigation.navigate('AddMedikament', { scannedPZN: pzn });
    }
  };

  // Manuelle Eingabe
  const handleUebernehmen = async () => {
    const trimmed = pznInput.trim();
    const normalized = normalizePzn(trimmed) || trimmed;
    if (!trimmed) {
      Alert.alert('Leer', 'Bitte gib eine PZN oder Barcode ein.');
      return;
    }

    const { allowed } = await canScanBarcode();
    if (!allowed) {
      showPremiumRequiredAlert('Mehr als 3 Barcode-Scans pro Tag sind nur mit Premium möglich.', navigation);
      return;
    }
    await recordBarcodeScan();

    if (/^\d{7,8}$/.test(normalized) && !validatePZN(normalized)) {
      Alert.alert(
        'Prüfziffer falsch',
        'Die eingegebene PZN scheint ungültig zu sein. Trotzdem übernehmen?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Trotzdem übernehmen',
            onPress: () => processPzn(normalized),
          },
        ]
      );
      return;
    }

    await processPzn(normalized);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📷</Text>
        <Text style={styles.headerText} accessibilityRole="header">
          {tab === 'kamera' ? 'Barcode scannen' : 'Barcode / PZN eingeben'}
        </Text>
      </View>

      {/* Tab-Umschalter */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'kamera' && styles.tabActive]}
          onPress={() => setTab('kamera')}
          accessibilityRole="button"
          accessibilityLabel="Kamera-Scanner"
        >
          <Text style={[styles.tabText, tab === 'kamera' && styles.tabTextActive]}>
            📷 Kamera
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'manuell' && styles.tabActive]}
          onPress={() => setTab('manuell')}
          accessibilityRole="button"
          accessibilityLabel="Manuelle Eingabe"
        >
          <Text style={[styles.tabText, tab === 'manuell' && styles.tabTextActive]}>
            ✏️ Manuell
          </Text>
        </TouchableOpacity>
      </View>

      {/* Kamera-Modus */}
      {tab === 'kamera' && (
        <View style={styles.cameraContainer}>
          <Camera
            scanBarcode={true}
            onReadCode={onBarcodeScanned}
            showFrame={true}
            laserColor="#27ae60"
            frameColor="#FFFFFF"
            style={styles.camera}
          />
          <View style={styles.scanHint}>
            <Text style={styles.scanHintText}>
              Halte den Barcode vor die Kamera
            </Text>
          </View>
          {isLookingUp && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#27ae60" />
              <Text style={styles.loadingText}>Suche Medikament...</Text>
            </View>
          )}
        </View>
      )}

      {/* Manueller Modus */}
      {tab === 'manuell' && (
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
            accessibilityLabel={isLookingUp ? 'Suche Medikament...' : 'PZN übernehmen'}
            disabled={isLookingUp}
          >
            {isLookingUp ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.uebernehmenButtonText}>Übernehmen</Text>
            )}
          </TouchableOpacity>

          {lookupResult && !isLookingUp && (
            <View style={styles.lookupResult}>
              <Text style={styles.lookupResultLabel}>Gefunden:</Text>
              <Text style={styles.lookupResultName}>{lookupResult}</Text>
            </View>
          )}
        </View>
      )}

      {/* Abbrechen-Button */}
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
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  headerIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  headerText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e6',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#e8e8e6',
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 3,
    borderBottomColor: '#27ae60',
  },
  tabText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#888',
  },
  tabTextActive: {
    color: '#1a1a2e',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  scanHint: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanHintText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#27ae60',
    marginTop: 12,
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
