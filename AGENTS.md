# Projektregeln

- Lerne stets aus deinen Fehlern, denke pragmatisch und zukunftsorientiert.
- Android und iOS haben ein gemeinsames Produktziel. Neue Funktionen, Verhalten, UI-Flows, Berechtigungen, Assets und Konfigurationen müssen auf beiden Plattformen konsistent umgesetzt werden.
- Wenn eine Funktion nur auf einer Plattform geändert wird, prüfe aktiv die andere Plattform und dokumentiere bewusst, warum dort keine Änderung nötig ist.
- Sichtbare deutsche UI-Texte verwenden echte Umlaute (`ä`, `ö`, `ü`, `ß`) statt Umschreibungen wie `ae`, `oe`, `ue`.
- Medikamenten-Zahlen, Brüche und Bestände müssen auf echten Handy-Displays optisch geprüft werden, nicht nur im Simulator.
- Vor dem ersten öffentlichen Release bleibt die Version unter `1.0.0`. Jeder Fix erhöht die Patch-Version und zieht `package.json`, `package-lock.json`, Android `versionName`/`versionCode` und iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` konsistent nach.
