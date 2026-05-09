/**
 * App.tsx – Einstiegspunkt für "Mein MediPlan"
 *
 * React Native App mit SQLite-Datenbank (Float-Support für halbe Tabletten).
 */

import React from 'react';
import { LogBox, StatusBar, Text, TextInput } from 'react-native';
import { MedikamentProvider } from './src/context/MedikamentContext';
import { PersonenProvider } from './src/context/PersonenContext';
import AppNavigator from './src/navigation/AppNavigator';

// ─── Globale Barrierefreiheit: Font-Scaling Limits ─────────────
// Senioren können Systemschriften bis 3x skalieren.
// Wir begrenzen stärker, damit Zahlen, Brüche und Bestandsfelder auf echten
// Handy-Displays nicht aus dem Layout laufen.
//
// Text.defaultProps ist in neueren RN-Versionen deprecated,
// aber über den Default-Props-Ansatz funktioniert es noch.
LogBox.ignoreLogs([
  'Support for defaultProps will be removed from function components',
]);
if (__DEV__) {
  LogBox.ignoreAllLogs(true);
}

if (typeof (Text as any).defaultProps === 'undefined') {
  (Text as any).defaultProps = {};
}
(Text as any).defaultProps.maxFontSizeMultiplier = 1.35;

if (typeof (TextInput as any).defaultProps === 'undefined') {
  (TextInput as any).defaultProps = {};
}
(TextInput as any).defaultProps.maxFontSizeMultiplier = 1.25;

function App(): React.JSX.Element {
  return (
    <PersonenProvider>
      <MedikamentProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <AppNavigator />
      </MedikamentProvider>
    </PersonenProvider>
  );
}

export default App;
