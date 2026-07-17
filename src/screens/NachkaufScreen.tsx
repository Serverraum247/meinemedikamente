/**
 * NachkaufScreen.tsx – Einfacher Nachkauf-Dialog für Senioren
 *
 * Fragt nur das Nötigste:
 * 1. Packungsgröße (Pflicht)
 * 2. Ersatzprodukt? (Checkbox, standardmäßig AUS)
 * 3. Falls Ersatzprodukt: Name + PZN (optional)
 *
 * Nach dem Speichern wird der Bestand automatisch erhöht.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMedikamente } from '../context/MedikamentContext';
import { MedikamentRow } from '../database/Database';
import { nachkaufErfassen } from '../database/PackungController';
import { parseDeFloat } from '../utils/FloatUtils';
import { announceChange } from '../utils/AccessibilityHelpers';
import { isPremium } from '../services/PremiumService';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';
import { logger } from '../utils/Logger';

type Props = NativeStackScreenProps<RootStackParamList, 'Nachkauf'>;

export default function NachkaufScreen({ route, navigation }: Props) {
  const { medikamentId } = route.params;
  const { medikamente, aktualisiereBestand } = useMedikamente();

  const [medikament, setMedikament] = useState<MedikamentRow | null>(null);
  const [groesse, setGroesse] = useState('');
  const [pzn, setPzn] = useState('');
  const [produktCode, setProduktCode] = useState('');
  const [charge, setCharge] = useState('');
  const [seriennummer, setSeriennummer] = useState('');
  const [verwendbarBis, setVerwendbarBis] = useState('');
  const [premium, setPremium] = useState(false);
  const [istErsatzprodukt, setIstErsatzprodukt] = useState(false);
  const [ersatzName, setErsatzName] = useState('');

  useEffect(() => {
    const found = medikamente.find(m => m.id === medikamentId);
    if (found) {
      setMedikament(found);
      setPzn(found.pzn || '');
      navigation.setOptions({ title: `Nachkauf: ${found.name}` });
    }
  }, [medikamente, medikamentId, navigation]);

  useEffect(() => {
    isPremium().then(setPremium);
  }, []);

  useEffect(() => {
    if (route.params?.suggestedPackungsgroesse && !groesse) {
      setGroesse(route.params.suggestedPackungsgroesse);
    }
    if (route.params?.scannedPZN) setPzn(route.params.scannedPZN);
    if (route.params?.scannedProduktCode) setProduktCode(route.params.scannedProduktCode);
    if (route.params?.scannedCharge) setCharge(route.params.scannedCharge);
    if (route.params?.scannedSeriennummer) setSeriennummer(route.params.scannedSeriennummer);
    if (route.params?.scannedVerwendbarBis) setVerwendbarBis(route.params.scannedVerwendbarBis);
  }, [
    groesse,
    route.params?.scannedCharge,
    route.params?.scannedPZN,
    route.params?.scannedProduktCode,
    route.params?.scannedSeriennummer,
    route.params?.scannedVerwendbarBis,
    route.params?.suggestedPackungsgroesse,
  ]);

  const handleSave = async () => {
    if (!medikament) return;

    const groesseFloat = parseDeFloat(groesse);
    if (isNaN(groesseFloat) || groesseFloat <= 0) {
      Alert.alert('Ungültig', 'Bitte gib die Packungsgröße ein (z.B. 50).');
      return;
    }

    if (istErsatzprodukt && !ersatzName.trim()) {
      Alert.alert('Hinweis', 'Bitte gib den Namen des Ersatzprodukts ein.');
      return;
    }

    try {
      await nachkaufErfassen(
        medikament.id,
        groesseFloat,
        pzn.trim(),
        istErsatzprodukt,
        ersatzName.trim(),
        {
          produkt_code: produktCode.trim(),
          charge: charge.trim(),
          seriennummer: seriennummer.trim(),
          verwendbar_bis: verwendbarBis.trim(),
        },
      );
      // Bestand wurde in nachkaufErfassen bereits aktualisiert

      const msg = istErsatzprodukt
        ? `${groesseFloat} Stück von "${ersatzName.trim()}" hinzugefügt.`
        : `${groesseFloat} Stück hinzugefügt.`;

      announceChange('Nachkauf wurde gespeichert');
      Alert.alert(
        'Nachkauf gespeichert',
        msg,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (error) {
      Alert.alert('Fehler', 'Nachkauf konnte nicht gespeichert werden.');
      logger.error(error);
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
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {/* Aktueller Bestand */}
          <View style={styles.bestandCard}>
            <Text style={styles.bestandLabel} accessibilityRole="header">Aktueller Bestand</Text>
            <Text style={styles.bestandWert}>
              {medikament.aktueller_bestand} {medikament.einheit}
            </Text>
          </View>

        {/* Packungsgröße */}
        <View style={styles.scanCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Packung scannen</Text>
            <Text style={styles.hint}>Premium erkennt PZN, Verfallsdatum und Charge als Vorschlag.</Text>
          </View>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => {
              if (!premium) {
                showPremiumRequiredAlert('Packungsdaten wie Verfallsdatum und Charge sind nur mit Premium möglich.', navigation);
                return;
              }
              navigation.navigate('BarcodeScanner', {
                target: 'nachkauf',
                medikamentId,
                premiumPackageScan: true,
              });
            }}
            accessibilityRole="button"
            accessibilityLabel="Packung scannen"
          >
            <Text style={styles.scanButtonText}>Scannen</Text>
          </TouchableOpacity>
        </View>

        {/* Packungsgröße */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label} accessibilityRole="header">Packungsgröße *</Text>
          <TextInput
            style={styles.input}
            value={groesse}
            onChangeText={setGroesse}
            placeholder="z.B. 50"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            autoFocus
            accessibilityLabel="Packungsgröße"
          />
          <Text style={styles.hint}>Anzahl der Tabletten/Kapseln in der Packung</Text>
        </View>

        {premium ? (
          <View style={styles.premiumBox}>
            <Text style={styles.label} accessibilityRole="header">Premium-Packungsdaten</Text>
            <TextInput
              style={styles.input}
              value={verwendbarBis}
              onChangeText={setVerwendbarBis}
              placeholder="Verwendbar bis, z.B. 2027-07-31"
              placeholderTextColor="#999"
              accessibilityLabel="Verwendbar bis"
            />
            <TextInput
              style={styles.input}
              value={charge}
              onChangeText={setCharge}
              placeholder="Charge"
              placeholderTextColor="#999"
              accessibilityLabel="Charge"
            />
            <TextInput
              style={styles.input}
              value={seriennummer}
              onChangeText={setSeriennummer}
              placeholder="Seriennummer"
              placeholderTextColor="#999"
              accessibilityLabel="Seriennummer"
            />
            <TextInput
              style={styles.input}
              value={produktCode}
              onChangeText={setProduktCode}
              placeholder="Produktcode"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              accessibilityLabel="Produktcode"
            />
          </View>
        ) : null}

        {/* PZN */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label} accessibilityRole="header">PZN / Barcode</Text>
          <TextInput
            style={styles.input}
            value={pzn}
            onChangeText={setPzn}
            placeholder="Optional – automatisch vom Stammartikel"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            accessibilityLabel="PZN / Barcode"
          />
        </View>

        {/* Ersatzprodukt */}
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label} accessibilityRole="header">Ersatzprodukt?</Text>
            <Text style={styles.hint}>Wenn ein anderes Produkt gekauft wurde</Text>
          </View>
          <Switch
            value={istErsatzprodukt}
            onValueChange={setIstErsatzprodukt}
            trackColor={{ false: '#ccc', true: '#e67e22' }}
            thumbColor={istErsatzprodukt ? '#fff' : '#f4f4f4'}
            style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
            accessibilityRole="switch"
            accessibilityLabel="Ersatzprodukt"
            accessibilityState={{ checked: istErsatzprodukt }}
          />
        </View>

        {istErsatzprodukt && (
          <View style={styles.ersatzSection}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label} accessibilityRole="header">Name des Ersatzprodukts *</Text>
              <TextInput
                style={styles.input}
                value={ersatzName}
                onChangeText={setErsatzName}
                placeholder="z.B. Ibuprofen AbZ 400"
                placeholderTextColor="#999"
                accessibilityLabel="Ersatzprodukt-Name"
              />
            </View>
          </View>
        )}

        {/* Info-Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ℹ️ Der Bestand wird nach dem Speichern automatisch um {groesse ? groesse : '...'} {medikament.einheit} erhöht.
          </Text>
        </View>

        </ScrollView>

        {/* Der Aktionsbereich bleibt bei geöffneter Tastatur sichtbar. */}
        <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Nachkauf speichern"
          accessibilityHint="Speichert die Packungsgröße und erhöht den Bestand"
        >
          <Text style={styles.saveButtonText}>Nachkauf speichern</Text>
        </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  actionBar: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0d0d0',
  },
  bestandCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
  bestandLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  bestandWert: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
  scanTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  scanButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  premiumBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 10,
    borderWidth: 2,
    borderColor: '#d6a800',
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
    fontSize: 20,
    color: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#ddd',
    minHeight: 56,
  },
  hint: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingVertical: 8,
  },
  ersatzSection: {
    backgroundColor: '#fef9e7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#f0c040',
  },
  infoBox: {
    backgroundColor: '#eaf2f8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 16,
    color: '#2c3e50',
  },
  saveButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#27ae60',
  },
  saveButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
