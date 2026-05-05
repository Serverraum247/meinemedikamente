/**
 * App.tsx – Einstiegspunkt für "Meine Medikamente"
 *
 * React Native App mit SQLite-Datenbank (Float-Support für halbe Tabletten).
 */

import React from 'react';
import { StatusBar, Text, TextInput } from 'react-native';
import { MedikamentProvider } from './src/context/MedikamentContext';
import AppNavigator from './src/navigation/AppNavigator';

// ─── Globale Barrierefreiheit: Font-Scaling Limits ─────────────
// Senioren koennen Systemschriften bis 3x skalieren.
// Wir begrenzen auf 2.0x damit Layouts nicht sprengen.
// Kritische Zahlen/Buttons werden einzeln auf 1.3x begrenzt.
//
// Text.defaultProps ist in neueren RN-Versionen deprecated,
// aber ueber den Default-Props-Ansatz funktioniert es noch.
if (typeof (Text as any).defaultProps === 'undefined') {
  (Text as any).defaultProps = {};
}
(Text as any).defaultProps.maxFontSizeMultiplier = 2.0;

if (typeof (TextInput as any).defaultProps === 'undefined') {
  (TextInput as any).defaultProps = {};
}
(TextInput as any).defaultProps.maxFontSizeMultiplier = 2.0;

function App(): React.JSX.Element {
  return (
    <MedikamentProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <AppNavigator />
    </MedikamentProvider>
  );
}

export default App;
