/**
 * AppText.tsx – Barrierefreie Text-Komponente fuer Senioren
 *
 * Setzt automatisch maxFontSizeMultiplier basierend auf Rolle:
 * - headline (Ueberschriften): 1.4x
 * - body (Fliesstext): 2.0x – Senioren koennen sehr grosse Schriften brauchen
 * - number (Bestands-Zahlen): 1.3x – duerfen Layout nicht sprengen
 * - button (Button-Text): 1.3x
 *
 * Verwendung: <AppText variant="body">Hallo</AppText>
 * Ersetzt <Text> in allen Screens.
 */

import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';

export type AppTextVariant = 'headline' | 'body' | 'number' | 'button' | 'caption';

const MULTIPLIER: Record<AppTextVariant, number> = {
  headline: 1.4,
  body: 2.0,
  number: 1.3,
  button: 1.3,
  caption: 1.8,
};

interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
}

/**
 * Barrierefreie Text-Komponente.
 * Setzt maxFontSizeMultiplier automatisch.
 * Alle anderen TextProps werden durchgereicht.
 */
export default function AppText({ variant = 'body', style, ...props }: AppTextProps) {
  return (
    <Text
      maxFontSizeMultiplier={MULTIPLIER[variant]}
      style={style}
      {...props}
    />
  );
}

/**
 * Convenience-Hooks fuer Font-Scale
 */
export { MULTIPLIER as FONT_SCALE_LIMITS };
