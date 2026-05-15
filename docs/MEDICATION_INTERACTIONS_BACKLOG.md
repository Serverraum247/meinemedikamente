# Medikamenten-Wechselwirkungen Backlog

Stand: 2026-05-15

Dieses Dokument parkt das Thema Wechselwirkungen bewusst als spaeteren Ausbau. Aktuell wird es nicht implementiert. Ziel ist, dass die Entscheidung spaeter ohne neue Grundsatzdiskussion wieder aufgenommen werden kann.

## Kurzfazit

- Apple Health kann Medikationsdaten bereitstellen, aber keine oeffentliche Wechselwirkungspruefung fuer Dritt-Apps.
- Eine belastbare Wechselwirkungsfunktion braucht fuer Deutschland eine lizenzierte medizinische Datenquelle.
- Fuer Mein MediPlan ist eine halbautomatische oder frei zusammengestellte Loesung nicht sinnvoll. Das medizinische und rechtliche Risiko ist zu hoch.

## Aktuelle Produktentscheidung

- Kein Wechselwirkungscheck im aktuellen MVP.
- Kein "smarter" Warnhinweis auf Basis unvollstaendiger Regeln.
- Weiterhin klarer Haftungshinweis: Die App ersetzt keine aerztliche oder pharmazeutische Beratung.
- Wenn das Thema spaeter kommt, dann fuer iOS und Android mit derselben fachlichen Basis.

## Fachliche Leitplanken

- Wechselwirkungen muessen auf Wirkstoffebene, nicht nur auf Handelsnamen, bewertet werden.
- Kombipraeparate muessen mehrere Wirkstoffe korrekt abbilden.
- Nicht nur Medikament gegen Medikament ist relevant, sondern ggf. auch Alkohol, Nikotin, Cannabis, Nahrungsergaenzung, Schwangerschaft und andere Faktoren.
- Die App darf keine klinischen Empfehlungen vortaeuschen, wenn nur eine Teilmenge der Daten vorliegt.
- Deutsche Nutzer brauchen eine fuer Deutschland belastbare Datenbasis, nicht nur US-spezifische Logik.

## Technische Ausgangslage

- Die App hat aktuell keine HealthKit-Integration.
- Die App pflegt bereits Namen, Wirkstoffe (`zusatz`) und bei Kombipraeparaten mehrere Wirkstoffe in lesbarer Form.
- Offline-Vorschlaege fuer Medikamentennamen sind vorhanden, aber keine klinische Pruef-Engine.
- Android und iOS muessen funktional moeglichst gleich bleiben.

## Backlog P0: Erst klaeren, dann bauen

1. Produktentscheidung dokumentieren
   - Wechselwirkungen sind ein spaeteres Sicherheits-/Premium-Thema, nicht Teil des aktuellen MVP.
   - Ergebnis: klare Priorisierung im Produkt-Backlog.

2. Rechtliche Leitplanken festziehen
   - Klaeren, wie die Funktion in Store-Texten, Datenschutz und Haftung beschrieben werden darf.
   - Pruefen, ob die gewaehlte Datenquelle oder Auswertung das Produkt in einen Medizinprodukt-Kontext drueckt.

3. Datenquellen evaluieren
   - Anbieter mit Deutschland-Fokus anfragen, z. B. ifap / THERAFOX, Vidal MMI, ABDATA.
   - Pruefen: Lizenzmodell, API-Verfuegbarkeit, Kosten, Antwortzeiten, Trefferqualitaet, Medizinprodukt-Bezug, Nutzungsrechte in Mobile-Apps.

4. Plattformstrategie festlegen
   - Keine iOS-Sonderloesung bauen, die Android funktional abhaengt.
   - Wenn es nur Apple-Import gibt, muss klar getrennt werden zwischen "Datenimport" und "Wechselwirkungspruefung".

## Backlog P1: Vorbereitende Architektur

1. Wirkstoffmodell schaerfen
   - Wirkstoffe strukturiert speichern, nicht nur als Freitext.
   - Kombipraeparate als Liste aus Wirkstoff + optionaler Staerke modellieren.
   - Handelsname und Wirkstoff klar trennen.

2. Normalisierungsschicht bauen
   - Interne Felder auf eine spaetere Pruef-Engine vorbereiten.
   - Ziel: aus lokalem Medikament ein einheitliches Pruefobjekt erzeugen.

3. Quellen-Mapping vorbereiten
   - PZN, Handelsname, Wirkstoff und Staerke fuer spaetere Vendor-Zuordnung nutzbar halten.
   - Unklare oder unvollstaendige Medikamente als "nicht sicher pruefbar" markieren koennen.

4. Ergebnis-Modell definieren
   - Schweregrad
   - betroffene Wirkstoffe
   - Kurztext
   - Quelle / Datenstand
   - letzter Pruefzeitpunkt
   - Status "vollstaendig pruefbar" oder "nur teilweise pruefbar"

## Backlog P2: Apple Health Import

1. HealthKit-Medikationsimport fuer iOS pruefen
   - Optionaler Import aus Apple Health.
   - Nur nach expliziter Nutzerfreigabe.
   - Noch ohne Wechselwirkungsbewertung.

2. Import-/Abgleich-UX definieren
   - Welche Medikamente aus Health werden neu angelegt?
   - Wie werden Dubletten erkannt?
   - Wie wird ein Import markiert, wenn Daten unvollstaendig sind?

3. Plattformgrenze offen kommunizieren
   - Apple Health Import darf nicht so wirken, als gaebe es dadurch automatisch eine verifizierte Wechselwirkungspruefung.

## Backlog P3: Wechselwirkungsfunktion spaeter

1. Server- oder Dienstarchitektur festlegen
   - Lokale Offline-Pruefung nur, wenn die lizenzierte Datenquelle das sauber erlaubt.
   - Sonst serverseitige Abfrage oder gesicherter Backend-Dienst.

2. UI fuer Warnungen entwerfen
   - Schweregrade klar und ruhig darstellen.
   - Keine Panikfarben ohne belastbare Fachgrundlage.
   - Immer mit Hinweis: Arzt oder Apotheke kontaktieren.

3. Pruefumfang definieren
   - nur Medikament gegen Medikament
   - oder zusaetzlich Alkohol, Rauchen, Cannabis, Nahrungsergaenzung, Schwangerschaft
   - Ergebnis muss vom Datendienst abhaengen, nicht von Wunschumfang.

4. Aktualisierungsstrategie
   - Wann wird neu geprueft?
   - Bei jeder Aenderung eines Medikaments?
   - periodisch?
   - nur auf Nutzeraktion?

## Backlog P4: Tests und Qualitaet

1. Testmatrix aufbauen
   - Einzelwirkstoff
   - Kombipraeparat
   - unvollstaendiges Medikament
   - doppeltes Medikament
   - Konflikt mit Alltagsfaktor
   - keine Wechselwirkung

2. Fallback-Verhalten testen
   - Datenquelle nicht erreichbar
   - Medikament nicht aufloesbar
   - Wirkstoff unvollstaendig
   - nur teilweise pruefbar

3. Plattformgleichheit pruefen
   - Dieselbe medizinische Eingabe muss auf Android und iOS zu demselben Ergebnis fuehren.

## Nicht machen

- Keine frei recherchierten Tabellen in die App einbauen.
- Keine Heuristiken wie "gleicher Wirkstoffname enthaelt Warnung".
- Keine Mischung aus Apple-UI-Anmutung und fachlich duennen Regeln.
- Keine Premium-Vermarktung, bevor die fachliche Basis belastbar ist.

## Empfehlenswerte Reihenfolge, wenn das Thema spaeter wieder aktiv wird

1. Datenquelle und Lizenz klaeren
2. Rechtliche Einordnung pruefen
3. Datenmodell fuer Wirkstoffe verfeinern
4. HealthKit-Import optional vorbereiten
5. Wechselwirkungsdienst anbinden
6. UI und Warntexte bauen
7. E2E- und Fachtests ausbauen

## Definition von "spaeter bereit"

Das Thema sollte erst aktiv umgesetzt werden, wenn alle folgenden Punkte erfuellt sind:

- belastbare Datenquelle ausgewaehlt
- Kostenmodell verstanden
- rechtliche Beschreibung abgestimmt
- Wirkstoffdaten strukturiert speicherbar
- Android und iOS koennen denselben Pruefweg nutzen
- klare UX fuer "nicht pruefbar" und "teilweise pruefbar" definiert
