import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { isPremium, purchasePremium, getProductInfo, initIAP } from '../services/PremiumService';

interface FeatureRow {
  label: string;
  free: string;
  premium: string;
  isPremiumOnly: boolean;
}

const FEATURES: FeatureRow[] = [
  { label: 'Medikamente verwalten', free: '\u2713', premium: '\u2713', isPremiumOnly: false },
  { label: 'Einnahme tracken', free: '\u2713', premium: '\u2713', isPremiumOnly: false },
  { label: 'Bestands-Warnung', free: '\u2713', premium: '\u2713', isPremiumOnly: false },
  { label: 'Arzt-Urlaub-Pr\u00e4vention', free: '\u2713', premium: '\u2713', isPremiumOnly: false },
  { label: 'Barcode-Scanner', free: '3 pro Tag', premium: 'Unbegrenzt', isPremiumOnly: true },
  { label: 'Kalender-Termine', free: '2 pro Monat', premium: 'Unbegrenzt', isPremiumOnly: true },
  { label: 'Erinnerung-Slots', free: '1 pro Medikament', premium: 'Alle Slots', isPremiumOnly: true },
  { label: 'Cloud-Backup', free: '\u2717', premium: '\u2713 (coming soon)', isPremiumOnly: true },
];

export default function PremiumScreen({ navigation }: { navigation: any }) {
  const [premiumActive, setPremiumActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [price, setPrice] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPremiumState();
  }, []);

  async function loadPremiumState() {
    try {
      setLoading(true);
      setError(null);
      await initIAP();
      const [active, productInfo] = await Promise.all([
        isPremium(),
        getProductInfo(),
      ]);
      setPremiumActive(active);
      if (productInfo?.localizedPrice) {
        setPrice(productInfo.localizedPrice);
      }
    } catch (e: any) {
      setError('Premium-Status konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchase() {
    try {
      setPurchasing(true);
      setError(null);
      const success = await purchasePremium();
      if (success) {
        setPremiumActive(true);
        Alert.alert(
          'Premium freigeschaltet',
          'Vielen Dank! Alle Premium-Funktionen stehen Ihnen jetzt zur Verf\u00fcgung.'
        );
      }
    } catch (e: any) {
      setError('Kauf fehlgeschlagen. Bitte versuchen Sie es erneut.');
    } finally {
      setPurchasing(false);
    }
  }

  function renderCheckOrValue(value: string, isPremiumColumn: boolean, isPremiumOnly: boolean) {
    const isCheck = value === '\u2713';
    const isCross = value === '\u2717';

    return (
      <Text
        style={[
          styles.cellText,
          isPremiumColumn && isPremiumOnly ? styles.premiumHighlight : null,
          isPremiumColumn && isCheck ? styles.premiumCheck : null,
          !isPremiumColumn && isCross ? styles.freeCross : null,
          isPremiumColumn ? styles.bold : null,
        ]}
        accessibilityLabel={
          isCheck ? 'Verf\u00fcgbar' :
          isCross ? 'Nicht verf\u00fcgbar' :
          value
        }
      >
        {value}
      </Text>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} accessibilityLabel="Premium-Bildschirm">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Zur\u00fcck"
          accessibilityRole="button"
        >
          <Text style={styles.backButtonText} accessibilityElementsHidden>
            {'\u2190'}
          </Text>
          <Text style={styles.backButtonTextLabel}>Zur\u00fcck</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Meine Medikamente Premium
        </Text>
        <View style={styles.headerSpacer} accessibilityElementsHidden />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel="Premium-Funktionen und Kauf-Option"
      >
        {/* Feature Comparison Table */}
        <View style={styles.tableContainer} accessibilityLabel="Funktionsvergleich">
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={[styles.tableHeaderCell, styles.featureCol]}>
              <Text style={styles.tableHeaderText}>Funktion</Text>
            </View>
            <View style={[styles.tableHeaderCell, styles.columnCol]}>
              <Text style={styles.tableHeaderText}>Kostenlos</Text>
            </View>
            <View style={[styles.tableHeaderCell, styles.columnCol]}>
              <Text style={[styles.tableHeaderText, styles.premiumHeaderText]}>Premium</Text>
            </View>
          </View>

          {/* Feature Rows */}
          {FEATURES.map((feature, index) => (
            <View
              key={feature.label}
              style={[
                styles.tableRow,
                index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd,
              ]}
              accessibilityLabel={`${feature.label}: Kostenlos ${feature.free}, Premium ${feature.premium}`}
            >
              <View style={[styles.tableCell, styles.featureCol]}>
                <Text style={styles.featureLabel}>{feature.label}</Text>
              </View>
              <View style={[styles.tableCell, styles.columnCol]}>
                {renderCheckOrValue(feature.free, false, feature.isPremiumOnly)}
              </View>
              <View style={[styles.tableCell, styles.columnCol]}>
                {renderCheckOrValue(feature.premium, true, feature.isPremiumOnly)}
              </View>
            </View>
          ))}
        </View>

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer} accessibilityLabel="Lade Premium-Status">
            <ActivityIndicator size="large" color="#27ae60" />
            <Text style={styles.loadingText}>Premium-Status wird geladen...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !loading && (
          <View style={styles.errorContainer} accessibilityLabel={`Fehler: ${error}`}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadPremiumState}
              accessibilityLabel="Erneut versuchen"
              accessibilityRole="button"
            >
              <Text style={styles.retryButtonText}>Erneut versuchen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Purchase Section */}
        {!loading && !error && (
          <View style={styles.purchaseContainer} accessibilityLabel="Kauf-Bereich">
            {premiumActive ? (
              <View style={styles.activeContainer} accessibilityLabel="Premium ist aktiv">
                <Text style={styles.activeText} accessibilityElementsHidden>
                  {'\u2713'}
                </Text>
                <Text style={styles.activeLabel}>Premium aktiv</Text>
                <TouchableOpacity
                  style={[styles.purchaseButton, styles.disabledButton]}
                  disabled
                  accessibilityLabel="Premium ist bereits aktiv"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: true }}
                >
                  <Text style={styles.disabledButtonText}>Premium freigeschaltet</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.buyContainer} accessibilityLabel="Premium freischalten">
                {price ? (
                  <Text style={styles.priceText} accessibilityLabel={`Preis: ${price} pro Monat`}>
                    {price} / Monat
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.purchaseButton,
                    purchasing ? styles.disabledButton : null,
                  ]}
                  onPress={handlePurchase}
                  disabled={purchasing}
                  accessibilityLabel="Premium freischalten"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: purchasing }}
                >
                  {purchasing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.purchaseButtonText}>Premium freischalten</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
    minHeight: 56,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 8,
    minHeight: 44,
    minWidth: 44,
  },
  backButtonText: {
    fontSize: 24,
    color: '#27ae60',
    marginRight: 4,
  },
  backButtonTextLabel: {
    fontSize: 18,
    color: '#27ae60',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 80,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  tableContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#CCCCCC',
  },
  tableHeaderCell: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#555555',
  },
  premiumHeaderText: {
    color: '#27ae60',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    alignItems: 'center',
  },
  tableRowEven: {
    backgroundColor: '#FFFFFF',
  },
  tableRowOdd: {
    backgroundColor: '#F9F9F9',
  },
  tableCell: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  featureCol: {
    flex: 2,
    alignItems: 'flex-start',
  },
  columnCol: {
    flex: 1,
  },
  featureLabel: {
    fontSize: 18,
    color: '#333333',
  },
  cellText: {
    fontSize: 18,
    color: '#555555',
    textAlign: 'center',
  },
  bold: {
    fontWeight: 'bold',
  },
  premiumHighlight: {
    color: '#27ae60',
    fontWeight: 'bold',
    fontSize: 18,
  },
  premiumCheck: {
    color: '#27ae60',
    fontWeight: 'bold',
    fontSize: 20,
  },
  freeCross: {
    color: '#999999',
    fontSize: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 18,
    color: '#555555',
    marginTop: 12,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#FFF3F3',
    borderRadius: 12,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 18,
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#D32F2F',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  purchaseContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  activeContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  activeText: {
    fontSize: 48,
    color: '#27ae60',
    marginBottom: 8,
  },
  activeLabel: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#27ae60',
    marginBottom: 16,
  },
  buyContainer: {
    alignItems: 'center',
    width: '100%',
  },
  priceText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 16,
  },
  purchaseButton: {
    backgroundColor: '#27ae60',
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 56,
  },
  purchaseButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#A5D6A7',
    opacity: 0.7,
  },
  disabledButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
