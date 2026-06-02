# Home Actions Status Design

## Ziel

Die Hauptseite soll beim Öffnen sofort zeigen, ob der Nutzer handeln muss. Der bisherige Bereich `Protokollieren` wirkt zu technisch und kann fälschlich beruhigen, wenn ältere Einnahmen fehlen. Der neue Bereich heißt `Aktionen` und priorisiert verpasste Einnahmen, heutige offene Einnahmen und den erledigten Zustand klar.

## Nutzerbild

Die Zielgruppe soll ohne Interpretation erkennen:

- Muss ich etwas nachtragen?
- Muss ich heute noch etwas bestätigen?
- Ist für heute alles erledigt?

Der Bereich darf nicht wie eine Statistik wirken. Er soll eine konkrete Handlung anbieten, wenn eine Handlung nötig ist.

## Zustände

### 1. Verpasste Einnahmen

Wenn für die aktuell ausgewählte Person in den letzten sieben Tagen ohne heute geplante Einnahmen fehlen, zeigt die Hauptseite zuerst diesen Zustand.

- Überschrift im Aktionsblock: `Einnahmen fehlen`
- Text bei einem Tag Rückstand: `Für gestern sind geplante Einnahmen nicht protokolliert.`
- Text bei mehreren Tagen Rückstand: `Für mehrere Tage fehlen geplante Einnahmen.`
- Primäre Aktion: `Jetzt nachtragen`
- Farbe: gelb, wenn nur gestern betroffen ist; rot, wenn zwei oder mehr Tage betroffen sind

Der Button öffnet den bestehenden Nachtragsdialog mit `Letzte 7 Tage`. Die vorhandene Auswahl aller offenen Einnahmen bleibt bestehen.

### 2. Heute offen

Wenn kein älterer Nachtrag offen ist, aber heute bestätigbare Einnahmen offen sind, zeigt die Hauptseite diesen Zustand.

- Überschrift im Aktionsblock: `Heute noch offen`
- Text: `Eine Einnahme kann bestätigt werden.` oder `{n} Einnahmen können bestätigt werden.`
- Primäre Aktion: `Heute bestätigen`
- Farbe: gelb oder neutral-blau, aber nicht grün

Der Button öffnet den bestehenden Einnahme-Erinnerungsdialog.

### 3. Alles erledigt

Wenn keine älteren Nachträge und keine heutigen offenen Einnahmen vorhanden sind, zeigt die Hauptseite einen ruhigen grünen Zustand.

- Überschrift im Aktionsblock: `Heute erledigt`
- Text bei geplanten Einnahmen: `Alle geplanten Einnahmen sind protokolliert.`
- Text ohne geplante Einnahmen: `Heute keine feste Einnahme geplant.`
- Keine dominante Aktion im grünen Zustand
- Sekundärer Link darunter: `Einnahmen nachtragen`

Der Text `0 Eintrag` wird zu `0 Einträge` korrigiert.

## Struktur der Hauptseite

Der Tageskopf mit Datum und Tagesstreifen bleibt erhalten. Direkt darunter folgt:

1. Abschnittstitel `Aktionen`
2. Ein einziger Status-/Aktionsblock
3. Optional eine dezente sekundäre Zeile `Einnahmen nachtragen`, wenn kein Nachtrag priorisiert wird
4. Danach `Bedarfsmedikamente`, heutiges Protokoll und Medikamentenliste wie bisher

Das Fragezeichen neben dem alten `Protokollieren` entfällt. Die Hilfetexte werden nicht prominent angezeigt.

## Datenfluss

Die HomeScreen-Logik lädt zusätzlich eine kompakte Nachtragszusammenfassung für die aktuell ausgewählte Person:

- nutzt `getOffeneEinnahmeNachtraege(personId, 'sevenDays')`
- zählt offene Tage und offene Einnahmen
- unterscheidet `nur gestern` gegen `zwei oder mehr Tage`
- aktualisiert die Zusammenfassung bei Focus, App-Aktivierung, Tageswechsel, Nachtrag speichern und Einnahme bestätigen

Die bestehende Nachtragslogik bleibt die Quelle der Wahrheit. Es wird keine neue Datenbankstruktur benötigt.

## Fehlerverhalten

Wenn die Nachtragszusammenfassung nicht geladen werden kann, zeigt die App keinen roten Warnzustand auf Verdacht. Sie loggt den Fehler und fällt auf die heutige offene Einnahme oder den erledigten Zustand zurück.

## Tests

- Unit-Test für die Ableitung des Aktionsstatus:
  - ältere Nachträge haben Vorrang vor heutigen offenen Einnahmen
  - nur gestern ergibt Warnstufe gelb
  - zwei oder mehr Tage ergeben Warnstufe rot
  - heute offen ergibt Aktionsstatus `Heute noch offen`
  - nichts offen ergibt `Heute erledigt`
- Bestehende Nachtrags-Tests bleiben unverändert gültig.
- TypeScript muss ohne Fehler laufen.
- Manuell auf Android und iOS prüfen:
  - App öffnet mit Rückstand und zeigt `Einnahmen fehlen`
  - `Jetzt nachtragen` öffnet den Nachtragsdialog
  - nach Speichern aktualisiert der Aktionsblock
  - Text `0 Einträge` wird korrekt mit Umlaut angezeigt

## Nicht Teil dieses Designs

- Keine neue Medikationslogik
- Keine Änderung an Erinnerungszeiten
- Keine Änderung am Nachtragsdialog selbst außer dem Einstiegspunkt
- Kein zusätzlicher Hilfebildschirm
