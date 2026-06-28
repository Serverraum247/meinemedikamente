# Firebase Android Setup

Diese App braucht für Android-Cloud-Backup genau einen Firebase-Baustein:

- Firestore als verschlüsselten Sicherungscode-Tresor
- anonyme Firebase-Authentifizierung
- eine lokale `google-services.json` mit beiden Android-Clients

## Package-Namen

In Firebase müssen zwei Android-Apps angelegt sein:

- `dev.serverraum247.meinmediplan`
- `dev.serverraum247.meinmediplan.internal`

## Was lokal ins Projekt gehört

Die heruntergeladene Firebase-Clientdatei muss hier liegen:

```text
android/app/google-services.json
```

Die Datei bleibt lokal und ist bereits in `.gitignore` ausgenommen.

## Was in Firebase konfiguriert sein muss

1. Firebase-Projekt erstellen oder vorhandenes Projekt für diese App verwenden.
2. Firestore Database aktivieren.
3. In der Firebase Console `Authentication` einmal manuell initialisieren (`Get started`).
4. Danach den Sign-in-Provider `Anonymous` aktivieren.
5. Android-App `dev.serverraum247.meinmediplan` anlegen.
6. Android-App `dev.serverraum247.meinmediplan.internal` anlegen.
7. Die aktuelle `google-services.json` herunterladen.
8. Die Datei nach `android/app/google-services.json` legen.
9. Firestore-Regeln aus `firebase/firestore.rules` deployen.

## Wichtiger Hinweis zur Initialisierung

Die erste Initialisierung von Firebase Authentication lässt sich für dieses Setup nicht vollständig über die öffentlich dokumentierten Admin-Endpunkte anlegen.
Darum ist der erste Console-Schritt aktuell Pflicht:

1. Mit dem Google-Konto anmelden, das Eigentümer des Firebase-Projekts ist.
2. `Authentication` öffnen.
3. `Get started` ausführen.
4. Danach `Anonymous` aktivieren.

Wenn die Firebase Console meldet, dass das Projekt nicht existiert oder keine Berechtigung vorliegt, ist fast immer das falsche Google-Konto oder Chrome-Profil aktiv.

## Warum zwei Android-Clients nötig sind

Die App arbeitet lokal mit mehreren Android-Varianten:

- Release: `dev.serverraum247.meinmediplan`
- Internal Test: `dev.serverraum247.meinmediplan.internal`

`npm run doctor:build` prüft beide Package-Namen hart. Fehlt einer davon in `google-services.json`, gilt das Android-Backup nicht als gesund.

## Verifikation

Nach dem Einlegen der Datei und dem Rule-Deploy:

```bash
npm run doctor:build
npm test -- --runInBand --runTestsByPath src/__tests__/BackupService.test.ts src/__tests__/BackupScreen.test.tsx
```

Anschließend auf zwei Android-Geräten oder Gerät plus Neuinstallation testen:

1. Auf Gerät A erstes Cloud-Backup erstellen.
2. Den angezeigten Sicherungscode notieren.
3. Auf Gerät B denselben Sicherungscode eingeben.
4. Cloud-Backup wiederherstellen.

## Offener Betriebsentscheid

Der Sicherungscode ist der einzige Wiederherstellungsschlüssel für Android ohne Nutzerkonto.
Wenn Gerät und Sicherungscode beide verloren sind, ist das Cloud-Backup nicht mehr wiederherstellbar.
