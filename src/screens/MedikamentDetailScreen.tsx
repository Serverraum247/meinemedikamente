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
  SafeAreaView,
  FlatList,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMedikamente } from '../context/MedikamentContext';
import { MedikamentRow, PackungRow } from '../database/Database';
import { getEinnahmenByMedikament, EinnahmeWithDate, storniereEinnahme } from '../database/EinnahmeController';
import { getLetztePackung, getOffenePackungenCount, getPackungenByMedikament } from '../database/PackungController';
import {
  parseEinnahmeplan,
  tagesdosisBerechnen,
  SLOT_META,
  SLOT_REIHENFOLGE,
  getAktuelleTageszeit,
  type EinnahmeSlot,
} from '../utils/Einnahmeplan';
import { announceChange } from '../utils/AccessibilityHelpers';
import { erstelleRezeptAbholtermin } from '../services/KalenderService';
import { canCreateCalendarEvent, recordCalendarEvent, isPremium } from '../services/PremiumService';

type Props = NativeStackScreenProps<RootStackParamList, 'MedikamentDetail'>;

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

  // Medikament + Historie laden
  const loadData = useCallback(async () => {
    const found = medikamente.find(m => m.id === medikamentId);
    if (found) {
      setMedikament(found);
      navigation.setOptions({ title: found.name });
    }
    try {
      const einnahmen = await getEinnahmenByMedikament(medikamentId, 30);
      setHistorie(einnahmen);
      // Packungsdaten laden
      const letzte = await getLetztePackung(medikamentId);
      setLetztePackung(letzte);
      const count = await getOffenePackungenCount(medikamentId);
      setOffenePackungen(count);
      const hist = await getPackungenByMedikament(medikamentId);
      setPackungsHistorie(hist);
    } catch (e) {
      console.error('[Historie] Fehler:', e);
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

    Alert.alert(
      'Einnahme bestätigen',
      `${medikament.einzeldosis} ${medikament.einheit} ${medikament.name} eingenommen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Bestätigen',
          style: 'default',
          onPress: async () => {
            try {
              const neuerBestand = await bestätigeEinnahme(medikament.id);
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
  }, [medikament, bestätigeEinnahme, loadData]);

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

  // Bestandskorrektur (Premium)
  const handleBestandskorrektur = useCallback(() => {
    if (!medikament) return;

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
            try {
              await aktualisiereBestand(medikament.id, neuerBestand);
              Alert.alert(
                'Bestand korrigiert',
                `${medikament.aktueller_bestand} → ${neuerBestand} ${medikament.einheit}`
              );
              await loadData();
            } catch {
              Alert.alert('Fehler', 'Bestand konnte nicht korrigiert werden.');
            }
          },
        },
      ],
      'plain-text',
      String(medikament.aktueller_bestand)
    );
  }, [medikament, aktualisiereBestand, loadData]);

  if (!medikament) {
    return (
      <View style={styles.center}>
        <Text>Lade Medikament...</Text>
      </View>
    );
  }

  const isUnterSchwelle = medikament.aktueller_bestand <= medikament.warnung_ab_bestand;

  // Berechne Tage verbleibend basierend auf Einnahmeplan
  const tageVerbleibend = (() => {
    if (medikament.einzeldosis <= 0) return 0;
    try {
      const plan = parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]');
      if (plan.length > 0) {
        const tagesDosis = tagesdosisBerechnen(plan, medikament.einzeldosis);
        return tagesDosis > 0
          ? Math.floor(medikament.aktueller_bestand / tagesDosis)
          : 0;
      }
    } catch { /* Fallback */ }
    return Math.floor(medikament.aktueller_bestand / medikament.einzeldosis);
  })();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Bestand-Anzeige */}
        <View
          style={[styles.bestandCard, isUnterSchwelle && styles.bestandCardWarning]}
          accessibilityLabel={`Bestand: ${medikament.aktueller_bestand} ${medikament.einheit}${tageVerbleibend > 0 ? `, reicht für ca. ${tageVerbleibend} Tag(e)` : ''}`}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.bestandLabel} accessibilityRole="header">Aktueller Bestand</Text>
          <Text style={[styles.bestandWert, isUnterSchwelle && styles.bestandWertWarning]} maxFontSizeMultiplier={1.3}>
            {isUnterSchwelle ? '⚠' : '✓'} {medikament.aktueller_bestand}
          </Text>
          <Text style={styles.bestandEinheit}>{medikament.einheit}</Text>
          <Text style={[styles.bestandStatusLabel, isUnterSchwelle ? styles.bestandStatusWarning : styles.bestandStatusOk]}>
            {isUnterSchwelle ? '⚠ Nachbestellen empfohlen' : '✓ Bestand OK'}
          </Text>
          {tageVerbleibend > 0 && (
            <Text style={styles.tageInfo}>
              Reicht für ca. {tageVerbleibend} Tag(e)
            </Text>
          )}
          {premium && (
            <TouchableOpacity
              style={styles.korrekturButton}
              onPress={handleBestandskorrektur}
              accessibilityLabel="Bestand korrigieren"
              accessibilityHint="Bestand manuell anpassen, z.B. bei Verlust"
            >
              <Text style={styles.korrekturButtonText}>✏️ Bestand korrigieren</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Details */}
        <View style={styles.detailCard}>
          <DetailRow label="Einzeldosis" value={`${medikament.einzeldosis} ${medikament.einheit}`} />
          <DetailRow label="Packungsgröße" value={`${medikament.packungsgroesse} ${medikament.einheit}`} />
          <DetailRow label="Warnung ab" value={`${medikament.warnung_ab_bestand} ${medikament.einheit}`} />
          {medikament.pzn ? <DetailRow label="PZN" value={medikament.pzn} /> : null}
        </View>

        {/* Einnahmeplan (falls Erinnerung aktiv) */}
        {medikament.erinnerung_aktiv === 1 && (() => {
          try {
            const plan = parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]');
            if (plan.length === 0) return null;
            const aktuelle = getAktuelleTageszeit();
            return (
              <View style={styles.einnahmeplanCard}>
                <Text style={styles.einnahmeplanTitle} accessibilityRole="header">Einnahmeplan</Text>
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

        {/* Einnahme-Button */}
        {(() => {
          // Zeige welche Tageszeit gerade dran ist
          let tageszeitInfo = '';
          try {
            const plan = parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]');
            const aktuelle = getAktuelleTageszeit();
            const eintrag = plan.find((s: EinnahmeSlot) => s.slot === aktuelle);
            if (eintrag && medikament.erinnerung_aktiv === 1) {
              const meta = SLOT_META[aktuelle];
              tageszeitInfo = `${meta.emoji} ${meta.label} – jetzt`;
            }
          } catch { /* ignore */ }

          return (
            <TouchableOpacity
              style={styles.einnahmeButton}
              onPress={handleEinnahme}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${medikament.name} als eingenommen markieren`}
              accessibilityHint="Bestand wird automatisch reduziert"
            >
              <Text style={styles.einnahmeButtonText}>
                Einnahme bestätigen
              </Text>
              <Text style={styles.einnahmeButtonSubtext}>
                -{medikament.einzeldosis} {medikament.einheit}
              </Text>
              {tageszeitInfo ? (
                <Text style={styles.einnahmeTageszeitInfo}>{tageszeitInfo}</Text>
              ) : null}
            </TouchableOpacity>
          );
        })()}

        {/* Letzte Packung (Option B) */}
        {letztePackung && (
          <View style={styles.packungCard}>
            <View style={styles.packungHeader}>
              <Text style={styles.packungTitle} accessibilityRole="header">Letzte Packung</Text>
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
          style={styles.nachkaufButton}
          onPress={() => navigation.navigate('Nachkauf', { medikamentId: medikament.id })}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Nachkauf erfassen"
        >
          <Text style={styles.nachkaufButtonText}>
            + Nachkauf
          </Text>
        </TouchableOpacity>

        {/* Einnahme-Historie */}
        <View style={styles.historieSection}>
          <Text style={styles.historieTitle} accessibilityRole="header">Einnahme-Historie</Text>
          {historie.length === 0 ? (
            <Text style={styles.historieEmpty}>Noch keine Einnahmen erfasst.</Text>
          ) : (
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
          )}
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
          <Text style={styles.editLinkText}>✏️ Medikament bearbeiten</Text>
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

        {/* Rezept-Termin im Kalender */}
        {medikament.aktueller_bestand > 0 && (
          <TouchableOpacity
            style={styles.kalenderButton}
            onPress={async () => {
              try {
                // Premium-Gate: Kalender-Limit prüfen
                const { allowed } = await canCreateCalendarEvent();
                if (!allowed) {
                  Alert.alert(
                    'Premium erforderlich',
                    'Du hast bereits 2 Kalendereinträge diesen Monat erstellt. Premium = unbegrenzt.',
                    [
                      { text: 'Abbrechen', style: 'cancel' },
                      { text: 'Premium', onPress: () => navigation.navigate('Premium') },
                    ]
                  );
                  return;
                }
                await recordCalendarEvent();

                await erstelleRezeptAbholtermin(
                  medikament.name,
                  medikament.aktueller_bestand,
                  medikament.einzeldosis,
                  1,
                  7,
                );
                Alert.alert('Termin erstellt', 'Der Rezept-Abholtermin wurde im Kalender eingetragen.');
              } catch (error) {
                Alert.alert('Fehler', 'Kalendereintrag konnte nicht erstellt werden.');
              }
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Kalendereintrag für Rezept-Abholung erstellen"
            accessibilityHint="Erstellt einen Termin im Kalender, 7 Tage bevor das Medikament leer wird"
          >
            <Text style={styles.kalenderButtonText}>
              📅 Rezept-Termin erstellen
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
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
    backgroundColor: '#f5f5f5',
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
  bestandCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bestandCardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: '#e74c3c',
  },
  bestandLabel: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  bestandWert: {
    fontSize: 56,
    fontWeight: '700',
    color: '#27ae60',
  },
  bestandWertWarning: {
    color: '#e74c3c',
  },
  bestandEinheit: {
    fontSize: 20,
    color: '#555',
    marginTop: 4,
  },
  bestandStatusLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  bestandStatusOk: {
    color: '#27ae60',
  },
  bestandStatusWarning: {
    color: '#e74c3c',
  },
  tageInfo: {
    fontSize: 16,
    color: '#888',
    marginTop: 8,
  },
  korrekturButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  korrekturButtonText: {
    fontSize: 16,
    color: '#555',
    fontWeight: '500',
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  einnahmeButton: {
    backgroundColor: '#27ae60',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 80,
    justifyContent: 'center',
  },
  einnahmeButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  einnahmeButtonSubtext: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },

  // Tageszeit-Info unter Einnahme-Button
  einnahmeTageszeitInfo: {
    fontSize: 16,
    color: '#ffd700',
    fontWeight: '600',
    marginTop: 4,
  },

  // Einnahmeplan-Karte
  einnahmeplanCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
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
    backgroundColor: '#1a1a2e',
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
    borderColor: '#ddd',
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
    color: '#3498db',
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
    color: '#666',
    textDecorationLine: 'underline',
  },
  historieSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
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
    color: '#e74c3c',
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
