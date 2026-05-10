# Google Play Datensicherheit - Arbeitsvorlage

Stand: 2026-05-10

Diese Datei ist keine Rechtsberatung. Sie fasst den aktuellen technischen Stand der App für die Datensicherheitsfragen in Google Play zusammen. Vor Veröffentlichung muss die tatsächliche App-Konfiguration geprüft werden.

Offizielle Referenz: https://support.google.com/googleplay/android-developer/answer/10787469

## Grundannahmen

- App: `Mein MediPlan`
- Package: `dev.serverraum247.meinmediplan`
- Herausgeber/Kontakt: `Serverraum247`, `kontakt@serverraum247.dev`
- Lokale Speicherung: SQLite auf dem Gerät.
- Cloud-Backup: optional, Premium-Funktion, Android über Firebase/Firestore.
- In-App-Kauf: Google Play Billing, Produkt-ID `mein_mediplan_premium`.
- Keine Werbung vorgesehen.
- Keine Analyse-/Tracking-SDKs erkennbar.

## Voraussichtlich erhobene Daten

### Gesundheit und Fitness

Medikamentenbezogene Angaben:

- Medikamentenname
- Darreichungsform und Einheit
- Bestand, Dosierung, Einnahmeplan, Reichweite
- Einnahmestatus
- optional Arztzuordnung

Zweck:

- App-Funktionalität
- Erinnerung und Übersicht
- optional Cloud-Backup

Hinweis für Play Console:
Diese Daten sind sensibel. Wenn Cloud-Backup aktiv ist, werden sie vom Gerät an Firebase übertragen.

### Personenbezogene Angaben

Mögliche Angaben:

- Name der Person oder des Angehörigen
- Avatar/Foto, falls genutzt
- Arztname, Fachgebiet, Telefonnummer, Adresse

Zweck:

- App-Funktionalität
- lokale Verwaltung
- optional Cloud-Backup

### Finanzdaten

Google Play verarbeitet Zahlungsdaten für den Premium-Kauf. Die App selbst speichert nach aktuellem Stand nur den lokalen Premium-Status.

Zweck:

- In-App-Kauf
- Premium-Freischaltung

### App-Informationen und Leistung

Keine eigene Crash-/Analytics-Erfassung erkennbar. Google Play und Firebase können technische Betriebsdaten verarbeiten, abhängig von aktivierten Diensten und Konfiguration.

## Datenübertragung

Voraussichtliche Übertragung:

- Firebase Authentication/Firestore für Cloud-Backup und Nutzerbindung.
- Google Play Billing für Premium-Käufe.
- Mail-App nur, wenn der Nutzer aktiv den Supportkontakt öffnet.

## Datenweitergabe

Voraussichtlich keine Weitergabe an Werbenetzwerke oder Datenhändler.

Technisch eingebundene Dienstleister:

- Google Play Billing
- Firebase/Google Cloud für optionales Android-Cloud-Backup

## Löschung

In der App sollte vor Produktionsgang klar möglich oder beschrieben sein:

- lokale Daten löschen oder App-Daten über Android-Systemeinstellungen entfernen
- Cloud-Backup löschen
- Supportkontakt für Löschanfragen: `kontakt@serverraum247.dev`

## Noch offen vor Play-Einreichung

- [ ] Firestore Security Rules final prüfen.
- [ ] Datenschutz-URL veröffentlichen.
- [ ] In Play Console Datentypen exakt ankreuzen.
- [ ] Prüfen, ob Fotos/Avatare wirklich in Cloud-Backup enthalten sind.
- [ ] Prüfen, ob Firebase Crashlytics, Analytics oder Messaging aktiv sind.
- [ ] Nutzer verständlich erklären, dass Cloud-Backup optional ist.
- [ ] Datenlöschung in App und Datenschutzerklärung konsistent beschreiben.

