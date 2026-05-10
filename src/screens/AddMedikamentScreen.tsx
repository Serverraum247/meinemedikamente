/**
 * AddMedikamentScreen.tsx – Neues Medikament anlegen
 *
 * Senioren-optimiert: Ein-Spalten-Layout, sehr große Textfelder,
 * klare Abschnitte, 44x44+ Touch-Ziele, WCAG AA Kontrast.
 *
 * Alle Zahlenfelder unterstützen Float (halbe Tabletten = 0.5).
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMedikamente } from '../context/MedikamentContext';
import { usePersonen } from '../context/PersonenContext';
import { parseDeFloat } from '../utils/FloatUtils';
import { announceChange } from '../utils/AccessibilityHelpers';
import { Switch } from 'react-native';
import {
  EinnahmeSlot,
  TageszeitSlot,
  SLOT_META,
  SLOT_REIHENFOLGE,
  WOCHENTAGE_META,
  toggleSlot,
  setSlotDosis,
  setSlotUhrzeit,
  toggleSlotWochentag,
  serializeEinnahmeplan,
  parseEinnahmeplan,
  getAllDefaultUhrzeiten,
} from '../utils/Einnahmeplan';
import { getMaxReminderSlots, isPremium, setDevPremiumOverride } from '../services/PremiumService';
import { getAllAerzte } from '../database/ArztController';
import type { ArztRow } from '../database/Database';
import PremiumGate from '../components/PremiumGate';
import { logger } from '../utils/Logger';
import { MEDICATION_UNITS, isPremiumMedicationUnit } from '../constants/MedicationUnits';
import {
  getMedicationTestPreset,
  MedicationTestPresetKey,
} from '../constants/MedicationTestPresets';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';

type Props = NativeStackScreenProps<RootStackParamList, 'AddMedikament'>;

export default function AddMedikamentScreen({ navigation, route }: Props) {
  const { addMedikament } = useMedikamente();
  const { aktivePerson } = usePersonen();

  const [name, setName] = useState('');
  const [zusatz, setZusatz] = useState('');
  const [bestand, setBestand] = useState('');
  const [einzeldosis, setEinzeldosis] = useState('1');
  const [einheit, setEinheit] = useState('Tabletten');
  const [pzn, setPzn] = useState('');
  const [packungsgroesse, setPackungsgroesse] = useState('');
  const [warnungAb, setWarnungAb] = useState('7');
  // Erinnerung & Auto-Abzug
  const [erinnerungAktiv, setErinnerungAktiv] = useState(false);
  const [einnahmePlan, setEinnahmePlan] = useState<EinnahmeSlot[]>([]);
  const [defaultUhrzeiten, setDefaultUhrzeiten] = useState<Record<TageszeitSlot, string>>({
    morgens: '08:00', mittags: '12:00', abends: '18:00', nachts: '22:00',
  });
  const [autoAbzugAktiv, setAutoAbzugAktiv] = useState(false);
  const [maxSlots, setMaxSlots] = useState(1);
  const [premium, setPremiumStatus] = useState(false);
  const [aerzte, setAerzte] = useState<ArztRow[]>([]);
  const [gewaehlterArzt, setGewaehlterArzt] = useState('');
  const [staerkeWert, setStaerkeWert] = useState('');
  const [staerkeEinheit, setStaerkeEinheit] = useState('');

  // Default-Uhrzeiten aus Einstellungen laden
  useEffect(() => {
    (async () => {
      const stored = await getAllDefaultUhrzeiten();
      setDefaultUhrzeiten(stored);
    })();
    getMaxReminderSlots().then(setMaxSlots);
    isPremium().then(async (isPrem) => {
      setPremiumStatus(isPrem);
      if (isPrem) {
        const arztListe = await getAllAerzte();
        setAerzte(arztListe);
      }
    });
  }, []);
  React.useEffect(() => {
    const scannedPZN = route.params?.scannedPZN;
    const suggestedName = route.params?.suggestedName;
    if (scannedPZN && !pzn) {
      setPzn(scannedPZN);
    }
    if (suggestedName && !name) {
      setName(suggestedName);
    }
  }, [route.params?.scannedPZN, route.params?.suggestedName]);

  const handleSave = async () => {
    if (isPremiumMedicationUnit(einheit) && !premium) {
      showPremiumRequiredAlert('Erweiterte Darreichungsformen sind nur mit Premium möglich.', navigation);
      return;
    }

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
      Alert.alert('Ungültig', 'Einzeldosis muss größer als 0 sein.');
      return;
    }

    try {
      const id = generateUUID();
      await addMedikament({
        id,
        name: name.trim(),
        zusatz: zusatz.trim(),
        person_id: aktivePerson?.id || 'person-default-001',
        aktueller_bestand: bestandFloat,
        einzeldosis: dosisFloat,
        einheit,
        pzn: pzn.trim(),
        packungsgroesse: packungsFloat,
        warnung_ab_bestand: warnungFloat,
        sync_status: 0,
        erinnerung_aktiv: erinnerungAktiv ? 1 : 0,
        einnahme_uhrzeiten: serializeEinnahmeplan(einnahmePlan),
        auto_abzug_aktiv: autoAbzugAktiv ? 1 : 0,
        arzt_id: gewaehlterArzt,
        staerke_wert: premium ? (parseDeFloat(staerkeWert) || 0) : 0,
        staerke_einheit: premium ? staerkeEinheit : '',
      });

      announceChange('Medikament wurde gespeichert');
      Alert.alert(
        'Gespeichert',
        `"${name.trim()}" wurde hinzugefügt.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Fehler', 'Medikament konnte nicht gespeichert werden.');
      logger.error(error);
    }
  };

  const applyTestPreset = (presetKey: MedicationTestPresetKey) => {
    const preset = getMedicationTestPreset(presetKey);
    setName(preset.name);
    setEinheit(preset.unit);
    setEinzeldosis(preset.singleDose);
    setBestand(preset.stock);
    setPackungsgroesse(preset.packageSize);
    setWarnungAb(preset.warningThreshold);
    if (presetKey === 'weekday') {
      setErinnerungAktiv(true);
      setEinnahmePlan([{ slot: 'morgens', uhrzeit: defaultUhrzeiten.morgens || '08:00' }]);
      setAutoAbzugAktiv(false);
    }
  };

  const saveTestPreset = async (presetKey: MedicationTestPresetKey) => {
    const preset = getMedicationTestPreset(presetKey);
    if (isPremiumMedicationUnit(preset.unit) && !premium) {
      showPremiumRequiredAlert('Diese Testdaten sind nur mit Premium möglich.', navigation);
      return;
    }

    try {
      await addMedikament({
        id: generateUUID(),
        name: preset.name,
        zusatz: '',
        person_id: aktivePerson?.id || 'person-default-001',
        aktueller_bestand: parseDeFloat(preset.stock) || 0,
        einzeldosis: parseDeFloat(preset.singleDose) || 1,
        einheit: preset.unit,
        pzn: '',
        packungsgroesse: parseDeFloat(preset.packageSize) || 0,
        warnung_ab_bestand: parseDeFloat(preset.warningThreshold) || 7,
        sync_status: 0,
        erinnerung_aktiv: 0,
        einnahme_uhrzeiten: serializeEinnahmeplan([]),
        auto_abzug_aktiv: 0,
        arzt_id: '',
        staerke_wert: 0,
        staerke_einheit: '',
      });

      announceChange('Medikament wurde gespeichert');
      Alert.alert(
        'Gespeichert',
        `"${preset.name}" wurde hinzugefügt.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Fehler', 'Medikament konnte nicht gespeichert werden.');
      logger.error(error);
    }
  };

  const enableDevPremiumForE2E = async () => {
    await setDevPremiumOverride('premium');
    setPremiumStatus(true);
    setMaxSlots(await getMaxReminderSlots());
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {__DEV__ && (
          <View style={styles.testPresetBox}>
            <Text style={styles.testPresetTitle}>Entwicklungsmodus</Text>
            <Text style={styles.testPresetHint}>Testwerte für E2E-Flows setzen.</Text>
            <View style={styles.testPresetRow}>
              <TouchableOpacity
                style={styles.testPresetButton}
                onPress={() => applyTestPreset('tablet')}
                accessibilityRole="button"
                accessibilityLabel="Testdaten Tablette einsetzen"
              >
                <Text style={styles.testPresetButtonText}>Tablette</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.testPresetButton}
                onPress={() => applyTestPreset('liquid')}
                accessibilityRole="button"
                accessibilityLabel="Testdaten Flüssigkeit einsetzen"
              >
                <Text style={styles.testPresetButtonText}>Flüssigkeit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.testPresetButton}
                onPress={() => applyTestPreset('spray')}
                accessibilityRole="button"
                accessibilityLabel="Testdaten Spray einsetzen"
              >
                <Text style={styles.testPresetButtonText}>Spray</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.testPresetButton}
                onPress={enableDevPremiumForE2E}
                accessibilityRole="button"
                accessibilityLabel="Premium für E2E simulieren"
              >
                <Text style={styles.testPresetButtonText}>Premium</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.testPresetButton}
                onPress={() => applyTestPreset('weekday')}
                accessibilityRole="button"
                accessibilityLabel="Testdaten Wochentage einsetzen"
              >
                <Text style={styles.testPresetButtonText}>Wochentage</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.testPresetRow}>
              <TouchableOpacity
                style={styles.testPresetButton}
                onPress={() => saveTestPreset('tablet')}
                accessibilityRole="button"
                accessibilityLabel="E2E Tablette speichern"
              >
                <Text style={styles.testPresetButtonText}>Tablette speichern</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.testPresetButton}
                onPress={() => saveTestPreset('liquid')}
                accessibilityRole="button"
                accessibilityLabel="E2E Flüssigkeit speichern"
              >
                <Text style={styles.testPresetButtonText}>Flüssigkeit speichern</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.testPresetButton}
                onPress={() => saveTestPreset('spray')}
                accessibilityRole="button"
                accessibilityLabel="E2E Spray speichern"
              >
                <Text style={styles.testPresetButtonText}>Spray speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* === ABSCHNITT: Medikament === */}
        <Text style={styles.sectionTitle} accessibilityRole="header">Medikament</Text>

        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Name des Medikaments *</Text>
          <TextInput
            style={styles.input}
            testID="medication-name-input"
            value={name}
            onChangeText={setName}
            placeholder="z.B. Aspirin 100"
            placeholderTextColor="#999"
            accessibilityLabel="Name"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            autoFocus
          />
        </View>

        {/* Zusatz / Wirkstoff-Alias */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Zusatz / Wirkstoff</Text>
          <TextInput
            style={styles.input}
            value={zusatz}
            onChangeText={setZusatz}
            placeholder="z.B. Blutdrucksenker"
            placeholderTextColor="#999"
            accessibilityLabel="Zusatz"
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
              accessibilityLabel="PZN"
              keyboardType="number-pad"
            />
            {/* Scanner-Button – wird in Phase 3 aktiviert */}
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => navigation.navigate('BarcodeScanner')}
              activeOpacity={0.7}
              accessibilityLabel="Barcode scannen"
            >
              <Text style={styles.scanButtonText}>Scan</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Arzt-Zuordnung (nur Premium) */}
        {premium && aerzte.length > 0 && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>👨‍⚕️ Verschreibender Arzt</Text>
            <Text style={styles.hint}>Premium: Welcher Arzt hat dieses Medikament verschrieben?</Text>
            {aerzte.map(arzt => (
              <TouchableOpacity
                key={arzt.id}
                style={[
                  styles.arztOption,
                  gewaehlterArzt === arzt.id && styles.arztOptionSelected,
                ]}
                onPress={() => setGewaehlterArzt(gewaehlterArzt === arzt.id ? '' : arzt.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: gewaehlterArzt === arzt.id }}
                accessibilityLabel={`Arzt: ${arzt.name}${arzt.fachgebiet ? `, ${arzt.fachgebiet}` : ''}`}
              >
                <Text style={[
                  styles.arztOptionText,
                  gewaehlterArzt === arzt.id && styles.arztOptionTextSelected,
                ]}>
                  {arzt.name}{arzt.fachgebiet ? ` – ${arzt.fachgebiet}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
            {gewaehlterArzt !== '' && (
              <TouchableOpacity
                onPress={() => setGewaehlterArzt('')}
                accessibilityRole="button"
                accessibilityLabel="Arzt-Zuordnung entfernen"
              >
                <Text style={styles.arztEntfernen}>Zuordnung entfernen</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* === ABSCHNITT: Stärke / Wirkstoffmenge (Premium) === */}
        <PremiumGate
          featureName="Stärke & Dosierung"
          description="Erfassen Sie mg/ml-Dosierungen für Ihre Medikamente. z.B. 500mg pro Tablette."
          navigation={navigation}
        >
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>💊 Stärke pro Einheit</Text>
            <Text style={styles.hint}>Wie viel Wirkstoff enthält eine Tablette / 1ml?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={staerkeWert}
                onChangeText={setStaerkeWert}
                placeholder="z.B. 500"
                keyboardType="decimal-pad"
                accessibilityLabel="Stärke Wert"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={staerkeEinheit}
                onChangeText={setStaerkeEinheit}
                placeholder="mg, ml, µg, IE"
                accessibilityLabel="Stärke Einheit"
              />
            </View>
          </View>
        </PremiumGate>

        {/* === ABSCHNITT: Dosierung === */}
        <Text style={styles.sectionTitle} accessibilityRole="header">Dosierung</Text>

        {/* Einzeldosis */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Einzeldosis *</Text>
          <TextInput
            style={styles.input}
            testID="single-dose-input"
            value={einzeldosis}
            onChangeText={setEinzeldosis}
            placeholder="z.B. 0,5 für halbe Tablette"
            placeholderTextColor="#999"
            accessibilityLabel="Einzeldosis"
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>Halbe Tabletten als 0.5 eingeben</Text>
        </View>

        {/* Einheit */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Einheit</Text>
          <View style={styles.einheitRow}>
            {MEDICATION_UNITS.map(e => (
              <TouchableOpacity
                key={e}
                style={[
                  styles.einheitButton,
                  einheit === e && styles.einheitActive,
                  isPremiumMedicationUnit(e) && !premium && styles.einheitPremiumLocked,
                ]}
                onPress={() => {
                  if (isPremiumMedicationUnit(e) && !premium) {
                    showPremiumRequiredAlert('Erweiterte Darreichungsformen sind nur mit Premium möglich.', navigation);
                    return;
                  }
                  setEinheit(e);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Einheit: ${e}${isPremiumMedicationUnit(e) && !premium ? ', nur mit Premium möglich' : ''}`}
                accessibilityState={{ selected: einheit === e }}
              >
                <Text style={[styles.einheitText, einheit === e && styles.einheitTextActive]}>
                  {e}{isPremiumMedicationUnit(e) && !premium ? ' ⭐' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* === ABSCHNITT: Bestand === */}
        <Text style={styles.sectionTitle} accessibilityRole="header">Bestand</Text>

        {/* Aktueller Bestand */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Aktueller Bestand</Text>
          <TextInput
            style={styles.input}
            testID="stock-input"
            value={bestand}
            onChangeText={setBestand}
            placeholder="z.B. 28.5"
            placeholderTextColor="#999"
            accessibilityLabel="Bestand"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Packungsgroesse */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Packungsgröße</Text>
          <TextInput
            style={styles.input}
            value={packungsgroesse}
            onChangeText={setPackungsgroesse}
            placeholder="z.B. 50"
            placeholderTextColor="#999"
            accessibilityLabel="Packungsgröße"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Warnung ab (Premium) */}
        {premium ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Warnung ab Bestand</Text>
            <TextInput
              style={styles.input}
              value={warnungAb}
              onChangeText={setWarnungAb}
              placeholder="z.B. 7"
              placeholderTextColor="#999"
              accessibilityLabel="Warnung ab Bestand"
              keyboardType="decimal-pad"
            />
            <Text style={styles.hint}>Warnung wenn Bestand darunter fällt</Text>
          </View>
        ) : (
          <PremiumGate
            featureName="Bestandswarnung"
            description="Warnungen bei niedrigem Bestand sind nur mit Premium möglich."
            navigation={navigation}
          />
        )}

        {/* === ABSCHNITT: Erinnerung === */}
        <Text style={styles.sectionTitle} accessibilityRole="header">Erinnerung</Text>

        {/* Erinnerung aktivieren */}
        <View style={styles.switchRow}>
          <Text style={styles.label}>Erinnerung aktivieren</Text>
          <Switch
            value={erinnerungAktiv}
            onValueChange={setErinnerungAktiv}
            trackColor={{ false: '#ccc', true: '#1a1a2e' }}
            thumbColor={erinnerungAktiv ? '#fff' : '#f4f4f4'}
            style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
            accessibilityRole="switch"
            accessibilityLabel="Erinnerung aktivieren"
            accessibilityState={{ checked: erinnerungAktiv }}
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
                    {/* Toggle-Button */}
                    <TouchableOpacity
                      style={[
                        styles.tageszeitButton,
                        isActive && styles.tageszeitButtonActive,
                      ]}
                      onPress={async () => {
                        const isActive = einnahmePlan.some(s => s.slot === slot);
                        // Premium-Gate: Slot aktivieren prüfen
                        if (!isActive) {
                          const activeSlots = einnahmePlan.length;
                          if (activeSlots >= maxSlots) {
                            showPremiumRequiredAlert(
                              'Mehrere Erinnerung-Slots pro Medikament sind nur mit Premium möglich.',
                              navigation,
                            );
                            return;
                          }
                        }
                        const newPlan = await toggleSlot(einnahmePlan, slot);
                        setEinnahmePlan(newPlan);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="switch"
                      accessibilityLabel={`${meta.label} ${isActive ? 'aktiviert' : 'deaktiviert'}`}
                      accessibilityState={{ checked: isActive }}
                    >
                      <Text style={styles.tageszeitEmoji} accessibilityElementsHidden>{meta.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tageszeitLabel}>
                          {meta.label}
                        </Text>
                        {premium ? (
                          <TextInput
                            style={styles.tageszeitUhrzeitInput}
                            value={eintrag?.uhrzeit || defaultUhrzeiten[slot]}
                            onChangeText={text => {
                              setEinnahmePlan(prev =>
                                setSlotUhrzeit(prev, slot, text)
                              );
                            }}
                            placeholder={defaultUhrzeiten[slot]}
                            placeholderTextColor="#999"
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                            accessibilityLabel={`Uhrzeit für ${meta.label}`}
                          />
                        ) : (
                          <Text style={styles.tageszeitUhrzeit}>
                            {eintrag?.uhrzeit || defaultUhrzeiten[slot]} Uhr
                          </Text>
                        )}
                      </View>
                      <Text style={[
                        styles.tageszeitCheck,
                        isActive && styles.tageszeitCheckActive,
                      ]}>
                        {isActive ? '✓' : '○'}
                      </Text>
                    </TouchableOpacity>

                    {/* Individuelle Dosis pro Slot (nur wenn aktiv) */}
                    {isActive && (
                      <View style={styles.slotDosisRow}>
                        <Text style={styles.slotDosisLabel}>Dosis:</Text>
                        <TextInput
                          style={styles.slotDosisInput}
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
                          accessibilityLabel={`${meta.label} Dosis`}
                          keyboardType="decimal-pad"
                        />
                        <Text style={styles.slotDosisEinheit}>{einheit}</Text>
                      </View>
                    )}

                    {isActive && (
                      <View style={styles.wochentageBox}>
                        <Text style={styles.wochentageLabel}>Tage:</Text>
                        <View style={styles.wochentageRow}>
                          {WOCHENTAGE_META.map(day => {
                            const isSelected = Boolean(eintrag?.wochentage?.includes(day.value));
                            return (
                              <TouchableOpacity
                                key={`${slot}-${day.value}`}
                                style={[
                                  styles.wochentagButton,
                                  isSelected && styles.wochentagButtonActive,
                                ]}
                                onPress={() => {
                                  setEinnahmePlan(prev =>
                                    toggleSlotWochentag(prev, slot, day.value)
                                  );
                                }}
                                accessibilityRole="switch"
                                accessibilityLabel={`${meta.label} ${day.label} ${isSelected ? 'aktiv' : 'inaktiv'}`}
                                accessibilityState={{ checked: isSelected }}
                              >
                                <Text style={[
                                  styles.wochentagButtonText,
                                  isSelected && styles.wochentagButtonTextActive,
                                ]}>
                                  {day.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <Text style={styles.wochentageHint}>Keine Auswahl bedeutet täglich.</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Tagesdosis-Vorschau */}
            {einnahmePlan.length > 0 && (
              <View style={styles.tagesdosisBox}>
                <Text style={styles.tagesdosisLabel}>
                  {einnahmePlan.some(s => s.wochentage && s.wochentage.length > 0) ? 'Dosis an Einnahmetagen' : 'Tagesdosis gesamt'}: {(() => {
                    const dosis = parseDeFloat(einzeldosis) || 1;
                    const total = einnahmePlan.reduce((sum, s) =>
                      sum + (s.dosis !== undefined ? s.dosis : dosis), 0);
                    return Math.round(total * 1e10) / 1e10;
                  })()} {einheit}
                </Text>
              </View>
            )}

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
                accessibilityRole="switch"
                accessibilityLabel="Automatischer Bestandsabzug"
                accessibilityState={{ checked: autoAbzugAktiv }}
              />
            </View>
          </>
        )}

        {/* Speichern */}
        <TouchableOpacity
          style={styles.saveButton}
          testID="save-medication-button"
          onPress={handleSave}
          activeOpacity={0.7}
          accessibilityLabel="Medikament speichern"
          accessibilityRole="button"
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
    fontSize: 22,
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
    fontSize: 19,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    fontSize: 20,
    color: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#ccc',
    minHeight: 58, // Große Touch-Ziele für Senioren
  },
  hint: {
    fontSize: 16,
    color: '#777',
    marginTop: 6,
  },

  // Debug-only Testdaten
  testPresetBox: {
    backgroundColor: '#fff7e6',
    borderColor: '#ff9800',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  testPresetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#bf360c',
    marginBottom: 4,
  },
  testPresetHint: {
    fontSize: 16,
    color: '#bf360c',
    marginBottom: 10,
  },
  testPresetRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  testPresetButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderColor: '#ff9800',
    borderWidth: 2,
    borderRadius: 10,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  testPresetButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  einheitPremiumLocked: {
    borderColor: '#FFB74D',
    backgroundColor: '#FFF9F0',
  },
  einheitText: {
    fontSize: 17,
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
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
    minHeight: 58,
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 21,
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

  // Tageszeit-Toggle
  tageszeitRow: {
    marginBottom: 12,
  },
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
  tageszeitEmoji: {
    fontSize: 28,
    marginRight: 14,
  },
  tageszeitLabel: {
    fontSize: 19,
    fontWeight: '600',
    color: '#888',
  },
  tageszeitLabelActive: {
    color: '#1a1a2e',
  },
  tageszeitUhrzeit: {
    fontSize: 16,
    color: '#999',
  },
  tageszeitUhrzeitInput: {
    fontSize: 16,
    color: '#007AFF',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 70,
    marginTop: 2,
  },
  tageszeitCheck: {
    fontSize: 24,
    color: '#ccc',
  },
  tageszeitCheckActive: {
    color: '#27ae60',
  },

  // Individuelle Dosis pro Slot
  slotDosisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 56,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 8,
  },
  slotDosisLabel: {
    fontSize: 16,
    color: '#666',
  },
  slotDosisInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    color: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#ccc',
    minHeight: 48,
  },
  slotDosisEinheit: {
    fontSize: 16,
    color: '#888',
  },

  // Wochentage pro Slot
  wochentageBox: {
    paddingLeft: 56,
    paddingTop: 6,
    paddingBottom: 8,
  },
  wochentageLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  wochentageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wochentagButton: {
    minWidth: 42,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccd3d7',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  wochentagButtonActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  wochentagButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4a5560',
  },
  wochentagButtonTextActive: {
    color: '#fff',
  },
  wochentageHint: {
    fontSize: 14,
    color: '#777',
    marginTop: 6,
  },

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
  // Arzt-Zuordnung
  arztOption: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  arztOptionSelected: {
    borderColor: '#28a745',
    backgroundColor: '#e8f5e9',
  },
  arztOptionText: {
    fontSize: 16,
    color: '#333',
  },
  arztOptionTextSelected: {
    color: '#155724',
    fontWeight: '600',
  },
  arztEntfernen: {
    fontSize: 14,
    color: '#dc3545',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
});
