# CloudKit Bridge – Xcode GUI Anleitung

## Status
Die Swift/ObjC-Dateien sind bereits erstellt und liegen im Dateisystem. Sie müssen nur noch in Xcode zum Projekt hinzugefügt werden.

**Betroffene Dateien:**
- `ios/MeineMedikamente/CloudKitBackupModule.swift`
- `ios/MeineMedikamente/CloudKitBackupBridge.m`
- `ios/MeineMedikamente/MeineMedikamente-Bridging-Header.h`

## Schritt-für-Schritt Anleitung

### 1. Xcode Projekt öffnen
```bash
open /Users/danielbrussig/Documents/Projekt/Spiel/MeineMedikamente/MeineMedikamente/ios/MeineMedikamente.xcodeproj
```

### 2. Bridging Header registrieren (WICHTIG – zuerst!)
1. Klicke im Project Navigator auf das **blaue Projekt-Icon** oben links (`MeineMedikamente`)
2. Wähle das Target **MeineMedikamente** aus
3. Gehe zum Tab **Build Settings**
4. Suche nach **"Objective-C Bridging Header"**
5. Doppelklicke auf den leeren Wert und trage ein:
   ```
   MeineMedikamente/MeineMedikamente-Bridging-Header.h
   ```
6. Bestätige mit Enter

### 3. Swift und ObjC Dateien zum Projekt hinzufügen
1. Rechtsklick auf den Ordner **MeineMedikamente** im Project Navigator
2. **"Add Files to MeineMedikamente..."**
3. Navigiere zu `ios/MeineMedikamente/`
4. Wähle **alle 3 Dateien** aus (Cmd+Click):
   - `CloudKitBackupModule.swift`
   - `CloudKitBackupBridge.m`
   - `MeineMedikamente-Bridging-Header.h`
5. **WICHTIG – Checkbox-Einstellungen:**
   - ✅ **Copy items if needed** – AUS (die Dateien liegen bereits am richtigen Ort)
   - ✅ **Create groups** – AN
   - ✅ **Add to targets: MeineMedikamente** – AN (nur das Haupt-Target, NICHT Tests)
6. Klicke **Add**

### 4. CloudKit Framework hinzufügen
1. Klicke auf das **blaue Projekt-Icon**
2. Wähle Target **MeineMedikamente**
3. Gehe zum Tab **General**
4. Scrolle runter zu **"Frameworks, Libraries, and Embedded Content"**
5. Klicke auf das **"+"** Button
6. Suche nach **CloudKit** und füge `CloudKit.framework` hinzu

### 5. iCloud Capability aktivieren
1. Gehe zum Tab **Signing & Capabilities**
2. Klicke **"+ Capability"**
3. Suche und füge **iCloud** hinzu
4. Unter **Services**: ✅ **CloudKit** aktivieren
5. Klicke auf das **"+"** bei Containers und füge hinzu:
   ```
   iCloud.com.meinemedikamente.backup
   ```

### 6. Build testen
1. **Cmd+B** drücken zum Bauen
2. Wenn Xcode fragt "Create Bridging Header?" → **JA** (falls noch nicht manuell gesetzt)
3. Build sollte **BUILD SUCCEEDED** zeigen

### 7. Abschließender Test
```bash
cd /Users/danielbrussig/Documents/Projekt/Spiel/MeineMedikamente/MeineMedikamente
npx react-native run-ios
```

## Fehlerbehebung

### "Bridging Header not found"
- Build Settings → "Objective-C Bridging Header" → Wert prüfen
- Pfad muss relativ zum Projekt sein: `MeineMedikamente/MeineMedikamente-Bridging-Header.h`

### "No such module 'CloudKit'"
- CloudKit Framework hinzufügen (Schritt 4)
- CloudKit ist nur auf iOS verfügbar, nicht auf macOS

### "Use of unresolved identifier 'RCTPromiseResolveBlock'"
- Bridging Header muss `#import <React-Core/React/RCTBridgeModule.h>` enthalten
- `pod install` vorher ausführen

### "Duplicate symbol"
- Die Datei wurde versehentlich mit "Copy items" hinzugefügt → eine der Kopien entfernen
