/**
 * HomeScreen.tsx – Hauptübersicht aller Medikamente
 *
 * Senioren-freundlich: Große Touch-Flächen, hoher Kontrast,
 * klare Anzeige der Bestände (inkl. Float-Werte wie 28.5)
 */

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useMedikamente } from '../context/MedikamentContext';
import { calculateReichweite, formatStaerke } from '../utils/ReichweitenCalc';
import { usePersonen } from '../context/PersonenContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { calculateUrlaubsWarnungen } from '../database/UrlaubController';
import { getMaxMedikamente, isPremium } from '../services/PremiumService';
import { version as APP_VERSION } from '../../package.json';
import {
  getOffeneEinnahmen,
  getHeutigeEinnahmeMedikamentIds,
  getUeberfaelligeEinnahmeMedikamentIds,
  sollErinnerungZeigen,
  setzteLetzteErinnerung,
  type OffeneEinnahme,
} from '../services/EinnahmeErinnerungService';
import { einnahmeVerbuchen } from '../database/MedikamentController';
import EinnahmeErinnerungModal from '../components/EinnahmeErinnerungModal';
import { logger } from '../utils/Logger';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';
import {
  getUrlaubsReminderTasks,
  markUrlaubsReminderDone,
  postponeUrlaubsReminderForToday,
  type UrlaubsReminderTask,
} from '../services/UrlaubsReminderService';
import {
  formatActiveIngredient,
  formatActiveIngredientStrengthSummary,
  parseActiveIngredients,
} from '../utils/ActiveIngredients';
import {
  getAllRezeptTermine,
  type RezeptTerminInfo,
} from '../services/RezeptTerminService';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { medikamente, medikamenteUnterSchwelle, loading, refresh } = useMedikamente();
  const { personen, aktivePerson, setAktivePerson, maxPersonen, premium } = usePersonen();
  const [urlaubsReminderTasks, setUrlaubsReminderTasks] = useState<UrlaubsReminderTask[]>([]);
  const [menueOffen, setMenueOffen] = useState(false);
  const [erinnerungOffen, setErinnerungOffen] = useState(false);
  const [offeneEinnahmen, setOffeneEinnahmen] = useState<OffeneEinnahme[]>([]);
  const [heuteEingenommenIds, setHeuteEingenommenIds] = useState<Set<string>>(new Set());
  const [offeneEinnahmeMedikamentIds, setOffeneEinnahmeMedikamentIds] = useState<Set<string>>(new Set());
  const [ueberfaelligeEinnahmeMedikamentIds, setUeberfaelligeEinnahmeMedikamentIds] = useState<Set<string>>(new Set());
  const [rezeptTermine, setRezeptTermine] = useState<Record<string, RezeptTerminInfo>>({});

  // Medikamente nach aktiver Person filtern
  const gefilterteMedikamente = useMemo(() => {
    if (!aktivePerson) return medikamente;
    return medikamente.filter(m => m.person_id === aktivePerson.id);
  }, [medikamente, aktivePerson]);

  // Urlaub-Erinnerungen nach aktiver Person filtern
  const gefilterteUrlaubsReminder = useMemo(() => {
    if (!aktivePerson) return urlaubsReminderTasks;
    return urlaubsReminderTasks.filter(task => task.personId === aktivePerson.id);
  }, [urlaubsReminderTasks, aktivePerson]);

  // Unter-Schwelle nach aktiver Person filtern
  const gefilterteUnterSchwelle = useMemo(() => {
    if (!aktivePerson) return medikamenteUnterSchwelle;
    return medikamenteUnterSchwelle.filter(m => m.person_id === aktivePerson.id);
  }, [medikamenteUnterSchwelle, aktivePerson]);

  // Premium-Status einmal laden
  const [premiumStatus, setPremiumStatus] = useState(false);
  useEffect(() => { isPremium().then(setPremiumStatus); }, []);

  const ladeEinnahmeStatus = useCallback(async () => {
    const [eingenommenIds, offene, ueberfaelligeIds] = await Promise.all([
      getHeutigeEinnahmeMedikamentIds(),
      getOffeneEinnahmen(0),
      getUeberfaelligeEinnahmeMedikamentIds(),
    ]);
    setHeuteEingenommenIds(eingenommenIds);
    setOffeneEinnahmeMedikamentIds(new Set(offene.map(e => e.medikamentId)));
    setUeberfaelligeEinnahmeMedikamentIds(ueberfaelligeIds);
    return { eingenommenIds, offene };
  }, []);

  // Hamburger-Menü im Header links
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => setMenueOffen(true)}
          style={styles.hamburgerButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Menü öffnen"
        >
          <Text style={styles.hamburgerIcon} accessibilityElementsHidden>☰</Text>
        </TouchableOpacity>
      ),
      headerRight: () => null,
    });
  }, [navigation]);

  // Urlaub-Kollisionen als Tagesaufgabe laden
  useEffect(() => {
    ladeUrlaubsReminder().catch(logger.error);
  }, []);

  const ladeUrlaubsReminder = async () => {
    const warnungen = await calculateUrlaubsWarnungen();
    const tasks = await getUrlaubsReminderTasks(warnungen);
    setUrlaubsReminderTasks(tasks);
  };

  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      ladeEinnahmeStatus().catch(error => {
        logger.error('Einnahme-Status konnte nicht geladen werden:', error);
      });
      getAllRezeptTermine()
        .then(setRezeptTermine)
        .catch(error => {
          logger.error('Rezepttermine konnten nicht geladen werden:', error);
        });
    }, [ladeEinnahmeStatus, loading])
  );

  // Einnahme-Erinnerung prüfen beim Öffnen
  useEffect(() => {
    if (loading) return;
    let aktiv = true;

    const pruefeErinnerung = async () => {
      try {
        const { offene } = await ladeEinnahmeStatus();

        const sollZeigen = await sollErinnerungZeigen(60);
        if (!sollZeigen || !aktiv) return;

        if (!aktiv || offene.length === 0) return;

        setOffeneEinnahmen(offene);
        setErinnerungOffen(true);
      } catch (e) {
        logger.error('Einnahme-Erinnerung fehlgeschlagen:', e);
      }
    };

    // Leichte Verzoegerung damit die UI erst aufbaut
    const timer = setTimeout(pruefeErinnerung, 1500);
    return () => { aktiv = false; clearTimeout(timer); };
  }, [ladeEinnahmeStatus, loading]);

  const openAddMedikament = async () => {
    const max = await getMaxMedikamente();
    if (medikamente.length >= max) {
      showPremiumRequiredAlert(`Mehr als ${max} Medikamente sind nur mit Premium möglich.`, navigation);
      return;
    }
    navigation.navigate('AddMedikament');
  };

  const erledigeUrlaubsReminder = async (task: UrlaubsReminderTask) => {
    try {
      await markUrlaubsReminderDone(task.key);
      setUrlaubsReminderTasks(prev => prev.filter(item => item.key !== task.key));
    } catch (error) {
      logger.error('Urlaubs-Erinnerung konnte nicht erledigt werden:', error);
      Alert.alert('Fehler', 'Die Erinnerung konnte nicht gespeichert werden.');
    }
  };

  const verschiebeUrlaubsReminder = async (task: UrlaubsReminderTask) => {
    try {
      await postponeUrlaubsReminderForToday(task.key);
      setUrlaubsReminderTasks(prev => prev.filter(item => item.key !== task.key));
    } catch (error) {
      logger.error('Urlaubs-Erinnerung konnte nicht verschoben werden:', error);
      Alert.alert('Fehler', 'Die Erinnerung konnte nicht verschoben werden.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a1a2e" />
        <Text
          style={styles.loadingText}
          accessibilityLiveRegion="polite"
        >Lade Medikamente...</Text>
      </View>
    );
  }

  const renderMedikament = ({ item }: { item: typeof medikamente[0] }) => {
    const isUnterSchwelle = item.aktueller_bestand <= item.warnung_ab_bestand;
    const reichweite = calculateReichweite(item);
    const staerkeText =
      formatStaerke(item.staerke_wert, item.staerke_einheit) ||
      formatActiveIngredientStrengthSummary(item.zusatz || '');
    const bestandText = formatCompactNumber(item.aktueller_bestand);
    const reichweiteBis = formatReichweiteBis(reichweite.leerDatum);
    const heuteEingenommen = heuteEingenommenIds.has(item.id);
    const heuteOffen = offeneEinnahmeMedikamentIds.has(item.id);
    const ueberfaellig = ueberfaelligeEinnahmeMedikamentIds.has(item.id);
    const bestandStatusStyles = getBestandStatusStyles({
      heuteEingenommen,
      heuteOffen: heuteOffen || Boolean(item.erinnerung_aktiv),
      ueberfaellig,
    });
    const rezeptTermin = rezeptTermine[item.id];
    const activeIngredients = parseActiveIngredients(item.zusatz || '');
    const showIngredientList = activeIngredients.length > 1 && activeIngredients.some(ingredient => ingredient.strength);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isUnterSchwelle && styles.cardWarning,
          reichweite.istKritisch && styles.cardCritical,
        ]}
        onPress={() => navigation.navigate('MedikamentDetail', { medikamentId: item.id })}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}${staerkeText ? `, ${staerkeText}` : ''}, Bestand: ${bestandText} ${item.einheit}, ${getBestandStatusLabel({ heuteEingenommen, heuteOffen: heuteOffen || Boolean(item.erinnerung_aktiv), ueberfaellig })}, ${reichweiteBis ? `Vorrat reicht bis ${reichweiteBis}` : reichweite.textLang}${isUnterSchwelle ? ', Nachbestellen empfohlen' : ''}`}
        accessibilityHint="Doppelt tippen für Details"
      >
        <View style={styles.cardContent}>
          <Text style={styles.medName}>{item.name}</Text>
          {showIngredientList ? (
            <View style={styles.wirkstoffListe}>
              {activeIngredients.map((ingredient, index) => (
                <Text key={`${ingredient.name}-${index}`} style={styles.medZusatz}>
                  {formatActiveIngredient(ingredient)}
                </Text>
              ))}
            </View>
          ) : item.zusatz ? (
            <Text style={styles.medZusatz}>{item.zusatz}</Text>
          ) : null}
          {staerkeText ? (
            <View
              style={styles.medStaerkeBadge}
              accessibilityLabel={`Stärke: ${staerkeText}`}
            >
              <View style={styles.medStaerkeIcon} accessibilityElementsHidden>
                <View style={styles.medStaerkeIconHalf} />
              </View>
              <Text style={styles.medStaerkeText}>{staerkeText}</Text>
            </View>
          ) : null}
          <View style={styles.reichweiteRow}>
            {reichweiteBis ? (
              <Text style={styles.reichweiteBis}>Vorrat reicht bis {reichweiteBis}</Text>
            ) : (
              <Text style={styles.reichweiteBis}>{reichweite.textLang}</Text>
            )}
          </View>
          {isUnterSchwelle && (
            <Text style={styles.warnungText}>
              ⚠ Nachbestellen empfohlen!
            </Text>
          )}
          {rezeptTermin ? (
            <Text style={styles.rezeptTerminText}>
              📅 Rezept-Erinnerung: {formatIsoDate(rezeptTermin.terminDatumIso)}
            </Text>
          ) : null}
          {heuteEingenommen ? (
            <Text style={styles.eingenommenText}>✓ Heute eingenommen</Text>
          ) : ueberfaellig ? (
            <Text style={styles.ueberfaelligText}>! Einnahme überfällig</Text>
          ) : heuteOffen ? (
            <Text style={styles.offenText}>○ Heute noch offen</Text>
          ) : item.erinnerung_aktiv ? (
            <Text style={styles.geplantText}>○ Heute geplant</Text>
          ) : null}
        </View>
        <View style={styles.cardBestand}>
          <Text style={[styles.bestandZahl, bestandStatusStyles]} maxFontSizeMultiplier={1.3}>
            {bestandText}
          </Text>
          <Text style={[styles.bestandLabel, bestandStatusStyles]}>{item.einheit}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderUrlaubsReminderTask = () => {
    const task = gefilterteUrlaubsReminder[0];
    if (!task) return null;
    const restliche = gefilterteUrlaubsReminder.length - 1;

    return (
      <View style={styles.dailyTaskCard} accessibilityLiveRegion="polite">
        <Text style={styles.dailyTaskEyebrow}>Heute wichtig</Text>
        <Text style={styles.dailyTaskTitle}>{task.title}</Text>
        <Text style={styles.dailyTaskBody}>{task.body}</Text>
        {restliche > 0 ? (
          <Text style={styles.dailyTaskMore}>
            + {restliche} weitere Erinnerung(en)
          </Text>
        ) : null}
        <View style={styles.dailyTaskActions}>
          <TouchableOpacity
            style={[styles.dailyTaskButton, styles.dailyTaskButtonSecondary]}
            onPress={() => verschiebeUrlaubsReminder(task)}
            accessibilityRole="button"
            accessibilityLabel="Urlaubserinnerung später anzeigen"
          >
            <Text style={styles.dailyTaskButtonSecondaryText}>Später</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dailyTaskButton, styles.dailyTaskButtonPrimary]}
            onPress={() => erledigeUrlaubsReminder(task)}
            accessibilityRole="button"
            accessibilityLabel="Urlaubserinnerung als erledigt markieren"
          >
            <Text style={styles.dailyTaskButtonPrimaryText}>Erledigt</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Personen-Umschalter */}
      {personen.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.personenLeiste}
          contentContainerStyle={styles.personenLeisteContent}
          accessibilityRole="tablist"
          accessibilityLabel="Personen-Auswahl"
        >
          {personen.map(person => {
            const isActive = aktivePerson?.id === person.id;
            return (
              <TouchableOpacity
                key={person.id}
                style={[
                  styles.personChip,
                  isActive && styles.personChipActive,
                ]}
                onPress={() => setAktivePerson(person)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${person.name}${isActive ? ' (ausgewählt)' : ''}`}
              >
                <Text style={styles.personEmoji} accessibilityElementsHidden>
                  {person.avatar_uri ? '📷' : person.avatar_emoji}
                </Text>
                <Text
                  style={[styles.personName, isActive && styles.personNameActive]}
                  numberOfLines={1}
                >
                  {person.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Warnungs-Banner */}
      {premiumStatus && gefilterteUnterSchwelle.length > 0 && (
        <View
          style={styles.warnBanner}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.warnBannerText}>
            ⚠ {gefilterteUnterSchwelle.length} Medikament(e) unter Warnschwelle
          </Text>
        </View>
      )}

      {/* Leerer Zustand */}
      {gefilterteMedikamente.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Keine Medikamente</Text>
          <Text style={styles.emptySubtitle}>
            Tippe auf "+" um dein erstes Medikament hinzuzufügen.
          </Text>
          {__DEV__ && (
            <TouchableOpacity
              style={styles.e2eAddButton}
              testID="e2e-add-medication-button"
              onPress={openAddMedikament}
              accessibilityRole="button"
              accessibilityLabel="Medikament hinzufügen"
            >
              <Text style={styles.e2eAddButtonText}>Medikament hinzufügen</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={gefilterteMedikamente}
          keyExtractor={item => item.id}
          renderItem={renderMedikament}
          ListHeaderComponent={renderUrlaubsReminderTask}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Hinzufuegen-Button */}
      <TouchableOpacity
        style={styles.fab}
        testID="add-medication-button"
        onPress={openAddMedikament}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Neues Medikament hinzufügen"
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Hamburger-Seitenmenue */}
      <Modal
        visible={menueOffen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenueOffen(false)}
      >
        <Pressable
          style={styles.menueOverlay}
          onPress={() => setMenueOffen(false)}
          accessible={false}
        >
          <Pressable style={styles.menuePanel} onPress={() => {}} accessible={false}>
            {/* Menue-Header */}
            <View style={styles.menueHeader}>
              <Text style={styles.menueTitle}>Mein MediPlan</Text>
              <TouchableOpacity
                onPress={() => setMenueOffen(false)}
                accessibilityRole="button"
                accessibilityLabel="Menü schließen"
              >
                <Text style={styles.menueClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Menue-Eintraege */}
            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('Settings'); }}
              accessibilityRole="button"
              accessibilityLabel="Einstellungen"
            >
              <Text style={styles.menueItemIcon}>⚙️</Text>
              <Text style={styles.menueItemText}>Einstellungen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('ArztUrlaub'); }}
              accessibilityRole="button"
              accessibilityLabel="Arzt-Urlaub"
            >
              <Text style={styles.menueItemIcon}>📅</Text>
              <Text style={styles.menueItemText}>Arzt-Urlaub</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('MedicationPlanExport'); }}
              accessibilityRole="button"
              accessibilityLabel="Plan teilen"
            >
              <Text style={styles.menueItemIcon}>📄</Text>
              <Text style={styles.menueItemText}>Plan teilen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('Backup'); }}
              accessibilityRole="button"
              accessibilityLabel="Cloud-Backup"
            >
              <Text style={styles.menueItemIcon}>☁️</Text>
              <Text style={styles.menueItemText}>Cloud-Backup</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('ErsteSchritte'); }}
              accessibilityRole="button"
              accessibilityLabel="Erste Schritte"
            >
              <Text style={styles.menueItemIcon}>?</Text>
              <Text style={styles.menueItemText}>Erste Schritte</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('DatenschutzRecht'); }}
              accessibilityRole="button"
              accessibilityLabel="Datenschutz und Rechtliches"
            >
              <Text style={styles.menueItemIcon}>§</Text>
              <Text style={styles.menueItemText}>Datenschutz & Rechtliches</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('Premium'); }}
              accessibilityRole="button"
              accessibilityLabel="Premium"
            >
              <Text style={styles.menueItemIcon}>⭐</Text>
              <Text style={styles.menueItemText}>Premium</Text>
            </TouchableOpacity>

            {/* Version */}
            <View style={styles.menueFooter}>
              <Text style={styles.menueVersion}>Version {APP_VERSION}</Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Einnahme-Erinnerung Modal */}
      <EinnahmeErinnerungModal
        visible={erinnerungOffen}
        offeneEinnahmen={offeneEinnahmen}
        onBestaetigen={async (medikamentId, dosis, slot) => {
          await einnahmeVerbuchen(medikamentId, dosis, slot);
          await refresh();
          const { offene } = await ladeEinnahmeStatus();
          setOffeneEinnahmen(offene);
          if (offene.length === 0) {
            setErinnerungOffen(false);
          }
          await setzteLetzteErinnerung();
        }}
        onSpaeter={async () => {
          setErinnerungOffen(false);
          await setzteLetzteErinnerung();
        }}
        onSchliessen={async () => {
          setErinnerungOffen(false);
          await setzteLetzteErinnerung();
        }}
      />
    </SafeAreaView>
  );
}

function formatCompactNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatReichweiteBis(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}.${year}`;
}

type BestandStatusInput = {
  heuteEingenommen: boolean;
  heuteOffen: boolean;
  ueberfaellig: boolean;
};

function getBestandStatusStyles(status: BestandStatusInput) {
  if (status.heuteEingenommen) return styles.bestandTaken;
  if (status.ueberfaellig) return styles.bestandOverdue;
  if (status.heuteOffen) return styles.bestandOpen;
  return styles.bestandNeutral;
}

function getBestandStatusLabel(status: BestandStatusInput): string {
  if (status.heuteEingenommen) return 'heute eingenommen';
  if (status.ueberfaellig) return 'Einnahme überfällig';
  if (status.heuteOffen) return 'heute noch nicht eingenommen';
  return 'kein Einnahmestatus';
}

// --- Styles (Senioren-freundlich, WCAG AA Kontrast) ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  personenLeiste: {
    maxHeight: 80,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  personenLeisteContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 10,
  },
  personChip: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    minWidth: 56,
    minHeight: 56,
  },
  personChipActive: {
    backgroundColor: '#d4edda',
    borderWidth: 2,
    borderColor: '#28a745',
  },
  personEmoji: {
    fontSize: 24,
    marginBottom: 2,
  },
  personName: {
    fontSize: 12,
    color: '#555',
    maxWidth: 60,
    textAlign: 'center',
  },
  personNameActive: {
    color: '#155724',
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 18,
    color: '#333',
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    // Mindestens 44px Touch-Fläche (Senioren-Richtlinie)
    minHeight: 88,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: '#e74c3c',
  },
  cardCritical: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF6D00',
  },
  cardContent: {
    flex: 1,
    paddingRight: 12,
  },
  medName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 2,
  },
  medZusatz: {
    fontSize: 14,
    color: '#777',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  wirkstoffListe: {
    marginBottom: 2,
  },
  medStaerkeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderWidth: 1,
    borderColor: '#B7D8F5',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 4,
  },
  medStaerkeIcon: {
    width: 22,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2F80C9',
    overflow: 'hidden',
    marginRight: 7,
  },
  medStaerkeIconHalf: {
    width: 11,
    height: 12,
    backgroundColor: '#B7D8F5',
  },
  medStaerkeText: {
    fontSize: 14,
    color: '#155C96',
    fontWeight: '700',
  },
  medDetail: {
    fontSize: 16,
    color: '#555',
    marginBottom: 2,
  },
  reichweiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  reichweiteBadge: {
    borderRadius: 8,
    backgroundColor: '#E9F7EF',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  reichweiteBadgeCritical: {
    backgroundColor: '#FFF3E0',
  },
  reichweiteBadgeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E20',
  },
  reichweiteBadgeTextCritical: {
    color: '#E65100',
  },
  reichweiteBis: {
    fontSize: 15,
    color: '#666',
  },
  warnungText: {
    fontSize: 16,
    color: '#e74c3c',
    fontWeight: '600',
    marginTop: 4,
  },
  rezeptTerminText: {
    marginTop: 6,
    fontSize: 16,
    color: '#0B63CE',
    fontWeight: '700',
  },
  eingenommenText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#1B7F3A',
  },
  offenText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#A15C00',
  },
  ueberfaelligText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#C62828',
  },
  geplantText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
  },
  cardBestand: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: 104,
    flexShrink: 0,
  },
  bestandZahl: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'right',
    width: '100%',
  },
  bestandLabel: {
    fontSize: 14,
    textAlign: 'right',
    width: '100%',
  },
  bestandTaken: {
    color: '#1B7F3A',
  },
  bestandOpen: {
    color: '#A15C00',
  },
  bestandOverdue: {
    color: '#C62828',
  },
  bestandNeutral: {
    color: '#4A5568',
  },
  warnBanner: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ffc107',
  },
  warnBannerText: {
    fontSize: 16,
    color: '#856404',
    fontWeight: '600',
    textAlign: 'center',
  },
  dailyTaskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0B63CE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dailyTaskEyebrow: {
    fontSize: 14,
    color: '#0B63CE',
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dailyTaskTitle: {
    fontSize: 20,
    color: '#1a1a2e',
    fontWeight: '700',
    marginBottom: 6,
  },
  dailyTaskBody: {
    fontSize: 17,
    color: '#333',
    lineHeight: 24,
  },
  dailyTaskMore: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
    marginTop: 8,
  },
  dailyTaskActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  dailyTaskButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyTaskButtonPrimary: {
    backgroundColor: '#0B63CE',
  },
  dailyTaskButtonSecondary: {
    backgroundColor: '#EEF4FC',
    borderWidth: 1,
    borderColor: '#B8D1F0',
  },
  dailyTaskButtonPrimaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  dailyTaskButtonSecondaryText: {
    color: '#0B63CE',
    fontSize: 17,
    fontWeight: '700',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
  e2eAddButton: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
  },
  e2eAddButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    // Min 44x44 erfüllt
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  fabText: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  hamburgerButton: {
    marginLeft: 8,
    padding: 6,
  },
  hamburgerIcon: {
    fontSize: 28,
    color: '#1a1a2e',
  },
  menueOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  menuePanel: {
    width: '75%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 0,
  },
  menueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 8,
  },
  menueTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  menueClose: {
    fontSize: 24,
    color: '#888',
    padding: 8,
  },
  menueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  menueItemIcon: {
    fontSize: 24,
    width: 40,
  },
  menueItemText: {
    fontSize: 20,
    color: '#1a1a2e',
    fontWeight: '500',
  },
  menueFooter: {
    marginTop: 'auto',
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
  },
  menueVersion: {
    fontSize: 14,
    color: '#999',
  },
});
