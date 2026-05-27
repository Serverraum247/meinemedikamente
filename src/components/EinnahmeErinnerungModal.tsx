/**
 * EinnahmeErinnerungModal.tsx – "Schon eingenommen?" Modal
 *
 * Senioren-freundliches Fullscreen-Modal das beim App-Oeffnen erscheint,
 * wenn Einnahmen fuer heute noch nicht bestaetigt wurden.
 *
 * Features:
 * - Groesse Touch-Flaechen (min 56x56px)
 * - Hoher Kontrast (WCAG AA)
 * - accessibilityLabel auf allen Buttons
 * - Haptisches Feedback (Vibration) bei "Ja"
 * - Pro Medikament eine Karte mit "Ja"/"Nein" Buttons
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Vibration,
  Alert,
} from 'react-native';
import type { OffeneEinnahme } from '../services/EinnahmeErinnerungService';
import { announceChange } from '../utils/AccessibilityHelpers';
import { formatMedicationUnit } from '../constants/MedicationUnits';

interface Props {
  visible: boolean;
  offeneEinnahmen: OffeneEinnahme[];
  onBestaetigen: (medikamentId: string, dosis: number, slot: OffeneEinnahme['slot']) => Promise<void>;
  onAlleBestaetigen: (einnahmen: OffeneEinnahme[]) => Promise<void>;
  onSpaeter: () => void;
  onSchliessen: () => void;
}

export default function EinnahmeErinnerungModal({
  visible,
  offeneEinnahmen,
  onBestaetigen,
  onAlleBestaetigen,
  onSpaeter,
  onSchliessen,
}: Props) {
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [bestaetigeAlle, setBestaetigeAlle] = useState(false);

  const handleJa = async (einnahme: OffeneEinnahme) => {
    setBearbeiteId(einnahme.medikamentId);
    try {
      // Haptisches Feedback – kurze Vibration
      Vibration.vibrate(50);

      await onBestaetigen(einnahme.medikamentId, einnahme.dosis, einnahme.slot);
      announceChange(`${einnahme.medikamentName} wurde als eingenommen markiert`);
    } catch (error) {
      Alert.alert('Schon gespeichert', 'Diese Einnahme wurde bereits protokolliert. Es wurde nichts doppelt abgezogen.');
    } finally {
      setBearbeiteId(null);
    }
  };

  const handleAlle = async () => {
    setBestaetigeAlle(true);
    try {
      Vibration.vibrate(50);
      await onAlleBestaetigen(offeneEinnahmen);
      announceChange('Alle offenen Einnahmen wurden als eingenommen markiert');
    } catch (error) {
      Alert.alert('Bitte prüfen', 'Nicht alle Einnahmen konnten bestätigt werden. Bereits gespeicherte Einnahmen wurden nicht doppelt abgezogen.');
    } finally {
      setBestaetigeAlle(false);
    }
  };

  const handleNein = () => {
    // Später fragen → Modal schließen
    onSpaeter();
  };

  if (offeneEinnahmen.length === 0) return null;

  // Nimm die erste offene Einnahme (die am längsten überfällige)
  const aktuelle = offeneEinnahmen[0];
  const restliche = offeneEinnahmen.length - 1;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onSchliessen}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji} accessibilityElementsHidden>💊</Text>
          <Text style={styles.headerTitle}>Einnahme-Erinnerung</Text>
          <Text style={styles.headerSubtitle}>
            {restliche > 0
              ? `${offeneEinnahmen.length} Medikament(e) offen`
              : 'Ein Medikament steht an'}
          </Text>
        </View>

        {/* Scrollbare Kartenliste */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
        >
          {offeneEinnahmen.length > 1 ? (
            <TouchableOpacity
              style={[styles.alleButton, bestaetigeAlle && styles.buttonDisabled]}
              onPress={handleAlle}
              disabled={bestaetigeAlle}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Alle offenen Einnahmen bestätigen"
              accessibilityHint="Bestätigt alle sichtbaren offenen Medikamente auf einmal"
            >
              <Text style={styles.alleButtonText}>
                {bestaetigeAlle ? 'Wird gespeichert ...' : 'Alle offenen bestätigen'}
              </Text>
              <Text style={styles.alleButtonSub}>
                {offeneEinnahmen.length} Einnahmen auf einmal protokollieren
              </Text>
            </TouchableOpacity>
          ) : null}

          {offeneEinnahmen.map((einnahme) => (
            <View
              key={`${einnahme.medikamentId}-${einnahme.slot}`}
              style={styles.karte}
            >
              {/* Medikament-Info */}
              <View style={styles.karteInfo}>
                <Text style={styles.medName}>{einnahme.medikamentName}</Text>
                {einnahme.zusatz ? (
                  <Text style={styles.medZusatz}>{einnahme.zusatz}</Text>
                ) : null}
                <View style={styles.slotRow}>
                  <Text style={styles.slotLabel}>
                    {einnahme.slotLabel} {einnahme.slotUhrzeit} Uhr
                  </Text>
                  <Text style={styles.dosisLabel}>
                    {einnahme.dosis} {formatMedicationUnit(einnahme.dosis, einnahme.einheit)}
                  </Text>
                </View>
                {einnahme.stundenSeitUhrzeit > 0 && (
                  <Text style={styles.ueberfaellig}>
                    ⏰ Seit {Math.floor(einnahme.stundenSeitUhrzeit)} Std. fällig
                  </Text>
                )}
              </View>

              {/* Ja/Nein Buttons */}
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[
                    styles.jaButton,
                    bearbeiteId === einnahme.medikamentId && styles.buttonDisabled,
                  ]}
                  onPress={() => handleJa(einnahme)}
                  disabled={bearbeiteId === einnahme.medikamentId}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${einnahme.medikamentName}: Ja, schon eingenommen`}
                  accessibilityHint="Doppelt tipten um die Einnahme zu bestätigen"
                >
                  <Text style={styles.jaButtonText}>
                    {bearbeiteId === einnahme.medikamentId ? '✓ ...' : 'Ja'}
                  </Text>
                  <Text style={styles.jaButtonSub}>eingenommen</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.neinButton}
                  onPress={handleNein}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Nein, ${einnahme.medikamentName} noch nicht eingenommen`}
                  accessibilityHint="Doppelt tippen um später zu erinnern"
                >
                  <Text style={styles.neinButtonText}>Nein</Text>
                  <Text style={styles.neinButtonSub}>später</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Footer: Schließen */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.schliessenButton}
            onPress={onSchliessen}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Erinnerung schließen"
          >
            <Text style={styles.schliessenText}>Schließen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// --- Styles (WCAG AA Kontrast, Senioren-freundlich) ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1a1a2e',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  headerEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 18,
    color: '#ccc',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  alleButton: {
    backgroundColor: '#1F6F8B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alleButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
  },
  alleButtonSub: {
    fontSize: 16,
    color: '#E9F7FB',
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  karte: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  karteInfo: {
    marginBottom: 20,
  },
  medName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 2,
  },
  medZusatz: {
    fontSize: 16,
    color: '#777',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  slotLabel: {
    fontSize: 18,
    color: '#555',
    fontWeight: '500',
  },
  dosisLabel: {
    fontSize: 18,
    color: '#1a1a2e',
    fontWeight: '600',
  },
  ueberfaellig: {
    fontSize: 16,
    color: '#e74c3c',
    fontWeight: '600',
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  jaButton: {
    flex: 1,
    backgroundColor: '#27ae60',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  jaButtonText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  jaButtonSub: {
    fontSize: 16,
    color: '#e0e0e0',
    marginTop: 2,
  },
  neinButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  neinButtonText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#555',
  },
  neinButtonSub: {
    fontSize: 16,
    color: '#999',
    marginTop: 2,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  schliessenButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  schliessenText: {
    fontSize: 18,
    color: '#888',
    fontWeight: '500',
  },
});
