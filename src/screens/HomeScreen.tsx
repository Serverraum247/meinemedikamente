/**
 * HomeScreen.tsx – Hauptübersicht aller Medikamente
 *
 * Senioren-freundlich: Große Touch-Flächen, hoher Kontrast,
 * klare Anzeige der Bestände (inkl. Float-Werte wie 28.5)
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { useMedikamente } from '../context/MedikamentContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { calculateUrlaubsWarnungen } from '../database/UrlaubController';
import type { UrlaubsWarnung } from '../database/UrlaubController';
import { getMaxMedikamente, isPremium } from '../services/PremiumService';
import { version as APP_VERSION } from '../../package.json';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { medikamente, medikamenteUnterSchwelle, loading } = useMedikamente();
  const [urlaubsWarnungen, setUrlaubsWarnungen] = useState<UrlaubsWarnung[]>([]);
  const [menueOffen, setMenueOffen] = useState(false);

  // Hamburger-Menue im Header links
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

  // Urlaub-Kollisionen laden
  useEffect(() => {
    calculateUrlaubsWarnungen().then(setUrlaubsWarnungen).catch(console.error);
  }, []);

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

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isUnterSchwelle && styles.cardWarning,
        ]}
        onPress={() => navigation.navigate('MedikamentDetail', { medikamentId: item.id })}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, Bestand: ${item.aktueller_bestand} ${item.einheit}${isUnterSchwelle ? ', Nachbestellen empfohlen' : ''}`}
        accessibilityHint="Doppelt tippen für Details"
      >
        <View style={styles.cardContent}>
          <Text style={styles.medName}>{item.name}</Text>
          <Text style={styles.medDetail}>
            Bestand: {item.aktueller_bestand} {item.einheit}
          </Text>
          <Text style={styles.medDetail}>
            Dosis: {item.einzeldosis} {item.einheit} pro Einnahme
          </Text>
          {isUnterSchwelle && (
            <Text style={styles.warnungText}>
              ⚠ Nachbestellen empfohlen!
            </Text>
          )}
        </View>
        <View style={styles.cardBestand}>
          <Text style={[styles.bestandZahl, isUnterSchwelle && styles.bestandWarning]} maxFontSizeMultiplier={1.3}>
            {isUnterSchwelle ? '⚠' : '✓'} {item.aktueller_bestand}
          </Text>
          <Text style={styles.bestandLabel}>übrig</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Warnungs-Banner */}
      {medikamenteUnterSchwelle.length > 0 && (
        <View
          style={styles.warnBanner}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.warnBannerText}>
            ⚠ {medikamenteUnterSchwelle.length} Medikament(e) unter Warnschwelle
          </Text>
        </View>
      )}

      {/* Urlaub-Kollisions-Banner */}
      {urlaubsWarnungen.length > 0 && (
        <TouchableOpacity
          style={styles.urlaubBanner}
          onPress={() => navigation.navigate('ArztUrlaub')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${urlaubsWarnungen.length} Urlaub-Kollisionen. Medikamente werden waehrend Arzturlaub leer. Tippen fuer Details.`}
        >
          <Text style={styles.urlaubBannerText}>
            📅 {urlaubsWarnungen.length} Urlaub-Kollision(en) – Medikamente werden waehrend Arzturlaub leer!
          </Text>
        </TouchableOpacity>
      )}

      {/* Leerer Zustand */}
      {medikamente.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Keine Medikamente</Text>
          <Text style={styles.emptySubtitle}>
            Tippe auf "+" um dein erstes Medikament hinzuzufügen.
          </Text>
        </View>
      ) : (
        <FlatList
          data={medikamente}
          keyExtractor={item => item.id}
          renderItem={renderMedikament}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Hinzufuegen-Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={async () => {
          const max = await getMaxMedikamente();
          if (medikamente.length >= max) {
            Alert.alert(
              'Premium erforderlich',
              `Kostenlose Version: maximal ${max} Medikamente. Premium = unbegrenzt.`,
              [
                { text: 'Abbrechen', style: 'cancel' },
                { text: 'Premium', onPress: () => navigation.navigate('Premium') },
              ]
            );
            return;
          }
          navigation.navigate('AddMedikament');
        }}
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
        <Pressable style={styles.menueOverlay} onPress={() => setMenueOffen(false)}>
          <Pressable style={styles.menuePanel} onPress={() => {}}>
            {/* Menue-Header */}
            <View style={styles.menueHeader}>
              <Text style={styles.menueTitle}>Meine Medikamente</Text>
              <TouchableOpacity onPress={() => setMenueOffen(false)} accessibilityLabel="Menü schließen">
                <Text style={styles.menueClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Menue-Eintraege */}
            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('Settings'); }}
              accessibilityRole="button"
            >
              <Text style={styles.menueItemIcon}>⚙️</Text>
              <Text style={styles.menueItemText}>Einstellungen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('ArztUrlaub'); }}
              accessibilityRole="button"
            >
              <Text style={styles.menueItemIcon}>📅</Text>
              <Text style={styles.menueItemText}>Arzt-Urlaub</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('Premium'); }}
              accessibilityRole="button"
            >
              <Text style={styles.menueItemIcon}>⭐</Text>
              <Text style={styles.menueItemText}>Premium</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menueItem}
              onPress={() => { setMenueOffen(false); navigation.navigate('Backup'); }}
              accessibilityRole="button"
            >
              <Text style={styles.menueItemIcon}>☁️</Text>
              <Text style={styles.menueItemText}>Cloud-Backup</Text>
            </TouchableOpacity>

            {/* Version */}
            <View style={styles.menueFooter}>
              <Text style={styles.menueVersion}>Version {APP_VERSION}</Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// --- Styles (Senioren-freundlich, WCAG AA Kontrast) ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  cardContent: {
    flex: 1,
  },
  medName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  medDetail: {
    fontSize: 16,
    color: '#555',
    marginBottom: 2,
  },
  warnungText: {
    fontSize: 16,
    color: '#e74c3c',
    fontWeight: '600',
    marginTop: 4,
  },
  cardBestand: {
    alignItems: 'center',
    paddingLeft: 16,
  },
  bestandZahl: {
    fontSize: 28,
    fontWeight: '700',
    color: '#27ae60',
  },
  bestandWarning: {
    color: '#e74c3c',
  },
  bestandLabel: {
    fontSize: 14,
    color: '#777',
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
  urlaubBanner: {
    backgroundColor: '#fff3cd',
    borderLeftWidth: 4,
    borderLeftColor: '#e74c3c',
    padding: 12,
  },
  urlaubBannerText: {
    fontSize: 16,
    color: '#856404',
    fontWeight: '600',
    textAlign: 'center',
  },
});
