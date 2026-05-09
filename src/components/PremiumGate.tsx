/**
 * PremiumGate.tsx
 *
 * Einheitliche Premium-Sperre fuer die gesamte App.
 * Ueberall gleich aussehend – egal ob Android oder iOS.
 *
 * Verwendung:
 *   <PremiumGate
 *     featureName="Stärke & Dosierung"
 *     description="Erfassen Sie mg/ml-Dosierungen fuer Ihre Medikamente."
 *     navigation={navigation}
 *   />
 *
 * Oder als Wrapper (versteckt Inhalt wenn nicht Premium):
 *   <PremiumGate featureName="Cloud-Backup" navigation={navigation}>
 *     <Text>Nur fuer Premium-Nutzer sichtbar</Text>
 *   </PremiumGate>
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AccessibilityInfo,
} from 'react-native';
import { isPremium } from '../services/PremiumService';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface PremiumGateProps {
  featureName: string;
  description?: string;
  navigation: NativeStackNavigationProp<any>;
  children?: React.ReactNode;
}

const PremiumGate: React.FC<PremiumGateProps> = ({
  featureName,
  description,
  navigation,
  children,
}) => {
  const [premiumAktiv, setPremiumAktiv] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    isPremium().then(p => {
      setPremiumAktiv(p);
      setLoading(false);
    });
  }, []);

  // Wenn Premium aktiv: Kinder rendern (oder nichts wenn keine Kinder)
  if (premiumAktiv && children) {
    return <>{children}</>;
  }

  // Wenn Premium aktiv aber keine Kinder: nichts rendern (Feature ist freigeschaltet)
  if (premiumAktiv && !children) {
    return null;
  }

  // Noch am Laden
  if (loading) {
    return null;
  }

  // Premium-Gate anzeigen
  const handleUpgrade = () => {
    navigation.navigate('Premium' as never);
  };

  // Accessibility-Ankuendigung
  const announceAccessibility = () => {
    AccessibilityInfo.announceForAccessibility(
      `${featureName} ist eine Premium-Funktion. Tippen Sie, um Premium zu werden.`
    );
  };

  return (
    <View
      style={styles.container}
      onLayout={announceAccessibility}
      accessible={true}
      accessibilityLabel={`${featureName} – Premium-Funktion. Tippen Sie auf den Button um Premium zu werden.`}
      accessibilityRole="none"
    >
      {/* Lock-Icon */}
      <View style={styles.iconCircle}>
        <Text style={styles.lockIcon}>⭐</Text>
      </View>

      {/* Feature-Name */}
      <Text style={styles.title} accessibilityRole="header">
        {featureName}
      </Text>
      <Text style={styles.badge}>Premium-Funktion</Text>

      {/* Beschreibung */}
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}

      {/* Upgrade-Button */}
      <TouchableOpacity
        style={styles.upgradeButton}
        onPress={handleUpgrade}
        accessibilityLabel="Jetzt Premium werden"
        accessibilityRole="button"
        activeOpacity={0.7}
      >
        <Text style={styles.upgradeButtonText}>Jetzt freischalten</Text>
      </TouchableOpacity>

      {/* Diskreter Hinweis */}
      <Text style={styles.hint}>
        Alle Funktionen • Kein Abo • Einmaliger Kauf
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF9F0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginVertical: 8,
    borderWidth: 2,
    borderColor: '#E8DDD0',
    // Leichter Schatten
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FFB74D',
  },
  lockIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 4,
  },
  badge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  upgradeButton: {
    backgroundColor: '#FF6D00',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    // Mindestens 44x44 fuer Accessibility
    minHeight: 48,
    justifyContent: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 10,
    textAlign: 'center',
  },
});

export default PremiumGate;
