import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import PremiumGate from '../components/PremiumGate';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  createDeviceTransferExport,
  pickDeviceTransferFile,
  previewDeviceTransferPackage,
  restoreDeviceTransferPackage,
  shareDeviceTransferFile,
  type DeviceTransferPreview,
} from '../services/DeviceTransferService';
import { isPremium as checkIsPremium } from '../services/PremiumService';
import { logger } from '../utils/Logger';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceTransfer'>;
type TransferMode = 'start' | 'send' | 'receive';

export default function DeviceTransferScreen({ navigation }: Props) {
  const [mode, setMode] = useState<TransferMode>('start');
  const [premium, setPremium] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [securityCode, setSecurityCode] = useState('');
  const [pickedPackage, setPickedPackage] = useState('');
  const [preview, setPreview] = useState<DeviceTransferPreview | null>(null);
  const [lastCreatedCode, setLastCreatedCode] = useState('');

  React.useEffect(() => {
    let active = true;
    checkIsPremium()
      .then(value => {
        if (active) setPremium(value);
      })
      .catch(error => {
        logger.error('Premium-Status für Gerätewechsel konnte nicht geladen werden:', error);
        if (active) setPremium(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const normalizedSecurityCode = useMemo(
    () => securityCode.trim().replace(/\s+/g, '').replace(/(.{4})/g, '$1-').replace(/-$/, ''),
    [securityCode],
  );

  async function handleCreatePackage() {
    try {
      setBusy(true);
      const transfer = await createDeviceTransferExport();
      setLastCreatedCode(transfer.securityCode);
      setPreview(transfer.preview);

      Alert.alert(
        'Sicherheitscode merken',
        `Notiere diesen Code separat:\n\n${transfer.securityCode}\n\nSende ihn nicht in derselben Nachricht wie das sichere Paket.`,
        [
          {
            text: 'Sicheres Paket teilen',
            onPress: async () => {
              try {
                await shareDeviceTransferFile(transfer.fileName, transfer.packageText);
              } catch (error) {
                logger.error('Sicheres Paket konnte nicht geteilt werden:', error);
                Alert.alert('Fehler', 'Das sichere Paket konnte nicht geteilt werden.');
              }
            },
          },
          { text: 'Später teilen', style: 'cancel' },
        ],
      );
    } catch (error) {
      logger.error('Sicheres Paket konnte nicht erstellt werden:', error);
      Alert.alert('Fehler', error instanceof Error ? error.message : 'Die Daten konnten nicht vorbereitet werden.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePickPackage() {
    try {
      setBusy(true);
      const content = await pickDeviceTransferFile();
      if (!content) return;
      setPickedPackage(content);
      setPreview(null);
      Alert.alert('Paket ausgewählt', 'Gib jetzt den Sicherheitscode ein, den das alte Gerät angezeigt hat.');
    } catch (error) {
      logger.error('Sicheres Paket konnte nicht ausgewählt werden:', error);
      Alert.alert('Fehler', error instanceof Error ? error.message : 'Das sichere Paket konnte nicht ausgewählt werden.');
    } finally {
      setBusy(false);
    }
  }

  function handlePreviewPackage() {
    try {
      if (!pickedPackage) {
        Alert.alert('Sicheres Paket fehlt', 'Wähle zuerst das sichere Paket vom alten Gerät aus.');
        return;
      }
      if (!normalizedSecurityCode) {
        Alert.alert('Sicherheitscode fehlt', 'Gib den Sicherheitscode vom alten Gerät ein.');
        return;
      }
      setPreview(previewDeviceTransferPackage(pickedPackage, normalizedSecurityCode));
    } catch (error) {
      logger.warn('Sicheres Paket konnte nicht geprüft werden:', error);
      Alert.alert('Prüfung fehlgeschlagen', error instanceof Error ? error.message : 'Der Sicherheitscode passt nicht.');
    }
  }

  function handleRestorePackage() {
    if (!preview) {
      handlePreviewPackage();
      return;
    }

    Alert.alert(
      'Daten übernehmen?',
      'Die Daten auf diesem Gerät werden ersetzt. Vorher wird geprüft, ob das sichere Paket vollständig gelesen werden kann.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Daten übernehmen',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusy(true);
              const result = await restoreDeviceTransferPackage(pickedPackage, normalizedSecurityCode);
              setPreview(result);
              Alert.alert(
                'Daten übernommen',
                'Die Daten wurden übernommen. Bitte prüfe Erinnerungen und Kalendertermine auf diesem Gerät.',
              );
            } catch (error) {
              logger.error('Sicheres Paket konnte nicht übernommen werden:', error);
              Alert.alert('Fehler', error instanceof Error ? error.message : 'Die Daten konnten nicht übernommen werden.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  if (premium === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#27ae60" />
          <Text style={styles.loadingText}>Gerätewechsel wird vorbereitet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>⇄</Text>
          <Text style={styles.title}>Handy wechseln</Text>
          <Text style={styles.subtitle}>
            Übertrage deine Daten geschützt vom alten auf das neue Handy.
          </Text>
        </View>

        {!premium ? (
          <PremiumGate
            featureName="Handy wechseln"
            description="Gerätewechsel ist in Premium enthalten. Deine Medikamentendaten bleiben lokal oder in einem sicheren Paket, das du selbst weitergibst."
            navigation={navigation}
          />
        ) : mode === 'start' ? (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setMode('send')}
              accessibilityRole="button"
              accessibilityLabel="Auf diesem Gerät sind meine Daten"
            >
              <Text style={styles.primaryButtonText}>Auf diesem Gerät sind meine Daten</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setMode('receive')}
              accessibilityRole="button"
              accessibilityLabel="Auf dieses Gerät sollen meine Daten"
            >
              <Text style={styles.secondaryButtonText}>Auf dieses Gerät sollen meine Daten</Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Wichtig</Text>
              <Text style={styles.infoText}>
                Ohne Sicherheitscode kann niemand das sichere Paket öffnen. Sende den Code nicht in derselben Nachricht mit.
              </Text>
            </View>
          </View>
        ) : mode === 'send' ? (
          <View style={styles.section}>
            <StepTitle title="Daten senden" onBack={() => setMode('start')} />
            <Text style={styles.bodyText}>
              Die App erstellt ein sicheres Paket. Danach kannst du es zum Beispiel über Dateien, AirDrop, Drive oder Mail weitergeben.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.disabledButton]}
              onPress={handleCreatePackage}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Sicheres Paket erstellen"
            >
              <Text style={styles.primaryButtonText}>{busy ? 'Wird erstellt...' : 'Sicheres Paket erstellen'}</Text>
            </TouchableOpacity>
            {lastCreatedCode ? (
              <View style={styles.codeBox}>
                <Text style={styles.infoTitle}>Sicherheitscode</Text>
                <Text style={styles.codeText}>{lastCreatedCode}</Text>
                <Text style={styles.infoText}>Den Code separat weitergeben, nicht zusammen mit dem sicheren Paket.</Text>
              </View>
            ) : null}
            {preview ? <PreviewBox preview={preview} /> : null}
          </View>
        ) : (
          <View style={styles.section}>
            <StepTitle title="Daten empfangen" onBack={() => setMode('start')} />
            <Text style={styles.bodyText}>
              Wähle das sichere Paket vom alten Gerät oder aus einer wiedergefundenen Sicherung aus und gib danach den Sicherheitscode ein.
            </Text>

            <TouchableOpacity
              style={[styles.secondaryButton, busy && styles.disabledButton]}
              onPress={handlePickPackage}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Sicheres Paket auswählen"
            >
              <Text style={styles.secondaryButtonText}>{pickedPackage ? 'Sicheres Paket ausgewählt' : 'Sicheres Paket auswählen'}</Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Auch für Wiederherstellung</Text>
              <Text style={styles.infoText}>
                Das sichere Paket kann direkt von einem alten Handy kommen oder vorher aus einer älteren Sicherung erzeugt worden sein.
              </Text>
            </View>

            <Text style={styles.inputLabel}>Sicherheitscode</Text>
            <TextInput
              style={styles.input}
              value={securityCode}
              onChangeText={setSecurityCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              accessibilityLabel="Sicherheitscode"
            />

            <TouchableOpacity
              style={[styles.secondaryButton, busy && styles.disabledButton]}
              onPress={handlePreviewPackage}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Daten prüfen"
            >
              <Text style={styles.secondaryButtonText}>Daten prüfen</Text>
            </TouchableOpacity>

            {preview ? <PreviewBox preview={preview} /> : null}

            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.disabledButton]}
              onPress={handleRestorePackage}
              disabled={busy || !pickedPackage}
              accessibilityRole="button"
              accessibilityLabel="Daten übernehmen"
            >
              <Text style={styles.primaryButtonText}>{busy ? 'Wird übernommen...' : 'Daten übernehmen'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StepTitle({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.stepHeader}>
      <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Zurück">
        <Text style={styles.backButtonText}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

function PreviewBox({ preview }: { preview: DeviceTransferPreview }) {
  return (
    <View style={styles.previewBox}>
      <Text style={styles.infoTitle}>Enthalten</Text>
      <PreviewRow label="Personen" value={preview.personCount} />
      <PreviewRow label="Medikamente" value={preview.medicationCount} />
      <PreviewRow label="Ärzte" value={preview.doctorCount} />
      <PreviewRow label="Einnahmen" value={preview.intakeCount} />
      <PreviewRow label="Packungen" value={preview.packageCount} />
      <PreviewRow label="Aktive Erinnerungen" value={preview.activeReminderCount} />
    </View>
  );
}

function PreviewRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>{value}</Text>
    </View>
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
  },
  hero: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
    borderRadius: 12,
    borderWidth: 1,
    padding: 22,
    marginBottom: 18,
  },
  heroIcon: {
    fontSize: 42,
    marginBottom: 8,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#444',
    marginTop: 8,
    lineHeight: 25,
    textAlign: 'center',
  },
  section: {
    gap: 16,
  },
  primaryButton: {
    minHeight: 60,
    borderRadius: 12,
    backgroundColor: '#27ae60',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: 60,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderColor: '#1a1a2e',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#1a1a2e',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  infoBox: {
    backgroundColor: '#F1F8F4',
    borderColor: '#D5EBDD',
    borderRadius: 12,
    borderWidth: 1,
    padding: 18,
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E6336',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 16,
    lineHeight: 23,
    color: '#333',
  },
  bodyText: {
    fontSize: 18,
    lineHeight: 26,
    color: '#333',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderColor: '#D4D4D4',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  backButtonText: {
    color: '#1a1a2e',
    fontSize: 34,
    lineHeight: 36,
  },
  stepTitle: {
    color: '#1a1a2e',
    fontSize: 23,
    fontWeight: '700',
  },
  codeBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
    borderRadius: 12,
    borderWidth: 1,
    padding: 18,
  },
  codeText: {
    color: '#1a1a2e',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 30,
    marginBottom: 8,
  },
  inputLabel: {
    color: '#1a1a2e',
    fontSize: 17,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8D8D8',
    borderRadius: 10,
    borderWidth: 1,
    color: '#1a1a2e',
    fontSize: 18,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  previewBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
    borderRadius: 12,
    borderWidth: 1,
    padding: 18,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 34,
  },
  previewLabel: {
    color: '#333',
    fontSize: 17,
  },
  previewValue: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: '700',
  },
});
