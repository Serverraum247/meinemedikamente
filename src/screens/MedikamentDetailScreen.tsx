/**
 * MedikamentDetailScreen.tsx – Detailansicht eines Medikaments
 *
 * - Einnahme bestaetigen (reduziert Bestand als Float)
 * - Bestand manuell anpassen (Nachkauf)
 * - Einnahme-Historie anzeigen
 * - Bearbeiten-Button -> EditMedikamentScreen
 * - Loeschen
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  FlatList,
  Platform,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMedikamente } from '../context/MedikamentContext';
import { MedikamentRow, PackungRow } from '../database/Database';
import { getEinnahmenByMedikament, EinnahmeWithDate, storniereEinnahme } from '../database/EinnahmeController';
import { einnahmeNachtragen } from '../database/MedikamentController';
import { getLetztePackung, getOffenePackungenCount, getPackungenByMedikament } from '../database/PackungController';
import { getRezeptTerminUrlaubsKonflikt } from '../database/UrlaubController';
import {
  parseEinnahmeplan,
  tagesdosisBerechnen,
  SLOT_META,
  SLOT_REIHENFOLGE,
  getAktuelleTageszeit,
  getDosisFuerSlot,
  istSlotAnDatumAktiv,
  type EinnahmeSlot,
  type TageszeitSlot,
} from '../utils/Einnahmeplan';
import {
  findBestaetigbarenSlotHeute,
  istFrueheEinnahmeErlaubt,
} from '../utils/EinnahmeBestaetigung';
import { announceChange } from '../utils/AccessibilityHelpers';
import { erstelleRezeptAbholtermin } from '../services/KalenderService';
import { canCreateCalendarEvent, recordCalendarEvent, isPremium } from '../services/PremiumService';
import { getArztById } from '../database/ArztController';
import { calculateReichweite, formatStaerke } from '../utils/ReichweitenCalc';
import { logger } from '../utils/Logger';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';
import { getOffeneEinnahmen } from '../services/EinnahmeErinnerungService';
import {
  formatActiveIngredient,
  formatActiveIngredientStrengthSummary,
  parseActiveIngredients,
} from '../utils/ActiveIngredients';
import {
  calculateRezeptTerminFromLeerDatum,
  REZEPT_TERMIN_TAGE_VOR_LEER,
} from '../utils/RezeptTermin';
import { formatGermanDate } from '../utils/GermanDate';
import {
  entferneRezeptTermin,
  getVerifiedRezeptTermin,
  saveRezeptTermin,
  synchronisiereRezeptTermin,
  istRezeptTerminAktuell,
  type RezeptTerminInfo,
  type RezeptTerminSyncResult,
} from '../services/RezeptTerminService';

type Props = NativeStackScreenProps<RootStackParamList, 'MedikamentDetail'>;

async function resolveSlotFuerBestaetigung(
  medikament: MedikamentRow,
  plan: EinnahmeSlot[],
  einnahmen: EinnahmeWithDate[],
): Promise<TageszeitSlot | null> {
  try {
    const offene = await getOffeneEinnahmen(0);
    const offenerEintrag = offene.find(einnahme => einnahme.medikamentId === medikament.id);
    if (offenerEintrag) {
      return offenerEintrag.slot;
    }
  } catch (error) {
    logger.error('Offener Einnahme-Slot konnte nicht ermittelt werden:', error);
  }

  const bestaetigbarerSlot = findBestaetigbarenSlotHeute({
    plan,
    eingenommeneSlots: getEingenommeneSlotsHeute(einnahmen),
    frueheEinnahmeErlaubt: istFrueheEinnahmeErlaubt(medikament.fruehe_einnahme_erlaubt),
  });

  if (bestaetigbarerSlot) {
    return bestaetigbarerSlot.slot;
  }

  const aktuelle = getAktuelleTageszeit();
  const heute = new Date();
  const aktuellerPlanSlot = plan.find(slot => slot.slot === aktuelle && istSlotAnDatumAktiv(slot, heute));
  if (aktuellerPlanSlot && istFrueheEinnahmeErlaubt(medikament.fruehe_einnahme_erlaubt)) {
    return aktuellerPlanSlot.slot;
  }

  const ersterAktiverSlot = [...plan]
    .sort((a, b) => SLOT_REIHENFOLGE.indexOf(a.slot) - SLOT_REIHENFOLGE.indexOf(b.slot))
    .find(slot => istSlotAnDatumAktiv(slot, heute));

  return istFrueheEinnahmeErlaubt(medikament.fruehe_einnahme_erlaubt)
    ? ersterAktiverSlot?.slot || aktuelle
    : null;
}

export default function MedikamentDetailScreen({ route, navigation }: Props) {
  const { medikamentId } = route.params;
  const { medikamente, bestätigeEinnahme, aktualisiereBestand, entferneMedikament } = useMedikamente();

  const [medikament, setMedikament] = useState<MedikamentRow | null>(null);
  const [historie, setHistorie] = useState<EinnahmeWithDate[]>([]);
  const [letztePackung, setLetztePackung] = useState<PackungRow | null>(null);
  const [offenePackungen, setOffenePackungen] = useState(0);
  const [packungsHistorie, setPackungsHistorie] = useState<PackungRow[]>([]);
  const [zeigeHistorie, setZeigeHistorie] = useState(false);
  const [premium, setPremiumStatus] = useState(false);
  const [arztName, setArztName] = useState('');
  const [arztEmail, setArztEmail] = useState('');
  const [korrekturModal, setKorrekturModal] = useState(false);
  const [korrekturWert, setKorrekturWert] = useState('');
  const [rezeptTermin, setRezeptTermin] = useState<RezeptTerminInfo | null>(null);
  const [offenerSlotHeute, setOffenerSlotHeute] = useState<TageszeitSlot | null>(null);
  const [zeigeEinnahmeHistorie, setZeigeEinnahmeHistorie] = useState(false);
  const [nachtragModal, setNachtragModal] = useState(false);
  const [nachtragTageZurueck, setNachtragTageZurueck] = useState(1);
  const [nachtragSlot, setNachtragSlot] = useState<TageszeitSlot>('morgens');

  // Medikament + Historie laden
  const loadData = useCallback(async () => {
    const found = medikamente.find(m => m.id === medikamentId);
    if (found) {
      setMedikament(found);
      navigation.setOptions({ title: found.name });
      // Arzt laden falls zugeordnet
      if (found.arzt_id) {
        const arzt = await getArztById(found.arzt_id);
        setArztName(arzt?.name || '');
        setArztEmail(arzt?.email || '');
      } else {
        setArztName('');
        setArztEmail('');
      }
    }
    try {
      setRezeptTermin(await getVerifiedRezeptTermin(medikamentId));
      const [einnahmen, offene] = await Promise.all([
        getEinnahmenByMedikament(medikamentId, 30),
        getOffeneEinnahmen(0),
      ]);
      setHistorie(einnahmen);
      const offenerEintrag = offene.find(einnahme => einnahme.medikamentId === medikamentId);
      if (offenerEintrag) {
        setOffenerSlotHeute(offenerEintrag.slot);
      } else if (found) {
        const plan = parseEinnahmeplan(found.einnahme_uhrzeiten || '[]');
        const bestaetigbarerSlot = findBestaetigbarenSlotHeute({
          plan,
          eingenommeneSlots: getEingenommeneSlotsHeute(einnahmen),
          frueheEinnahmeErlaubt: istFrueheEinnahmeErlaubt(found.fruehe_einnahme_erlaubt),
        });
        setOffenerSlotHeute(bestaetigbarerSlot?.slot || null);
      } else {
        setOffenerSlotHeute(null);
      }
      // Packungsdaten laden
      const letzte = await getLetztePackung(medikamentId);
      setLetztePackung(letzte);
      const count = await getOffenePackungenCount(medikamentId);
      setOffenePackungen(count);
      const hist = await getPackungenByMedikament(medikamentId);
      setPackungsHistorie(hist);
    } catch (e) {
      logger.error('[Historie] Fehler:', e);
    }
  }, [medikamente, medikamentId, navigation]);

  // Premium-Status einmal laden
  useEffect(() => {
    isPremium().then(setPremiumStatus);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEinnahme = useCallback(async () => {
    if (!medikament) return;
    const plan = parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]');
    const slot = await resolveSlotFuerBestaetigung(medikament, plan, historie);
    if (!slot) {
      Alert.alert('Noch nicht fällig', 'Diese Einnahme ist heute noch nicht fällig.');
      return;
    }
    const dosis = getDosisFuerSlot(plan, slot, medikament.einzeldosis);
    const slotLabel = SLOT_META[slot].label;

    Alert.alert(
      'Einnahme bestätigen',
      `${slotLabel}: ${dosis} ${medikament.einheit} ${medikament.name} eingenommen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Bestätigen',
          style: 'default',
          onPress: async () => {
            try {
              const neuerBestand = await bestätigeEinnahme(medikament.id, dosis, slot);
              await loadData(); // Historie refreshen
              announceChange(`${medikament.name} wurde als eingenommen markiert`);
              Alert.alert(
                'Eingenommen',
                `Neuer Bestand: ${neuerBestand} ${medikament.einheit}`
              );
            } catch (error) {
              Alert.alert('Fehler', 'Einnahme konnte nicht verbucht werden.');
            }
          },
        },
      ]
    );
  }, [historie, medikament, bestätigeEinnahme, loadData]);

  const handleDelete = useCallback(() => {
    if (!medikament) return;

    Alert.alert(
      'Medikament löschen',
      `"${medikament.name}" wirklich löschen? Alle Einnahmen werden ebenfalls entfernt.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await entferneMedikament(medikament.id);
            navigation.goBack();
          },
        },
      ]
    );
  }, [medikament, entferneMedikament, navigation]);

  // Einnahme stornieren (versehentliche Einnahme zuruecknehmen)
  const handleStornoEinnahme = useCallback((item: EinnahmeWithDate) => {
    if (!medikament) return;

    Alert.alert(
      'Einnahme stornieren',
      `Möchten Sie die Einnahme vom ${item.datum_formatted}, ${item.uhrzeit_formatted} Uhr stornieren?\n\nDer Bestand wird um ${item.menge} ${medikament.einheit} erhöht.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Stornieren',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await storniereEinnahme(item.id, medikament.id);
              if (result.success) {
                Alert.alert(
                  'Storniert',
                  result.neuerBestand !== undefined
                    ? `Einnahme wurde storniert.\nNeuer Bestand: ${result.neuerBestand} ${medikament.einheit}`
                    : 'Einnahme wurde storniert.'
                );
                await loadData();
              } else {
                Alert.alert('Fehler', 'Einnahme konnte nicht storniert werden.');
              }
            } catch (error) {
              Alert.alert('Fehler', 'Beim Stornieren ist ein Fehler aufgetreten.');
            }
          },
        },
      ]
    );
  }, [medikament, loadData]);

  const handleRezeptTerminErstellen = useCallback(async () => {
    if (!medikament) return;

    const aktuelleReichweite = calculateReichweite(medikament);
    if (!aktuelleReichweite.leerDatum) {
      Alert.alert('Nicht möglich', 'Für dieses Medikament kann aktuell kein Leer-Datum berechnet werden.');
      return;
    }

    const termin = calculateRezeptTerminFromLeerDatum(
      aktuelleReichweite.leerDatum,
      REZEPT_TERMIN_TAGE_VOR_LEER,
    );
    const konflikt = await getRezeptTerminUrlaubsKonflikt(medikament, termin.terminDatumIso);
    if (konflikt) {
      Alert.alert(
        'Arzt im Urlaub',
        `Die Rezept-Erinnerung wäre am ${formatGermanDate(termin.terminDatumIso)}.\n\n${konflikt.praxis_name} ist vom ${formatGermanDate(konflikt.urlaub_start)} bis ${formatGermanDate(konflikt.urlaub_ende)} im Urlaub.\n\nBitte das Rezept vor dem Urlaub besorgen oder einen anderen Weg wählen.`,
      );
      return;
    }

    try {
      const bestehenderTerminIstAktuell = istRezeptTerminAktuell(medikament, rezeptTermin);
      if (rezeptTermin && bestehenderTerminIstAktuell) {
        Alert.alert(
          'Rezept-Erinnerung besteht schon',
          `Für dieses Medikament ist bereits eine Rezept-Erinnerung am ${formatGermanDate(rezeptTermin.terminDatumIso)} geplant.`,
        );
        return;
      }

      const { allowed } = await canCreateCalendarEvent();
      if (!allowed) {
        showPremiumRequiredAlert(
          'Kalendertermine, zum Beispiel als Rezept-Erinnerung, sind nur mit Premium möglich.',
          navigation,
        );
        return;
      }

      const eventId = await erstelleRezeptAbholtermin(
        medikament.name,
        medikament.aktueller_bestand,
        medikament.einzeldosis,
        1,
        REZEPT_TERMIN_TAGE_VOR_LEER,
        termin.leerDatumIso,
        rezeptTermin?.eventId,
      );
      if (!eventId) {
        Alert.alert('Fehler', 'Kalendereintrag konnte nicht erstellt werden.');
        return;
      }

      await recordCalendarEvent();
      const info: RezeptTerminInfo = {
        terminDatumIso: termin.terminDatumIso,
        leerDatumIso: termin.leerDatumIso,
        eventId,
        createdAt: new Date().toISOString(),
      };
      await saveRezeptTermin(medikament.id, info);
      setRezeptTermin(info);
      Alert.alert(
        rezeptTermin ? 'Rezept-Erinnerung aktualisiert' : 'Rezept-Erinnerung erstellt',
        rezeptTermin
          ? `Die bestehende Erinnerung wurde auf den ${formatGermanDate(termin.terminDatumIso)} verschoben.`
          : `Die Erinnerung wurde für den ${formatGermanDate(termin.terminDatumIso)} im Kalender eingetragen.`,
      );
    } catch (error) {
      logger.error('Rezepttermin konnte nicht erstellt werden:', error);
      Alert.alert('Fehler', 'Kalendereintrag konnte nicht erstellt werden.');
    }
  }, [medikament, navigation, rezeptTermin]);

  const handleRezeptEmail = useCallback(() => {
    if (!medikament || !arztEmail) return;
    const subject = `Rezeptanfrage ${medikament.name}`;
    const body = [
      `Guten Tag,`,
      ``,
      `bitte stellen Sie mir ein Rezept für folgendes Medikament aus:`,
      ``,
      `Medikament: ${medikament.name}`,
      medikament.zusatz ? `Wirkstoff: ${medikament.zusatz}` : '',
      ``,
      `Vielen Dank.`,
    ].filter(Boolean).join('\n');

    const url = `mailto:${arztEmail.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Fehler', 'E-Mail-App konnte nicht geöffnet werden.');
    });
  }, [arztEmail, medikament]);

  const handleRezeptBesorgt = useCallback(() => {
    if (!medikament || !rezeptTermin) return;

    Alert.alert(
      'Rezept besorgt',
      `Ist das Rezept für ${medikament.name} jetzt besorgt? Die Erinnerung am ${formatGermanDate(rezeptTermin.terminDatumIso)} wird dann entfernt.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Erledigt',
          style: 'default',
          onPress: async () => {
            try {
              await entferneRezeptTermin(medikament.id, rezeptTermin.eventId);
              setRezeptTermin(null);
              Alert.alert('Erledigt', 'Die Rezept-Erinnerung wurde aus der App und dem Kalender entfernt.');
            } catch (error) {
              logger.error('Rezept-Erinnerung konnte nicht entfernt werden:', error);
              Alert.alert('Fehler', 'Die Rezept-Erinnerung konnte nicht entfernt werden.');
            }
          },
        },
      ],
    );
  }, [medikament, rezeptTermin]);

  const bestaetigeBestandskorrektur = useCallback(async (neuerBestand: number) => {
    if (!medikament) return;

    try {
      const bestaetigungsMedikament = { ...medikament, aktueller_bestand: neuerBestand };
      await aktualisiereBestand(medikament.id, neuerBestand);
      const syncResult = await synchronisiereRezeptTermin(bestaetigungsMedikament);
      await loadData();
      zeigeBestandskorrekturErgebnis(
        medikament.aktueller_bestand,
        neuerBestand,
        medikament.einheit,
        syncResult,
      );
    } catch {
      Alert.alert('Fehler', 'Bestand konnte nicht korrigiert werden.');
    }
  }, [aktualisiereBestand, loadData, medikament]);

  // Bestandskorrektur (Premium) – Platform-abhaengig
  const handleBestandskorrektur = useCallback(() => {
    if (!medikament) return;

    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Bestandskorrektur',
        `Aktueller Bestand: ${medikament.aktueller_bestand} ${medikament.einheit}\nNeuer Bestand:`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Korrigieren',
            onPress: async (value?: string) => {
              const input = (value || '').replace(',', '.');
              const neuerBestand = parseFloat(input);
              if (isNaN(neuerBestand) || neuerBestand < 0) {
                Alert.alert('Ungültig', 'Bitte eine gültige Zahl eingeben (z.B. 28.5).');
                return;
              }
              await bestaetigeBestandskorrektur(neuerBestand);
            },
          },
        ],
        'plain-text',
      String(medikament.aktueller_bestand)
    );
    } else {
      // Android: Eigenes Modal statt Alert.prompt
      setKorrekturWert(String(medikament.aktueller_bestand));
      setKorrekturModal(true);
    }
  }, [bestaetigeBestandskorrektur, medikament]);

  const handleEinnahmeNachtragen = useCallback(async () => {
    if (!medikament) return;

    const plan = parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]');
    const dosis = getDosisFuerSlot(plan, nachtragSlot, medikament.einzeldosis);
    const timestamp = buildNachtragTimestamp(nachtragTageZurueck, plan.find(item => item.slot === nachtragSlot)?.uhrzeit, nachtragSlot);

    try {
      const neuerBestand = await einnahmeNachtragen(medikament.id, dosis, timestamp, nachtragSlot);
      const syncResult = await synchronisiereRezeptTermin({ ...medikament, aktueller_bestand: neuerBestand });
      setNachtragModal(false);
      await loadData();
      zeigeEinnahmeNachtragErgebnis(medikament.aktueller_bestand, neuerBestand, medikament.einheit, syncResult);
    } catch (error) {
      logger.error('Einnahme konnte nicht nachgetragen werden:', error);
      Alert.alert('Fehler', 'Die Einnahme konnte nicht nachgetragen werden.');
    }
  }, [loadData, medikament, nachtragSlot, nachtragTageZurueck]);

  if (!medikament) {
    return (
      <View style={styles.center}>
        <Text>Lade Medikament...</Text>
      </View>
    );
  }

  const isUnterSchwelle = medikament.aktueller_bestand <= medikament.warnung_ab_bestand;

  // Reichweite berechnen (zentrale Utility)
  const reichweite = calculateReichweite(medikament);
  const staerkeText =
    formatStaerke(medikament.staerke_wert, medikament.staerke_einheit) ||
    formatActiveIngredientStrengthSummary(medikament.zusatz || '');
  const activeIngredients = parseActiveIngredients(medikament.zusatz || '');
  const rezeptTerminVorschlag = reichweite.leerDatum
    ? calculateRezeptTerminFromLeerDatum(reichweite.leerDatum, REZEPT_TERMIN_TAGE_VOR_LEER)
    : null;
  const offenerSlotMeta = offenerSlotHeute ? SLOT_META[offenerSlotHeute] : null;
  const offenerSlotPlan = offenerSlotHeute
    ? parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]').find(slot => slot.slot === offenerSlotHeute)
    : undefined;
  const offeneDosisHeute = offenerSlotHeute
    ? getDosisFuerSlot(
        parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]'),
        offenerSlotHeute,
        medikament.einzeldosis,
      )
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Name + Wirkstoff */}
        {activeIngredients.length > 1 ? (
          <View style={styles.wirkstoffeCard}>
            <Text style={styles.wirkstoffeTitle}>Wirkstoffe</Text>
            {activeIngredients.map((ingredient, index) => (
              <View key={`${ingredient.name}-${index}`} style={styles.wirkstoffRow}>
                <Text style={styles.wirkstoffNumber}>{index + 1}</Text>
                <Text style={styles.wirkstoffText}>{formatActiveIngredient(ingredient)}</Text>
              </View>
            ))}
          </View>
        ) : medikament.zusatz ? (
          <Text style={styles.zusatzUntertitel}>{medikament.zusatz}</Text>
        ) : null}

        {offenerSlotHeute && offenerSlotMeta && offeneDosisHeute !== null ? (
          <TouchableOpacity
            style={styles.prioritaetEinnahmeButton}
            onPress={handleEinnahme}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${medikament.name} als eingenommen markieren`}
            accessibilityHint="Offene Einnahme für heute direkt bestätigen"
          >
            <Text style={styles.prioritaetBadge}>Heute offen</Text>
            <Text style={styles.prioritaetTitle}>Einnahme bestätigen</Text>
            <Text style={styles.prioritaetSubtext}>
              {offenerSlotMeta.label}: {offeneDosisHeute} {medikament.einheit}
            </Text>
            {offenerSlotPlan?.uhrzeit ? (
              <Text style={styles.prioritaetTime}>Geplant für {offenerSlotPlan.uhrzeit} Uhr</Text>
            ) : null}
          </TouchableOpacity>
        ) : null}

        {/* Bestand-Anzeige */}
        <View
          style={[styles.bestandCard, isUnterSchwelle && styles.bestandCardWarning, reichweite.istKritisch && styles.bestandCardCritical]}
        accessibilityLabel={`Bestand: ${medikament.aktueller_bestand} ${medikament.einheit}${staerkeText ? `, Stärke: ${staerkeText}` : ''}, ${reichweite.textLang}`}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.bestandLabel} accessibilityRole="header">Vorrat zuhause</Text>
          <Text style={[styles.bestandWert, isUnterSchwelle && styles.bestandWertWarning]} maxFontSizeMultiplier={1.3}>
            {medikament.aktueller_bestand}
          </Text>
          <Text style={styles.bestandEinheit}>{medikament.einheit}</Text>
          {staerkeText ? (
            <View
              style={styles.staerkeBadge}
              accessibilityLabel={`Stärke: ${staerkeText}`}
            >
              <View style={styles.staerkeIcon} accessibilityElementsHidden>
                <View style={styles.staerkeIconHalf} />
              </View>
              <Text style={styles.staerkeInfoText}>{staerkeText}</Text>
            </View>
          ) : null}
          <Text style={[styles.bestandStatusLabel, isUnterSchwelle ? styles.bestandStatusWarning : styles.bestandStatusOk]}>
            {isUnterSchwelle ? 'Nachbestellen empfohlen' : 'Bestand ausreichend'}
          </Text>
          <Text style={[styles.tageInfo, reichweite.istKritisch && styles.tageInfoCritical]}>
            {reichweite.textLang}
          </Text>
          {premium && (
            <TouchableOpacity
              style={styles.korrekturButton}
              onPress={handleBestandskorrektur}
              accessibilityLabel="Bestand korrigieren"
              accessibilityHint="Bestand manuell anpassen, z.B. bei Verlust"
            >
              <Text style={styles.korrekturButtonText}>Bestand korrigieren</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Rezept-Erinnerung */}
        {medikament.aktueller_bestand > 0 && (
          <View style={styles.rezeptTerminCard}>
            <Text style={styles.sectionTitle}>Rezept</Text>
            {rezeptTermin ? (
              <Text style={styles.sectionBodyStrong}>
                Erinnerung am {formatGermanDate(rezeptTermin.terminDatumIso)}
              </Text>
            ) : rezeptTerminVorschlag ? (
              <Text style={styles.sectionBodyStrong}>
                Vorschlag: {formatGermanDate(rezeptTerminVorschlag.terminDatumIso)}
              </Text>
            ) : (
              <Text style={styles.sectionBody}>Noch kein Termin geplant.</Text>
            )}
            {arztEmail ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleRezeptEmail}
                accessibilityRole="button"
                accessibilityLabel="Arzt per E-Mail wegen Rezept anschreiben"
              >
                <Text style={styles.secondaryButtonText}>
                  Arzt per E-Mail anschreiben
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleRezeptTerminErstellen}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Kalendereintrag als Rezept-Erinnerung erstellen"
              accessibilityHint="Prüft zuerst Arzturlaub und erstellt dann einen Kalendertermin"
            >
              <Text style={styles.primaryButtonText}>
                Rezept-Erinnerung erstellen
              </Text>
            </TouchableOpacity>
            {rezeptTermin ? (
              <TouchableOpacity
                style={styles.doneButton}
                onPress={handleRezeptBesorgt}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Rezept besorgt"
                accessibilityHint="Markiert die Rezept-Erinnerung als erledigt und entfernt den Kalendereintrag"
              >
                <Text style={styles.doneButtonText}>
                  Rezept besorgt
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Einnahmeplan (falls Erinnerung aktiv) */}
        {medikament.erinnerung_aktiv === 1 && (() => {
          try {
            const plan = parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]');
            if (plan.length === 0) return null;
            const aktuelle = getAktuelleTageszeit();
            return (
              <View style={styles.einnahmeplanCard}>
                <Text style={styles.sectionTitle} accessibilityRole="header">Einnahmeplan</Text>
                <View style={styles.einnahmeplanRow}>
                  {SLOT_REIHENFOLGE.map(slot => {
                    const meta = SLOT_META[slot];
                    const eintrag = plan.find((s: EinnahmeSlot) => s.slot === slot);
                    if (!eintrag) return null;
                    const dosis = eintrag.dosis !== undefined ? eintrag.dosis : medikament.einzeldosis;
                    const isAktuell = aktuelle === slot;
                    return (
                      <View
                        key={slot}
                        style={[styles.einnahmeSlot, isAktuell && styles.einnahmeSlotAktuell]}
                      >
                        <Text style={styles.einnahmeSlotEmoji} accessibilityElementsHidden>{meta.emoji}</Text>
                        <Text style={[styles.einnahmeSlotLabel, isAktuell && styles.einnahmeSlotLabelAktuell]}>
                          {meta.label}
                        </Text>
                        <Text style={styles.einnahmeSlotDosis}>{dosis} {medikament.einheit}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          } catch { return null; }
        })()}

        {/* Details */}
        <View style={styles.detailCard}>
          <Text style={styles.sectionTitle}>Details</Text>
          <DetailRow label="Einzeldosis" value={`${medikament.einzeldosis} ${medikament.einheit}`} />
          <DetailRow label="Packungsgröße" value={`${medikament.packungsgroesse} ${medikament.einheit}`} />
          <DetailRow label="Warnung ab" value={`${medikament.warnung_ab_bestand} ${medikament.einheit}`} />
          {medikament.pzn ? <DetailRow label="PZN" value={medikament.pzn} /> : null}
          {arztName ? <DetailRow label="Verschrieben von" value={arztName} /> : null}
        </View>

        {/* Letzte Packung (Option B) */}
        {letztePackung && (
          <View style={styles.packungCard}>
            <View style={styles.packungHeader}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Letzte Packung</Text>
              {offenePackungen > 1 && (
                <Text style={styles.packungCount}>
                  {offenePackungen} Packungen offen
                </Text>
              )}
            </View>
            <View style={styles.packungRow}>
              <Text style={styles.packungLabel}>Größe</Text>
              <Text style={styles.packungValue}>{letztePackung.groesse} {medikament.einheit}</Text>
            </View>
            {letztePackung.ist_ersatzprodukt === 1 && (
              <View style={styles.ersatzBadge}>
                <Text style={styles.ersatzBadgeText}>
                  Ersatzprodukt: {letztePackung.ersatz_name || 'Ja'}
                </Text>
              </View>
            )}
            {letztePackung.pzn ? (
              <View style={styles.packungRow}>
                <Text style={styles.packungLabel}>PZN</Text>
                <Text style={styles.packungValue}>{letztePackung.pzn}</Text>
              </View>
            ) : null}

            {/* Packungshistorie einklappbar */}
            {packungsHistorie.length > 1 && (
              <TouchableOpacity
                onPress={() => setZeigeHistorie(!zeigeHistorie)}
                activeOpacity={0.7}
                style={styles.historieToggle}
                accessibilityRole="button"
                accessibilityLabel={`${packungsHistorie.length} Käufe insgesamt, ${zeigeHistorie ? 'ausblenden' : 'einblenden'}`}
              >
                <Text style={styles.historieToggleText}>
                  {zeigeHistorie ? '▲' : '▼'} {packungsHistorie.length} Käufe insgesamt
                </Text>
              </TouchableOpacity>
            )}
            {zeigeHistorie && packungsHistorie.map(p => (
              <View key={p.id} style={styles.packungHistRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.packungHistDate}>
                    {p.gekauft_am ? new Date(p.gekauft_am).toLocaleDateString('de-DE') : '?'}
                  </Text>
                  {p.ist_ersatzprodukt === 1 && (
                    <Text style={styles.packungHistErsatz}>
                      Ersatz: {p.ersatz_name || 'Ja'}
                    </Text>
                  )}
                </View>
                <Text style={styles.packungHistGroesse}>
                  {p.groesse} {medikament.einheit}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Nachkauf-Button -> NachkaufScreen */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Nachkauf', { medikamentId: medikament.id })}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Nachkauf erfassen"
        >
          <Text style={styles.primaryButtonText}>
            Nachkauf erfassen
          </Text>
        </TouchableOpacity>

        {/* Einnahme-Historie */}
        <View style={styles.historieSection}>
          <TouchableOpacity
            style={styles.sectionToggle}
            onPress={() => setZeigeEinnahmeHistorie(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel={`Einnahme-Historie ${zeigeEinnahmeHistorie ? 'ausblenden' : 'anzeigen'}`}
          >
            <Text style={styles.sectionTitle}>Einnahme-Historie</Text>
            <Text style={styles.sectionToggleText}>{zeigeEinnahmeHistorie ? 'Ausblenden' : 'Anzeigen'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setNachtragSlot(getNachtragSlots(medikament)[0]);
              setNachtragModal(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Vergessene Einnahme nachtragen"
            accessibilityHint="Reduziert den Bestand und ergänzt die Einnahme-Historie"
          >
            <Text style={styles.secondaryButtonText}>Einnahme nachtragen</Text>
          </TouchableOpacity>
          {zeigeEinnahmeHistorie && historie.length === 0 ? (
            <Text style={styles.historieEmpty}>Noch keine Einnahmen erfasst.</Text>
          ) : null}
          {zeigeEinnahmeHistorie && historie.length > 0 ? (
            historie.map(item => (
              <View key={item.id} style={styles.historieRow}>
                <View style={styles.historieLeft}>
                  <Text style={styles.historieDate}>
                    {item.datum_formatted}
                  </Text>
                  <Text style={styles.historieTime}>
                    {item.uhrzeit_formatted} Uhr
                  </Text>
                </View>
                <View style={styles.historieRight}>
                  <Text style={styles.historieMenge}>
                    -{item.menge} {medikament.einheit}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleStornoEinnahme(item)}
                    accessibilityLabel="Einnahme stornieren"
                    accessibilityHint="Versehentliche Einnahme zurücknehmen"
                    style={styles.stornoButton}
                  >
                    <Text style={styles.stornoButtonText}>↩</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : null}
        </View>

        {/* Loeschen */}

        {/* Bearbeiten – kleiner Link, weiter unten */}
        <TouchableOpacity
          onPress={() => navigation.navigate('EditMedikament', { medikamentId: medikament.id })}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Medikament bearbeiten"
          style={styles.editLinkContainer}
        >
          <Text style={styles.editLinkText}>Medikament bearbeiten</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Medikament löschen"
          accessibilityHint="Alle Daten werden entfernt"
        >
          <Text style={styles.deleteButtonText}>Medikament löschen</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Android Bestandskorrektur Modal */}
      <Modal
        visible={korrekturModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setKorrekturModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Bestandskorrektur</Text>
            <Text style={styles.modalHint}>
              Aktueller Bestand: {medikament?.aktueller_bestand} {medikament?.einheit}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={korrekturWert}
              onChangeText={setKorrekturWert}
              keyboardType="decimal-pad"
              placeholder="Neuer Bestand"
              autoFocus
              accessibilityLabel="Neuer Bestand"
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setKorrekturModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Abbrechen"
              >
                <Text style={styles.modalButtonCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonOk}
                onPress={async () => {
                  const input = korrekturWert.replace(',', '.');
                  const neuerBestand = parseFloat(input);
                  if (isNaN(neuerBestand) || neuerBestand < 0) {
                    Alert.alert('Ungültig', 'Bitte eine gültige Zahl eingeben (z.B. 28.5).');
                    return;
                  }
                  if (medikament) {
                    await bestaetigeBestandskorrektur(neuerBestand);
                    setKorrekturModal(false);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Bestand korrigieren"
              >
                <Text style={styles.modalButtonOkText}>Korrigieren</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={nachtragModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setNachtragModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Einnahme nachtragen</Text>
            <Text style={styles.modalHint}>
              Wenn eine Einnahme vergessen wurde, wird sie hier in der Historie ergänzt und vom Vorrat abgezogen.
            </Text>

            <Text style={styles.modalLabel}>Wann?</Text>
            <View style={styles.choiceRow}>
              {[
                { label: 'Heute', value: 0 },
                { label: 'Gestern', value: 1 },
                { label: 'Vorgestern', value: 2 },
              ].map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.choiceButton, nachtragTageZurueck === option.value && styles.choiceButtonActive]}
                  onPress={() => setNachtragTageZurueck(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: nachtragTageZurueck === option.value }}
                >
                  <Text style={[styles.choiceButtonText, nachtragTageZurueck === option.value && styles.choiceButtonTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Welche Einnahme?</Text>
            <View style={styles.choiceRow}>
              {getNachtragSlots(medikament).map(slot => {
                const meta = SLOT_META[slot];
                const selected = nachtragSlot === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.choiceButton, selected && styles.choiceButtonActive]}
                    onPress={() => setNachtragSlot(slot)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.choiceButtonText, selected && styles.choiceButtonTextActive]}>
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.modalHint}>
              Menge: {getDosisFuerSlot(parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]'), nachtragSlot, medikament.einzeldosis)} {medikament.einheit}
            </Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setNachtragModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Abbrechen"
              >
                <Text style={styles.modalButtonCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonOk}
                onPress={handleEinnahmeNachtragen}
                accessibilityRole="button"
                accessibilityLabel="Einnahme nachtragen"
              >
                <Text style={styles.modalButtonOkText}>Nachtragen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getNachtragSlots(medikament: MedikamentRow): TageszeitSlot[] {
  const plan = parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]');
  const slots = plan.map(item => item.slot);
  return slots.length > 0 ? slots : ['morgens'];
}

function getEingenommeneSlotsHeute(einnahmen: EinnahmeWithDate[]): Set<TageszeitSlot> {
  const heute = new Date();
  const slots = new Set<TageszeitSlot>();

  for (const einnahme of einnahmen) {
    const datum = new Date(einnahme.timestamp);
    if (
      datum.getFullYear() !== heute.getFullYear() ||
      datum.getMonth() !== heute.getMonth() ||
      datum.getDate() !== heute.getDate()
    ) {
      continue;
    }

    if (isTageszeitSlot(einnahme.slot)) {
      slots.add(einnahme.slot);
    } else {
      slots.add(stundeZuTageszeitSlot(datum.getHours()));
    }
  }

  return slots;
}

function isTageszeitSlot(value: string): value is TageszeitSlot {
  return value === 'morgens' || value === 'mittags' || value === 'abends' || value === 'nachts';
}

function stundeZuTageszeitSlot(stunde: number): TageszeitSlot {
  if (stunde >= 4 && stunde < 11) return 'morgens';
  if (stunde >= 11 && stunde < 15) return 'mittags';
  if (stunde >= 15 && stunde < 21) return 'abends';
  return 'nachts';
}

function buildNachtragTimestamp(tageZurueck: number, uhrzeit: string | undefined, slot: TageszeitSlot): string {
  const fallback: Record<TageszeitSlot, string> = {
    morgens: '08:00',
    mittags: '12:00',
    abends: '18:00',
    nachts: '22:00',
  };
  const [hours, minutes] = (uhrzeit || fallback[slot]).split(':').map(value => Number(value));
  const date = new Date();
  date.setDate(date.getDate() - tageZurueck);
  date.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0);

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function zeigeBestandskorrekturErgebnis(
  alterBestand: number,
  neuerBestand: number,
  einheit: string,
  syncResult: RezeptTerminSyncResult,
) {
  const basisText = `${alterBestand} → ${neuerBestand} ${einheit}`;

  switch (syncResult.status) {
    case 'updated':
      Alert.alert(
        'Bestand korrigiert',
        `${basisText}\n\nDie vorhandene Rezept-Erinnerung wurde auf den ${formatGermanDate(syncResult.info!.terminDatumIso)} angepasst.`,
      );
      return;
    case 'removed_conflict':
      Alert.alert(
        'Bestand korrigiert',
        `${basisText}\n\nDie bisherige Rezept-Erinnerung wurde entfernt, weil der neue Termin in einen Arzturlaub fällt. Bitte neu planen.`,
      );
      return;
    case 'removed_unavailable':
      Alert.alert(
        'Bestand korrigiert',
        `${basisText}\n\nDie bisherige Rezept-Erinnerung wurde entfernt, weil aktuell kein passender Termin mehr berechnet werden kann.`,
      );
      return;
    case 'failed':
      Alert.alert(
        'Bestand korrigiert',
        `${basisText}\n\nDie bestehende Rezept-Erinnerung konnte nicht automatisch aktualisiert werden. Bitte prüfen.`,
      );
      return;
    default:
      Alert.alert('Bestand korrigiert', basisText);
  }
}

function zeigeEinnahmeNachtragErgebnis(
  alterBestand: number,
  neuerBestand: number,
  einheit: string,
  syncResult: RezeptTerminSyncResult,
) {
  const basisText = `Der Vorrat wurde von ${alterBestand} auf ${neuerBestand} ${einheit} reduziert.`;

  switch (syncResult.status) {
    case 'updated':
      Alert.alert(
        'Einnahme nachgetragen',
        `${basisText}\n\nDie vorhandene Rezept-Erinnerung wurde auf den ${formatGermanDate(syncResult.info!.terminDatumIso)} angepasst.`,
      );
      return;
    case 'removed_conflict':
      Alert.alert(
        'Einnahme nachgetragen',
        `${basisText}\n\nDie bisherige Rezept-Erinnerung wurde entfernt, weil der neue Termin in einen Arzturlaub fällt. Bitte neu planen.`,
      );
      return;
    case 'removed_unavailable':
      Alert.alert(
        'Einnahme nachgetragen',
        `${basisText}\n\nDie bisherige Rezept-Erinnerung wurde entfernt, weil aktuell kein passender Termin mehr berechnet werden kann.`,
      );
      return;
    case 'failed':
      Alert.alert(
        'Einnahme nachgetragen',
        `${basisText}\n\nDie bestehende Rezept-Erinnerung konnte nicht automatisch aktualisiert werden. Bitte prüfen.`,
      );
      return;
    default:
      Alert.alert('Einnahme nachgetragen', basisText);
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value}>{value}</Text>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  zusatzUntertitel: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
  },
  prioritaetEinnahmeButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#B45309',
  },
  prioritaetBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF7ED',
    color: '#92400E',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  prioritaetTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1F2933',
    marginBottom: 6,
  },
  prioritaetSubtext: {
    fontSize: 18,
    color: '#374151',
    fontWeight: '700',
  },
  prioritaetTime: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 6,
  },
  wirkstoffeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D8DEE6',
  },
  wirkstoffeTitle: {
    fontSize: 18,
    color: '#1F2933',
    fontWeight: '700',
    marginBottom: 10,
  },
  wirkstoffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  wirkstoffNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF2F7',
    color: '#374151',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 15,
    fontWeight: '800',
    marginRight: 10,
    paddingTop: Platform.OS === 'ios' ? 5 : 0,
  },
  wirkstoffText: {
    flex: 1,
    fontSize: 17,
    color: '#1F2933',
    fontWeight: '600',
    lineHeight: 24,
  },
  bestandCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D8DEE6',
  },
  bestandCardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: '#B45309',
  },
  bestandLabel: {
    fontSize: 18,
    color: '#5F6B7A',
    marginBottom: 8,
  },
  bestandWert: {
    fontSize: 56,
    fontWeight: '700',
    color: '#1F2933',
  },
  bestandWertWarning: {
    color: '#92400E',
  },
  bestandEinheit: {
    fontSize: 20,
    color: '#4B5563',
    marginTop: 4,
  },
  bestandStatusLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  bestandStatusOk: {
    color: '#4B5563',
  },
  bestandStatusWarning: {
    color: '#92400E',
  },
  tageInfo: {
    fontSize: 16,
    color: '#5F6B7A',
    marginTop: 8,
  },
  tageInfoCritical: {
    color: '#92400E',
    fontWeight: '600',
  },
  staerkeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderWidth: 1,
    borderColor: '#B7D8F5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  staerkeIcon: {
    width: 26,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2F80C9',
    overflow: 'hidden',
    marginRight: 8,
  },
  staerkeIconHalf: {
    width: 13,
    height: 14,
    backgroundColor: '#B7D8F5',
  },
  staerkeInfoText: {
    fontSize: 16,
    color: '#155C96',
    fontWeight: '700',
  },
  bestandCardCritical: {
    borderLeftWidth: 4,
    borderLeftColor: '#B45309',
  },
  korrekturButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#EEF2F7',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  korrekturButtonText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2933',
    marginBottom: 10,
  },
  sectionBodyStrong: {
    fontSize: 18,
    color: '#1F2933',
    fontWeight: '700',
    marginBottom: 10,
    lineHeight: 25,
  },
  sectionBody: {
    fontSize: 17,
    color: '#5F6B7A',
    marginBottom: 10,
    lineHeight: 24,
  },
  primaryButton: {
    backgroundColor: '#243B53',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#C9D2DC',
    marginBottom: 10,
  },
  secondaryButtonText: {
    fontSize: 17,
    color: '#243B53',
    fontWeight: '700',
  },
  doneButton: {
    backgroundColor: '#F3F6F9',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#C9D2DC',
  },
  doneButtonText: {
    fontSize: 17,
    color: '#374151',
    fontWeight: '700',
  },
  einnahmeplanCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D8DEE6',
  },
  einnahmeplanTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  einnahmeplanRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  einnahmeSlot: {
    backgroundColor: '#f5f5f3',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  einnahmeSlotAktuell: {
    backgroundColor: '#243B53',
    borderWidth: 0,
  },
  einnahmeSlotEmoji: {
    fontSize: 24,
  },
  einnahmeSlotLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginTop: 2,
  },
  einnahmeSlotLabelAktuell: {
    color: '#fff',
  },
  einnahmeSlotDosis: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  nachkaufButton: {
    backgroundColor: '#27ae60',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 60,
    justifyContent: 'center',
  },
  nachkaufButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Packungs-Karte (Option B)
  packungCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D8DEE6',
  },
  packungHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  packungTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  packungCount: {
    fontSize: 14,
    color: '#e67e22',
    fontWeight: '600',
  },
  packungRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  packungLabel: {
    fontSize: 16,
    color: '#666',
  },
  packungValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  ersatzBadge: {
    backgroundColor: '#fef9e7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#f0c040',
  },
  ersatzBadgeText: {
    fontSize: 15,
    color: '#8a6d3b',
    fontWeight: '500',
  },
  historieToggle: {
    paddingVertical: 10,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  historieToggleText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  packungHistRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  packungHistDate: {
    fontSize: 14,
    color: '#333',
  },
  packungHistErsatz: {
    fontSize: 12,
    color: '#e67e22',
    fontWeight: '500',
  },
  packungHistGroesse: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  editButton: {
    backgroundColor: '#f39c12',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    minHeight: 60,
    justifyContent: 'center',
  },
  editButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  editLinkContainer: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  editLinkText: {
    fontSize: 16,
    color: '#5F6B7A',
    textDecorationLine: 'underline',
  },
  historieSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  sectionToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionToggleText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '700',
  },
  historieTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  historieEmpty: {
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
  },
  historieRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historieLeft: {
    flex: 1,
  },
  historieDate: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  historieTime: {
    fontSize: 14,
    color: '#888',
  },
  historieMenge: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  historieRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stornoButton: {
    backgroundColor: '#fff3f3',
    borderRadius: 8,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  stornoButtonText: {
    fontSize: 18,
    color: '#e74c3c',
  },
  deleteButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e74c3c',
    marginBottom: 12,
  },
  deleteButtonText: {
    fontSize: 18,
    color: '#e74c3c',
    fontWeight: '600',
  },
  rezeptTerminCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D8DEE6',
  },
  rezeptTerminTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 6,
  },
  rezeptTerminText: {
    fontSize: 18,
    color: '#1a1a2e',
    fontWeight: '600',
    marginBottom: 4,
  },
  rezeptTerminSubtext: {
    fontSize: 15,
    color: '#666',
    marginBottom: 12,
  },
  rezeptEmailButton: {
    backgroundColor: '#EEF4FC',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#B8D1F0',
    marginBottom: 10,
  },
  rezeptEmailButtonText: {
    fontSize: 17,
    color: '#0B63CE',
    fontWeight: '700',
  },
  kalenderButton: {
    backgroundColor: '#3498db',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    minHeight: 60,
    justifyContent: 'center',
  },
  kalenderButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rezeptTerminDoneButton: {
    backgroundColor: '#EEF7F0',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#B9DEC2',
    marginTop: 10,
  },
  rezeptTerminDoneButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#25643A',
  },
  // Android Bestandskorrektur Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 17,
    color: '#1F2933',
    fontWeight: '700',
    marginBottom: 8,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  choiceButton: {
    borderWidth: 1,
    borderColor: '#C9D2DC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    minHeight: 48,
    justifyContent: 'center',
  },
  choiceButtonActive: {
    backgroundColor: '#243B53',
    borderColor: '#243B53',
  },
  choiceButtonText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '700',
  },
  choiceButtonTextActive: {
    color: '#FFFFFF',
  },
  modalInput: {
    borderWidth: 2,
    borderColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 20,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  modalButtonCancelText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#888',
  },
  modalButtonOk: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
  },
  modalButtonOkText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 18,
    color: '#666',
  },
  value: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
  },
});
