# Visueller Leitfaden

Dieser Leitfaden beschreibt den visuellen Stil des Linarte-Fassadenkonfigurators als gemeinsame Referenz für neue Oberflächen und Werkzeuge. Er fasst die tatsächlich verwendeten UI-Regeln zusammen; die zentrale Implementierung liegt in `src/index.css`.

## Markenwirkung

- Sachlich, technisch und zurückhaltend: Die Fassade und ihre Maße stehen im Mittelpunkt, nicht dekorative UI-Effekte.
- Helle, klar abgegrenzte Arbeitsbereiche, feine Linien und kompakte Beschriftungen schaffen die Anmutung eines technischen Werkzeugs.
- Blau kennzeichnet primäre Aktionen, Fokus und wichtige technische Hervorhebungen. Es ist kein flächiger Dekorationshintergrund.
- Die Oberfläche ist deutschsprachig. Technische Maße werden mit Einheiten gezeigt; Zahlen und Dezimaltrennzeichen folgen der deutschen Darstellung.

## Farben

| Zweck | Wert | Verwendung |
| --- | --- | --- |
| Text / Dunkelgrau | `#262626` | Primärer Text, dunkle UI-Elemente |
| Sekundärtext | `#555555` | Labels, Hinweise, Status und Beschriftungen |
| Linien / Hellgrau / 3D-Arbeitsfläche | `#D5D5D5` | Trennlinien, neutrale Flächen und Viewer-Hintergrund |
| Primärblau | `#285598` | Primäre Aktion, Fokus, ausgewählte Zustände und technische Akzente |
| Dunkelblau | `#173259` | Hover-Zustand und betonte blaue Texte |
| Weiß | `#FFFFFF` | Einstellungsleiste, Kopfzeile, Karten und Eingabeflächen |
| Warnfarbe | `#B75132` | Export- und Warnmeldungen |

Ungespeicherte Änderungen verwenden zusätzlich Rot (`#B42318`), Validierungsfehler ein dunkles Rot (`#A4161A`). Fehlermeldungsflächen sind blass rötlich (`#FFF7F3`) und werden mit einem sichtbaren Rand vom normalen Inhalt getrennt. Profil- und Materialfarben dürfen konfigurierbar sein; die Bedienelemente dafür bleiben neutral und nutzen Blau nur für Auswahl/Fokus.

Die CSS-Variablen `--ink`, `--muted`, `--line`, `--blue`, `--blue-dark`, `--light-gray`, `--dark-gray`, `--white` und `--warning` in `src/index.css` sind die maßgebliche UI-Farbpalette. Bestehende Variablen wiederverwenden, statt abweichende Werte einzuführen.

## Typografie

- Schriftstack: `"Arial Nova Cond", "Arial Narrow", Bahnschrift, "Segoe UI", sans-serif`.
- Die Oberfläche verwendet eine kompakte Größenhierarchie: Hauptansichtstitel ca. 23 px, Abschnittstitel ca. 13 px, Standardlabels ca. 10–11 px und technische Metadaten ca. 8–9 px.
- Zahlen und Maße sollen schnell vergleichbar sein: numerische Eingaben und Kennzahlen verwenden tabellarische Ziffern (`font-variant-numeric: tabular-nums`).
- Kleine technische Metadaten, Einheiten und Statuszeilen verwenden den vorhandenen Stack `--mono`. Dieser ist derzeit ein Alias desselben Schriftstacks, kein separates Monospace-Font.
- Großbuchstaben und leicht gesperrte Laufweite sparsam für kurze technische Kennzeichnungen, nicht für längere Texte.
- Schreibweise, Dezimalformat und Einheiten in der UI an der deutschen Lokalisierung ausrichten.

## Layout und Komponenten

- Desktop: feste linke Konfigurationsleiste (derzeit 302 px) neben einem flexiblen Arbeitsbereich. Die Leiste ist weiß, durch eine feine Linie getrennt und unabhängig vertikal scrollbar.
- Arbeitsbereich: weiße Kopfzeile mit Projektname und Aktionen; darunter eine zentrierte, in der Breite begrenzte Arbeitsfläche. Die 3D-Ansicht ist der größte und visuell ruhigste Bereich.
- Abschnitte der Einstellungsleiste sind kompakt, durch horizontale Linien gegliedert und bei Bedarf auf-/zuklappbar. Nummerierte Abschnittsindizes und kleine Plus/Minus-Indikatoren unterstützen die Orientierung.
- Eingaben sind überwiegend rechteckig, weiß, fein umrandet und etwa 32–34 px hoch. Zahlen stehen rechtsbündig; Einheiten werden direkt am Feld angezeigt.
- Buttons sind nüchtern und rechteckig. Sekundäre Aktionen haben weißen Hintergrund und graue Kontur; die wichtigste Aktion erhält einen blauen Hintergrund mit weißer Schrift.
- Informationskarten können mit hellgrauem Hintergrund und schmaler blauer linker Kante hervorgehoben werden. Karten und Panels verwenden überwiegend Linien statt starker Schatten oder großer Rundungen.
- Icons aus `lucide-react` sind einfache Kontur-Icons, typischerweise 14–16 px. Keine dekorativen Illustrationen ergänzen, wenn sie nicht fachlich nötig sind.
- Das bereitgestellte ALUFEFA-Geländerkonfigurator-Logo unter `public/gel-konfigurator-logo.jpg` verwenden; nicht durch neu gesetzten Text oder ein nachgebautes Logo ersetzen.

## Zustände und Interaktion

- Fokus immer sichtbar machen: 2 px blaue Fokus-Kontur mit Abstand. Hover-Zustände ändern dezent Kontur, Text- oder Hintergrundfarbe.
- Ausgewählte Zustände klar mit Blau markieren. Deaktivierte Eingaben und Aktionen bleiben erkennbar, wirken aber zurückgenommen und zeigen einen passenden Cursor.
- Fehler, Warnungen, Erfolg und ungespeicherte Änderungen unterscheidbar darstellen; Statusmeldungen nicht allein durch Farbe vermitteln.
- Fortschritt und Ergebnis von Exporten direkt an der zugehörigen Aktion anzeigen. Meldungen bleiben kurz und in deutscher Sprache.
- Auf-/zuklappbare Bereiche und Menüs müssen klare Zustände sowie bedienbare Fokuszustände behalten.

## Responsive Verhalten

- Ab ca. 1050 px wird die Einstellungsleiste schmaler und Abstände werden reduziert.
- Bis 720 px wechselt das Layout zu einer oberen, begrenzt hohen und scrollbareren Konfigurationsleiste über dem Viewer. Projektaktionen können dann als reine Icons erscheinen.
- Bis 420 px werden Außenabstände und Kennzahlen weiter verdichtet. Bedienelemente bleiben lesbar und bedienbar; die 3D-Ansicht behält den verfügbaren Hauptbereich.
- Neue Oberflächen sollen zuerst die Desktop-Aufteilung übernehmen und dann ein bewusstes, platzsparendes Mobilverhalten ergänzen, statt lediglich horizontal zu schrumpfen.

## Für neue Tools übernehmen

1. Farben und Typografie aus dieser Palette übernehmen und bestehende CSS-Tokens wiederverwenden.
2. Eine klare Hauptarbeitsfläche, eine kompakte Navigation/Einstellungsleiste und zurückhaltende Trennlinien bevorzugen.
3. Blau für Aktionen und Zustände reservieren; neutrale Flächen für den Inhalt und das Modell nutzen.
4. Deutsche, präzise Beschriftungen mit passenden Einheiten verwenden und Zahlen tabellarisch ausrichten.
5. Rechteckige, kompakte Controls und einfache Kontur-Icons verwenden; starke Schatten, dekorative Verläufe und unnötig runde Karten vermeiden.
6. Responsive Verhalten, Tastaturfokus sowie Fehler-, Lade- und Deaktiviert-Zustände von Anfang an mitgestalten.

Für UI-Änderungen im Konfigurator ist `src/index.css` die konkrete Referenz; dieser Leitfaden beschreibt, welche Regeln neue Oberflächen konsistent weiterführen sollen.
