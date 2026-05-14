import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { version as APP_VERSION } from '../../package.json';

const supportMail = 'kontakt@serverraum247.dev';

export default function DatenschutzRechtScreen() {
  const openMail = () => {
    const subject = encodeURIComponent('Anfrage Mein MediPlan');
    const body = encodeURIComponent(`\n\nApp: Mein MediPlan\nVersion: ${APP_VERSION}\n`);
    Linking.openURL(`mailto:${supportMail}?subject=${subject}&body=${body}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Datenschutz & Rechtliches</Text>

        <InfoBlock title="Herausgeber und Kontakt">
          <Text style={styles.body}>Serverraum247</Text>
          <TouchableOpacity
            onPress={openMail}
            accessibilityRole="link"
            accessibilityLabel={`E-Mail an ${supportMail} schreiben`}
          >
            <Text style={styles.link}>{supportMail}</Text>
          </TouchableOpacity>
        </InfoBlock>

        <InfoBlock title="Zweck der App">
          <Text style={styles.body}>
            Mein MediPlan unterstützt bei der persönlichen Organisation von Medikamenten, Erinnerungen, Vorräten, Rezeptterminen und Arztinformationen.
          </Text>
        </InfoBlock>

        <InfoBlock title="Keine medizinische Beratung">
          <Text style={styles.body}>
            Die App ersetzt keine ärztliche oder pharmazeutische Beratung. Sie stellt keine Diagnose, keine Therapieempfehlung und keine verbindliche Einnahmeanweisung dar.
          </Text>
          <Text style={styles.body}>
            Maßgeblich sind die Vorgaben von Arzt, Apotheke und Beipackzettel. Änderungen an Medikamenten, Dosierung oder Einnahmezeiten sollten nur nach fachlicher Rücksprache erfolgen.
          </Text>
        </InfoBlock>

        <InfoBlock title="Haftungshinweis">
          <Text style={styles.body}>
            Alle Angaben werden vom Nutzer selbst eingegeben oder bestätigt. Bitte prüfe Name, Wirkstoff, Stärke, Dosierung, Uhrzeiten und Bestand regelmäßig.
          </Text>
          <Text style={styles.body}>
            Für eine fehlerhafte oder vergessene Einnahme von Medikamenten ist jeder Nutzer selbst verantwortlich.
          </Text>
        </InfoBlock>

        <InfoBlock title="Gespeicherte Daten">
          <Text style={styles.body}>
            Die App speichert Medikamentendaten, Personen, Ärzte, Einnahmen, Erinnerungen, Rezepttermine und Einstellungen lokal auf dem Gerät.
          </Text>
          <Text style={styles.body}>
            Bei Nutzung von Cloud-Backup können diese Daten zusätzlich in der jeweiligen Cloud des Geräts gesichert werden. E-Mail-Anfragen werden nur geöffnet, wenn du den Kontakt aktiv auswählst.
          </Text>
        </InfoBlock>

        <InfoBlock title="Berechtigungen">
          <Text style={styles.body}>
            Kamera wird für Barcode- oder PZN-Scans verwendet. Benachrichtigungen werden für Einnahmeerinnerungen verwendet. Kalenderzugriff wird nur genutzt, wenn ein Termin erstellt werden soll.
          </Text>
        </InfoBlock>

        <InfoBlock title="Löschen von Daten">
          <Text style={styles.body}>
            Einträge können in der App gelöscht oder geändert werden. Zusätzlich können App-Daten über die Systemeinstellungen des Geräts entfernt werden.
          </Text>
        </InfoBlock>

        <InfoBlock title="Hinweis zur Datenschutzerklärung">
          <Text style={styles.body}>
            Für die Veröffentlichung im App Store und bei Google Play wird zusätzlich eine öffentlich erreichbare Datenschutzerklärung benötigt. Diese App-Seite fasst die wichtigsten Punkte für Nutzer verständlich zusammen.
          </Text>
        </InfoBlock>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
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
    marginBottom: 16,
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
    marginBottom: 8,
  },
  link: {
    fontSize: 17,
    lineHeight: 25,
    color: '#0B63CE',
    fontWeight: '700',
  },
});
