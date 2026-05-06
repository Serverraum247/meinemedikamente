import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  StyleSheet,
  Linking,
} from 'react-native';
import {
  createArztUrlaub,
  getAllArztUrlaube,
  deleteArztUrlaub,
  calculateUrlaubsWarnungen,
  ArztUrlaubRow,
  UrlaubsWarnung,
} from '../database/UrlaubController';

// ---------- Helper functions ----------

function parseGermanDate(dateStr: string): string | null {
  const match = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function formatGermanDate(isoDate: string): string {
  if (!isoDate) return isoDate;
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function isFutureOrToday(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d >= today;
}

// ---------- Component ----------

interface ArztUrlaubScreenProps {
  navigation?: any;
}

const ArztUrlaubScreen: React.FC<ArztUrlaubScreenProps> = ({ navigation }) => {
  const [praxisName, setPraxisName] = useState('');
  const [telefon, setTelefon] = useState('');
  const [urlaubVon, setUrlaubVon] = useState('');
  const [urlaubBis, setUrlaubBis] = useState('');
  const [urlaube, setUrlaube] = useState<ArztUrlaubRow[]>([]);
  const [warnungen, setWarnungen] = useState<UrlaubsWarnung[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const allUrlaube = await getAllArztUrlaube();
      // Only keep vacations that haven't fully ended yet
      const activeUrlaube = allUrlaube.filter(
        (u: ArztUrlaubRow) => isFutureOrToday(u.urlaub_ende)
      );
      setUrlaube(activeUrlaube);

      const warnings = await calculateUrlaubsWarnungen();
      setWarnungen(warnings);
    } catch (error) {
      console.error('Fehler beim Laden der Urlaubsdaten:', error);
    }
  };

  const handleAddUrlaub = async () => {
    const name = praxisName.trim();
    if (!name) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Praxis-Namen ein.');
      return;
    }
    if (!urlaubVon || !urlaubBis) {
      Alert.alert('Fehler', 'Bitte geben Sie beide Daten ein (von und bis).');
      return;
    }

    const startDate = parseGermanDate(urlaubVon);
    const endDate = parseGermanDate(urlaubBis);

    if (!startDate) {
      Alert.alert('Fehler', 'Ungültiges Datum bei "Urlaub von". Bitte Format TT.MM.JJJJ verwenden.');
      return;
    }
    if (!endDate) {
      Alert.alert('Fehler', 'Ungültiges Datum bei "Urlaub bis". Bitte Format TT.MM.JJJJ verwenden.');
      return;
    }
    if (startDate > endDate) {
      Alert.alert('Fehler', 'Das Enddatum muss nach dem Startdatum liegen.');
      return;
    }

    try {
      await createArztUrlaub({
        praxis_name: name,
        telefon: telefon.trim(),
        urlaub_start: startDate,
        urlaub_ende: endDate,
      } as any);
      setPraxisName('');
      setTelefon('');
      setUrlaubVon('');
      setUrlaubBis('');
      await loadData();
      Alert.alert('Erfolg', 'Urlaub wurde eingetragen.');
    } catch (error) {
      console.error('Fehler beim Eintragen:', error);
      Alert.alert('Fehler', 'Urlaub konnte nicht eingetragen werden.');
    }
  };

  const handleDeleteUrlaub = async (id: string, praxisNameDelete: string) => {
    Alert.alert(
      'Urlaub löschen',
      `Möchten Sie den Urlaub von "${praxisNameDelete}" wirklich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteArztUrlaub(id);
              await loadData();
            } catch (error) {
              console.error('Fehler beim Löschen:', error);
              Alert.alert('Fehler', 'Urlaub konnte nicht gelöscht werden.');
            }
          },
        },
      ]
    );
  };

  // Anruf mit Bestaetigungsdialog
  const handleAnrufen = (praxisNameCall: string, telefonNummer: string) => {
    const nummer = telefonNummer.trim();
    if (!nummer) {
      Alert.alert('Keine Nummer', 'Für diese Praxis ist keine Telefonnummer hinterlegt.');
      return;
    }

    Alert.alert(
      'Arzt anrufen',
      `Möchten Sie "${praxisNameCall}" jetzt anrufen?\n\n${nummer}`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Anrufen',
          style: 'default',
          onPress: () => {
            Linking.openURL(`tel:${nummer}`).catch(() => {
              Alert.alert('Fehler', 'Anruf konnte nicht gestartet werden.');
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ---------- Header ---------- */}
        <View style={styles.header}>
          {navigation ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              accessibilityLabel="Zurück"
            >
              <Text style={styles.backButtonText}>← Zurück</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.headerTitle}>Arzt-Urlaub verwalten</Text>
        </View>

        {/* ---------- Form Section ---------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Neuen Urlaub eintragen</Text>

          <Text style={styles.label}>Praxis-Name</Text>
          <TextInput
            style={styles.input}
            value={praxisName}
            onChangeText={setPraxisName}
            placeholder="z.B. Praxis Dr. Müller"
            placeholderTextColor="#999"
            accessibilityLabel="Praxis-Name eingeben"
          />

          <Text style={styles.label}>Telefonnummer</Text>
          <TextInput
            style={styles.input}
            value={telefon}
            onChangeText={setTelefon}
            placeholder="z.B. 0681 123456"
            placeholderTextColor="#999"
            keyboardType="phone-pad"
            accessibilityLabel="Telefonnummer eingeben"
          />

          <Text style={styles.label}>Urlaub von</Text>
          <TextInput
            style={styles.input}
            value={urlaubVon}
            onChangeText={setUrlaubVon}
            placeholder="TT.MM.JJJJ"
            placeholderTextColor="#999"
            keyboardType="numeric"
            maxLength={10}
            accessibilityLabel="Urlaub Startdatum eingeben"
          />

          <Text style={styles.label}>Urlaub bis</Text>
          <TextInput
            style={styles.input}
            value={urlaubBis}
            onChangeText={setUrlaubBis}
            placeholder="TT.MM.JJJJ"
            placeholderTextColor="#999"
            keyboardType="numeric"
            maxLength={10}
            accessibilityLabel="Urlaub Enddatum eingeben"
          />

          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddUrlaub}
            accessibilityLabel="Urlaub eintragen"
          >
            <Text style={styles.addButtonText}>Urlaub eintragen</Text>
          </TouchableOpacity>
        </View>

        {/* ---------- Active Vacations List ---------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aktive Urlaube</Text>
          {urlaube.length === 0 ? (
            <Text style={styles.emptyText}>Keine aktiven Urlaube eingetragen.</Text>
          ) : (
            urlaube.map((urlaub) => (
              <View key={urlaub.id} style={styles.urlaubCard}>
                <View style={styles.urlaubInfo}>
                  <Text style={styles.urlaubPraxis}>{urlaub.praxis_name}</Text>
                  <Text style={styles.urlaubDateRange}>
                    {formatGermanDate(urlaub.urlaub_start)} – {formatGermanDate(urlaub.urlaub_ende)}
                  </Text>
                  {urlaub.telefon ? (
                    <TouchableOpacity
                      style={styles.telefonRow}
                      onPress={() => handleAnrufen(urlaub.praxis_name, urlaub.telefon || '')}
                      accessibilityLabel={`${urlaub.praxis_name} anrufen: ${urlaub.telefon}`}
                      accessibilityHint="Tippen um Arzt anzurufen"
                    >
                      <Text style={styles.telefonIcon}>📞</Text>
                      <Text style={styles.telefonText}>{urlaub.telefon}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.urlaubActions}>
                  {urlaub.telefon ? (
                    <TouchableOpacity
                      style={styles.callButton}
                      onPress={() => handleAnrufen(urlaub.praxis_name, urlaub.telefon || '')}
                      accessibilityLabel={`${urlaub.praxis_name} anrufen`}
                    >
                      <Text style={styles.callButtonText}>📞</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteUrlaub(urlaub.id, urlaub.praxis_name)}
                    accessibilityLabel={`Urlaub löschen: ${urlaub.praxis_name}`}
                  >
                    <Text style={styles.deleteButtonText}>Löschen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ---------- Warnings Section ---------- */}
        {warnungen.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚠️ Warnungen</Text>
            {warnungen.map((warnung, index) => (
              <View key={index} style={styles.warningCard}>
                <Text style={styles.warningText}>
                  {warnung.medikament?.name ?? 'Medikament'} wird ca. am{' '}
                  {formatGermanDate(
                    warnung.leerDatum instanceof Date
                      ? warnung.leerDatum.toISOString().split('T')[0]
                      : String(warnung.leerDatum)
                  )} leer!{' '}
                  {warnung.urlaub?.praxis_name ?? 'Praxis'} ist vom{' '}
                  {formatGermanDate(warnung.urlaub?.urlaub_start ?? '')} bis{' '}
                  {formatGermanDate(warnung.urlaub?.urlaub_ende ?? '')} im Urlaub.
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ---------- Styles ----------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  backButton: {
    paddingVertical: 12,
    paddingRight: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#007AFF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a1a1a',
    flex: 1,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 16,
  },
  label: {
    fontSize: 18,
    color: '#444444',
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
    minHeight: 50,
  },
  addButton: {
    backgroundColor: '#28a745',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
    minHeight: 52,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 18,
    color: '#888888',
    textAlign: 'center',
    paddingVertical: 12,
  },
  urlaubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
    minHeight: 60,
  },
  urlaubInfo: {
    flex: 1,
    marginRight: 12,
  },
  urlaubPraxis: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  urlaubDateRange: {
    fontSize: 16,
    color: '#555555',
    marginTop: 2,
  },
  telefonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 4,
  },
  telefonIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  telefonText: {
    fontSize: 16,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  urlaubActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callButton: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButtonText: {
    fontSize: 20,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#fff3cd',
    borderWidth: 2,
    borderColor: '#dc3545',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 18,
    color: '#842029',
    fontWeight: '500',
    lineHeight: 26,
  },
});

export default ArztUrlaubScreen;
