# Projektregeln

- Lerne stets aus deinen Fehlern, denke pragmatisch und zukunftsorientiert.
- Android und iOS haben ein gemeinsames Produktziel. Neue Funktionen, Verhalten, UI-Flows, Berechtigungen, Assets und Konfigurationen müssen auf beiden Plattformen konsistent umgesetzt werden.
- Wenn eine Funktion nur auf einer Plattform geändert wird, prüfe aktiv die andere Plattform und dokumentiere bewusst, warum dort keine Änderung nötig ist.
- Sichtbare deutsche UI-Texte verwenden echte Umlaute (`ä`, `ö`, `ü`, `ß`) statt Umschreibungen wie `ae`, `oe`, `ue`.
- Medikamenten-Zahlen, Brüche und Bestände müssen auf echten Handy-Displays optisch geprüft werden, nicht nur im Simulator.
- Vor dem ersten öffentlichen Release bleibt die Version unter `1.0.0`. Jeder Fix erhöht die Patch-Version und zieht `package.json`, `package-lock.json`, Android `versionName`/`versionCode` und iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` konsistent nach.
- Worktrees dürfen nicht dauerhaft im App-Projektroot liegen. Ein verschachteltes `.worktrees/` kann Metro, Git-Status und native Builds massiv verlangsamen; wenn es doch vorhanden ist, muss Metro es blocken und Build-/Deploy-Skripte müssen den Zustand sichtbar melden.
- Vor Android-Builds auf lokale Konfliktartefakte wie `* 2.dex`, `* 2.xml`, `values 2.xml` oder duplizierte `android/app/build/* 2` prüfen. Solche Dateien in `android/app/build` sind generierte lokale Artefakte und müssen durch einen sauberen Build-Ordner ersetzt werden, statt den Build weiterlaufen zu lassen.
