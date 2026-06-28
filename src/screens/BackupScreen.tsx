import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import PremiumGate from '../components/PremiumGate';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  connectBackupWithRecoveryCode,
  getBackupInfo,
  getBackupRecoveryCode,
  restoreBackup,
  uploadBackup,
  type BackupInfo as ServiceBackupInfo,
} from '../services/BackupService';
import { isPremium as checkIsPremium } from '../services/PremiumService';
import { logger } from '../utils/Logger';

const isIOS = Platform.OS === 'ios';
const isAndroid = Platform.OS === 'android';
const cloudName = isIOS ? 'iCloud' : 'Cloud';

type BackupScreenProps = NativeStackScreenProps<RootStackParamList, 'Backup'>;

export default function BackupScreen({ navigation }: BackupScreenProps) {
  const [isPremium, setIsPremium] = useState(false);
  const [backupInfo, setBackupInfo] = useState<ServiceBackupInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [connectingRecoveryCode, setConnectingRecoveryCode] = useState(false);
  const [revealRecoveryCode, setRevealRecoveryCode] = useState(false);

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}.${month}.${year}, ${hours}:${minutes}`;
    } catch {
      return dateString;
    }
  };

  const loadBackupState = useCallback(async () => {
    try {
      setLoadingInfo(true);
      const [info, storedRecoveryCode] = await Promise.all([
        getBackupInfo(),
        getBackupRecoveryCode(),
      ]);
      setBackupInfo(info);
      setRecoveryCode(storedRecoveryCode);
    } catch (error) {
      logger.error('Fehler beim Laden des Cloud-Backups:', error);
      setBackupInfo(null);
      setRecoveryCode(null);
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  useEffect(() => {
    const checkPremiumAndLoadInfo = async () => {
      try {
        const premium = await checkIsPremium();
        setIsPremium(premium);
        if (premium) {
          await loadBackupState();
        }
      } catch (error) {
        logger.error('Fehler beim Prüfen des Premium-Status:', error);
        setIsPremium(false);
      } finally {
        setLoadingInfo(false);
      }
    };

    checkPremiumAndLoadInfo().catch(logger.error);
  }, [loadBackupState]);

  const handleCreateBackup = async () => {
    Alert.alert(
      `${cloudName}-Backup erstellen`,
      `Möchten Sie ein neues ${cloudName}-Backup erstellen? Die aktuellen Medikamentendaten werden ${isIOS ? 'in iCloud gespeichert' : 'verschlüsselt hochgeladen'}.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Backup erstellen',
          style: 'default',
          onPress: async () => {
            try {
              setUploading(true);
              const result = await uploadBackup();
              if (!result.success) {
                throw new Error(result.error || 'Das Backup konnte nicht erstellt werden.');
              }

              await loadBackupState();
              if (isAndroid && result.generatedRecoveryCode && result.recoveryCode) {
                setRevealRecoveryCode(true);
                Alert.alert(
                  'Backup erfolgreich',
                  `Ihre Medikamentendaten wurden erfolgreich in der Cloud gespeichert.\n\nIhr Sicherungscode lautet:\n\n${result.recoveryCode}\n\nOhne diesen Code kann ein neues Android-Gerät das Backup nicht wiederherstellen.`,
                );
              } else {
                Alert.alert(
                  'Backup erfolgreich',
                  `Ihre Medikamentendaten wurden erfolgreich ${isIOS ? 'in iCloud' : 'in der Cloud'} gespeichert.`,
                );
              }
            } catch (error) {
              logger.error('Fehler beim Backup:', error);
              Alert.alert(
                'Fehler',
                error instanceof Error
                  ? error.message
                  : 'Das Backup konnte nicht erstellt werden. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
              );
            } finally {
              setUploading(false);
            }
          },
        },
      ],
    );
  };

  const handleRestoreBackup = async () => {
    if (isAndroid && !recoveryCode) {
      Alert.alert(
        'Sicherungscode fehlt',
        'Geben Sie zuerst den Sicherungscode Ihres Android-Backups ein. Danach kann dieses Gerät das Cloud-Backup wiederherstellen.',
      );
      return;
    }

    Alert.alert(
      'Backup wiederherstellen',
      'Achtung: Aktuelle Daten werden ersetzt.\n\nDie gespeicherten Medikamentendaten aus der Cloud werden geladen und ersetzen Ihre aktuellen Daten.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Wiederherstellen',
          style: 'destructive',
          onPress: async () => {
            try {
              setRestoring(true);
              const result = await restoreBackup();
              if (!result.success) {
                throw new Error(result.error || 'Die Wiederherstellung ist fehlgeschlagen.');
              }
              Alert.alert(
                'Wiederherstellung erfolgreich',
                'Ihre Medikamentendaten wurden erfolgreich aus der Cloud wiederhergestellt.',
              );
              await loadBackupState();
            } catch (error) {
              logger.error('Fehler bei der Wiederherstellung:', error);
              Alert.alert(
                'Fehler',
                error instanceof Error
                  ? error.message
                  : 'Die Wiederherstellung ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
              );
            } finally {
              setRestoring(false);
            }
          },
        },
      ],
    );
  };

  const handleConnectRecoveryCode = async () => {
    if (!recoveryCodeInput.trim()) {
      Alert.alert('Sicherungscode fehlt', 'Geben Sie zuerst den Sicherungscode vom alten Android-Gerät ein.');
      return;
    }

    try {
      setConnectingRecoveryCode(true);
      const result = await connectBackupWithRecoveryCode(recoveryCodeInput);
      if (!result.success) {
        throw new Error(result.error || 'Der Sicherungscode konnte nicht geprüft werden.');
      }

      setRecoveryCode(result.recoveryCode ?? null);
      setBackupInfo(result.info ?? null);
      setRecoveryCodeInput('');
      setRevealRecoveryCode(false);
      Alert.alert(
        'Gerät verbunden',
        'Dieses Android-Gerät kennt jetzt Ihr Cloud-Backup. Sie können es jetzt wiederherstellen oder später mit demselben Sicherungscode aktualisieren.',
      );
    } catch (error) {
      logger.error('Fehler beim Verbinden des Sicherungscodes:', error);
      Alert.alert(
        'Fehler',
        error instanceof Error ? error.message : 'Der Sicherungscode konnte nicht geprüft werden.',
      );
    } finally {
      setConnectingRecoveryCode(false);
    }
  };

  const renderBackupStatus = () => {
    if (loadingInfo) {
      return (
        <View style={styles.statusContainer}>
          <ActivityIndicator size="large" color="#27ae60" />
          <Text style={styles.loadingText}>Backup-Informationen werden geladen...</Text>
        </View>
      );
    }

    const hasBackup = Boolean(backupInfo?.timestamp);
    let emptyStateText = 'Noch kein Backup vorhanden';

    if (isAndroid && recoveryCode) {
      emptyStateText = 'Sicherungscode verbunden, aber noch kein Cloud-Backup gespeichert';
    } else if (isAndroid) {
      emptyStateText = 'Auf diesem Android-Gerät ist noch kein Sicherungscode verbunden';
    }

    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusIcon}>☁️</Text>
        <Text style={styles.statusLabel}>Backup-Status</Text>
        {hasBackup ? (
          <>
            <Text style={styles.statusText}>Letztes Backup: {formatDate(backupInfo!.timestamp)}</Text>
            <Text style={styles.statusDetail}>{backupInfo!.medikamentCount} Medikamente gesichert</Text>
          </>
        ) : (
          <Text style={styles.noBackupText}>{emptyStateText}</Text>
        )}
      </View>
    );
  };

  const renderRecoveryCodeCard = () => {
    if (!isAndroid) {
      return null;
    }

    return (
      <View style={styles.recoveryContainer}>
        <Text style={styles.recoveryTitle}>Sicherungscode</Text>
        {recoveryCode ? (
          <>
            <Text style={styles.recoveryText}>
              Mit diesem Code kann ein neues Android-Gerät Ihr Cloud-Backup finden und entschlüsseln. Bewahren Sie ihn getrennt vom Handy auf.
            </Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeValue}>{revealRecoveryCode ? recoveryCode : maskRecoveryCode(recoveryCode)}</Text>
            </View>
            <TouchableOpacity
              style={styles.codeActionButton}
              onPress={() => setRevealRecoveryCode(current => !current)}
              accessibilityRole="button"
              accessibilityLabel={revealRecoveryCode ? 'Sicherungscode ausblenden' : 'Sicherungscode anzeigen'}
            >
              <Text style={styles.codeActionButtonText}>
                {revealRecoveryCode ? 'Code ausblenden' : 'Code anzeigen'}
              </Text>
            </TouchableOpacity>
            {!backupInfo ? (
              <Text style={styles.recoveryHint}>
                Erstellen Sie jetzt das erste Cloud-Backup auf diesem Gerät oder geben Sie denselben Code auf dem neuen Gerät ein.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.recoveryText}>
              Wenn Sie schon ein Cloud-Backup auf einem anderen Android-Gerät haben, geben Sie hier denselben Sicherungscode ein. Falls nicht, erzeugt die App Ihren ersten Code automatisch beim ersten Backup.
            </Text>
            <Text style={styles.inputLabel}>Sicherungscode</Text>
            <TextInput
              style={styles.codeInput}
              value={recoveryCodeInput}
              onChangeText={setRecoveryCodeInput}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="ABCD-EF12-3456-7890-ABCD-EF12-3456-7890"
              placeholderTextColor="#8a94a6"
              accessibilityLabel="Sicherungscode"
            />
            <TouchableOpacity
              style={[styles.codeActionButton, connectingRecoveryCode && styles.buttonDisabled]}
              onPress={handleConnectRecoveryCode}
              disabled={connectingRecoveryCode}
              accessibilityRole="button"
              accessibilityLabel="Mit Sicherungscode verbinden"
            >
              <Text style={styles.codeActionButtonText}>
                {connectingRecoveryCode ? 'Wird geprüft...' : 'Mit Sicherungscode verbinden'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  const renderActionButtons = () => (
    <View style={styles.buttonsContainer}>
      <TouchableOpacity
        style={[styles.actionButton, styles.backupButton, uploading && styles.buttonDisabled]}
        onPress={handleCreateBackup}
        disabled={uploading || restoring || connectingRecoveryCode}
        accessibilityLabel="Cloud-Backup erstellen"
        accessibilityRole="button"
      >
        {uploading ? (
          <View style={styles.buttonLoadingContainer}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.buttonText}>Backup wird erstellt...</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>☁️ {cloudName}-Backup erstellen</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.restoreButton, restoring && styles.buttonDisabled]}
        onPress={handleRestoreBackup}
        disabled={uploading || restoring || connectingRecoveryCode}
        accessibilityLabel="Backup wiederherstellen"
        accessibilityRole="button"
      >
        {restoring ? (
          <View style={styles.buttonLoadingContainer}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.buttonText}>Wird wiederhergestellt...</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>📥 Backup wiederherstellen</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderTransferHint = () => {
    if (!isAndroid) {
      return null;
    }

    return (
      <View style={styles.transferHintContainer}>
        <Text style={styles.transferHintTitle}>Von iPhone oder altem Handy übernehmen</Text>
        <Text style={styles.transferHintText}>
          Wenn Ihre Daten noch auf einem anderen Gerät liegen und dort noch kein Cloud-Backup mit Sicherungscode eingerichtet war, nutzen Sie „Handy wechseln“. Dort können Sie ein sicheres Paket vom alten iPhone, Android-Handy oder aus einer wiedergefundenen Sicherung importieren.
        </Text>
        <TouchableOpacity
          style={styles.transferHintButton}
          onPress={() => navigation.navigate('DeviceTransfer')}
          accessibilityLabel="Handy wechseln öffnen"
          accessibilityRole="button"
        >
          <Text style={styles.transferHintButtonText}>Handy wechseln öffnen</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>☁️ {cloudName}-Backup</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.localInfoContainer}>
          <Text style={styles.localInfoIcon}>📱</Text>
          <Text style={styles.localInfoTitle}>Lokale Daten auf diesem Gerät</Text>
          <Text style={styles.localInfoText}>
            Ihre App-Daten liegen zuerst lokal auf diesem Handy. Ein Cloud-Backup ist eine zusätzliche Premium-Sicherung.
          </Text>
        </View>

        {renderTransferHint()}

        {!isPremium && !loadingInfo ? (
          <PremiumGate
            featureName="Cloud-Backup"
            description="Sichern Sie Ihre Medikamentendaten zusätzlich in der Cloud und stellen Sie sie bei Bedarf wieder her."
            navigation={navigation}
          />
        ) : (
          <>
            {renderBackupStatus()}
            {renderRecoveryCodeCard()}
            {renderActionButtons()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function maskRecoveryCode(value: string): string {
  const parts = value.split('-');
  if (parts.length <= 2) {
    return value;
  }

  return parts
    .map((part, index) => (index === 0 || index === parts.length - 1 ? part : '****'))
    .join('-');
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#f8f8f6',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  statusContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  localInfoContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E7E7E0',
  },
  localInfoIcon: {
    fontSize: 38,
    marginBottom: 8,
  },
  localInfoTitle: {
    fontSize: 21,
    fontWeight: 'bold',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 8,
  },
  localInfoText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#444444',
    textAlign: 'center',
  },
  transferHintContainer: {
    backgroundColor: '#eef6ff',
    borderRadius: 16,
    padding: 22,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#c6dcff',
  },
  transferHintTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#13335f',
    textAlign: 'left',
    marginBottom: 8,
  },
  transferHintText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#24456f',
    textAlign: 'left',
    marginBottom: 16,
  },
  transferHintButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#2d6cdf',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  transferHintButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  recoveryContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 22,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#dfe6f2',
  },
  recoveryTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 8,
    textAlign: 'left',
  },
  recoveryText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#364152',
    marginBottom: 14,
    textAlign: 'left',
  },
  recoveryHint: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 22,
    color: '#566275',
    textAlign: 'left',
  },
  codeBox: {
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cfd7e3',
    backgroundColor: '#f7f9fc',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#17335d',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 8,
    textAlign: 'left',
  },
  codeInput: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cfd7e3',
    backgroundColor: '#fbfcfe',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#1a1a2e',
    marginBottom: 12,
  },
  codeActionButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#e8eef8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  codeActionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#17407a',
    textAlign: 'center',
  },
  statusIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  statusText: {
    fontSize: 20,
    color: '#333333',
    textAlign: 'center',
    marginBottom: 6,
  },
  statusDetail: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
  },
  noBackupText: {
    fontSize: 19,
    color: '#707070',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666666',
    marginTop: 12,
    textAlign: 'center',
  },
  buttonsContainer: {
    gap: 16,
  },
  actionButton: {
    minHeight: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  backupButton: {
    backgroundColor: '#27ae60',
  },
  restoreButton: {
    backgroundColor: '#2980b9',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  buttonLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
