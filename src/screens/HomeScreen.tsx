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
  AppState,
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
import { DuplicateEinnahmeError, einnahmeVerbuchen } from '../database/MedikamentController';
import EinnahmeErinnerungModal from '../components/EinnahmeErinnerungModal';
import EinnahmeNachtragModal from '../components/EinnahmeNachtragModal';
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
  getVerifiedAllRezeptTermine,
  type RezeptTerminInfo,
} from '../services/RezeptTerminService';
import {
  getEinnahmenForLocalDay,
  type TagesEinnahmeWithMedikament,
} from '../database/EinnahmeController';
import { parseEinnahmeplan, istSlotAnDatumAktiv } from '../utils/Einnahmeplan';
import {
  getOffeneEinnahmeNachtraege,
  speichereEinnahmeNachtraege,
  type NachtragRangeMode,
  type OffeneEinnahmeNachtragGroup,
  type OffeneEinnahmeNachtragItem,
} from '../services/EinnahmeNachtragService';
import {
  dateFromLocalDateKey,
  getLocalDateKey,
  msUntilNextLocalDay,
} from '../utils/LocalDate';
import {
  buildHomeActionStatus,
  formatProtocolEntryCount,
  type HomeMissedGroup,
} from '../utils/HomeActionStatus';

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
  const [heutigeProtokolle, setHeutigeProtokolle] = useState<TagesEinnahmeWithMedikament[]>([]);
  const [nachtragOffen, setNachtragOffen] = useState(false);
  const [nachtragLoading, setNachtragLoading] = useState(false);
  const [nachtragSaving, setNachtragSaving] = useState(false);
  const [nachtragMode, setNachtragMode] = useState<NachtragRangeMode>('sevenDays');
  const [nachtragCustomDate, setNachtragCustomDate] = useState<Date | undefined>();
  const [nachtragGroups, setNachtragGroups] = useState<OffeneEinnahmeNachtragGroup[]>([]);
  const [nachtragPhase, setNachtragPhase] = useState<'past' | 'today'>('past');
  const [missedNachtragGroups, setMissedNachtragGroups] = useState<HomeMissedGroup[]>([]);
  const [heuteKey, setHeuteKey] = useState(() => getLocalDateKey());
  const heuteDatum = useMemo(() => dateFromLocalDateKey(heuteKey), [heuteKey]);

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

  const bedarfsMedikamente = useMemo(() => {
    return gefilterteMedikamente.filter(m => parseEinnahmeplan(m.einnahme_uhrzeiten || '[]').length === 0);
  }, [gefilterteMedikamente]);

  const heutigePlanMedikamente = useMemo(() => {
    return gefilterteMedikamente.filter(m => {
      const plan = parseEinnahmeplan(m.einnahme_uhrzeiten || '[]');
      return plan.some(slot => istSlotAnDatumAktiv(slot, heuteDatum));
    });
  }, [gefilterteMedikamente, heuteDatum]);

  const offeneEinnahmenFuerPerson = useMemo(() => {
    const erlaubteIds = new Set(gefilterteMedikamente.map(m => m.id));
    return offeneEinnahmen.filter(e => erlaubteIds.has(e.medikamentId));
  }, [gefilterteMedikamente, offeneEinnahmen]);

  // Premium-Status einmal laden
  const [premiumStatus, setPremiumStatus] = useState(false);
  useEffect(() => { isPremium().then(setPremiumStatus); }, []);

  const ladeEinnahmeStatus = useCallback(async (datum: Date = heuteDatum) => {
    const [eingenommenIds, offene, ueberfaelligeIds, heutigeEinnahmen] = await Promise.all([
      getHeutigeEinnahmeMedikamentIds(),
      getOffeneEinnahmen(0),
      getUeberfaelligeEinnahmeMedikamentIds(),
      getEinnahmenForLocalDay(datum, aktivePerson?.id),
    ]);
    setHeuteEingenommenIds(eingenommenIds);
    setOffeneEinnahmen(offene);
    setOffeneEinnahmeMedikamentIds(new Set(offene.map(e => e.medikamentId)));
    setUeberfaelligeEinnahmeMedikamentIds(ueberfaelligeIds);
    setHeutigeProtokolle(heutigeEinnahmen);
    return { eingenommenIds, offene };
  }, [aktivePerson?.id, heuteDatum]);

  const ladeNachtrag = useCallback(async (
    mode: NachtragRangeMode,
    customDate?: Date,
  ) => {
    setNachtragLoading(true);
    try {
      const groups = await getOffeneEinnahmeNachtraege(aktivePerson?.id, mode, customDate);
      setNachtragGroups(groups);
      setNachtragMode(mode);
      setNachtragCustomDate(customDate);
    } catch (error) {
      logger.error('Einnahme-Nachtrag konnte nicht geladen werden:', error);
      Alert.alert('Fehler', 'Die offenen Einnahmen konnten nicht geladen werden.');
    } finally {
      setNachtragLoading(false);
    }
  }, [aktivePerson?.id]);

  const ladeMissedNachtragSummary = useCallback(async () => {
    try {
      const groups = await getOffeneEinnahmeNachtraege(aktivePerson?.id, 'sevenDays');
      setMissedNachtragGroups(groups.map(group => ({
        datumIso: group.datumIso,
        itemCount: group.items.length,
      })));
    } catch (error) {
      logger.error('Nachtrags-Zusammenfassung konnte nicht geladen werden:', error);
      setMissedNachtragGroups([]);
    }
  }, [aktivePerson?.id]);

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

  const ladeUrlaubsReminder = useCallback(async () => {
    const warnungen = await calculateUrlaubsWarnungen();
    const tasks = await getUrlaubsReminderTasks(warnungen);
    setUrlaubsReminderTasks(tasks);
  }, []);

  const refreshTagesstand = useCallback(async () => {
    const nextHeuteKey = getLocalDateKey();
    const nextHeuteDatum = dateFromLocalDateKey(nextHeuteKey);
    setHeuteKey(nextHeuteKey);
    await Promise.all([
      refresh(),
      ladeEinnahmeStatus(nextHeuteDatum),
      ladeUrlaubsReminder(),
      ladeMissedNachtragSummary(),
      getVerifiedAllRezeptTermine()
        .then(setRezeptTermine)
        .catch(error => {
          logger.error('Rezepttermine konnten nicht geladen werden:', error);
        }),
    ]);
  }, [ladeEinnahmeStatus, ladeMissedNachtragSummary, ladeUrlaubsReminder, refresh]);

  // Urlaub-Kollisionen als Tagesaufgabe laden
  useEffect(() => {
    ladeUrlaubsReminder().catch(logger.error);
  }, [ladeUrlaubsReminder]);

  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      refreshTagesstand().catch(error => {
        logger.error('Tagesstand konnte nicht aktualisiert werden:', error);
      });
    }, [loading, refreshTagesstand])
  );

  useEffect(() => {
    if (loading) return;

    let midnightTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleMidnightRefresh = () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      midnightTimer = setTimeout(() => {
        refreshTagesstand().catch(error => {
          logger.error('Tageswechsel konnte nicht aktualisiert werden:', error);
        });
        scheduleMidnightRefresh();
      }, msUntilNextLocalDay());
    };

    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      refreshTagesstand()
        .then(scheduleMidnightRefresh)
        .catch(error => {
          logger.error('Tagesstand nach App-Aktivierung konnte nicht aktualisiert werden:', error);
        });
    });

    scheduleMidnightRefresh();

    return () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      appStateSubscription.remove();
    };
  }, [loading, refreshTagesstand]);

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
        accessibilityLabel={`${item.name}${staerkeText ? `, ${staerkeText}` : ''}${rezeptTermin ? ', Rezept-Erinnerung vorhanden' : ''}, Bestand: ${bestandText} ${item.einheit}, ${getBestandStatusLabel({ heuteEingenommen, heuteOffen: heuteOffen || Boolean(item.erinnerung_aktiv), ueberfaellig })}, ${reichweiteBis ? `Vorrat reicht bis ${reichweiteBis}` : reichweite.textLang}${isUnterSchwelle ? ', Nachbestellen empfohlen' : ''}`}
        accessibilityHint="Doppelt tippen für Details"
      >
        <View style={styles.cardContent}>
          <View style={styles.medHeaderRow}>
            <Text style={styles.medName}>{item.name}</Text>
            {rezeptTermin ? (
              <Text
                style={styles.rezeptTerminIcon}
                accessibilityLabel="Rezept-Erinnerung vorhanden"
              >
                📅
              </Text>
            ) : null}
          </View>
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

  const openEinnahmeModal = () => {
    if (offeneEinnahmenFuerPerson.length === 0) return;
    setOffeneEinnahmen(offeneEinnahmenFuerPerson);
    setErinnerungOffen(true);
  };

  const openNachtragModal = async () => {
    setNachtragPhase('past');
    setNachtragOffen(true);
    await ladeNachtrag('sevenDays');
  };

  const handleNachtragSpeichern = async (items: OffeneEinnahmeNachtragItem[]) => {
    setNachtragSaving(true);
    try {
      const result = await speichereEinnahmeNachtraege(items);
      await refresh();
      await ladeEinnahmeStatus();
      await ladeMissedNachtragSummary();

      if (nachtragPhase === 'past') {
        const todayGroups = await getOffeneEinnahmeNachtraege(aktivePerson?.id, 'today');
        if (todayGroups.length > 0) {
          Alert.alert(
            'Nachtrag gespeichert',
            `${result.gespeichert} Einnahme${result.gespeichert === 1 ? '' : 'n'} nachgetragen. Heute sind noch Einnahmen offen.`,
            [
              { text: 'Fertig', style: 'cancel', onPress: () => setNachtragOffen(false) },
              {
                text: 'Heute bestätigen',
                onPress: () => {
                  setNachtragPhase('today');
                  setNachtragMode('today');
                  setNachtragGroups(todayGroups);
                },
              },
            ],
          );
        } else {
          setNachtragOffen(false);
          Alert.alert(
            'Nachtrag gespeichert',
            `${result.gespeichert} Einnahme${result.gespeichert === 1 ? '' : 'n'} nachgetragen.`,
          );
        }
      } else {
        setNachtragOffen(false);
        Alert.alert(
          'Heute gespeichert',
          `${result.gespeichert} Einnahme${result.gespeichert === 1 ? '' : 'n'} für heute protokolliert.`,
        );
      }
    } catch (error) {
      logger.error('Einnahme-Nachtrag konnte nicht gespeichert werden:', error);
      Alert.alert('Fehler', 'Der Nachtrag konnte nicht gespeichert werden.');
    } finally {
      setNachtragSaving(false);
    }
  };

  const renderTagesHeader = () => {
    const tage = buildDayStrip(heuteDatum);
    const offeneCount = offeneEinnahmenFuerPerson.length;
    const geplantCount = heutigePlanMedikamente.length;
    const erledigtCount = heutigeProtokolle.length;
    const protokolliert = groupHeutigeProtokolle(heutigeProtokolle);
    const actionStatus = buildHomeActionStatus({
      missedGroups: missedNachtragGroups,
      todayOpenCount: offeneCount,
      plannedTodayCount: geplantCount,
      loggedTodayCount: erledigtCount,
    });

    const handleActionPress = () => {
      if (actionStatus.kind === 'missed') {
        openNachtragModal().catch(logger.error);
        return;
      }
      if (actionStatus.kind === 'todayOpen') {
        openEinnahmeModal();
      }
    };

    return (
      <View>
        {renderUrlaubsReminderTask()}

        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>{formatTodayTitle(heuteDatum)}</Text>
          <View style={styles.dayStrip} accessibilityLabel="Tagesübersicht">
            {tage.map(tag => (
              <View
                key={tag.key}
                style={[styles.dayDotWrap, tag.isToday && styles.dayDotWrapActive]}
              >
                <Text style={[styles.dayWeekday, tag.isToday && styles.dayWeekdayActive]}>
                  {tag.weekday}
                </Text>
                <View style={[styles.dayDot, tag.isToday && styles.dayDotActive]}>
                  <Text style={[styles.dayNumber, tag.isToday && styles.dayNumberActive]}>
                    {tag.day}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Aktionen</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.homeActionCard,
            actionStatus.severity === 'critical' && styles.homeActionCardCritical,
            actionStatus.severity === 'warning' && styles.homeActionCardWarning,
            actionStatus.severity === 'attention' && styles.homeActionCardAttention,
            actionStatus.severity === 'success' && styles.homeActionCardSuccess,
          ]}
          onPress={actionStatus.actionLabel ? handleActionPress : undefined}
          disabled={!actionStatus.actionLabel}
          activeOpacity={0.84}
          accessibilityRole={actionStatus.actionLabel ? 'button' : 'text'}
          accessibilityLabel={`${actionStatus.title}. ${actionStatus.message}${actionStatus.actionLabel ? `. ${actionStatus.actionLabel}` : ''}`}
        >
          <View style={styles.homeActionTextWrap}>
            <Text style={[
              styles.homeActionTitle,
              actionStatus.severity === 'critical' && styles.homeActionTextCritical,
              actionStatus.severity === 'warning' && styles.homeActionTextWarning,
              actionStatus.severity === 'attention' && styles.homeActionTextAttention,
              actionStatus.severity === 'success' && styles.homeActionTextSuccess,
            ]}>
              {actionStatus.title}
            </Text>
            <Text style={[
              styles.homeActionSub,
              actionStatus.severity === 'critical' && styles.homeActionTextCritical,
              actionStatus.severity === 'warning' && styles.homeActionTextWarning,
              actionStatus.severity === 'attention' && styles.homeActionTextAttention,
              actionStatus.severity === 'success' && styles.homeActionTextSuccess,
            ]}>
              {actionStatus.message}
            </Text>
          </View>
          {actionStatus.actionLabel ? (
            <Text style={[
              styles.homeActionButton,
              actionStatus.severity === 'critical' && styles.homeActionTextCritical,
              actionStatus.severity === 'warning' && styles.homeActionTextWarning,
              actionStatus.severity === 'attention' && styles.homeActionTextAttention,
            ]}>
              {actionStatus.actionLabel}
            </Text>
          ) : null}
        </TouchableOpacity>

        {actionStatus.kind !== 'missed' ? (
          <TouchableOpacity
            style={styles.nachtragSecondaryAction}
            onPress={openNachtragModal}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Vergessene Einnahmen nachtragen"
          >
            <Text style={styles.nachtragSecondaryText}>Einnahmen nachtragen</Text>
            <Text style={styles.nachtragSecondaryChevron}>›</Text>
          </TouchableOpacity>
        ) : null}

        {bedarfsMedikamente.length > 0 ? (
          <TouchableOpacity
            style={styles.bedarfCard}
            onPress={() => navigation.navigate('MedikamentDetail', { medikamentId: bedarfsMedikamente[0].id })}
            accessibilityRole="button"
            accessibilityLabel={`${bedarfsMedikamente.length} Bedarfsmedikament(e). Antippen zum Erfassen.`}
          >
            <Text style={styles.bedarfTitle}>Bedarfsmedikamente</Text>
            <Text style={styles.bedarfCount}>{bedarfsMedikamente.length}</Text>
          </TouchableOpacity>
        ) : null}

        {protokolliert.length > 0 ? (
          <View style={styles.protocolCard}>
            <View style={styles.protocolHeaderRow}>
              <Text style={styles.protocolTitle}>Protokolliert</Text>
            <Text style={styles.protocolTime}>{protokolliert[0].time}</Text>
            </View>
            {protokolliert.slice(0, 5).map(item => (
              <View key={`${item.name}-${item.time}`} style={styles.protocolItem}>
                <Text style={styles.protocolCheck}>✓</Text>
                <Text style={styles.protocolName}>{item.name}</Text>
              </View>
            ))}
            {protokolliert.length > 5 ? (
              <Text style={styles.protocolMore}>+ {protokolliert.length - 5} weitere</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.medicationsHeaderRow}>
          <Text style={styles.sectionTitle}>Deine Medikamente</Text>
          <TouchableOpacity
            onPress={openAddMedikament}
            accessibilityRole="button"
            accessibilityLabel="Medikament hinzufügen"
          >
            <Text style={styles.medicationsHeaderAction}>Hinzufügen</Text>
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
          ListHeaderComponent={renderTagesHeader}
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

      <EinnahmeNachtragModal
        visible={nachtragOffen}
        title={nachtragPhase === 'today' ? 'Heute auch bestätigen?' : 'Offene Einnahmen nachtragen'}
        subtitle={
          nachtragPhase === 'today'
            ? 'Diese Einnahmen sind heute noch offen oder dürfen schon bestätigt werden.'
            : 'Wähle die offenen Einnahmen aus, die du wirklich genommen hast.'
        }
        groups={nachtragGroups}
        loading={nachtragLoading}
        mode={nachtragMode}
        customDate={nachtragCustomDate}
        showRangeSelector={nachtragPhase === 'past'}
        saving={nachtragSaving}
        onModeChange={(mode, customDate) => {
          setNachtragPhase('past');
          ladeNachtrag(mode, customDate).catch(logger.error);
        }}
        onSave={handleNachtragSpeichern}
        onClose={() => setNachtragOffen(false)}
      />

      {/* Einnahme-Erinnerung Modal */}
      <EinnahmeErinnerungModal
        visible={erinnerungOffen}
        offeneEinnahmen={offeneEinnahmenFuerPerson}
        onBestaetigen={async (medikamentId, dosis, slot) => {
          await einnahmeVerbuchen(medikamentId, dosis, slot);
          await refresh();
          const { offene } = await ladeEinnahmeStatus();
          await ladeMissedNachtragSummary();
          setOffeneEinnahmen(offene);
          const offeneIds = new Set(gefilterteMedikamente.map(medikament => medikament.id));
          if (offene.filter(einnahme => offeneIds.has(einnahme.medikamentId)).length === 0) {
            setErinnerungOffen(false);
          }
          await setzteLetzteErinnerung();
        }}
        onAlleBestaetigen={async (einnahmen) => {
          let fehlgeschlagen = false;
          for (const einnahme of einnahmen) {
            try {
              await einnahmeVerbuchen(einnahme.medikamentId, einnahme.dosis, einnahme.slot);
            } catch (error) {
              if (!(error instanceof DuplicateEinnahmeError)) {
                fehlgeschlagen = true;
              }
            }
          }
          await refresh();
          const { offene } = await ladeEinnahmeStatus();
          await ladeMissedNachtragSummary();
          setOffeneEinnahmen(offene);
          const offeneIds = new Set(gefilterteMedikamente.map(medikament => medikament.id));
          if (offene.filter(einnahme => offeneIds.has(einnahme.medikamentId)).length === 0) {
            setErinnerungOffen(false);
          }
          await setzteLetzteErinnerung();
          if (fehlgeschlagen) {
            throw new Error('Mindestens eine Einnahme konnte nicht bestätigt werden.');
          }
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

function formatTodayTitle(date: Date): string {
  return `Heute, ${date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
  })}`;
}

function buildDayStrip(today: Date): Array<{
  key: string;
  weekday: string;
  day: string;
  isToday: boolean;
}> {
  const start = new Date(today);
  start.setDate(today.getDate() - 3);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const isToday = date.toDateString() === today.toDateString();
    return {
      key: date.toISOString(),
      weekday: date.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''),
      day: String(date.getDate()),
      isToday,
    };
  });
}

function groupHeutigeProtokolle(
  einnahmen: TagesEinnahmeWithMedikament[],
): Array<{ name: string; time: string }> {
  const seen = new Set<string>();
  const grouped: Array<{ name: string; time: string }> = [];

  for (const einnahme of einnahmen) {
    const key = `${einnahme.medikament_id}-${einnahme.slot || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    grouped.push({
      name: einnahme.medikament_name,
      time: einnahme.uhrzeit_formatted,
    });
  }

  return grouped;
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
  dayHeader: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 14,
    marginBottom: 14,
  },
  dayTitle: {
    fontSize: 28,
    color: '#111827',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
  },
  dayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayDotWrap: {
    alignItems: 'center',
    minWidth: 38,
  },
  dayDotWrapActive: {
    transform: [{ translateY: -2 }],
  },
  dayWeekday: {
    fontSize: 14,
    color: '#7A7F87',
    fontWeight: '700',
    marginBottom: 6,
  },
  dayWeekdayActive: {
    color: '#111827',
  },
  dayDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECEEF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotActive: {
    backgroundColor: '#4FB7D8',
  },
  dayNumber: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '700',
  },
  dayNumberActive: {
    color: '#FFFFFF',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 26,
    color: '#111827',
    fontWeight: '800',
  },
  homeActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    minHeight: 104,
    borderWidth: 1,
  },
  homeActionCardCritical: {
    backgroundColor: '#FEECEC',
    borderColor: '#F3B3B3',
  },
  homeActionCardWarning: {
    backgroundColor: '#FFF7E0',
    borderColor: '#E8C96A',
  },
  homeActionCardAttention: {
    backgroundColor: '#EAF3FF',
    borderColor: '#B8D4F8',
  },
  homeActionCardSuccess: {
    backgroundColor: '#EAF7F0',
    borderColor: '#BFE6CE',
  },
  homeActionTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  homeActionTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  homeActionSub: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 6,
    fontWeight: '600',
  },
  homeActionButton: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
    maxWidth: 128,
  },
  homeActionTextCritical: {
    color: '#8A1F1F',
  },
  homeActionTextWarning: {
    color: '#6D4A00',
  },
  homeActionTextAttention: {
    color: '#155C96',
  },
  homeActionTextSuccess: {
    color: '#14532D',
  },
  nachtragSecondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  nachtragSecondaryText: {
    fontSize: 17,
    color: '#374151',
    fontWeight: '700',
  },
  nachtragSecondaryChevron: {
    fontSize: 26,
    color: '#6B7280',
    fontWeight: '700',
  },
  bedarfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 58,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#EAF6FA',
    marginBottom: 12,
  },
  bedarfTitle: {
    fontSize: 20,
    color: '#102A43',
    fontWeight: '800',
  },
  bedarfCount: {
    minWidth: 34,
    textAlign: 'center',
    fontSize: 20,
    color: '#155C96',
    fontWeight: '900',
  },
  protocolCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
  },
  protocolHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  protocolTitle: {
    fontSize: 22,
    color: '#111827',
    fontWeight: '800',
  },
  protocolTime: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '700',
  },
  protocolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
  },
  protocolCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: 'center',
    lineHeight: 26,
    backgroundColor: '#4FB7D8',
    color: '#FFFFFF',
    fontWeight: '900',
    marginRight: 10,
  },
  protocolName: {
    fontSize: 20,
    color: '#111827',
    fontWeight: '700',
    flexShrink: 1,
  },
  protocolMore: {
    marginTop: 6,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '700',
  },
  medicationsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  medicationsHeaderAction: {
    fontSize: 18,
    color: '#0B63CE',
    fontWeight: '800',
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
  medHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  medName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 2,
    flexShrink: 1,
  },
  rezeptTerminIcon: {
    fontSize: 17,
    color: '#0B63CE',
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
    width: '82%',
    maxWidth: 340,
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
    flex: 1,
    fontSize: 21,
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
    paddingLeft: 18,
    paddingRight: 16,
    minHeight: 58,
  },
  menueItemIcon: {
    fontSize: 22,
    width: 34,
    marginRight: 4,
    textAlign: 'center',
  },
  menueItemText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 19,
    color: '#1a1a2e',
    fontWeight: '500',
    lineHeight: 23,
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
