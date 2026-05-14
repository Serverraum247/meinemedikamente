import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const steps = [
  {
    title: '1. Person auswählen',
    body: 'Lege bei Bedarf eine weitere Person an. Die Medikamentenliste zeigt immer die aktuell ausgewählte Person.',
  },
  {
    title: '2. Medikament erfassen',
    body: 'Trage Name, Wirkstoff, Stärke, Bestand und Einheit ein. Bei Kombi-Präparaten können mehrere Wirkstoffe hinterlegt werden.',
  },
  {
    title: '3. Einnahme planen',
    body: 'Aktiviere Erinnerungen nur, wenn mindestens eine Uhrzeit feststeht. Für tägliche Einnahme „Jeden Tag“ wählen, sonst einzelne Wochentage.',
  },
  {
    title: '4. Einnahme bestätigen',
    body: 'Bestätige die Einnahme direkt in der App. Der Bestand wird dann nachvollziehbar aktualisiert, wenn der automatische Abzug aktiv ist.',
  },
  {
    title: '5. Vorrat prüfen',
    body: 'Die Übersicht zeigt knapp, bis wann der Vorrat reicht. Bei Bedarf rechtzeitig Rezept oder Nachschub organisieren.',
  },
  {
    title: '6. Plan sichern oder teilen',
    body: 'Cloud-Backup, Text-Export und PDF-Export sind Komfortfunktionen für Premium. Der Plan bezieht sich auf die aktuell ausgewählte Person.',
  },
];

export default function ErsteSchritteScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Erste Schritte</Text>
        <Text style={styles.intro}>
          Mein MediPlan soll eine einfache Übersicht über Medikamente, Einnahmen und Vorrat geben. Die wichtigsten Schritte sind:
        </Text>

        {steps.map(step => (
          <View key={step.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
          </View>
        ))}

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Wichtig</Text>
          <Text style={styles.body}>
            Bitte prüfe alle Angaben sorgfältig. Maßgeblich bleiben immer ärztliche Vorgaben, Beipackzettel und Hinweise der Apotheke.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  intro: {
    fontSize: 18,
    lineHeight: 26,
    color: '#333',
    marginBottom: 18,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  body: {
    fontSize: 17,
    lineHeight: 25,
    color: '#333',
  },
  noteBox: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F2D27A',
  },
  noteTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#5D4200',
    marginBottom: 8,
  },
});
