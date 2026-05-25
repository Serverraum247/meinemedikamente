/**
 * SettingsScreen.tsx – App-Einstellungen
 *
 * - Standard-Uhrzeiten fuer Tageszeit-Slots
 * - Arztkontaktdaten pflegen (Free: 1 Arzt, Premium: unbegrenzt)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  SLOT_META,
  SLOT_REIHENFOLGE,
  getAllDefaultUhrzeiten,
  setDefaultUhrzeit,
  resetDefaultUhrzeiten,
  type TageszeitSlot,
} from '../utils/Einnahmeplan';
import { announceChange } from '../utils/AccessibilityHelpers';
import {
  getAllAerzte,
  createArzt,
  updateArzt,
  deleteArzt,
  getMaxAerzte,
  type ArztRow,
} from '../database/ArztController';
import { isPremium, setDevPremiumOverride, getDevPremiumOverride } from '../services/PremiumService';
import { canUsePremiumTestOverride } from '../services/AppRuntimeConfigService';
import { usePersonen } from '../context/PersonenContext';
import { AVATAR_EMOJIS } from '../database/PersonenController';
import { showPremiumRequiredAlert } from '../utils/PremiumAlerts';
import { version as APP_VERSION } from '../../package.json';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type SettingsTab = 'allgemein' | 'medikamente' | 'speicherung' | 'hilfe';

const SETTINGS_TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'allgemein', label: 'Allgemein' },
  { key: 'medikamente', label: 'Medikamente' },
  { key: 'speicherung', label: 'Speicherung' },
  { key: 'hilfe', label: 'Hilfe' },
];

export default function SettingsScreen({ navigation }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('allgemein');
  // Personen
  const {
    personen, aktivePerson, setAktivePerson,
    addPerson, editPerson, removePerson,
    maxPersonen,
  } = usePersonen();
  const [neuePersonName, setNeuePersonName] = useState('');
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [editPersonName, setEditPersonName] = useState('');
  const [editPersonEmoji, setEditPersonEmoji] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null); // person id oder 'new'

  // Premium-Override fuer Debug- und interne Test-Builds
  const [devOverride, setDevOverrideState] = useState<string>('');
  const premiumTestOverrideAvailable = canUsePremiumTestOverride();
  const [premiumActive, setPremiumActive] = useState(false);

  // Uhrzeiten-State
  const [uhrzeiten, setUhrzeiten] = useState<Record<TageszeitSlot, string>>({
    morgens: '08:00',
    mittags: '12:00',
    abends: '18:00',
    nachts: '22:00',
  });
  const [geaendert, setGeaendert] = useState<Set<TageszeitSlot>>(new Set());

  // Aerzte-State
  const [aerzte, setAerzte] = useState<ArztRow[]>([]);
  const [maxAerzte, setMaxAerzteState] = useState(1);
  const [editArzt, setEditArzt] = useState<ArztRow | null>(null);
  const [neuerArzt, setNeuerArzt] = useState(false);

  // Uhrzeiten + Aerzte laden
  useEffect(() => {
    (async () => {
      const stored = await getAllDefaultUhrzeiten();
      setUhrzeiten(stored);
      await loadAerzte();
    })();

    // Test-Override laden
    if (premiumTestOverrideAvailable) {
      getDevPremiumOverride().then(setDevOverrideState);
    }
  }, [premiumTestOverrideAvailable]);

  const loadAerzte = async () => {
    const [list, isPrem, max] = await Promise.all([
      getAllAerzte(),
      isPremium(),
      getMaxAerzte(),
    ]);
    setAerzte(list);
    setPremiumActive(isPrem);
    setMaxAerzteState(max);
  };

  // Uhrzeit validieren (HH:MM)
  const isValidTime = (t: string): boolean => {
    return /^\d{1,2}:\d{2}$/.test(t) && (() => {
      const [h, m] = t.split(':').map(Number);
      return h >= 0 && h < 24 && m >= 0 && m < 60;
    })();
  };

  const handleUhrzeitChange = useCallback((slot: TageszeitSlot, value: string) => {
    setUhrzeiten(prev => ({ ...prev, [slot]: value }));
    setGeaendert(prev => new Set(prev).add(slot));
  }, []);

  const handleSpeichern = useCallback(async () => {
    try {
      for (const slot of geaendert) {
        const uhrzeit = uhrzeiten[slot];
        if (!isValidTime(uhrzeit)) {
          const meta = SLOT_META[slot];
          Alert.alert(
            'Ungültige Uhrzeit',
            `"${uhrzeit}" ist keine gültige Uhrzeit für ${meta.label}.\nBitte im Format HH:MM eingeben (z.B. 08:00).`,
          );
          return;
        }
        await setDefaultUhrzeit(slot, uhrzeit);
      }
      setGeaendert(new Set());
      announceChange('Einstellungen gespeichert');
      Alert.alert('Gespeichert', 'Standard-Uhrzeiten wurden aktualisiert.');
    } catch (_e) {
      Alert.alert('Fehler', 'Uhrzeiten konnten nicht gespeichert werden.');
    }
  }, [geaendert, uhrzeiten]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Zurücksetzen',
      'Alle Uhrzeiten auf die Standardwerte zurücksetzen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Zurücksetzen',
          style: 'destructive',
          onPress: async () => {
            await resetDefaultUhrzeiten();
            const defaults = await getAllDefaultUhrzeiten();
            setUhrzeiten(defaults);
            setGeaendert(new Set());
          },
        },
      ],
    );
  }, []);

  // === Arzt-Handler ===

  const handleAddArzt = () => {
    if (aerzte.length >= maxAerzte) {
      showPremiumRequiredAlert('Mehr als ein Arzt ist nur mit Premium möglich.', navigation);
      return;
    }
    setNeuerArzt(true);
    setEditArzt({
      id: '',
      name: '',
      telefon: '',
      email: '',
      adresse: '',
      plz: '',
      ort: '',
      land: 'Deutschland',
      fachgebiet: '',
      created_at: '',
    });
  };

  const handleSaveArzt = async () => {
    if (!editArzt || !editArzt.name.trim()) {
      Alert.alert('Pflichtfeld', 'Bitte gib einen Namen ein.');
      return;
    }

    try {
      if (neuerArzt) {
        const result = await createArzt({
          name: editArzt.name.trim(),
          telefon: editArzt.telefon.trim(),
          email: editArzt.email.trim(),
          adresse: editArzt.adresse.trim(),
          plz: editArzt.plz.trim(),
          ort: editArzt.ort.trim(),
          land: editArzt.land.trim() || 'Deutschland',
          fachgebiet: editArzt.fachgebiet.trim(),
        });
        if (!result.success) {
          showPremiumRequiredAlert(result.error || 'Weitere Ärzte sind nur mit Premium möglich.', navigation);
          return;
        }
      } else {
        await updateArzt(editArzt.id, {
          name: editArzt.name.trim(),
          telefon: editArzt.telefon.trim(),
          email: editArzt.email.trim(),
          adresse: editArzt.adresse.trim(),
          plz: editArzt.plz.trim(),
          ort: editArzt.ort.trim(),
          land: editArzt.land.trim() || 'Deutschland',
          fachgebiet: editArzt.fachgebiet.trim(),
        });
      }
      setEditArzt(null);
      setNeuerArzt(false);
      await loadAerzte();
    } catch (_e) {
      Alert.alert('Fehler', 'Arzt konnte nicht gespeichert werden.');
    }
  };

  const handleDeleteArzt = (arzt: ArztRow) => {
    Alert.alert(
      'Arzt löschen',
      `"${arzt.name}" wirklich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await deleteArzt(arzt.id);
            await loadAerzte();
          },
        },
      ],
    );
  };

  const formatArztAdresse = (arzt: ArztRow): string => {
    const ortZeile = [arzt.plz?.trim(), arzt.ort?.trim()].filter(Boolean).join(' ');
    return [arzt.adresse?.trim(), ortZeile, arzt.land?.trim()].filter(Boolean).join(', ');
  };

  const openPreparedMail = async (subject: string, intro = '') => {
    const constants = Platform.constants as Record<string, unknown>;
    const geraet = [constants.Manufacturer, constants.Brand, constants.Model]
      .filter(Boolean)
      .join(' ');
    const body = [
      intro,
      '',
      '',
      'Supportdaten:',
      `App-Version: ${APP_VERSION}`,
      `Plattform: ${Platform.OS}`,
      `Systemversion: ${String(Platform.Version)}`,
      `Gerät: ${geraet || 'unbekannt'}`,
    ].join('\n');
    const url = `mailto:kontakt@serverraum247.dev?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('E-Mail nicht verfügbar', 'Auf diesem Gerät ist keine E-Mail-App eingerichtet.');
        return;
      }
      await Linking.openURL(url);
    } catch (_e) {
      Alert.alert('E-Mail nicht verfügbar', 'Die E-Mail-App konnte nicht geöffnet werden.');
    }
  };

  const handleSupportMail = async () => {
    await openPreparedMail('Anfrage Mein MediPlan');
  };

  const handleProblemMail = async () => {
    await openPreparedMail('Problem melden - Mein MediPlan', 'Bitte beschreibe kurz, was passiert ist:');
  };

  const handleFeatureMail = async () => {
    await openPreparedMail('Verbesserungsvorschlag - Mein MediPlan', 'Meine Idee oder mein Wunsch:');
  };

  const renderPersonen = () => (
    <SettingsCard title="Personen" subtitle="Verwalte Medikamente getrennt nach Person.">
      {personen.length < maxPersonen ? (
        <View style={styles.inlineForm}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={neuePersonName}
            onChangeText={setNeuePersonName}
            placeholder="Name der neuen Person"
            placeholderTextColor="#999"
            accessibilityLabel="Name der neuen Person"
          />
          <TouchableOpacity
            style={styles.compactPrimaryButton}
            onPress={async () => {
              if (!neuePersonName.trim()) return;
              const result = await addPerson({ name: neuePersonName.trim() });
              if (result.success) {
                setNeuePersonName('');
                announceChange('Person hinzugefügt');
              } else {
                showPremiumRequiredAlert('Mehrere Personen sind nur mit Premium möglich.', navigation);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Person hinzufügen"
          >
            <Text style={styles.compactPrimaryButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {personen.map(person => {
        const isEditing = editPersonId === person.id;
        const isActive = aktivePerson?.id === person.id;
        return (
          <View key={person.id} style={styles.personRow}>
            {isEditing ? (
              <View style={styles.inlineForm}>
                <TouchableOpacity onPress={() => setShowEmojiPicker(person.id)} accessibilityRole="button" accessibilityLabel="Avatar ändern">
                  <Text style={styles.personEmoji}>{person.avatar_emoji}</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={editPersonName}
                  onChangeText={setEditPersonName}
                  placeholder="Name"
                  placeholderTextColor="#999"
                  accessibilityLabel="Name bearbeiten"
                />
                <TouchableOpacity
                  onPress={async () => {
                    if (!editPersonName.trim()) return;
                    await editPerson(person.id, {
                      name: editPersonName.trim(),
                      avatar_emoji: editPersonEmoji || person.avatar_emoji,
                    });
                    setEditPersonId(null);
                    announceChange('Person aktualisiert');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Speichern"
                >
                  <Text style={styles.saveButton}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditPersonId(null)} accessibilityRole="button" accessibilityLabel="Abbrechen">
                  <Text style={styles.cancelButton}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.inlineForm}>
                <TouchableOpacity onPress={() => setShowEmojiPicker(person.id)} accessibilityRole="button" accessibilityLabel={`Avatar von ${person.name} ändern`}>
                  <Text style={styles.personEmoji}>{person.avatar_uri ? '📷' : person.avatar_emoji}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => {
                    setAktivePerson(person);
                    announceChange(`${person.name} ausgewählt`);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${person.name}${isActive ? ' (aktiv)' : ''}. Tippen zum Auswählen.`}
                >
                  <Text style={[styles.personNameText, isActive && styles.personNameActive]}>
                    {person.name}
                  </Text>
                  {isActive ? <Text style={styles.rowSubText}>Aktive Person</Text> : null}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEditPersonId(person.id);
                    setEditPersonName(person.name);
                    setEditPersonEmoji(person.avatar_emoji);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${person.name} bearbeiten`}
                >
                  <Text style={styles.editIcon}>✎</Text>
                </TouchableOpacity>
                {person.ist_standard !== 1 ? (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(`${person.name} löschen?`, 'Medikamente dieser Person werden der Hauptperson zugeordnet.', [
                        { text: 'Abbrechen', style: 'cancel' },
                        {
                          text: 'Löschen',
                          style: 'destructive',
                          onPress: async () => {
                            const result = await removePerson(person.id);
                            if (!result.success) Alert.alert('Fehler', result.error);
                            else announceChange('Person gelöscht');
                          },
                        },
                      ]);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${person.name} löschen`}
                  >
                    <Text style={styles.deleteIcon}>⌫</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        );
      })}
    </SettingsCard>
  );

  const renderAerzte = () => (
    <SettingsCard title="Meine Ärzte" subtitle="Hinterlege Kontaktdaten deiner Ärzte.">
      <SettingsRow
        icon="＋"
        title="Arzt hinzufügen"
        value={`${aerzte.length}/${maxAerzte}`}
        onPress={handleAddArzt}
      />
      {aerzte.length === 0 && !editArzt ? <Text style={styles.emptyText}>Noch kein Arzt hinterlegt.</Text> : null}
      {aerzte.map(arzt => (
        <View key={arzt.id} style={styles.arztCard}>
          <View style={styles.arztInfo}>
            <Text style={styles.arztName}>{arzt.name}</Text>
            {arzt.fachgebiet ? <Text style={styles.arztDetail}>{arzt.fachgebiet}</Text> : null}
            {arzt.telefon ? <Text style={styles.arztDetail}>Telefon: {arzt.telefon}</Text> : null}
            {arzt.email ? <Text style={styles.arztDetail}>E-Mail: {arzt.email}</Text> : null}
            {formatArztAdresse(arzt) ? <Text style={styles.arztDetail}>{formatArztAdresse(arzt)}</Text> : null}
          </View>
          <View style={styles.arztActions}>
            <TouchableOpacity onPress={() => { setNeuerArzt(false); setEditArzt({ ...arzt }); }} accessibilityLabel={`${arzt.name} bearbeiten`}>
              <Text style={styles.arztEditButton}>✎</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteArzt(arzt)} accessibilityLabel={`${arzt.name} löschen`}>
              <Text style={styles.arztDeleteButton}>⌫</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {editArzt ? (
        <View style={styles.arztForm}>
          <Text style={styles.arztFormTitle}>{neuerArzt ? 'Neuer Arzt' : 'Arzt bearbeiten'}</Text>
          <Text style={styles.fieldLabel}>Name *</Text>
          <TextInput style={styles.fieldInput} value={editArzt.name} onChangeText={(t: string) => setEditArzt({ ...editArzt, name: t })} placeholder="Dr. Müller" placeholderTextColor="#999" />
          <Text style={styles.fieldLabel}>Fachgebiet</Text>
          <TextInput style={styles.fieldInput} value={editArzt.fachgebiet} onChangeText={(t: string) => setEditArzt({ ...editArzt, fachgebiet: t })} placeholder="Hausarzt, Kardiologie..." placeholderTextColor="#999" />
          <Text style={styles.fieldLabel}>Telefon</Text>
          <TextInput style={styles.fieldInput} value={editArzt.telefon} onChangeText={(t: string) => setEditArzt({ ...editArzt, telefon: t })} placeholder="0681 123456" placeholderTextColor="#999" keyboardType="phone-pad" />
          <Text style={styles.fieldLabel}>E-Mail</Text>
          <TextInput style={styles.fieldInput} value={editArzt.email} onChangeText={(t: string) => setEditArzt({ ...editArzt, email: t })} placeholder="praxis@example.de" placeholderTextColor="#999" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Text style={styles.fieldLabel}>Adresse</Text>
          <TextInput style={styles.fieldInput} value={editArzt.adresse} onChangeText={(t: string) => setEditArzt({ ...editArzt, adresse: t })} placeholder="Musterstraße 1" placeholderTextColor="#999" />
          <View style={styles.arztAddressRow}>
            <View style={styles.arztAddressZip}>
              <Text style={styles.fieldLabel}>PLZ</Text>
              <TextInput style={styles.fieldInput} value={editArzt.plz} onChangeText={(t: string) => setEditArzt({ ...editArzt, plz: t })} placeholder="66111" placeholderTextColor="#999" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.arztAddressCity}>
              <Text style={styles.fieldLabel}>Ort</Text>
              <TextInput style={styles.fieldInput} value={editArzt.ort} onChangeText={(t: string) => setEditArzt({ ...editArzt, ort: t })} placeholder="Saarbrücken" placeholderTextColor="#999" />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Land</Text>
          <TextInput style={styles.fieldInput} value={editArzt.land} onChangeText={(t: string) => setEditArzt({ ...editArzt, land: t })} placeholder="Deutschland" placeholderTextColor="#999" />
          <View style={styles.arztFormButtons}>
            <TouchableOpacity style={[styles.arztFormBtn, styles.arztFormCancel]} onPress={() => { setEditArzt(null); setNeuerArzt(false); }}>
              <Text style={styles.arztFormCancelText}>Abbrechen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.arztFormBtn, styles.arztFormSave]} onPress={handleSaveArzt}>
              <Text style={styles.arztFormSaveText}>Speichern</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </SettingsCard>
  );

  const renderUhrzeiten = () => (
    <SettingsCard title="Standard-Uhrzeiten" subtitle="Diese Zeiten werden als Vorschlag für neue Erinnerungen genutzt.">
      {SLOT_REIHENFOLGE.map(slot => {
        const meta = SLOT_META[slot];
        return (
          <View key={slot} style={styles.uhrzeitRow}>
            <View style={styles.uhrzeitLabelContainer}>
              <Text style={styles.uhrzeitEmoji} accessibilityElementsHidden>{meta.emoji}</Text>
              <Text style={styles.uhrzeitLabel}>{meta.label}</Text>
            </View>
            <TextInput
              accessibilityLabel={`${meta.label} Standard-Uhrzeit`}
              style={[styles.uhrzeitInput, geaendert.has(slot) && styles.uhrzeitInputChanged]}
              value={uhrzeiten[slot]}
              onChangeText={(text: string) => handleUhrzeitChange(slot, text)}
              placeholder="HH:MM"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              maxLength={5}
            />
          </View>
        );
      })}
      {geaendert.size > 0 ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Änderungen speichern" style={styles.speichernButton} onPress={handleSpeichern} activeOpacity={0.7}>
          <Text style={styles.speichernButtonText}>Speichern ({geaendert.size})</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Uhrzeiten auf Standard zurücksetzen" style={styles.secondaryButton} onPress={handleReset} activeOpacity={0.7}>
        <Text style={styles.secondaryButtonText}>Uhrzeiten zurücksetzen</Text>
      </TouchableOpacity>
    </SettingsCard>
  );

  const renderPremiumTest = () => {
    if (!premiumTestOverrideAvailable) return null;
    return (
      <SettingsCard title="Interne Testversion" subtitle="Premium-Status für Tests simulieren. Nur in Debug/Internal sichtbar.">
        <View style={styles.devButtonRow}>
          {(['premium', 'free', ''] as const).map(mode => (
            <TouchableOpacity
              key={mode || 'real'}
              style={[styles.devButton, devOverride === mode && styles.devButtonActive]}
              onPress={async () => {
                await setDevPremiumOverride(mode);
                setDevOverrideState(mode);
                await loadAerzte();
              }}
              accessibilityRole="button"
              accessibilityLabel={mode === 'premium' ? 'Premium simulieren' : mode === 'free' ? 'Free simulieren' : 'Override entfernen'}
            >
              <Text style={[styles.devButtonText, devOverride === mode && styles.devButtonTextActive]}>
                {mode === 'premium' ? 'Premium' : mode === 'free' ? 'Free' : 'Echt'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <StatusBadge label={devOverride === 'premium' ? 'Premium simuliert' : devOverride === 'free' ? 'Free simuliert' : 'Echte Prüfung'} tone="warning" />
      </SettingsCard>
    );
  };

  const renderActiveTab = () => {
    if (activeTab === 'allgemein') {
      return (
        <>
          {renderPersonen()}
          <SettingsCard title="Darstellung">
            <SettingsRow icon="Aa" title="Schriftgröße" value="System" subtitle="Die App folgt der Schriftgröße deines Geräts." />
            <SettingsRow icon="◐" title="Kontrast" value="Klar" subtitle="Ruhige Farben, deutliche Statusanzeigen." />
          </SettingsCard>
          <SettingsCard title="Abo & App">
            <SettingsRow icon="♕" title="Status" value={premiumActive ? 'Premium' : 'Free'} onPress={() => navigation.navigate('Premium')} />
            <SettingsRow icon="i" title="Version" value={APP_VERSION} />
          </SettingsCard>
          {renderPremiumTest()}
        </>
      );
    }

    if (activeTab === 'medikamente') {
      return (
        <>
          <SettingsCard title="Medikamente">
            <SettingsRow icon="⏰" title="Erinnerungen" value="Aktiv" subtitle="Einnahmen werden außerhalb der App erinnert, wenn erlaubt." />
            <SettingsRow icon="⚠" title="Bestandswarnung" value={premiumActive ? 'Premium' : 'Premium'} subtitle="Warnungen bei niedrigem Vorrat." />
            <SettingsRow icon="📅" title="Arzt-Urlaub" value="Verwalten" onPress={() => navigation.navigate('ArztUrlaub')} />
          </SettingsCard>
          {renderUhrzeiten()}
          {renderAerzte()}
        </>
      );
    }

    if (activeTab === 'speicherung') {
      return (
        <>
          <SettingsCard title="Speicherung">
            <SettingsRow icon="⌂" title="Lokale Daten" value="Auf diesem Gerät" subtitle="Deine Medikamentendaten werden zuerst lokal gespeichert." />
            <SettingsRow icon="☁" title="Cloud-Backup" value={premiumActive ? 'Verfügbar' : 'Premium'} subtitle="Zusätzliche Sicherung, wenn du sie aktiv nutzt." onPress={() => navigation.navigate('Backup')} />
            <SettingsRow icon="⇄" title="Live-Sync" value="Nicht aktiv" subtitle="Android und iOS haben keine automatische gemeinsame Datenbank." />
          </SettingsCard>
          <View style={styles.privacyNotice}>
            <Text style={styles.privacyNoticeTitle}>Datenschutz-Hinweis</Text>
            <Text style={styles.privacyNoticeText}>
              Deine Medikamentendaten bleiben auf deinem Gerät. Cloud-Backup wird nur verwendet, wenn du es aktiv einrichtest.
            </Text>
          </View>
        </>
      );
    }

    return (
      <>
        <SettingsCard title="Hilfe & Feedback">
          <SettingsRow icon="✉" title="Kontakt" value="E-Mail" subtitle="kontakt@serverraum247.dev" onPress={handleSupportMail} />
          <SettingsRow icon="!" title="Problem melden" value="Mail" subtitle="Öffnet eine E-Mail mit Geräte- und Versionsdaten." onPress={handleProblemMail} />
          <SettingsRow icon="💡" title="Verbesserung vorschlagen" value="Mail" onPress={handleFeatureMail} />
        </SettingsCard>
        <SettingsCard title="Anbieter">
          <SettingsRow icon="i" title="Serverraum247" subtitle="Kontakt & Support" value="Support" />
          <SettingsRow icon="i" title="App-Version" value={APP_VERSION} />
          <SettingsRow icon="i" title="Systemversion" value={String(Platform.Version)} />
        </SettingsCard>
        <View style={styles.disclaimerSection} accessibilityRole="summary" accessibilityLabel="Wichtiger Hinweis zur Medikamenteneinnahme">
          <Text style={styles.disclaimerTitle}>Wichtiger Hinweis</Text>
          <Text style={styles.disclaimerText}>
            Diese App unterstützt nur bei Übersicht, Erinnerung und Bestandsplanung. Sie ersetzt keine ärztliche oder pharmazeutische Beratung.
          </Text>
          <Text style={styles.disclaimerText}>
            Wir übernehmen keine Haftung für eine fehlerhafte Einnahme von Medikamenten. Jeder Nutzer ist selbst dafür verantwortlich, Medikamente nach ärztlicher Vorgabe einzunehmen.
          </Text>
        </View>
        <SettingsCard title="Rechtliches">
          <SettingsRow icon="§" title="Datenschutz & Rechtliches" value="Öffnen" onPress={() => navigation.navigate('DatenschutzRecht')} />
          <SettingsRow icon="♕" title="Premium" value={premiumActive ? 'Aktiv' : 'Free'} onPress={() => navigation.navigate('Premium')} />
        </SettingsCard>
        <SettingsCard title="Gefährliche Aktionen">
          <SettingsRow
            icon="!"
            title="App-Daten zurücksetzen"
            value="Später"
            subtitle="Diese Funktion wird erst aktiviert, wenn ein vollständiger Löschdialog vorhanden ist."
          />
        </SettingsCard>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Einstellungen schließen">
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Einstellungen</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        {SETTINGS_TABS.map(tab => {
          const selected = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, selected && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
            >
              <Text style={[styles.tabText, selected && styles.tabTextActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderActiveTab()}
      </ScrollView>

      <Modal visible={!!showEmojiPicker} transparent animationType="fade">
        <View style={styles.emojiPickerOverlay}>
          <View style={styles.emojiPickerCard}>
            <Text style={styles.emojiPickerTitle}>Avatar auswählen</Text>
            <View style={styles.emojiGrid}>
              {AVATAR_EMOJIS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiOption}
                  onPress={async () => {
                    if (showEmojiPicker && showEmojiPicker !== 'new') {
                      await editPerson(showEmojiPicker, { avatar_emoji: emoji });
                      if (editPersonId === showEmojiPicker) setEditPersonEmoji(emoji);
                    }
                    setShowEmojiPicker(null);
                    announceChange('Avatar geändert');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Avatar ${emoji}`}
                >
                  <Text style={styles.emojiOptionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setShowEmojiPicker(null)} style={styles.emojiPickerClose} accessibilityRole="button" accessibilityLabel="Avatar-Auswahl schließen">
              <Text style={styles.emojiPickerCloseText}>Schließen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SettingsCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingsCard}>
      <Text style={styles.settingsCardTitle} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.settingsCardSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.settingsRowIcon}>
        <Text style={styles.settingsRowIconText}>{icon}</Text>
      </View>
      <View style={styles.settingsRowContent}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.settingsRowSubtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
      {onPress ? <Text style={styles.settingsRowChevron}>›</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.settingsRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.settingsRow}>{content}</View>;
}

function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warning' }) {
  return (
    <View style={[styles.statusBadge, tone === 'warning' && styles.statusBadgeWarning]}>
      <Text style={[styles.statusBadgeText, tone === 'warning' && styles.statusBadgeWarningText]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F1F5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 60,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#F1F1F5',
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#5A6472',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
  },
  topBarSpacer: {
    width: 42,
    height: 42,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#101828',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabButtonActive: {
    backgroundColor: '#EEF2F7',
  },
  tabText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#111827',
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  settingsCardTitle: {
    fontSize: 20,
    color: '#101828',
    fontWeight: '800',
    marginBottom: 4,
  },
  settingsCardSubtitle: {
    fontSize: 14,
    color: '#667085',
    lineHeight: 20,
    marginBottom: 10,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F3',
    paddingVertical: 8,
  },
  settingsRowIcon: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  settingsRowIconText: {
    fontSize: 20,
    color: '#2684C7',
    fontWeight: '800',
  },
  settingsRowContent: {
    flex: 1,
    paddingRight: 8,
  },
  settingsRowTitle: {
    fontSize: 17,
    color: '#101828',
    fontWeight: '700',
  },
  settingsRowSubtitle: {
    fontSize: 13,
    color: '#667085',
    lineHeight: 18,
    marginTop: 2,
  },
  settingsRowValue: {
    fontSize: 15,
    color: '#667085',
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: 110,
  },
  settingsRowChevron: {
    fontSize: 30,
    color: '#98A2B3',
    marginLeft: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#EEF2F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  statusBadgeText: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '800',
  },
  statusBadgeWarning: {
    backgroundColor: '#FFF4E5',
  },
  statusBadgeWarningText: {
    color: '#A15C00',
  },
  // Personen
  personRow: {
    marginBottom: 8,
  },
  personEmoji: {
    fontSize: 32,
    marginRight: 8,
  },
  personNameText: {
    fontSize: 18,
    color: '#333',
    paddingVertical: 4,
  },
  personNameActive: {
    color: '#155724',
    fontWeight: '600',
  },
  rowSubText: {
    fontSize: 13,
    color: '#667085',
    marginTop: 2,
  },
  editIcon: {
    fontSize: 20,
    padding: 8,
  },
  deleteIcon: {
    fontSize: 20,
    padding: 8,
  },
  saveButton: {
    fontSize: 24,
    color: '#28a745',
    padding: 8,
    fontWeight: '700',
  },
  cancelButton: {
    fontSize: 22,
    color: '#999',
    padding: 8,
  },
  // Emoji-Picker
  emojiPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiPickerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  emojiPickerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 16,
    textAlign: 'center',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  emojiOption: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
  },
  emojiOptionText: {
    fontSize: 32,
  },
  emojiPickerClose: {
    marginTop: 20,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
  },
  emojiPickerCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inlineForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fafafa',
    minHeight: 44,
  },
  compactPrimaryButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F6F8B',
  },
  compactPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 15,
    color: '#666',
    marginBottom: 20,
    lineHeight: 22,
  },

  // Arzt-Liste
  addButton: {
    fontSize: 16,
    color: '#27ae60',
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 12,
  },
  arztCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  arztInfo: {
    flex: 1,
  },
  arztName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  arztDetail: {
    fontSize: 15,
    color: '#666',
    marginTop: 2,
  },
  arztActions: {
    flexDirection: 'row',
    gap: 12,
    paddingLeft: 12,
  },
  arztEditButton: {
    fontSize: 22,
  },
  arztDeleteButton: {
    fontSize: 22,
  },

  // Arzt-Formular
  arztForm: {
    backgroundColor: '#f9f9f8',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#27ae60',
  },
  arztFormTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
    marginTop: 8,
  },
  fieldInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  arztAddressRow: {
    flexDirection: 'row',
    gap: 10,
  },
  arztAddressZip: {
    flex: 0.8,
  },
  arztAddressCity: {
    flex: 1.4,
  },
  arztFormButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  arztFormBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arztFormCancel: {
    backgroundColor: '#f0f0f0',
  },
  arztFormCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  arztFormSave: {
    backgroundColor: '#27ae60',
  },
  arztFormSaveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Uhrzeiten
  uhrzeitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  uhrzeitLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  uhrzeitEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  uhrzeitLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  uhrzeitInput: {
    backgroundColor: '#f5f5f3',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
    minWidth: 90,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  uhrzeitInputChanged: {
    borderColor: '#3498db',
    backgroundColor: '#eef6fd',
  },
  speichernButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 56,
    justifyContent: 'center',
    marginTop: 14,
  },
  speichernButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F7',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#344054',
    fontSize: 16,
    fontWeight: '700',
  },
  privacyNotice: {
    backgroundColor: '#EAF6FA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFE4EF',
  },
  privacyNoticeTitle: {
    color: '#123E52',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  privacyNoticeText: {
    color: '#234B5B',
    fontSize: 15,
    lineHeight: 21,
  },
  disclaimerSection: {
    backgroundColor: '#FFF8E1',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3D27A',
  },
  disclaimerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4B3A10',
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 15,
    color: '#5D4A1A',
    lineHeight: 21,
    marginBottom: 6,
  },
  contactSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DADDE2',
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  contactText: {
    fontSize: 16,
    color: '#1a1a2e',
    lineHeight: 22,
    fontWeight: '600',
  },
  contactMail: {
    fontSize: 16,
    color: '#0066CC',
    lineHeight: 24,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  contactHint: {
    fontSize: 15,
    color: '#555',
    lineHeight: 21,
    marginTop: 6,
  },
  contactMeta: {
    fontSize: 13,
    color: '#777',
    lineHeight: 18,
    marginTop: 10,
  },
  resetButton: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ccc',
    minHeight: 52,
    justifyContent: 'center',
  },
  resetButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  // Dev-Mode Styles
  devSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FF9800',
    borderStyle: 'dashed',
  },
  devSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 6,
  },
  devSectionInfo: {
    fontSize: 14,
    color: '#BF360C',
    marginBottom: 12,
    lineHeight: 20,
  },
  devButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  devButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFB74D',
    minHeight: 48,
    justifyContent: 'center',
  },
  devButtonActive: {
    backgroundColor: '#1F6F8B',
    borderColor: '#1F6F8B',
  },
  devButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  devButtonTextActive: {
    color: '#FFFFFF',
  },
  devStatusText: {
    fontSize: 14,
    color: '#E65100',
    fontWeight: '600',
    textAlign: 'center',
  },
});
