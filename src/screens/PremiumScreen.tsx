import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { isPremium, purchasePremium, getProductInfo, initIAP } from '../services/PremiumService';

interface FeatureItem {
  icon: string;
  label: string;
  freeText: string;
  premiumText: string;
  isPremiumOnly: boolean;
}

const FEATURES: FeatureItem[] = [
  { icon: '💊', label: 'Medikamente verwalten', freeText: 'Max. 3', premiumText: 'Unbegrenzt', isPremiumOnly: true },
  { icon: '🧴', label: 'Darreichungsformen', freeText: 'Basis', premiumText: 'Erweitert', isPremiumOnly: true },
  { icon: '✅', label: 'Einnahme tracken', freeText: 'Ja', premiumText: 'Ja', isPremiumOnly: false },
  { icon: '📊', label: 'Bestands-Warnung', freeText: 'Nein', premiumText: 'Ja', isPremiumOnly: true },
  { icon: '📅', label: 'Arzt-Urlaub-Prävention', freeText: 'Ansehen', premiumText: 'Verwalten + Anrufen', isPremiumOnly: true },
  { icon: '✏️', label: 'Bestand korrigieren', freeText: 'Nein', premiumText: 'Ja', isPremiumOnly: true },
  { icon: '📷', label: 'Barcode-Scanner', freeText: '3 pro Tag', premiumText: 'Unbegrenzt', isPremiumOnly: true },
  { icon: '🗓️', label: 'Kalender-Termine', freeText: 'Nein', premiumText: 'Ja', isPremiumOnly: true },
  { icon: '⏰', label: 'Erinnerungen', freeText: 'Standard', premiumText: 'Unbegrenzt', isPremiumOnly: true },
  { icon: '🕐', label: 'Uhrzeiten', freeText: 'Standard', premiumText: 'Individuell', isPremiumOnly: true },
  { icon: '☁️', label: 'Cloud-Backup', freeText: 'Nein', premiumText: 'Ja', isPremiumOnly: true },
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
    } catch (_e: any) {
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
          'Vielen Dank! Alle Premium-Funktionen stehen Ihnen jetzt zur Verfügung.'
        );
      }
    } catch (_e: any) {
      setError('Kauf fehlgeschlagen. Bitte versuchen Sie es erneut.');
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel="Premium-Bildschirm"
      >
        {/* Hero-Bereich */}
        <View style={styles.heroSection}>
          <Text style={styles.heroIcon}>⭐</Text>
          <Text style={styles.heroTitle}>Mein MediPlan</Text>
          <Text style={styles.heroSubtitle}>Premium</Text>

          {premiumActive ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>✓ Aktiv</Text>
            </View>
          ) : (
            <Text style={styles.heroDescription}>
              Schalte alle Funktionen frei und sorge dich nicht mehr um Limits.
            </Text>
          )}
        </View>

        {/* Feature-Karten */}
        <Text style={styles.sectionTitle}>Was ist alles drin?</Text>

        {FEATURES.map((feature) => {
          const isBlocked = feature.isPremiumOnly && !premiumActive;
          return (
            <View
              key={feature.label}
              style={[
                styles.featureCard,
                isBlocked && styles.featureCardBlocked,
              ]}
              accessibilityLabel={`${feature.label}: Kostenlos ${feature.freeText}, Premium ${feature.premiumText}`}
            >
              <View style={styles.featureTopRow}>
                <Text style={styles.featureIcon}>{feature.icon}</Text>
                <Text style={[
                  styles.featureLabel,
                  isBlocked && styles.featureLabelBlocked,
                ]}>
                  {feature.label}
                </Text>
                {isBlocked && (
                  <Text style={styles.lockIcon}>🔒</Text>
                )}
              </View>
              <View style={styles.featureValues}>
                <View style={styles.featureValueCol}>
                  <Text style={styles.featureValueLabel}>Kostenlos</Text>
                  <Text style={[
                    styles.featureValueText,
                    feature.freeText === 'Nein' && styles.featureValueNo,
                  ]}>
                    {feature.freeText}
                  </Text>
                </View>
                <View style={styles.featureDivider} />
                <View style={styles.featureValueCol}>
                  <Text style={[styles.featureValueLabel, styles.premiumLabel]}>Premium</Text>
                  <Text style={[styles.featureValueText, styles.premiumValue]}>
                    {feature.premiumText}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#27ae60" />
            <Text style={styles.loadingText}>Premium-Status wird geladen...</Text>
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadPremiumState}
              accessibilityRole="button"
            >
              <Text style={styles.retryButtonText}>Erneut versuchen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Kauf-Bereich */}
        {!loading && !error && (
          <View style={styles.purchaseSection}>
            {premiumActive ? (
              <TouchableOpacity
                style={[styles.purchaseButton, styles.activeButton]}
                disabled
                accessibilityState={{ disabled: true }}
              >
                <Text style={styles.activeButtonText}>✓ Premium ist freigeschaltet</Text>
              </TouchableOpacity>
            ) : (
              <>
                {price ? (
                  <Text style={styles.priceText}>{price} / Monat</Text>
                ) : (
                  <Text style={styles.priceText}>In-App Kauf</Text>
                )}
                <TouchableOpacity
                  style={[
                    styles.purchaseButton,
                    purchasing ? styles.purchaseButtonDisabled : null,
                  ]}
                  onPress={handlePurchase}
                  disabled={purchasing}
                  accessibilityRole="button"
                  accessibilityLabel="Premium freischalten"
                >
                  {purchasing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.purchaseButtonText}>⭐ Premium freischalten</Text>
                  )}
                </TouchableOpacity>
                <Text style={styles.purchaseHint}>
                  Sobald einmal gekauft, dauerhaft aktiv.
                </Text>
              </>
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
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 50,
  },

  // Hero
  heroSection: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  heroIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  heroSubtitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#27ae60',
    marginTop: 2,
  },
  heroDescription: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
    lineHeight: 26,
  },
  activeBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
  },
  activeBadgeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#27ae60',
  },

  // Section
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 16,
  },

  // Feature-Karten
  featureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  featureCardBlocked: {
    borderLeftWidth: 4,
    borderLeftColor: '#f39c12',
  },
  featureTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  featureIcon: {
    fontSize: 28,
    width: 44,
  },
  featureLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
    flex: 1,
  },
  featureLabelBlocked: {
    color: '#888',
  },
  lockIcon: {
    fontSize: 20,
    marginLeft: 8,
  },
  featureValues: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 44,
  },
  featureValueCol: {
    flex: 1,
  },
  featureValueLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 4,
  },
  featureValueText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
  },
  featureValueNo: {
    color: '#c0392b',
  },
  premiumLabel: {
    color: '#27ae60',
  },
  premiumValue: {
    color: '#27ae60',
    fontWeight: '700',
  },
  featureDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 16,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 18,
    color: '#555',
    marginTop: 12,
  },

  // Error
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#FFF3F3',
    borderRadius: 14,
    marginTop: 16,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#D32F2F',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minHeight: 48,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  // Kauf
  purchaseSection: {
    marginTop: 28,
    alignItems: 'center',
  },
  priceText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 16,
  },
  purchaseButton: {
    backgroundColor: '#27ae60',
    width: '100%',
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  activeButton: {
    backgroundColor: '#A5D6A7',
  },
  activeButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  purchaseHint: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
  },
});
