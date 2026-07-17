/**
 * BarcodeScannerScreen.tsx – Packungs-/PZN-Scan + manuelle PZN-Eingabe
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
  Alert,
  ActivityIndicator,
  NativeModules,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera } from 'react-native-camera-kit';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { normalizePzn, validatePZN } from '../services/BarcodeScannerService';
import { canScanBarcode, isPremium, recordBarcodeScan } from '../services/PremiumService';
import { lookupPzn } from '../services/PznLookupService';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';
import {
  buildMedicationScanSuggestion,
  type MedicationNativeScanResult,
  type MedicationScanSuggestion,
} from '../utils/MedicationScanSuggestions';

type Props = NativeStackScreenProps<RootStackParamList, 'BarcodeScanner'>;

type TabMode = 'kamera' | 'manuell';

const { MedicationVisionScanner } = NativeModules as {
  MedicationVisionScanner?: {
    scanMedicationPackage: () => Promise<MedicationNativeScanResult & { cancelled?: boolean }>;
  };
};

const { MedicationPackageScanner } = NativeModules as {
  MedicationPackageScanner?: {
    scanPackage: () => Promise<MedicationNativeScanResult & { cancelled?: boolean }>;
  };
};

export default function BarcodeScannerScreen({ route, navigation }: Props) {
  const [tab, setTab] = useState<TabMode>('kamera');
  const [pznInput, setPznInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [review, setReview] = useState<MedicationScanSuggestion | null>(null);
  const [reviewName, setReviewName] = useState('');
  const [reviewPzn, setReviewPzn] = useState('');
  const [reviewPackungsgroesse, setReviewPackungsgroesse] = useState('');
  const [reviewVerwendbarBis, setReviewVerwendbarBis] = useState('');
  const [reviewCharge, setReviewCharge] = useState('');
  const [reviewSeriennummer, setReviewSeriennummer] = useState('');
  const nativePackageScannerAvailable = Boolean(MedicationPackageScanner?.scanPackage);
  const appleVisionAvailable = Platform.OS === 'ios' && Boolean(MedicationVisionScanner?.scanMedicationPackage);
  const target = route.params?.target ?? 'add';

  // Barcode vom Kamera-Scanner verarbeiten. Auf iOS ergänzt Apple Vision zusätzlich OCR-Texte.
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
  const processPzn = async (pzn: string, scanSuggestion?: MedicationScanSuggestion) => {
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
                  suggestedActiveIngredient: scanSuggestion?.suggestedActiveIngredient,
                  suggestedStrengthValue: scanSuggestion?.suggestedStrengthValue,
                  suggestedStrengthUnit: scanSuggestion?.suggestedStrengthUnit,
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
        navigation.navigate('AddMedikament', {
          scannedPZN: pzn,
          suggestedName: scanSuggestion?.suggestedName,
          suggestedActiveIngredient: scanSuggestion?.suggestedActiveIngredient,
          suggestedStrengthValue: scanSuggestion?.suggestedStrengthValue,
          suggestedStrengthUnit: scanSuggestion?.suggestedStrengthUnit,
        });
      }
    } catch {
      setIsLookingUp(false);
      navigation.navigate('AddMedikament', {
        scannedPZN: pzn,
        suggestedName: scanSuggestion?.suggestedName,
        suggestedActiveIngredient: scanSuggestion?.suggestedActiveIngredient,
        suggestedStrengthValue: scanSuggestion?.suggestedStrengthValue,
        suggestedStrengthUnit: scanSuggestion?.suggestedStrengthUnit,
      });
    }
  };

  const handleAppleVisionScan = async () => {
    const scanner = MedicationPackageScanner?.scanPackage ?? MedicationVisionScanner?.scanMedicationPackage;
    if (!scanner) {
      Alert.alert('Nicht verfügbar', 'Der Packungs-Scan ist auf diesem Gerät nicht verfügbar.');
      return;
    }

    const premiumActive = await isPremium();
    if (!premiumActive) {
      showPremiumRequiredAlert('Packungsdaten wie Verfallsdatum, Charge und Seriennummer sind nur mit Premium möglich.', navigation);
      return;
    }

    setIsLookingUp(true);
    try {
      const nativeResult = await scanner();
      setIsLookingUp(false);
      if (nativeResult.cancelled) return;

      await recordBarcodeScan();
      const suggestion = buildMedicationScanSuggestion(nativeResult);

      if (hasAnyPackageSuggestion(suggestion)) {
        setReview(suggestion);
        setReviewName(suggestion.suggestedName || '');
        setReviewPzn(suggestion.scannedPZN || '');
        setReviewPackungsgroesse(suggestion.suggestedPackungsgroesse || '');
        setReviewVerwendbarBis(suggestion.scannedVerwendbarBis || '');
        setReviewCharge(suggestion.scannedCharge || '');
        setReviewSeriennummer(suggestion.scannedSeriennummer || '');
        return;
      }

      Alert.alert('Nichts erkannt', 'Es wurde kein Barcode und kein klarer Medikamentenname erkannt. Bitte versuche es erneut oder gib die PZN manuell ein.');
    } catch (error) {
      setIsLookingUp(false);
      Alert.alert('Scan nicht möglich', error instanceof Error ? error.message : 'Der Packungs-Scan konnte nicht gestartet werden.');
    }
  };

  const handleApplyReview = () => {
    if (!review) return;
    const params = {
      scannedPZN: reviewPzn.trim(),
      suggestedName: reviewName.trim(),
      suggestedActiveIngredient: review.suggestedActiveIngredient,
      suggestedStrengthValue: review.suggestedStrengthValue,
      suggestedStrengthUnit: review.suggestedStrengthUnit,
      scannedProduktCode: review.scannedProduktCode,
      scannedCharge: reviewCharge.trim(),
      scannedSeriennummer: reviewSeriennummer.trim(),
      scannedVerwendbarBis: reviewVerwendbarBis.trim(),
      suggestedPackungsgroesse: reviewPackungsgroesse.trim(),
    };

    if (target === 'nachkauf' && route.params?.medikamentId) {
      navigation.navigate('Nachkauf', {
        medikamentId: route.params.medikamentId,
        scannedPZN: params.scannedPZN,
        scannedProduktCode: params.scannedProduktCode,
        scannedCharge: params.scannedCharge,
        scannedSeriennummer: params.scannedSeriennummer,
        scannedVerwendbarBis: params.scannedVerwendbarBis,
        suggestedPackungsgroesse: params.suggestedPackungsgroesse,
      });
      return;
    }

    navigation.navigate('AddMedikament', params);
  };

  // Manuelle Eingabe
  const handleUebernehmen = async () => {
    const trimmed = pznInput.trim();
    const normalized = normalizePzn(trimmed) || trimmed;
    if (!trimmed) {
      Alert.alert('Leer', 'Bitte gib eine PZN ein.');
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
      {review ? (
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <ScrollView
          contentContainerStyle={styles.reviewContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <Text style={styles.reviewTitle} accessibilityRole="header">Bitte prüfen</Text>
          <Text style={styles.reviewIntro}>
            Die App hat Daten auf der Packung erkannt. Bitte kontrolliere alles vor dem Übernehmen.
          </Text>
          <ReviewInput label="Name" value={reviewName} onChangeText={setReviewName} placeholder="Nicht erkannt" />
          <ReviewInput label="PZN" value={reviewPzn} onChangeText={setReviewPzn} placeholder="Nicht erkannt" keyboardType="number-pad" />
          <ReviewInput label="Packungsgröße" value={reviewPackungsgroesse} onChangeText={setReviewPackungsgroesse} placeholder="Nicht erkannt" keyboardType="decimal-pad" />
          <ReviewInput label="Verwendbar bis" value={reviewVerwendbarBis} onChangeText={setReviewVerwendbarBis} placeholder="YYYY-MM-DD" />
          <ReviewInput label="Charge" value={reviewCharge} onChangeText={setReviewCharge} placeholder="Nicht erkannt" />
          <ReviewInput label="Seriennummer" value={reviewSeriennummer} onChangeText={setReviewSeriennummer} placeholder="Nicht erkannt" />
          <TouchableOpacity
            style={styles.appleVisionButton}
            onPress={handleApplyReview}
            accessibilityRole="button"
            accessibilityLabel="Vorschläge übernehmen"
          >
            <Text style={styles.appleVisionButtonText}>Übernehmen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setReview(null)}
            accessibilityRole="button"
            accessibilityLabel="Nochmal scannen"
          >
            <Text style={styles.secondaryButtonText}>Nochmal scannen</Text>
          </TouchableOpacity>
        </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📷</Text>
        <Text style={styles.headerText} accessibilityRole="header">
          {tab === 'kamera' ? 'Packung scannen' : 'PZN eingeben'}
        </Text>
      </View>

      {/* Tab-Umschalter */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'kamera' && styles.tabActive]}
          onPress={() => setTab('kamera')}
          accessibilityRole="button"
          accessibilityLabel="Packung per Kamera scannen"
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
          {nativePackageScannerAvailable || appleVisionAvailable ? (
            <View style={styles.appleVisionBox}>
              <Text style={styles.appleVisionTitle}>Packung scannen</Text>
              <Text style={styles.appleVisionText}>
                Premium erkennt DataMatrix, PZN, Text, Verfallsdatum und Charge als Vorschlag.
              </Text>
              <TouchableOpacity
                style={styles.appleVisionButton}
                onPress={handleAppleVisionScan}
                accessibilityRole="button"
                accessibilityLabel="Packung scannen starten"
                disabled={isLookingUp}
              >
                {isLookingUp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.appleVisionButtonText}>Scan starten</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <>
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
            </>
          )}
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
            <Text style={styles.label}>PZN eingeben</Text>
            <TextInput
              style={styles.input}
              value={pznInput}
              onChangeText={setPznInput}
              placeholder="z.B. 12345678"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              accessibilityLabel="PZN eingeben"
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
        </>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function hasAnyPackageSuggestion(suggestion: MedicationScanSuggestion): boolean {
  return Boolean(
    suggestion.scannedPZN ||
      suggestion.scannedProduktCode ||
      suggestion.scannedCharge ||
      suggestion.scannedSeriennummer ||
      suggestion.scannedVerwendbarBis ||
      suggestion.suggestedPackungsgroesse ||
      suggestion.suggestedName ||
      suggestion.suggestedActiveIngredient ||
      suggestion.suggestedStrengthValue,
  );
}

function ReviewInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        keyboardType={keyboardType}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f6',
  },
  keyboardAvoidingContainer: {
    flex: 1,
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
  reviewContent: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#f8f8f6',
  },
  reviewTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  reviewIntro: {
    fontSize: 17,
    lineHeight: 24,
    color: '#555',
    marginBottom: 18,
  },
  appleVisionBox: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8f8f6',
  },
  appleVisionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 12,
  },
  appleVisionText: {
    fontSize: 20,
    lineHeight: 28,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 24,
  },
  appleVisionButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 68,
  },
  appleVisionButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  secondaryButton: {
    marginTop: 12,
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: '700',
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
