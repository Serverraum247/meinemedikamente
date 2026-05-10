import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { uploadBackup, getBackupInfo, restoreBackup, BackupInfo as ServiceBackupInfo } from '../services/BackupService';
import { isPremium as checkIsPremium } from '../services/PremiumService';
import { RootStackParamList } from '../navigation/AppNavigator';
import PremiumGate from '../components/PremiumGate';
import { logger } from '../utils/Logger';

// Plattform-spezifische Labels
const isIOS = Platform.OS === 'ios';
const cloudName = isIOS ? 'iCloud' : 'Cloud';

type BackupScreenProps = NativeStackScreenProps<RootStackParamList, 'Backup'>;

const BackupScreen: React.FC<BackupScreenProps> = ({ navigation }) => {
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [backupInfo, setBackupInfo] = useState<ServiceBackupInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);

  // Format date to German locale: DD.MM.YYYY, HH:MM
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

  const loadBackupInfo = useCallback(async () => {
    try {
      setLoadingInfo(true);
      const info = await getBackupInfo();
      setBackupInfo(info);
    } catch (error) {
      logger.error('Fehler beim Laden der Backup-Info:', error);
      setBackupInfo(null);
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
          await loadBackupInfo();
        }
      } catch (error) {
        logger.error('Fehler beim Prüfen des Premium-Status:', error);
        setIsPremium(false);
      } finally {
        setLoadingInfo(false);
      }
    };

    checkPremiumAndLoadInfo();
  }, [loadBackupInfo]);

  const handleCreateBackup = async () => {
    Alert.alert(
      `${cloudName}-Backup erstellen`,
      `Möchten Sie ein neues ${cloudName}-Backup erstellen? Die aktuellen Medikamentendaten werden ${isIOS ? 'in iCloud gespeichert' : 'hochgeladen'}.`,
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
              Alert.alert(
                'Backup erfolgreich',
                `Ihre Medikamentendaten wurden erfolgreich ${isIOS ? 'in iCloud' : 'in der Cloud'} gespeichert.`
              );
              await loadBackupInfo();
            } catch (error) {
              logger.error('Fehler beim Backup:', error);
              Alert.alert(
                'Fehler',
                error instanceof Error
                  ? error.message
                  : 'Das Backup konnte nicht erstellt werden. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.'
              );
            } finally {
              setUploading(false);
            }
          },
        },
      ]
    );
  };

  const handleRestoreBackup = async () => {
    Alert.alert(
      'Backup wiederherstellen',
      'Achtung: Aktuelle Daten werden ersetzt!\n\nDie gespeicherten Medikamentendaten aus der Cloud werden geladen und ersetzen Ihre aktuellen Daten.',
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
                'Ihre Medikamentendaten wurden erfolgreich aus der Cloud wiederhergestellt.'
              );
              await loadBackupInfo();
            } catch (error) {
              logger.error('Fehler bei der Wiederherstellung:', error);
              Alert.alert(
                'Fehler',
                error instanceof Error
                  ? error.message
                  : 'Die Wiederherstellung ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.'
              );
            } finally {
              setRestoring(false);
            }
          },
        },
      ]
    );
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

    const hasBackup = backupInfo?.timestamp !== null && backupInfo?.timestamp !== undefined && backupInfo.timestamp !== '';

    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusIcon}>📋</Text>
        <Text style={styles.statusLabel}>Backup-Status</Text>
        {hasBackup ? (
          <>
            <Text style={styles.statusText}>
              Letztes Backup: {formatDate(backupInfo!.timestamp)}
            </Text>
            <Text style={styles.statusDetail}>
              {backupInfo!.medikamentCount} Medikamente gesichert
            </Text>
          </>
        ) : (
          <Text style={styles.noBackupText}>Noch kein Backup vorhanden</Text>
        )}
      </View>
    );
  };

  const renderActionButtons = () => (
    <View style={styles.buttonsContainer}>
      <TouchableOpacity
        style={[styles.actionButton, styles.backupButton, uploading && styles.buttonDisabled]}
        onPress={handleCreateBackup}
        disabled={uploading || restoring}
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
        disabled={uploading || restoring}
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>☁️ {cloudName}-Backup</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.localInfoContainer}>
          <Text style={styles.localInfoIcon}>📱</Text>
          <Text style={styles.localInfoTitle}>Lokale Daten auf diesem Gerät</Text>
          <Text style={styles.localInfoText}>
            Ihre App-Daten liegen zuerst lokal auf diesem Handy. Ein Cloud-Backup ist eine zusätzliche Premium-Sicherung.
          </Text>
        </View>

        {!isPremium && !loadingInfo ? (
          <PremiumGate
            featureName="Cloud-Backup"
            description="Sichern Sie Ihre Medikamentendaten zusätzlich in der Cloud und stellen Sie sie bei Bedarf wieder her."
            navigation={navigation}
          />
        ) : (
          <>
            {renderBackupStatus()}
            {renderActionButtons()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

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
    marginBottom: 24,
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
    fontSize: 20,
    color: '#999999',
    textAlign: 'center',
    fontStyle: 'italic',
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

export default BackupScreen;
