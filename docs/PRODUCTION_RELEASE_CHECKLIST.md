# Mein MediPlan - Produktionsgang Android

Stand: 2026-05-10

Diese Checkliste trennt lokale technische Vorbereitung von Schritten, die nur in der Google Play Console oder organisatorisch erledigt werden koennen.

## Lokal erledigt

- [x] App-Name ist in Android/iOS auf `Mein MediPlan` umgestellt.
- [x] Version erhoeht auf `0.1.3`, Android `versionCode` auf `4`, iOS `CURRENT_PROJECT_VERSION` auf `4`.
- [x] Android Release-Signing nutzt nicht mehr den Debug-Key.
- [x] Signaturdaten werden nicht in `build.gradle` gespeichert, sondern ueber Gradle-Properties erwartet.
- [x] Android Auto Backup und Device Transfer fuer lokale Daten deaktiviert.
- [x] Android App-Manifest enthaelt `com.android.vending.BILLING`.
- [x] Premium-Produkt-ID fuer Google Play ist auf `mein_mediplan_premium` festgelegt.
- [x] `react-native-iap` auf `15.2.3` aktualisiert, damit Android Release-Bundling funktioniert.
- [x] React-Native-CLI-Patchversionen aktualisiert, `npm audit` meldet 0 bekannte Vulnerabilities.
- [x] Build-Skripte fuer Android Release-Artefakte ergaenzt.

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

- [ ] Entwicklerkonto erstellen oder bestehendes Konto verwenden.
- [ ] App mit Package-Name `com.meinemedikamente` anlegen.
- [ ] Play App Signing aktivieren.
- [ ] Signiertes `.aab` in internen Testtrack hochladen.
- [ ] Interne Tester per E-Mail hinterlegen.
- [ ] Altersfreigabe und Inhaltsangaben ausfuellen.
- [ ] Datenschutzangaben ausfuellen, inklusive Gesundheitsdaten/Medikamentendaten.
- [ ] Datenschutzerklaerung veroeffentlichen und URL im Store-Eintrag hinterlegen.
- [ ] Store-Eintrag mit deutschen Screenshots, Icon, Feature Graphic und Beschreibung erstellen.

Offizielle Referenz: https://developer.android.com/studio/publish/

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

Wichtig: In-App-Kaeufe funktionieren zuverlaessig erst ueber Play-Installationen aus einem Testtrack, nicht nur mit lokal installierten APKs.

Offizielle Referenz: https://support.google.com/googleplay/android-developer/answer/1153481

## Datenschutz und Cloud Backup

- [ ] Firebase-Projekt fuer Android final konfigurieren.
- [ ] `google-services.json` nur als clientseitige Firebase-Konfiguration verwenden; keine Admin-Keys ins Repo.
- [ ] Firestore-Regeln setzen: Nutzer duerfen nur unter ihrer eigenen `uid` lesen/schreiben.
- [ ] Cloud-Backup nur fuer Premium aktiv halten.
- [ ] In Datenschutzerklaerung klar beschreiben, welche Medikamentendaten lokal und optional in der Cloud gespeichert werden.

## Vor jedem Release

- [ ] `npm run lint`
- [ ] `npm test -- --runInBand --forceExit`
- [ ] `npm audit`
- [ ] `npm run android:bundle:release`
- [ ] App aus internem Testtrack installieren, nicht nur lokal per Debug-APK.
- [ ] Premium-Kauf mit Play-Testkonto pruefen.
- [ ] Free/Premium-Grenzen pruefen.
- [ ] PZN-/Barcode-Scan pruefen.
- [ ] Senioren-UI-Check auf echtem Android-Geraet.
- [ ] Haftungsausschluss, Kontakt und Datenschutzerklaerung in der App pruefen.

## Nicht in Git speichern

- Keystore-Dateien fuer Release/Upload
- Keystore-Passwoerter
- Firebase Admin SDK Keys
- Service-Account-JSON-Dateien
- Play Console API Keys
- Private Zertifikate oder private Keys
- Echte Nutzerdaten, Medikamentendaten oder Backups
