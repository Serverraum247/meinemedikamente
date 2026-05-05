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
import { MedikamentRow } from '../database/Database';
import { getEinnahmenByMedikament, EinnahmeWithDate } from '../database/EinnahmeController';

type Props = NativeStackScreenProps<RootStackParamList, 'MedikamentDetail'>;

export default function MedikamentDetailScreen({ route, navigation }: Props) {
  const { medikamentId } = route.params;
  const { medikamente, bestätigeEinnahme, aktualisiereBestand, entferneMedikament } = useMedikamente();

  const [medikament, setMedikament] = useState<MedikamentRow | null>(null);
  const [historie, setHistorie] = useState<EinnahmeWithDate[]>([]);

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
    } catch (e) {
      console.error('[Historie] Fehler:', e);
    }
  }, [medikamente, medikamentId, navigation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEinnahme = useCallback(async () => {
    if (!medikament) return;

    Alert.alert(
      'Einnahme bestaetigen',
      `${medikament.einzeldosis} ${medikament.einheit} ${medikament.name} eingenommen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Bestaetigen',
          style: 'default',
          onPress: async () => {
            try {
              const neuerBestand = await bestätigeEinnahme(medikament.id);
              await loadData(); // Historie refreshen
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
      'Medikament loeschen',
      `"${medikament.name}" wirklich loeschen? Alle Einnahmen werden ebenfalls entfernt.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Loeschen',
          style: 'destructive',
          onPress: async () => {
            await entferneMedikament(medikament.id);
            navigation.goBack();
          },
        },
      ]
    );
  }, [medikament, entferneMedikament, navigation]);

  if (!medikament) {
    return (
      <View style={styles.center}>
        <Text>Lade Medikament...</Text>
      </View>
    );
  }

  const isUnterSchwelle = medikament.aktueller_bestand <= medikament.warnung_ab_bestand;
  const tageVerbleibend =
    medikament.einzeldosis > 0
      ? Math.floor(medikament.aktueller_bestand / medikament.einzeldosis)
      : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Bestand-Anzeige */}
        <View style={[styles.bestandCard, isUnterSchwelle && styles.bestandCardWarning]}>
          <Text style={styles.bestandLabel}>Aktueller Bestand</Text>
          <Text style={[styles.bestandWert, isUnterSchwelle && styles.bestandWertWarning]}>
            {medikament.aktueller_bestand}
          </Text>
          <Text style={styles.bestandEinheit}>{medikament.einheit}</Text>
          {tageVerbleibend > 0 && (
            <Text style={styles.tageInfo}>
              Reicht fuer ca. {tageVerbleibend} Einnahme(n)
            </Text>
          )}
        </View>

        {/* Details */}
        <View style={styles.detailCard}>
          <DetailRow label="Einzeldosis" value={`${medikament.einzeldosis} ${medikament.einheit}`} />
          <DetailRow label="Packungsgroesse" value={`${medikament.packungsgroesse} ${medikament.einheit}`} />
          <DetailRow label="Warnung ab" value={`${medikament.warnung_ab_bestand} ${medikament.einheit}`} />
          {medikament.pzn ? <DetailRow label="PZN" value={medikament.pzn} /> : null}
        </View>

        {/* Einnahme-Button */}
        <TouchableOpacity
          style={styles.einnahmeButton}
          onPress={handleEinnahme}
          activeOpacity={0.7}
        >
          <Text style={styles.einnahmeButtonText}>
            Einnahme bestaetigen
          </Text>
          <Text style={styles.einnahmeButtonSubtext}>
            -{medikament.einzeldosis} {medikament.einheit}
          </Text>
        </TouchableOpacity>

        {/* Nachkauf-Button */}
        <TouchableOpacity
          style={styles.nachkaufButton}
          onPress={async () => {
            const neuerBestand = medikament.aktueller_bestand + medikament.packungsgroesse;
            await aktualisiereBestand(medikament.id, neuerBestand);
            Alert.alert('Nachkauf', `Bestand auf ${neuerBestand} aktualisiert.`);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.nachkaufButtonText}>
            + Nachkauf ({medikament.packungsgroesse} {medikament.einheit})
          </Text>
        </TouchableOpacity>

        {/* Bearbeiten-Button */}
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('EditMedikament', { medikamentId: medikament.id })}
          activeOpacity={0.7}
        >
          <Text style={styles.editButtonText}>Medikament bearbeiten</Text>
        </TouchableOpacity>

        {/* Einnahme-Historie */}
        <View style={styles.historieSection}>
          <Text style={styles.historieTitle}>Einnahme-Historie</Text>
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
                <Text style={styles.historieMenge}>
                  -{item.menge} {medikament.einheit}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Loeschen */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteButtonText}>Medikament loeschen</Text>
        </TouchableOpacity>
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
  tageInfo: {
    fontSize: 16,
    color: '#888',
    marginTop: 8,
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
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  nachkaufButton: {
    backgroundColor: '#3498db',
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
  deleteButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  deleteButtonText: {
    fontSize: 18,
    color: '#e74c3c',
    fontWeight: '600',
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
