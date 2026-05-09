# Premium Dosing Variants

Stand: 2026-05-09

Ziel: Einnahmevarianten sammeln, die ueber einfache taegliche Einnahme und feste Wochentage hinausgehen. Diese Varianten sind fachlich relevant, sollten aber in der App als Erinnerung, Bestand/Forecast und Dokumentation abgebildet werden, nicht als medizinische Empfehlung.

## Bereits abgedeckt

- Taeglich, ein- oder mehrfach pro Tag.
- Slot-spezifische Dosis, z.B. morgens 0,5 und abends 1 Tablette.
- Ausgewaehlte Wochentage, z.B. Montag/Mittwoch/Freitag.
- Darreichungsformen wie Tabletten, ml, Tropfen, Huebe, Pflaster, Ampullen und Spritzen.

## Sinnvolle Premium-Erweiterungen

| Variante | Beispiel | App-Bedeutung | Premium-Prioritaet |
| --- | --- | --- | --- |
| Jeden X-ten Tag | jeden 2. Tag, alle 3 Tage, alle 4 Tage | Forecast darf nicht nur Wochentage kennen, sondern Intervalltage ab Startdatum. | Hoch |
| Pflaster-Wechselrhythmus | alle 3, 4 oder 7 Tage | Bestand zählt Pflaster; Reminder muss auch "altes Pflaster entfernen" koennen. | Hoch |
| Therapie-Zyklen | 3 Wochen Einnahme, 1 Woche Pause | Kalender braucht Einnahmephasen und Pausenphasen. | Hoch |
| Dosis-Aenderungsplan | Ausschleichen, Aufdosieren, taeglich/woechentlich andere Menge | Zeitbasierte Dosisstaffel fuer Forecast und Bestand. | Hoch |
| Bedarfsmedikation mit Limit | 1-2 Huebe bei Bedarf, maximal X-mal pro 24 Stunden | Kein klassischer Forecast; stattdessen Tageszaehler, Maximalwarnung und Verlauf. | Hoch |
| Mindestabstand zwischen Dosen | z.B. Abstand zwischen Inhalations-Hueben oder Augentropfen | Timer/Sequenz statt nur Uhrzeit. | Mittel |
| Mehrere Mittel in Reihenfolge | Augentropfen A, 5 Minuten warten, Tropfen B, dann Salbe | Schrittfolge fuer Senioren mit "naechster Schritt"-Reminder. | Mittel |
| Start-/Enddatum und Kurzkur | z.B. nur 5 oder 7 Tage | Automatisches Ende, Restbestand und "Therapie abgeschlossen". | Mittel |
| Verfalls-/Oeffnungsdatum | Augentropfen nach Oeffnung begrenzt haltbar | Nach Oeffnen Timer starten und Warnung vor Ablauf. | Mittel |
| Ersatz-/Ausweichmedikation | Patch plus zusaetzliches Schmerzmittel bei Durchbruchschmerz | Verknuepfte Medikamente, getrennte Bestandslogik. | Niedrig bis Mittel |

## Quellen

- NHS Prednisolone: Dosen koennen steigen/fallen, Reduktion vor Therapieende und teils Einnahme nur an wechselnden Tagen.
  https://www.nhs.uk/medicines/prednisolone/how-and-when-to-take-prednisolone-tablets-and-liquid/
- NHS Salbutamol: Bedarfsmedikation, 1-2 Huebe, Maximalhaeufigkeit pro 24 Stunden, Notfall-Schema mit Abstaenden.
  https://www.nhs.uk/medicines/salbutamol-inhaler/how-and-when-to-use-salbutamol-inhalers/
- NHS Oestrogen/HRT: Tabletten taeglich, Pflaster ein- oder zweimal woechentlich, Gel/Spray mit Pumps/Sprays.
  https://www.nhs.uk/medicines/hormone-replacement-therapy-hrt/oestrogen-tablets-patches-gel-and-spray/how-and-when-to-take-or-use-oestrogen-tablets-patches-gel-and-spray/
- NHS Buprenorphine: Pflaster mit 3-, 4- oder 7-Tage-Rhythmus, altes Pflaster entfernen, ggf. mehrere Pflaster nur nach Anweisung.
  https://www.nhs.uk/medicines/buprenorphine-for-pain/how-and-when-to-use-buprenorphine/
- Moorfields Eye Hospital: Augentropfen gleichmaessig ueber den Tag, 5-Minuten-Abstand zwischen Praeparaten, Oeffnungs-/Ablauffristen beachten.
  https://www.moorfields.nhs.uk/for-patients/information-hub/how-to-use-your-eye-drops

## Umsetzungsvorschlag

1. Premium "Erweiterter Einnahmeplan":
   - taeglich
   - Wochentage
   - alle X Tage ab Startdatum
   - Zyklus: X Tage/Wochen Einnahme, Y Tage/Wochen Pause
   - Dosisstaffel mit Datumsbereichen

2. Premium "Spezial-Reminder":
   - Bedarfsmedikation mit Tageslimit
   - Mindestabstand/Timer
   - Schrittfolge fuer Tropfen/Salbe/Inhalation
   - Pflasterwechsel mit Entfernen/Anbringen und Koerperstelle

3. Tests:
   - Forecast fuer jeden 2. Tag.
   - Forecast fuer alle 3/4/7 Tage.
   - Zyklus 21 Tage aktiv / 7 Tage Pause.
   - Dosisstaffel: 40 mg, dann 30 mg, dann 20 mg.
   - Bedarfsmedikation: kein Leer-Datum, aber Tageslimit-Zaehler.
