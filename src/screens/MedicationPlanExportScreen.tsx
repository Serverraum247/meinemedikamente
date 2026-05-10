import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeModules,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import PremiumGate from '../components/PremiumGate';
import type { ArztRow } from '../database/Database';
import { getAllAerzte } from '../database/ArztController';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMedikamente } from '../context/MedikamentContext';
import { usePersonen } from '../context/PersonenContext';
import { buildMedicationPlanExport } from '../services/MedicationPlanExportService';
import { isPremium as checkIsPremium } from '../services/PremiumService';
import { logger } from '../utils/Logger';

type Props = NativeStackScreenProps<RootStackParamList, 'MedicationPlanExport'>;

type MedicationPlanShareModule = {
  sharePdf?: (title: string, body: string, fileName: string) => Promise<boolean>;
};

const { MedicationPlanShare } = NativeModules as {
  MedicationPlanShare?: MedicationPlanShareModule;
};

export default function MedicationPlanExportScreen({ navigation }: Props) {
  const { medikamente } = useMedikamente();
  const { aktivePerson, personen } = usePersonen();
  const [aerzte, setAerzte] = useState<ArztRow[]>([]);
  const [premium, setPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const selectedPerson = aktivePerson ?? personen[0] ?? null;

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [premiumActive, allDoctors] = await Promise.all([
          checkIsPremium(),
          getAllAerzte(),
        ]);
        if (!active) return;
        setPremium(premiumActive);
        setAerzte(allDoctors);
      } catch (error) {
        logger.error('Medikamentenplan konnte nicht geladen werden:', error);
        Alert.alert('Fehler', 'Der Medikamentenplan konnte nicht vorbereitet werden.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const exportPlan = useMemo(() => {
    if (!selectedPerson) return null;
    return buildMedicationPlanExport({
      person: selectedPerson,
      medications: medikamente,
      doctors: aerzte,
    });
  }, [aerzte, medikamente, selectedPerson]);

  const medicationCount = useMemo(() => {
    if (!selectedPerson) return 0;
    return medikamente.filter(medication => medication.person_id === selectedPerson.id).length;
  }, [medikamente, selectedPerson]);

  async function handleShareText() {
    if (!exportPlan) return;
    try {
      setSharing(true);
      await Share.share({
        title: exportPlan.title,
        message: exportPlan.text,
      });
    } catch (error) {
      logger.error('Text-Export fehlgeschlagen:', error);
      Alert.alert('Fehler', 'Der Medikamentenplan konnte nicht als Text geteilt werden.');
    } finally {
      setSharing(false);
    }
  }

  async function handleSharePdf() {
    if (!exportPlan) return;
    if (!MedicationPlanShare?.sharePdf) {
      Alert.alert('PDF nicht verfügbar', 'Der PDF-Export ist auf diesem Gerät noch nicht verfügbar.');
      return;
    }

    try {
      setSharing(true);
      await MedicationPlanShare.sharePdf(exportPlan.title, exportPlan.text, exportPlan.fileName);
    } catch (error) {
      logger.error('PDF-Export fehlgeschlagen:', error);
      Alert.alert('Fehler', 'Der Medikamentenplan konnte nicht als PDF geteilt werden.');
    } finally {
      setSharing(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#27ae60" />
          <Text style={styles.loadingText}>Medikamentenplan wird vorbereitet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {!premium ? (
          <PremiumGate
            featureName="Medikamentenplan teilen"
            description="Teilen Sie den aktuellen Medikamentenplan als Text oder PDF mit Arzt, Apotheke, Notfallkontakt oder Angehörigen."
            navigation={navigation}
          />
        ) : (
          <>
            <View style={styles.headerCard}>
              <Text style={styles.headerIcon}>📄</Text>
              <Text style={styles.title}>Medikamentenplan teilen</Text>
              <Text style={styles.subtitle}>
                {selectedPerson ? `Für ${selectedPerson.name}` : 'Keine Person ausgewählt'}
              </Text>
              <Text style={styles.countText}>
                {medicationCount === 1 ? '1 Medikament' : `${medicationCount} Medikamente`}
              </Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Enthalten</Text>
              <Text style={styles.infoText}>
                Medikament, Stärke, Dosis, Einnahmeplan, PZN und zugeordneter Arzt.
              </Text>
              <Text style={styles.infoTitle}>Nicht enthalten</Text>
              <Text style={styles.infoText}>
                Aktueller Bestand, Reichweite, Warnschwellen und technische IDs.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, sharing && styles.buttonDisabled]}
              onPress={handleShareText}
              disabled={sharing || !exportPlan}
              accessibilityRole="button"
              accessibilityLabel="Medikamentenplan als Text teilen"
            >
              <Text style={styles.primaryButtonText}>Als Text teilen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, sharing && styles.buttonDisabled]}
              onPress={handleSharePdf}
              disabled={sharing || !exportPlan}
              accessibilityRole="button"
              accessibilityLabel="Medikamentenplan als PDF teilen"
            >
              <Text style={styles.secondaryButtonText}>Als PDF teilen</Text>
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              Der Plan ist eine Übersicht und ersetzt keine medizinische Beratung.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 17,
    color: '#555',
    textAlign: 'center',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    padding: 22,
    alignItems: 'center',
    marginBottom: 18,
  },
  headerIcon: {
    fontSize: 42,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#444',
    marginTop: 6,
    textAlign: 'center',
  },
  countText: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  infoBox: {
    backgroundColor: '#F1F8F4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5EBDD',
    padding: 18,
    marginBottom: 18,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E6336',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 16,
    lineHeight: 23,
    color: '#333',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#27ae60',
    minHeight: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#27ae60',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  secondaryButtonText: {
    color: '#1E6336',
    fontSize: 18,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
    textAlign: 'center',
  },
});
