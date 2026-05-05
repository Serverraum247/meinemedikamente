/**
 * App.tsx – Einstiegspunkt für "Meine Medikamente"
 *
 * React Native App mit SQLite-Datenbank (Float-Support für halbe Tabletten).
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { MedikamentProvider } from './src/context/MedikamentContext';
import AppNavigator from './src/navigation/AppNavigator';

function App(): React.JSX.Element {
  return (
    <MedikamentProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <AppNavigator />
    </MedikamentProvider>
  );
}

export default App;
