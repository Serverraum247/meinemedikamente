/**
 * EditMedikamentScreen.tsx – Bestehendes Medikament bearbeiten
 *
 * Alle Zahlenfelder unterstuetzen Float (halbe Tabletten = 0.5).
 * Senioren-freundlich: Groesse Eingabefelder, klare Labels, Zurück-Button.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMedikamente } from '../context/MedikamentContext';
import { MedikamentRow } from '../database/Database';
import { parseDeFloat } from '../utils/FloatUtils';
import { announceChange } from '../utils/AccessibilityHelpers';
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
  setSlotTaeglich,
  serializeEinnahmeplan,
  parseEinnahmeplan,
  getAllDefaultUhrzeiten,
} from '../utils/Einnahmeplan';
import { isPremium } from '../services/PremiumService';
import { getAllAerzte } from '../database/ArztController';
import type { ArztRow } from '../database/Database';
import PremiumGate from '../components/PremiumGate';
import { logger } from '../utils/Logger';
import { MEDICATION_UNITS, isPremiumMedicationUnit } from '../constants/MedicationUnits';
import {
  formatMedicationNameSuggestion,
  getMedicationNameSuggestionMetadata,
  getMedicationNameSuggestions,
} from '../constants/MedicationNameSuggestions';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';
import { findPotentialDuplicateMedication } from '../utils/MedicationDuplicate';
import { hasValidReminderTime, shouldAutoEnableStockDeduction, STRENGTH_UNITS } from '../utils/MedicationFormRules';
import { formatActiveIngredient, parseActiveIngredients } from '../utils/ActiveIngredients';

type Props = NativeStackScreenProps<RootStackParamList, 'EditMedikament'>;

export default function EditMedikamentScreen({ route, navigation }: Props) {
  const { medikamentId } = route.params;
  const { medikamente, bearbeiteMedikament } = useMedikamente();

  const [medikament, setMedikament] = useState<MedikamentRow | null>(null);

  const [name, setName] = useState('');
  const [zusatz, setZusatz] = useState('');
  const [bestand, setBestand] = useState('');
  const [einzeldosis, setEinzeldosis] = useState('');
  const [einheit, setEinheit] = useState('Tabletten');
  const [pzn, setPzn] = useState('');
  const [packungsgroesse, setPackungsgroesse] = useState('');
  const [warnungAb, setWarnungAb] = useState('');
  // Erinnerung & Auto-Abzug
  const [erinnerungAktiv, setErinnerungAktiv] = useState(false);
  const [einnahmePlan, setEinnahmePlan] = useState<EinnahmeSlot[]>([]);
  const [defaultUhrzeiten, setDefaultUhrzeiten] = useState<Record<TageszeitSlot, string>>({
    morgens: '08:00', mittags: '12:00', abends: '18:00', nachts: '22:00',
  });
  const [autoAbzugAktiv, setAutoAbzugAktiv] = useState(false);
  const [frueheEinnahmeErlaubt, setFrueheEinnahmeErlaubt] = useState(true);
  const [premium, setPremiumStatus] = useState(false);
  const [aerzte, setAerzte] = useState<ArztRow[]>([]);
  const [gewaehlterArzt, setGewaehlterArzt] = useState('');
  const [staerkeWert, setStaerkeWert] = useState('');
  const [staerkeEinheit, setStaerkeEinheit] = useState('');
  const [staerkeEinheitDropdownOffen, setStaerkeEinheitDropdownOffen] = useState(false);
  const skipUnsavedPromptRef = React.useRef(false);
  const nameSuggestions = useMemo(() => getMedicationNameSuggestions(name), [name]);
  const activeIngredients = useMemo(() => parseActiveIngredients(zusatz), [zusatz]);

  const isDirty = useMemo(() => {
    if (!medikament) {
      return false;
    }

    let originalPlan = '[]';
    try {
      originalPlan = serializeEinnahmeplan(parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]'));
    } catch {
      originalPlan = '[]';
    }

    return (
      name !== medikament.name ||
      zusatz !== (medikament.zusatz || '') ||
      bestand !== String(medikament.aktueller_bestand) ||
      einzeldosis !== String(medikament.einzeldosis) ||
      einheit !== medikament.einheit ||
      pzn !== medikament.pzn ||
      packungsgroesse !== String(medikament.packungsgroesse) ||
      warnungAb !== String(medikament.warnung_ab_bestand) ||
      erinnerungAktiv !== (medikament.erinnerung_aktiv === 1) ||
      serializeEinnahmeplan(einnahmePlan) !== originalPlan ||
      autoAbzugAktiv !== (medikament.auto_abzug_aktiv === 1) ||
      frueheEinnahmeErlaubt !== ((medikament.fruehe_einnahme_erlaubt ?? 1) !== 0) ||
      gewaehlterArzt !== (medikament.arzt_id || '') ||
      staerkeWert !== (medikament.staerke_wert ? String(medikament.staerke_wert) : '') ||
      staerkeEinheit !== (medikament.staerke_einheit || '')
    );
  }, [
    autoAbzugAktiv,
    bestand,
    einheit,
    einnahmePlan,
    einzeldosis,
    frueheEinnahmeErlaubt,
    erinnerungAktiv,
    gewaehlterArzt,
    medikament,
    name,
    packungsgroesse,
    pzn,
    staerkeEinheit,
    staerkeWert,
    warnungAb,
    zusatz,
  ]);

  const goBackAfterSave = React.useCallback(() => {
    skipUnsavedPromptRef.current = true;
    navigation.goBack();
  }, [navigation]);

  const applyNameSuggestion = (suggestion: string) => {
    setName(suggestion);
    const activeIngredient = getMedicationNameSuggestionMetadata(suggestion)?.activeIngredient;
    if (activeIngredient && !zusatz.trim()) {
      setZusatz(activeIngredient);
    }
  };

  // Medikament-Daten laden

  // Default-Uhrzeiten aus Einstellungen laden
  useEffect(() => {
    (async () => {
      const stored = await getAllDefaultUhrzeiten();
      setDefaultUhrzeiten(stored);
      const isPrem = await isPremium();
      setPremiumStatus(isPrem);
      const arztListe = await getAllAerzte();
      setAerzte(arztListe);
    })();
  }, []);
  useEffect(() => {
    const found = medikamente.find(m => m.id === medikamentId);
    if (found) {
      setMedikament(found);
      setName(found.name);
      setZusatz(found.zusatz || '');
      setBestand(String(found.aktueller_bestand));
      setEinzeldosis(String(found.einzeldosis));
      setEinheit(found.einheit);
      setPzn(found.pzn);
      setPackungsgroesse(String(found.packungsgroesse));
      setWarnungAb(String(found.warnung_ab_bestand));
      setErinnerungAktiv(found.erinnerung_aktiv === 1);
      try {
        const plan = parseEinnahmeplan(found.einnahme_uhrzeiten || '[]');
        setEinnahmePlan(plan);
      } catch { setEinnahmePlan([]); }
      setAutoAbzugAktiv(found.auto_abzug_aktiv === 1);
      setFrueheEinnahmeErlaubt((found.fruehe_einnahme_erlaubt ?? 1) !== 0);
      setGewaehlterArzt(found.arzt_id || '');
      setStaerkeWert(found.staerke_wert ? String(found.staerke_wert) : '');
      setStaerkeEinheit(found.staerke_einheit || '');
      navigation.setOptions({ title: found.name + ' bearbeiten' });
    }
  }, [medikamente, medikamentId, navigation]);

  useEffect(() => {
    if (shouldAutoEnableStockDeduction(erinnerungAktiv, bestand)) {
      setAutoAbzugAktiv(true);
    }
  }, [bestand, erinnerungAktiv]);

  const handleSave = React.useCallback(async (duplicateConfirmed = false) => {
    if (!medikament) return;

    if (isPremiumMedicationUnit(einheit) && !premium) {
      showPremiumRequiredAlert('Erweiterte Darreichungsformen sind nur mit Premium möglich.', navigation);
      return;
    }

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
      Alert.alert('Ungültig', 'Einzeldosis muss größer als 0 sein.');
      return;
    }
    if (!hasValidReminderTime(erinnerungAktiv, einnahmePlan)) {
      Alert.alert('Erinnerung unvollständig', 'Bitte wähle mindestens eine Tageszeit mit Uhrzeit für die Erinnerung aus.');
      return;
    }

    const duplicate = findPotentialDuplicateMedication(medikamente, {
      id: medikament.id,
      name: name.trim(),
      zusatz: zusatz.trim(),
      person_id: medikament.person_id,
      pzn: pzn.trim(),
    });

    if (duplicate && !duplicateConfirmed) {
      Alert.alert(
        'Mögliches Duplikat',
        `Dieses Medikament scheint bereits vorhanden zu sein: "${duplicate.medication.name}". Bitte prüfen Sie, ob es wirklich erneut gespeichert werden soll.`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Trotzdem speichern', onPress: () => void handleSave(true) },
        ],
      );
      return;
    }

    try {
      const isCombination = activeIngredients.length > 1;

      await bearbeiteMedikament(medikament.id, {
        name: name.trim(),
        zusatz: zusatz.trim(),
        aktueller_bestand: bestandFloat,
        einzeldosis: dosisFloat,
        einheit,
        pzn: pzn.trim(),
        packungsgroesse: isNaN(packungsFloat) ? 0 : packungsFloat,
        warnung_ab_bestand: isNaN(warnungFloat) ? 7 : warnungFloat,
        sync_status: 1,
        erinnerung_aktiv: erinnerungAktiv ? 1 : 0,
        einnahme_uhrzeiten: serializeEinnahmeplan(einnahmePlan),
        auto_abzug_aktiv: autoAbzugAktiv ? 1 : 0,
        fruehe_einnahme_erlaubt: frueheEinnahmeErlaubt ? 1 : 0,
        arzt_id: gewaehlterArzt,
        staerke_wert: isCombination ? 0 : parseDeFloat(staerkeWert) || 0,
        staerke_einheit: isCombination ? '' : staerkeEinheit,
      });

      announceChange('Änderungen wurden gespeichert');
      Alert.alert(
        'Gespeichert',
        `"${name.trim()}" wurde aktualisiert.`,
        [{ text: 'OK', onPress: goBackAfterSave }]
      );
    } catch (error) {
      Alert.alert('Fehler', 'Änderung konnte nicht gespeichert werden.');
      logger.error(error);
    }
  }, [
    autoAbzugAktiv,
    bearbeiteMedikament,
    bestand,
    einheit,
    einnahmePlan,
    einzeldosis,
    frueheEinnahmeErlaubt,
    erinnerungAktiv,
    gewaehlterArzt,
    goBackAfterSave,
    medikament,
    medikamente,
    name,
    navigation,
    packungsgroesse,
    premium,
    pzn,
    staerkeEinheit,
    staerkeWert,
    warnungAb,
    zusatz,
  ]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerSaveButton}
          onPress={() => handleSave()}
          accessibilityRole="button"
          accessibilityLabel="Änderungen speichern"
        >
          <Text style={styles.headerSaveButtonText}>Speichern</Text>
        </TouchableOpacity>
      ),
    });
  }, [handleSave, navigation]);

  React.useEffect(() => {
    return navigation.addListener('beforeRemove', event => {
      if (skipUnsavedPromptRef.current || !isDirty) {
        return;
      }

      event.preventDefault();

      Alert.alert(
        'Änderungen speichern?',
        'Willst du die Änderungen speichern, bevor du gehst?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Verwerfen',
            style: 'destructive',
            onPress: () => {
              skipUnsavedPromptRef.current = true;
              navigation.dispatch(event.data.action);
            },
          },
          { text: 'Speichern', onPress: () => void handleSave() },
        ],
      );
    });
  }, [handleSave, isDirty, navigation]);

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
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Name des Medikaments *</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Name des Medikaments"
            value={name}
            onChangeText={setName}
            placeholder="z.B. Aspirin"
            placeholderTextColor="#999"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
          />
          {nameSuggestions.length > 0 && (
            <View style={styles.suggestionBox} accessibilityLabel="Namensvorschläge">
              {nameSuggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={styles.suggestionButton}
                  onPress={() => applyNameSuggestion(suggestion)}
                  accessibilityRole="button"
                  accessibilityLabel={`${suggestion} übernehmen`}
                >
                  <Text style={styles.suggestionText}>{formatMedicationNameSuggestion(suggestion)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Wirkstoff-Alias */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Wirkstoff(e)</Text>
          <TextInput
            style={[styles.input, styles.wirkstoffInput]}
            accessibilityLabel="Wirkstoffe"
            value={zusatz}
            onChangeText={setZusatz}
            placeholder="z.B. Bisoprolol oder Candesartan 16 mg + Hydrochlorothiazid 12,5 mg"
            placeholderTextColor="#999"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
          {activeIngredients.length > 1 ? (
            <View style={styles.wirkstoffPreview}>
              <Text style={styles.wirkstoffPreviewTitle}>Kombi-Wirkstoffe erkannt</Text>
              {activeIngredients.map((ingredient, index) => (
                <Text key={`${ingredient.name}-${index}`} style={styles.wirkstoffPreviewText}>
                  {index + 1}. {formatActiveIngredient(ingredient)}
                </Text>
              ))}
              <Text style={styles.wirkstoffPreviewHint}>
                Zum Nachjustieren die Zeile oben ändern. Jeder Wirkstoff wird im Plan getrennt angezeigt.
              </Text>
            </View>
          ) : (
            <Text style={styles.hint}>Bei Kombipräparaten mit + trennen, z.B. Candesartan 16 mg + Hydrochlorothiazid 12,5 mg.</Text>
          )}
        </View>

        {/* Bestand */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Aktueller Bestand</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Aktueller Bestand"
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
            accessibilityLabel="Einzeldosis"
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

        {/* Packungsgroesse */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Packungsgröße</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Packungsgröße"
            value={packungsgroesse}
            onChangeText={setPackungsgroesse}
            placeholder="z.B. 50"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Warnung ab (Premium) */}
        {premium ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Warnung ab Bestand</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Warnung ab Bestand"
              value={warnungAb}
              onChangeText={setWarnungAb}
              placeholder="z.B. 7"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
            />
          </View>
        ) : (
          <PremiumGate
            featureName="Bestandswarnung"
            description="Warnungen bei niedrigem Bestand sind nur mit Premium möglich."
            navigation={navigation}
          />
        )}

        {/* PZN */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>PZN / Barcode</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="PZN / Barcode"
            value={pzn}
            onChangeText={setPzn}
            placeholder="Optional"
            placeholderTextColor="#999"
            keyboardType="number-pad"
          />
        </View>

        {/* === ABSCHNITT: Erinnerung === */}
        <Text style={styles.sectionTitle} accessibilityRole="header">Erinnerung</Text>

        <View style={styles.switchRow}>
          <Text style={styles.label}>Erinnerung aktivieren</Text>
          <Switch
            value={erinnerungAktiv}
            accessibilityRole="switch"
            accessibilityLabel="Erinnerung aktivieren"
            accessibilityState={{ checked: erinnerungAktiv }}
            onValueChange={setErinnerungAktiv}
            trackColor={{ false: '#ccc', true: '#1a1a2e' }}
            thumbColor={erinnerungAktiv ? '#fff' : '#f4f4f4'}
            style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
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
                    <TouchableOpacity
                      style={[styles.tageszeitButton, isActive && styles.tageszeitButtonActive]}
                      accessibilityRole="switch"
                      accessibilityLabel={`${meta.label} ${isActive ? 'aktiv' : 'inaktiv'}`}
                      accessibilityState={{ checked: isActive }}
                      onPress={async () => {
                        const newPlan = await toggleSlot(einnahmePlan, slot);
                        setEinnahmePlan(newPlan);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.tageszeitEmoji} accessibilityElementsHidden>{meta.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tageszeitLabel, isActive && styles.tageszeitLabelActive]}>
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
                      <Text style={[styles.tageszeitCheck, isActive && styles.tageszeitCheckActive]}>
                        {isActive ? '✓' : '○'}
                      </Text>
                    </TouchableOpacity>

                    {isActive && (
                      <View style={styles.slotDosisRow}>
                        <Text style={styles.slotDosisLabel}>Dosis:</Text>
                        <TextInput
                          style={styles.slotDosisInput}
                          accessibilityLabel={`Dosis für ${meta.label}`}
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
                          keyboardType="decimal-pad"
                        />
                        <Text style={styles.slotDosisEinheit}>{einheit}</Text>
                      </View>
                    )}

                    {isActive && (
                      <View style={styles.wochentageBox}>
                        <Text style={styles.wochentageLabel}>Einnahmetage:</Text>
                        <View style={styles.wochentageRow}>
                          {(() => {
                            const istTaeglich = !eintrag?.wochentage || eintrag.wochentage.length === 0;
                            return (
                              <TouchableOpacity
                                style={[
                                  styles.wochentagButton,
                                  styles.taeglichButton,
                                  istTaeglich && styles.wochentagButtonActive,
                                ]}
                                accessibilityRole="switch"
                                accessibilityLabel={`${meta.label} jeden Tag ${istTaeglich ? 'aktiv' : 'inaktiv'}`}
                                accessibilityState={{ checked: istTaeglich }}
                                onPress={() => {
                                  setEinnahmePlan(prev => setSlotTaeglich(prev, slot));
                                }}
                              >
                                <Text style={[
                                  styles.wochentagButtonText,
                                  istTaeglich && styles.wochentagButtonTextActive,
                                ]}>
                                  Jeden Tag
                                </Text>
                              </TouchableOpacity>
                            );
                          })()}
                          {WOCHENTAGE_META.map(day => {
                            const isSelected = Boolean(eintrag?.wochentage?.includes(day.value));
                            return (
                              <TouchableOpacity
                                key={`${slot}-${day.value}`}
                                style={[
                                  styles.wochentagButton,
                                  isSelected && styles.wochentagButtonActive,
                                ]}
                                accessibilityRole="switch"
                                accessibilityLabel={`${meta.label} ${day.label} ${isSelected ? 'aktiv' : 'inaktiv'}`}
                                accessibilityState={{ checked: isSelected }}
                                onPress={() => {
                                  setEinnahmePlan(prev =>
                                    toggleSlotWochentag(prev, slot, day.value)
                                  );
                                }}
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
                        <Text style={styles.wochentageHint}>Für tägliche Einnahme „Jeden Tag“ wählen. Sonst einzelne Tage kombinieren.</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

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

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Automatischer Abzug</Text>
                <Text style={styles.hint}>Bestand wird bei jeder Erinnerung automatisch reduziert</Text>
              </View>
              <Switch
                value={autoAbzugAktiv}
                accessibilityRole="switch"
                accessibilityLabel="Automatischer Bestandsabzug"
                accessibilityState={{ checked: autoAbzugAktiv }}
                onValueChange={setAutoAbzugAktiv}
                trackColor={{ false: '#ccc', true: '#1a1a2e' }}
                thumbColor={autoAbzugAktiv ? '#fff' : '#f4f4f4'}
                style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Früher einnehmen erlauben</Text>
                <Text style={styles.hint}>Am selben Tag auch vor der Uhrzeit abhaken</Text>
              </View>
              <Switch
                value={frueheEinnahmeErlaubt}
                accessibilityRole="switch"
                accessibilityLabel="Früher einnehmen erlauben"
                accessibilityState={{ checked: frueheEinnahmeErlaubt }}
                onValueChange={setFrueheEinnahmeErlaubt}
                trackColor={{ false: '#ccc', true: '#1a1a2e' }}
                thumbColor={frueheEinnahmeErlaubt ? '#fff' : '#f4f4f4'}
                style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
              />
            </View>
          </>
        )}

        {/* Arzt-Zuordnung */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>👨‍⚕️ Verschreibender Arzt</Text>
          <Text style={styles.hint}>Welcher Arzt hat dieses Medikament verschrieben?</Text>
          {aerzte.length > 0 ? (
            <>
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
            </>
          ) : (
            <Text style={styles.hint}>Noch kein Arzt hinterlegt. Lege deinen Hausarzt zuerst unter „Arzt-Urlaub“ an.</Text>
          )}
        </View>

        {/* === ABSCHNITT: Stärke / Wirkstoffmenge === */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>💊 Stärke pro Einheit</Text>
          {activeIngredients.length > 1 ? (
            <View style={styles.comboNotice}>
              <Text style={styles.comboNoticeTitle}>Kombi-Präparat</Text>
              <Text style={styles.comboNoticeText}>
                Die Stärken werden je Wirkstoff oben gepflegt. Ein einzelner Wert wäre hier missverständlich.
              </Text>
            </View>
          ) : (
            <>
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
                <View style={{ flex: 1 }}>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setStaerkeEinheitDropdownOffen(prev => !prev)}
                    accessibilityRole="button"
                    accessibilityLabel="Stärke Einheit auswählen"
                  >
                    <Text style={[
                      styles.dropdownButtonText,
                      !staerkeEinheit && styles.dropdownPlaceholder,
                    ]}>
                      {staerkeEinheit || 'Einheit'}
                    </Text>
                    <Text style={styles.dropdownArrow}>{staerkeEinheitDropdownOffen ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {staerkeEinheitDropdownOffen && (
                    <View style={styles.dropdownMenu}>
                      {STRENGTH_UNITS.map(unit => (
                        <TouchableOpacity
                          key={unit}
                          style={styles.dropdownOption}
                          onPress={() => {
                            setStaerkeEinheit(unit);
                            setStaerkeEinheitDropdownOffen(false);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Stärke Einheit ${unit} auswählen`}
                        >
                          <Text style={styles.dropdownOptionText}>{unit}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </>
          )}
        </View>

        </ScrollView>

        {/* Speichern */}
        <View style={styles.saveFooter}>
        <TouchableOpacity
          style={styles.saveButton}
          accessibilityLabel="Änderungen speichern"
          accessibilityRole="button"
          onPress={() => handleSave()}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>Änderungen speichern</Text>
        </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  keyboardAvoidingContainer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  headerSaveButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerSaveButtonText: {
    color: '#0B63CE',
    fontSize: 17,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
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
  suggestionBox: {
    marginTop: 10,
    gap: 8,
  },
  suggestionButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B8C2CC',
    borderWidth: 2,
    borderRadius: 12,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  suggestionText: {
    color: '#1a1a2e',
    fontSize: 19,
    fontWeight: '600',
  },
  wirkstoffPreview: {
    marginTop: 10,
    backgroundColor: '#E8F1FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#B8D1F0',
  },
  wirkstoffPreviewTitle: {
    fontSize: 16,
    color: '#0B63CE',
    fontWeight: '800',
    marginBottom: 6,
  },
  wirkstoffPreviewText: {
    fontSize: 17,
    color: '#1a1a2e',
    fontWeight: '600',
    lineHeight: 24,
  },
  wirkstoffPreviewHint: {
    marginTop: 8,
    fontSize: 14,
    color: '#35516C',
    lineHeight: 20,
  },
  wirkstoffInput: {
    minHeight: 76,
    paddingTop: 12,
  },
  comboNotice: {
    backgroundColor: '#FFF7E6',
    borderColor: '#F2C66D',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  comboNoticeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#7A4B00',
    marginBottom: 4,
  },
  comboNoticeText: {
    fontSize: 15,
    color: '#5F4300',
    lineHeight: 21,
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
  einheitPremiumLocked: {
    borderColor: '#FFB74D',
    backgroundColor: '#FFF9F0',
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
    minHeight: 56,
    justifyContent: 'center',
  },
  saveFooter: {
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  saveButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dropdownButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#ddd',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonText: {
    fontSize: 18,
    color: '#1a1a2e',
    fontWeight: '600',
  },
  dropdownPlaceholder: {
    color: '#777',
    fontWeight: '400',
  },
  dropdownArrow: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownMenu: {
    marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ccd3d7',
    overflow: 'hidden',
  },
  dropdownOption: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
  },
  dropdownOptionText: {
    fontSize: 18,
    color: '#1a1a2e',
    fontWeight: '600',
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

  // Tageszeit-Toggle
  tageszeitRow: { marginBottom: 12 },
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
  tageszeitEmoji: { fontSize: 32, marginRight: 14 },
  tageszeitLabel: { fontSize: 22, fontWeight: '600', color: '#888' },
  tageszeitLabelActive: { color: '#1a1a2e' },
  tageszeitUhrzeit: { fontSize: 16, color: '#999' },
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
  tageszeitCheck: { fontSize: 28, color: '#ccc' },
  tageszeitCheckActive: { color: '#27ae60' },

  // Individuelle Dosis pro Slot
  slotDosisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 56,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 8,
  },
  slotDosisLabel: { fontSize: 18, color: '#666' },
  slotDosisInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 20,
    color: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#ccc',
    minHeight: 48,
  },
  slotDosisEinheit: { fontSize: 16, color: '#888' },

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
  taeglichButton: {
    minWidth: 112,
    paddingHorizontal: 12,
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
