/**
 * AppNavigator.ts – Navigation mit React Navigation
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import MedikamentDetailScreen from '../screens/MedikamentDetailScreen';
import AddMedikamentScreen from '../screens/AddMedikamentScreen';
import EditMedikamentScreen from '../screens/EditMedikamentScreen';
import BarcodeScannerScreen from '../screens/BarcodeScannerScreen';
import NachkaufScreen from '../screens/NachkaufScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ArztUrlaubScreen from '../screens/ArztUrlaubScreen';
import PremiumScreen from '../screens/PremiumScreen';
import BackupScreen from '../screens/BackupScreen';
import MedicationPlanExportScreen from '../screens/MedicationPlanExportScreen';
import ErsteSchritteScreen from '../screens/ErsteSchritteScreen';
import DatenschutzRechtScreen from '../screens/DatenschutzRechtScreen';

export type RootStackParamList = {
  Home: undefined;
  MedikamentDetail: { medikamentId: string };
  AddMedikament: { scannedPZN?: string; suggestedName?: string } | undefined;
  EditMedikament: { medikamentId: string };
  BarcodeScanner: undefined;
  Nachkauf: { medikamentId: string };
  Settings: undefined;
  ArztUrlaub: undefined;
  Premium: undefined;
  Backup: undefined;
  MedicationPlanExport: undefined;
  ErsteSchritte: undefined;
  DatenschutzRecht: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#FFFFFF',
          },
          headerTintColor: '#1a1a2e',
          headerTitleStyle: {
            fontWeight: '600' as const,
            fontSize: 20,
          },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Mein MediPlan' }}
        />
        <Stack.Screen
          name="MedikamentDetail"
          component={MedikamentDetailScreen}
          options={{ title: 'Medikament' }}
        />
        <Stack.Screen
          name="AddMedikament"
          component={AddMedikamentScreen}
          options={{ title: 'Neues Medikament' }}
        />
        <Stack.Screen
          name="EditMedikament"
          component={EditMedikamentScreen}
          options={{ title: 'Bearbeiten' }}
        />
        <Stack.Screen
          name="BarcodeScanner"
          component={BarcodeScannerScreen}
          options={{ title: 'Barcode scannen', headerShown: false }}
        />
        <Stack.Screen
          name="Nachkauf"
          component={NachkaufScreen}
          options={{ title: 'Nachkauf' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Einstellungen' }}
        />
        <Stack.Screen name="ArztUrlaub" component={ArztUrlaubScreen} options={{ title: 'Arzt-Urlaub' }} />
        <Stack.Screen name="Premium" component={PremiumScreen} options={{ title: 'Premium' }} />
        <Stack.Screen name="Backup" component={BackupScreen} options={{ title: 'Cloud-Backup' }} />
        <Stack.Screen name="MedicationPlanExport" component={MedicationPlanExportScreen} options={{ title: 'Plan teilen' }} />
        <Stack.Screen name="ErsteSchritte" component={ErsteSchritteScreen} options={{ title: 'Erste Schritte' }} />
        <Stack.Screen name="DatenschutzRecht" component={DatenschutzRechtScreen} options={{ title: 'Datenschutz & Rechtliches' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
