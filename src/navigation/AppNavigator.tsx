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

export type RootStackParamList = {
  Home: undefined;
  MedikamentDetail: { medikamentId: string };
  AddMedikament: { scannedPZN?: string } | undefined;
  EditMedikament: { medikamentId: string };
  BarcodeScanner: undefined;
  Nachkauf: { medikamentId: string };
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
          options={{ title: 'Meine Medikamente' }}
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
