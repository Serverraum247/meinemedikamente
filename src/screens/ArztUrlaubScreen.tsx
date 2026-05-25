/**
 * ArztUrlaubScreen.tsx – Arzt-Urlaub verwalten
 *
 * Zeigt eine Liste aller Urlaube mit Warnungen.
 * Urlaube eintragen, verwalten und löschen ist kostenlos.
 * Premium ergänzt Komfortfunktionen wie direktes Anrufen und Kalender-Erinnerungen.
 * Verwendet die Arztdaten aus der Einstellungen-Sektion.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Linking,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createArztUrlaub,
  getAllArztUrlaube,
  deleteArztUrlaub,
  calculateUrlaubsWarnungen,
  ArztUrlaubRow,
  UrlaubsWarnung,
} from '../database/UrlaubController';
import {
  getAllAerzte,
  createArzt,
  getMaxAerzte,
  type ArztRow,
} from '../database/ArztController';
import { isPremium } from '../services/PremiumService';
import { logger } from '../utils/Logger';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';
import {
  dateToGermanInput,
  formatGermanDate,
  normalizeGermanDateInput,
  parseGermanDate,
} from '../utils/GermanDate';

// ---------- Helper functions ----------

function isFutureOrToday(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d >= today;
}

// ---------- Component ----------

interface ArztUrlaubScreenProps {
  navigation?: any;
}

const ArztUrlaubScreen: React.FC<ArztUrlaubScreenProps> = ({ navigation }) => {
  const [praxisName, setPraxisName] = useState('');
  const [telefon, setTelefon] = useState('');
  const [urlaubVon, setUrlaubVon] = useState('');
  const [urlaubBis, setUrlaubBis] = useState('');
  const [urlaube, setUrlaube] = useState<ArztUrlaubRow[]>([]);
  const [warnungen, setWarnungen] = useState<UrlaubsWarnung[]>([]);
  const [premium, setPremiumStatus] = useState(false);
  const [aerzte, setAerzte] = useState<ArztRow[]>([]);
  const [maxAerzte, setMaxAerzteState] = useState(1);
  const [menueOffen, setMenueOffen] = useState(false);
  const [neuenArztAnlegen, setNeuenArztAnlegen] = useState(false);
  const [neuArztName, setNeuArztName] = useState('');
  const [neuArztTelefon, setNeuArztTelefon] = useState('');
  const [neuArztEmail, setNeuArztEmail] = useState('');
  const [neuArztFachgebiet, setNeuArztFachgebiet] = useState('');
  const [selectedArztId, setSelectedArztId] = useState<string | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<'von' | 'bis' | null>(null);
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(new Date()));
  const skipUnsavedPromptRef = React.useRef(false);

  const isDirty = useMemo(
    () =>
      praxisName.trim().length > 0 ||
      telefon.trim().length > 0 ||
      urlaubVon.trim().length > 0 ||
      urlaubBis.trim().length > 0 ||
      selectedArztId !== null,
    [praxisName, selectedArztId, telefon, urlaubBis, urlaubVon],
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!navigation) return;
    navigation.setOptions({
      headerRight: () => null,
    });
  });

  useEffect(() => {
    if (!navigation) return undefined;
    return navigation.addListener('beforeRemove', (event: any) => {
      if (skipUnsavedPromptRef.current || !isDirty) return;
      event.preventDefault();
      Alert.alert(
        'Änderungen speichern?',
        'Willst du den Urlaub eintragen, bevor du gehst?',
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
          { text: 'Speichern', onPress: () => void handleAddUrlaub(true) },
        ],
      );
    });
  }, [isDirty, navigation, praxisName, telefon, urlaubBis, urlaubVon, selectedArztId]);

  const loadData = async () => {
    try {
      const [urlaubeList, warnings, isPrem, aerzteList, max] = await Promise.all([
        getAllArztUrlaube(),
        calculateUrlaubsWarnungen(),
        isPremium(),
        getAllAerzte(),
        getMaxAerzte(),
      ]);
      const activeUrlaube = urlaubeList.filter(
        (u: ArztUrlaubRow) => isFutureOrToday(u.urlaub_ende)
      );
      setUrlaube(activeUrlaube);
      setWarnungen(warnings);
      setPremiumStatus(isPrem);
      setAerzte(aerzteList);
      setMaxAerzteState(max);
    } catch (error) {
      logger.error('Fehler beim Laden der Urlaubsdaten:', error);
    }
  };

  // Arzt aus der Liste auswählen
  const handleArztAuswahlen = (arzt: ArztRow) => {
    setSelectedArztId(arzt.id);
    setPraxisName(arzt.name);
    setTelefon(arzt.telefon);
    setMenueOffen(false);
  };

  // Neuen Arzt anlegen (ein Arzt kostenlos, mehr mit Premium)
  const handleNeuenArztSpeichern = async () => {
    if (!neuArztName.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Namen ein.');
      return;
    }
    const result = await createArzt({
      name: neuArztName.trim(),
      telefon: neuArztTelefon.trim(),
      email: neuArztEmail.trim(),
      adresse: '',
      plz: '',
      ort: '',
      land: 'Deutschland',
      fachgebiet: neuArztFachgebiet.trim(),
    });
    if (!result.success) {
      showPremiumRequiredAlert('Mehr als ein Arzt ist nur mit Premium möglich.', navigation);
      return;
    }
    // Neuen Arzt zur Liste laden und auswählen
    await loadData();
    const newArzt = (await getAllAerzte()).find(a => a.name === neuArztName.trim());
    if (newArzt) {
      handleArztAuswahlen(newArzt);
    }
    setNeuenArztAnlegen(false);
    setNeuArztName('');
    setNeuArztTelefon('');
    setNeuArztEmail('');
    setNeuArztFachgebiet('');
  };

  const handleAddUrlaub = async (goBackAfterSave = false) => {
    const name = praxisName.trim();
    if (!name) {
      Alert.alert('Fehler', 'Bitte wählen oder geben Sie einen Praxis-Namen ein.');
      return;
    }
    if (!urlaubVon || !urlaubBis) {
      Alert.alert('Fehler', 'Bitte geben Sie beide Daten ein (von und bis).');
      return;
    }

    const startDate = parseGermanDate(urlaubVon);
    const endDate = parseGermanDate(urlaubBis);

    if (!startDate) {
      Alert.alert('Fehler', 'Ungültiges Datum bei "Urlaub von". Bitte Format TT.MM.JJJJ verwenden.');
      return;
    }
    if (!endDate) {
      Alert.alert('Fehler', 'Ungültiges Datum bei "Urlaub bis". Bitte Format TT.MM.JJJJ verwenden.');
      return;
    }
    if (startDate > endDate) {
      Alert.alert('Fehler', 'Das Enddatum muss nach dem Startdatum liegen.');
      return;
    }

    try {
      await createArztUrlaub({
        id: '',
        person_id: 'person-default-001',
        arzt_id: selectedArztId || '',
        praxis_name: name,
        telefon: telefon.trim(),
        urlaub_start: startDate,
        urlaub_ende: endDate,
      } as any);
      setPraxisName('');
      setTelefon('');
      setUrlaubVon('');
      setUrlaubBis('');
      setSelectedArztId(null);
      await loadData();
      Alert.alert('Erfolg', 'Urlaub wurde eingetragen.', [
        {
          text: 'OK',
          onPress: () => {
            if (goBackAfterSave && navigation) {
              skipUnsavedPromptRef.current = true;
              navigation.goBack();
            }
          },
        },
      ]);
    } catch (error) {
      logger.error('Fehler beim Eintragen:', error);
      Alert.alert('Fehler', 'Urlaub konnte nicht eingetragen werden.');
    }
  };

  const requestGoBack = () => {
    if (!navigation) return;
    if (!isDirty) {
      navigation.goBack();
      return;
    }

    Alert.alert(
      'Änderungen speichern?',
      'Willst du den Urlaub eintragen, bevor du gehst?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verwerfen',
          style: 'destructive',
          onPress: () => {
            skipUnsavedPromptRef.current = true;
            navigation.goBack();
          },
        },
        { text: 'Speichern', onPress: () => void handleAddUrlaub(true) },
      ],
    );
  };

  const openDatePicker = (target: 'von' | 'bis') => {
    const current = target === 'von' ? urlaubVon : urlaubBis;
    const iso = parseGermanDate(current);
    const base = iso ? new Date(`${iso}T12:00:00`) : new Date();
    setPickerMonth(startOfMonth(base));
    setDatePickerTarget(target);
  };

  const selectDate = (date: Date) => {
    const value = dateToGermanInput(date);
    if (datePickerTarget === 'von') setUrlaubVon(value);
    if (datePickerTarget === 'bis') setUrlaubBis(value);
    setDatePickerTarget(null);
  };

  const handleDeleteUrlaub = async (id: string, praxisNameDelete: string) => {
    Alert.alert(
      'Urlaub löschen',
      `Möchten Sie den Urlaub von "${praxisNameDelete}" wirklich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteArztUrlaub(id);
              await loadData();
            } catch (error) {
              logger.error('Fehler beim Löschen:', error);
              Alert.alert('Fehler', 'Urlaub konnte nicht gelöscht werden.');
            }
          },
        },
      ]
    );
  };

  // Anruf mit Bestaetigungsdialog
  const handleAnrufen = (praxisNameCall: string, telefonNummer: string) => {
    if (!premium) {
      showPremiumRequiredAlert('Arzt direkt anrufen ist nur mit Premium möglich.', navigation);
      return;
    }

    const nummer = telefonNummer.trim();
    if (!nummer) {
      Alert.alert('Keine Nummer', 'Für diese Praxis ist keine Telefonnummer hinterlegt.');
      return;
    }

    Alert.alert(
      'Arzt anrufen',
      `Möchten Sie "${praxisNameCall}" jetzt anrufen?\n\n${nummer}`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Anrufen',
          style: 'default',
          onPress: () => {
            Linking.openURL(`tel:${nummer}`).catch(() => {
              Alert.alert('Fehler', 'Anruf konnte nicht gestartet werden.');
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ---------- Header ---------- */}
        <View style={styles.header}>
          {navigation ? (
            <TouchableOpacity
              style={[styles.addButton, styles.headerActionButton]}
              onPress={requestGoBack}
              accessibilityLabel="Zurück"
            >
              <Text style={styles.addButtonText}>Zurück</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.addButton, styles.headerActionButton]}
            onPress={() => handleAddUrlaub()}
            accessibilityRole="button"
            accessibilityLabel="Urlaub eintragen"
          >
            <Text style={styles.addButtonText}>Speichern</Text>
          </TouchableOpacity>
        </View>

        {/* ---------- Active Vacations List ---------- */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>Aktive Urlaube</Text>
            {urlaube.length > 0 ? (
              <Text style={styles.sectionCount}>{urlaube.length}</Text>
            ) : null}
          </View>
          <Text style={styles.sectionHint}>
            Bitte zuerst prüfen, ob der Urlaub schon eingetragen ist.
          </Text>
          {urlaube.length === 0 ? (
            <Text style={styles.emptyText}>Keine aktiven Urlaube eingetragen.</Text>
          ) : (
            urlaube.map((urlaub) => (
              <View key={urlaub.id} style={styles.urlaubCard}>
                <View style={styles.urlaubInfo}>
                  <Text style={styles.urlaubPraxis}>{urlaub.praxis_name}</Text>
                  <Text style={styles.urlaubDateRange}>
                    {formatGermanDate(urlaub.urlaub_start)} – {formatGermanDate(urlaub.urlaub_ende)}
                  </Text>
                  {urlaub.telefon ? (
                    <TouchableOpacity
                      style={styles.telefonRow}
                      onPress={() => handleAnrufen(urlaub.praxis_name, urlaub.telefon || '')}
                      accessibilityLabel={`${urlaub.praxis_name} anrufen: ${urlaub.telefon}`}
                      accessibilityHint="Tippen um Arzt anzurufen"
                    >
                      <Text style={styles.telefonIcon}>📞</Text>
                      <Text style={styles.telefonText}>{urlaub.telefon}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.urlaubActions}>
                  {urlaub.telefon ? (
                    <TouchableOpacity
                      style={styles.callButton}
                      onPress={() => handleAnrufen(urlaub.praxis_name, urlaub.telefon || '')}
                      accessibilityLabel={`${urlaub.praxis_name} anrufen`}
                    >
                      <Text style={styles.callButtonText}>📞</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteUrlaub(urlaub.id, urlaub.praxis_name)}
                    accessibilityLabel={`Urlaub löschen: ${urlaub.praxis_name}`}
                  >
                    <Text style={styles.deleteButtonText}>Löschen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ---------- Form Section ---------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Neuen Urlaub eintragen</Text>

          {/* Arzt-Auswahl */}
          <Text style={styles.label}>Arzt auswählen</Text>
          <TouchableOpacity
            style={[styles.input, styles.selectButton]}
            onPress={() => setMenueOffen(true)}
            accessibilityRole="button"
            accessibilityLabel="Arzt aus Liste auswählen"
          >
            <Text style={styles.selectButtonText}>
              {selectedArztId
                ? aerzte.find(a => a.id === selectedArztId)?.name || 'Arzt auswählen'
                : 'Arzt aus Liste auswählen'
              }
            </Text>
            <Text style={styles.arrowIcon}>▼</Text>
          </TouchableOpacity>

          {/* Manuelle Eingabe (Fallback) */}
          <Text style={styles.label}>Praxis-Name</Text>
          <TextInput
            style={styles.input}
            value={praxisName}
            onChangeText={setPraxisName}
            placeholder="z.B. Praxis Dr. Müller"
            placeholderTextColor="#999"
            accessibilityLabel="Praxis-Name eingeben"
          />

          <Text style={styles.label}>Telefonnummer</Text>
          <TextInput
            style={styles.input}
            value={telefon}
            onChangeText={setTelefon}
            placeholder="z.B. 0681 123456"
            placeholderTextColor="#999"
            keyboardType="phone-pad"
            accessibilityLabel="Telefonnummer eingeben"
          />

          <Text style={styles.label}>Urlaub von</Text>
          <TouchableOpacity
            style={styles.dateSelectButton}
            onPress={() => openDatePicker('von')}
            accessibilityRole="button"
            accessibilityLabel="Startdatum auswählen"
          >
            <Text style={[styles.dateSelectValue, !urlaubVon && styles.dateSelectPlaceholder]}>
              {urlaubVon || 'Startdatum wählen'}
            </Text>
            <Text style={styles.dateSelectIcon}>📅</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Urlaub bis</Text>
          <TouchableOpacity
            style={styles.dateSelectButton}
            onPress={() => openDatePicker('bis')}
            accessibilityRole="button"
            accessibilityLabel="Enddatum auswählen"
          >
            <Text style={[styles.dateSelectValue, !urlaubBis && styles.dateSelectPlaceholder]}>
              {urlaubBis || 'Enddatum wählen'}
            </Text>
            <Text style={styles.dateSelectIcon}>📅</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addButton}
            onPress={() => handleAddUrlaub()}
            accessibilityLabel="Urlaub eintragen"
          >
            <Text style={styles.addButtonText}>Urlaub eintragen</Text>
          </TouchableOpacity>
        </View>

        {/* ---------- Warnings Section ---------- */}
        {warnungen.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚠️ Warnungen</Text>
            {warnungen.map((warnung, index) => (
              <View key={index} style={styles.warningCard}>
                <Text style={styles.warningText}>
                  {warnung.medikament?.name ?? 'Medikament'} wird ca. am{' '}
                  {formatGermanDate(
                    warnung.leerDatum instanceof Date
                      ? warnung.leerDatum.toISOString().split('T')[0]
                      : String(warnung.leerDatum)
                  )} leer!{' '}
                  {warnung.urlaub?.praxis_name ?? 'Praxis'} ist vom{' '}
                  {formatGermanDate(warnung.urlaub?.urlaub_start ?? '')} bis{' '}
                  {formatGermanDate(warnung.urlaub?.urlaub_ende ?? '')} im Urlaub.
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Arzt-Auswahl-Menü (Modal) */}
        <Modal
          visible={menueOffen}
          transparent
          animationType="slide"
          onRequestClose={() => setMenueOffen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Arzt auswählen</Text>
                <TouchableOpacity onPress={() => setMenueOffen(false)}>
                  <Text style={styles.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>

              {aerzte.length === 0 ? (
                <Text style={styles.emptyModalText}>Noch keine Ärzte hinterlegt.</Text>
              ) : (
                <FlatList
                  data={aerzte}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.arztItem}
                      onPress={() => handleArztAuswahlen(item)}
                      accessibilityLabel={`${item.name} (${item.fachgebiet || 'Kein Fachgebiet'})`}
                    >
                      <View style={styles.arztItemInfo}>
                        <Text style={styles.arztItemName}>{item.name}</Text>
                        {item.fachgebiet ? (
                          <Text style={styles.arztItemDetail}>{item.fachgebiet}</Text>
                        ) : null}
                        {item.telefon ? (
                          <Text style={styles.arztItemDetail}>{item.telefon}</Text>
                        ) : null}
                        {item.email ? (
                          <Text style={styles.arztItemDetail}>{item.email}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.checkIcon}>✓</Text>
                    </TouchableOpacity>
                  )}
                />
              )}

              {/* Neuen Arzt anlegen: ein Arzt kostenlos, mehr mit Premium */}
              <TouchableOpacity
                style={styles.neuArztButton}
                onPress={() => {
                  if (aerzte.length >= maxAerzte) {
                    showPremiumRequiredAlert('Mehr als ein Arzt ist nur mit Premium möglich.', navigation);
                    return;
                  }
                  setMenueOffen(false);
                  setNeuenArztAnlegen(true);
                }}
                accessibilityLabel="Neuen Arzt anlegen"
              >
                <Text style={styles.neuArztButtonText}>+ Neuen Arzt anlegen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Neuen Arzt anlegen (Modal) */}
        <Modal
          visible={neuenArztAnlegen}
          transparent
          animationType="slide"
          onRequestClose={() => setNeuenArztAnlegen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Neuen Arzt anlegen</Text>

              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={neuArztName}
                onChangeText={setNeuArztName}
                placeholder="Dr. Max Mustermann"
                placeholderTextColor="#999"
                accessibilityLabel="Arzt-Namen eingeben"
              />

              <Text style={styles.label}>Fachgebiet</Text>
              <TextInput
                style={styles.input}
                value={neuArztFachgebiet}
                onChangeText={setNeuArztFachgebiet}
                placeholder="Hausarzt, Kardiologie..."
                placeholderTextColor="#999"
                accessibilityLabel="Fachgebiet eingeben"
              />

              <Text style={styles.label}>Telefon</Text>
              <TextInput
                style={styles.input}
                value={neuArztTelefon}
                onChangeText={setNeuArztTelefon}
                placeholder="0681 123456"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                accessibilityLabel="Telefonnummer eingeben"
              />

              <Text style={styles.label}>E-Mail</Text>
              <TextInput
                style={styles.input}
                value={neuArztEmail}
                onChangeText={setNeuArztEmail}
                placeholder="praxis@example.de"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="E-Mail-Adresse eingeben"
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => setNeuenArztAnlegen(false)}
                >
                  <Text style={styles.modalBtnCancelText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnSave]}
                  onPress={handleNeuenArztSpeichern}
                >
                  <Text style={styles.modalBtnSaveText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={datePickerTarget !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setDatePickerTarget(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {datePickerTarget === 'von' ? 'Startdatum wählen' : 'Enddatum wählen'}
                </Text>
                <TouchableOpacity onPress={() => setDatePickerTarget(null)}>
                  <Text style={styles.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.monthHeader}>
                <TouchableOpacity
                  style={styles.monthNavButton}
                  onPress={() => setPickerMonth(addMonths(pickerMonth, -1))}
                  accessibilityRole="button"
                  accessibilityLabel="Vorheriger Monat"
                >
                  <Text style={styles.monthNavText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.monthTitle}>{formatMonthTitle(pickerMonth)}</Text>
                <TouchableOpacity
                  style={styles.monthNavButton}
                  onPress={() => setPickerMonth(addMonths(pickerMonth, 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Nächster Monat"
                >
                  <Text style={styles.monthNavText}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.calendarGrid}>
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                  <Text key={day} style={styles.weekdayLabel}>{day}</Text>
                ))}
                {buildCalendarDays(pickerMonth).map((date, index) => (
                  date ? (
                    <TouchableOpacity
                      key={date.toISOString()}
                      style={styles.calendarDayButton}
                      onPress={() => selectDate(date)}
                      accessibilityRole="button"
                      accessibilityLabel={`${dateToGermanInput(date)} auswählen`}
                    >
                      <Text style={styles.calendarDayText}>{date.getDate()}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View key={`empty-${index}`} style={styles.calendarDayButton} />
                  )
                ))}
              </View>
              <View style={styles.manualDateFallback}>
                <Text style={styles.manualDateFallbackLabel}>Oder Datum eintippen</Text>
                <TextInput
                  style={styles.manualDateInput}
                  value={datePickerTarget === 'von' ? urlaubVon : urlaubBis}
                  onChangeText={text => {
                    const value = normalizeGermanDateInput(text);
                    if (datePickerTarget === 'von') setUrlaubVon(value);
                    if (datePickerTarget === 'bis') setUrlaubBis(value);
                  }}
                  placeholder="TT.MM.JJJJ"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  maxLength={10}
                  accessibilityLabel="Datum manuell eintippen"
                />
              </View>
              <TouchableOpacity
                style={styles.todayButton}
                onPress={() => selectDate(new Date())}
                accessibilityRole="button"
                accessibilityLabel="Heute auswählen"
              >
                <Text style={styles.todayButtonText}>Heute</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatMonthTitle(date: Date): string {
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function buildCalendarDays(month: Date): Array<Date | null> {
  const first = startOfMonth(month);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const leading = (first.getDay() + 6) % 7;
  const days: Array<Date | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= last.getDate(); day++) {
    days.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  return days;
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardAvoidingContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    paddingTop: 8,
  },
  headerActionButton: {
    flex: 1,
    marginTop: 0,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 16,
  },
  sectionTitleInRow: {
    marginBottom: 0,
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionCount: {
    minWidth: 34,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#E8F1FF',
    color: '#0B63CE',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  sectionHint: {
    fontSize: 16,
    color: '#555555',
    lineHeight: 22,
    marginBottom: 10,
  },
  label: {
    fontSize: 18,
    color: '#444444',
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
    minHeight: 50,
  },
  dateInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  dateInput: {
    flex: 1,
  },
  dateSelectButton: {
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#0B63CE',
    backgroundColor: '#EEF4FC',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateSelectValue: {
    fontSize: 18,
    color: '#1a1a1a',
    fontWeight: '700',
  },
  dateSelectPlaceholder: {
    color: '#0B63CE',
  },
  dateSelectIcon: {
    fontSize: 22,
  },
  datePickerButton: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#0B63CE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderColor: '#27ae60',
    borderWidth: 2,
  },
  selectButtonText: {
    fontSize: 18,
    color: '#27ae60',
    fontWeight: '600',
  },
  arrowIcon: {
    fontSize: 16,
    color: '#27ae60',
  },
  addButton: {
    backgroundColor: '#0B63CE',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
    minHeight: 52,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 18,
    color: '#888888',
    textAlign: 'center',
    paddingVertical: 12,
  },
  urlaubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
    minHeight: 60,
  },
  urlaubInfo: {
    flex: 1,
    marginRight: 12,
  },
  urlaubPraxis: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  urlaubDateRange: {
    fontSize: 16,
    color: '#555555',
    marginTop: 2,
  },
  telefonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 4,
  },
  telefonIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  telefonText: {
    fontSize: 16,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  urlaubActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callButton: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButtonText: {
    fontSize: 20,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#fff3cd',
    borderWidth: 2,
    borderColor: '#dc3545',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 18,
    color: '#842029',
    fontWeight: '500',
    lineHeight: 26,
  },
  premiumBanner: {
    backgroundColor: '#fff8e1',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  premiumBannerText: {
    fontSize: 18,
    color: '#856404',
    fontWeight: '600',
    marginBottom: 12,
  },
  premiumBannerButton: {
    backgroundColor: '#ffc107',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  premiumBannerButtonText: {
    color: '#333',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  datePickerModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthNavButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavText: {
    color: '#0B63CE',
    fontSize: 30,
    fontWeight: '700',
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  weekdayLabel: {
    width: '14.285%',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    marginBottom: 6,
  },
  calendarDayButton: {
    width: '14.285%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  calendarDayText: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 18,
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: Platform.OS === 'ios' ? 8 : 0,
    backgroundColor: '#F3F6FA',
    color: '#1a1a1a',
    fontSize: 17,
    fontWeight: '600',
  },
  manualDateFallback: {
    marginTop: 10,
  },
  manualDateFallbackLabel: {
    fontSize: 15,
    color: '#555',
    fontWeight: '600',
    marginBottom: 6,
  },
  manualDateInput: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cccccc',
    paddingHorizontal: 12,
    fontSize: 18,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  todayButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#0B63CE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  closeIcon: {
    fontSize: 28,
    color: '#888',
  },
  emptyModalText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 20,
  },
  arztItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  arztItemInfo: {
    flex: 1,
  },
  arztItemName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  arztItemDetail: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  checkIcon: {
    fontSize: 24,
    color: '#27ae60',
  },
  neuArztButton: {
    backgroundColor: '#27ae60',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 48,
  },
  neuArztButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalBtnCancelText: {
    fontSize: 16,
    color: '#888',
    fontWeight: '600',
  },
  modalBtnSave: {
    backgroundColor: '#27ae60',
  },
  modalBtnSaveText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default ArztUrlaubScreen;
