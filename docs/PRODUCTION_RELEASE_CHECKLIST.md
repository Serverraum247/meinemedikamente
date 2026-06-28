# Mein MediPlan - Produktionsgang Android

Stand: 2026-05-27

Diese Checkliste trennt lokale technische Vorbereitung von Schritten, die nur in der Google Play Console oder organisatorisch erledigt werden koennen.

## Lokal erledigt

- [x] App-Name ist in Android/iOS auf `Mein MediPlan` umgestellt.
- [x] Version erhoeht auf `0.1.6`, Android `versionCode` auf `7`, iOS `CURRENT_PROJECT_VERSION` auf `7`.
- [x] Android Package-Name fuer Google Play auf `dev.serverraum247.meinmediplan` umgestellt.
- [x] Android Release-Signing nutzt nicht mehr den Debug-Key.
- [x] Signaturdaten werden nicht in `build.gradle` gespeichert, sondern ueber Gradle-Properties erwartet.
- [x] Android Auto Backup und Device Transfer fuer lokale Daten deaktiviert.
- [x] Android App-Manifest enthaelt `com.android.vending.BILLING`.
- [x] Premium-Produkt-ID fuer Google Play ist auf `mein_mediplan_premium` festgelegt.
- [x] Premium wird in der App als Einmalkauf angezeigt, nicht als Monatsabo.
- [x] `react-native-iap` auf `15.2.3` aktualisiert, damit Android Release-Bundling funktioniert.
- [x] React-Native-CLI-Patchversionen aktualisiert, `npm audit` meldet 0 bekannte Vulnerabilities.
- [x] Build-Skripte fuer Android Release-Artefakte ergaenzt.
- [x] Upload-Key lokal erstellt: `/Users/danielbrussig/Documents/Zertifikat/mein-mediplan-upload-key.jks`.
- [x] Upload-Zertifikat exportiert: `/Users/danielbrussig/Documents/Zertifikat/mein-mediplan-upload-certificate.pem`.
- [x] Signiertes AAB erfolgreich gebaut und mit `jarsigner` verifiziert.

## Aktueller Stand Play Console

- [x] Entwicklerkonto als privates Konto angelegt: `Serverraum247`.
- [x] Identitätsdokumente bei Google hochgeladen.
- [ ] Auf Abschluss der Identitätsprüfung durch Google warten.
- [ ] App in der Play Console anlegen.
- [ ] Erstes internes Test-Release mit signiertem AAB hochladen.

Hinweis: Da das Konto als privates Konto eingerichtet ist, ist keine D-U-N-S-Nummer erforderlich. Eine D-U-N-S-Nummer wäre relevant, wenn Google ein Organisationskonto für ein Unternehmen prüfen soll.

## Lokale Release-Builds

Release-Builds muessen mit JDK 17 laufen. JDK 25 bricht beim Android Native/Prefab-Schritt ab.

```sh
npm run android:bundle:release
```

Das erzeugt ein technisches Release-Bundle. Ohne Upload-Key ist es nicht fuer die Play Console geeignet.

Fuer das Play-Store-Artefakt nach Signaturkonfiguration:

```sh
npm run android:bundle:play
```

Das erzeugt:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Aktuell vorbereitetes Play-Artefakt:

```text
/Users/danielbrussig/Documents/Projekt/Spiel/MeineMedikamente/MeineMedikamente/android/app/build/outputs/bundle/release/app-release.aab
```

Fuer lokale APK-Tests:

```sh
npm run android:assemble:release
```

## Release-Signing

Google Play erwartet fuer neue Apps ein signiertes Android App Bundle. Die Upload-Key-Daten gehoeren nicht in Git.

In `~/.gradle/gradle.properties` lokal setzen:

```properties
MYAPP_UPLOAD_STORE_FILE=/absoluter/pfad/mein-mediplan-upload-key.jks
MYAPP_UPLOAD_KEY_ALIAS=mein-mediplan-upload
MYAPP_UPLOAD_STORE_PASSWORD=...
MYAPP_UPLOAD_KEY_PASSWORD=...
```

Offizielle Referenz: https://developer.android.com/studio/publish/app-signing

## Google Play Console

- [x] Entwicklerkonto erstellen oder bestehendes Konto verwenden.
- [ ] App `Mein MediPlan` anlegen.
- [ ] Beim ersten AAB-Upload prüfen, dass Google den Package-Namen `dev.serverraum247.meinmediplan` erkennt.
- [ ] Play App Signing aktivieren.
- [ ] Wenn Google ein Upload-Zertifikat verlangt, `mein-mediplan-upload-certificate.pem` hochladen.
- [ ] Signiertes `.aab` in internen Testtrack hochladen.
- [ ] Interne Tester per E-Mail hinterlegen.
- [ ] Opt-in-Link an Tester verschicken.
- [ ] Feedback-Kanal im Testhinweis nennen: `kontakt@serverraum247.dev`.
- [ ] Altersfreigabe und Inhaltsangaben ausfuellen.
- [ ] Datenschutzangaben ausfuellen, inklusive Gesundheitsdaten/Medikamentendaten.
- [ ] Datenschutzerklaerung veroeffentlichen und URL im Store-Eintrag hinterlegen.
- [ ] Store-Eintrag mit deutschen Screenshots, Icon, Feature Graphic und Beschreibung erstellen.
- [ ] Store-Text muss klar sagen: Die App ist keine medizinische Beratung und ersetzt nicht Arzt/Apotheke.

Vorbereitete Vorlagen:

- `docs/GOOGLE_PLAY_STORE_DRAFT.md`
- `docs/GOOGLE_PLAY_DATA_SAFETY_DRAFT.md`

Offizielle Referenzen:

- https://developer.android.com/studio/publish/
- https://support.google.com/googleplay/android-developer/answer/9845334
- https://support.google.com/googleplay/android-developer/answer/10787469

## In-App-Kauf

In der Play Console als nicht konsumierbarer Einmalkauf anlegen:

```text
mein_mediplan_premium
```

- [ ] Produktname: `Mein MediPlan Premium`
- [ ] Typ: Einmalkauf / nicht konsumierbar
- [ ] Preis festlegen
- [ ] Beschreibung passend zu Premium-Funktionen
- [ ] Produkt aktivieren
- [ ] Kauf im internen Testtrack testen
- [ ] Wiederherstellung/Restore mit Testkonto pruefen
- [ ] Prüfen, dass die App auf der Premium-Seite keinen Abo-Text anzeigt.

Wichtig: In-App-Kaeufe funktionieren zuverlaessig erst ueber Play-Installationen aus einem Testtrack, nicht nur mit lokal installierten APKs.

Offizielle Referenz: https://support.google.com/googleplay/android-developer/answer/1153481

## Datenschutz und Cloud Backup

- [ ] Firebase-Projekt fuer Android final konfigurieren.
- [ ] `google-services.json` nur als clientseitige Firebase-Konfiguration verwenden; keine Admin-Keys ins Repo.
- [ ] `npm run doctor:build` muss fuer Android auch die Firebase-Verdrahtung grün melden: `google-services`-Classpath, App-Plugin und passende Clients fuer `dev.serverraum247.meinmediplan` sowie `dev.serverraum247.meinmediplan.internal`.
- [ ] Firestore-Regeln setzen: Nutzer duerfen nur unter ihrer eigenen `uid` lesen/schreiben.
- [ ] Cloud-Backup nur fuer Premium aktiv halten.
- [ ] In Datenschutzerklaerung klar beschreiben, welche Medikamentendaten lokal und optional in der Cloud gespeichert werden.
- [ ] Veröffentliche Datenschutzerklärungs-URL bereitstellen, bevor die App zur Prüfung geht.

## Store-Grafiken und Screenshots

- [ ] App-Icon Android final prüfen und ggf. neu generieren.
- [ ] Feature Graphic für Google Play erstellen.
- [ ] Smartphone-Screenshots auf Deutsch erstellen:
  - [ ] Startseite mit kurzer Reichweitenanzeige
  - [ ] Medikament erfassen
  - [ ] Einnahme abhaken
  - [ ] Arzt-/Notfallliste oder Arztkontakte
  - [ ] Premium-Übersicht ohne abgeschnittene Wörter
- [ ] Screenshots auf echtem Android-Gerät prüfen, besonders große Schrift und Brüche/Zahlen.

## Vor jedem Release

- [ ] `npm run doctor:build`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test -- --runInBand --forceExit`
- [ ] `npm audit`
- [ ] `npm run android:bundle:play`
- [ ] App aus internem Testtrack installieren, nicht nur lokal per Debug-APK.
- [ ] Premium-Kauf mit Play-Testkonto pruefen.
- [ ] Premium-Restore mit Play-Testkonto pruefen.
- [ ] Free/Premium-Grenzen pruefen.
- [ ] PZN-/Barcode-Scan pruefen.
- [ ] Cloud-Backup erstellen, App neu öffnen und Backup-Status prüfen.
- [ ] Premium-Export pruefen: Plan der aktiven Person als Text und PDF teilen.
- [ ] Medikamentenvarianten testen: Tabletten, Flüssigkeit/ml, Hübe, Mo/Mi/Fr, nur 3 Einnahmetage.
- [ ] Senioren-UI-Check auf echtem Android-Geraet.
- [ ] Haftungsausschluss, Kontakt und Datenschutzerklaerung in der App pruefen.

## Fail-Fast Build Harness

Ziel: Lange Android-/iOS-Arbeit darf nicht mehr blind in Gradle oder Xcode haengen. Vor nativen Builds wird die Umgebung mit einem kurzen Doctor geprüft.

- [x] `npm run doctor:build` prüft Node, npm, Java, Xcode-Tools, ADB, React-Native-Config und doppelte lokale Git-Refs.
- [x] `npm run android:internal:build` startet erst nach erfolgreichem Doctor und schreibt ein kompaktes Fehlerlog nach `/tmp/meinmediplan-android-internal-build.log`.
- [x] `npm run ios:internal:build` startet erst nach erfolgreichem Doctor und schreibt ein kompaktes Fehlerlog nach `/tmp/meinmediplan-ios-internal-build.log`.
- [x] `npm run deploy:devices` installiert vorhandene interne Artefakte auf sichtbare Android-Geräte und verfügbare gekoppelte iPhones.
- [x] `npm run deploy:devices` startet standardmäßig nur noch nach erfolgreichem `doctor:build`; Ausnahme nur bewusst mit `SKIP_DOCTOR_BUILD=1`.
- [x] React-Native-Config-Hänger über den Doctor prüfbar machen, bevor Android/iOS produktiv gebaut werden.
- [x] Lokalen doppelten Git-Ref `codex/medication-e2e-premium-dosing 2` prüfen und bereinigen, bevor der nächste Push erfolgt.

## Nicht in Git speichern

- Keystore-Dateien fuer Release/Upload
- Keystore-Passwoerter
- Firebase Admin SDK Keys
- Service-Account-JSON-Dateien
- Play Console API Keys
- Private Zertifikate oder private Keys
- Echte Nutzerdaten, Medikamentendaten oder Backups
