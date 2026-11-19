# Geländerkonfigurator

Browserbasierter Geländerkonfigurator mit einer frei zusammenstellbaren Betondecke. Die Decke beginnt als Rechteck mit 3.000 mm Länge, 500 mm Tiefe und 200 mm Stärke. Über „Länge hinzufügen“ werden weitere Abschnitte mit Außenlänge und Innenwinkel am Ende angefügt. Die Tiefe und Stärke gelten für den gesamten Deckenstreifen. Die dreh- und zoombare 3D-Ansicht hebt sichtbare Körperkanten mit feinen schwarzen Linien hervor, ohne die Dreiecke des Darstellungsnetzes anzuzeigen, und zeigt die eingegebenen Längen an den Außenkanten und die Winkel an den Ecken. Oben im Ansichtsfenster lassen sich „Maße“, „Betondecke“, „Grundprofile“, „Dichtlippen“, „Klemmkeile“, „Glasschuhe“, „Glas“ und „Schrauben“ unabhängig voneinander ein- und ausblenden. Die Schalter betreffen ausschließlich die Vorschau, nicht das Projekt oder den STEP-Export.

Die Längen werden entlang der eingegebenen Kante zwischen den Gehrungseckpunkten gemessen. Bei Außenecken liegt diese Kante außen, bei Innenecken innen. In der Startansicht verläuft die erste Länge waagerecht, die Tiefe nach hinten; der nächste Abschnitt schließt am Ende an. 180° bedeutet geradeaus, 90° eine rechtwinklige Außenecke und 270° eine rechtwinklige Innenecke. Die Ecken werden auf Gehrung verbunden.

Maße von 1 bis 100.000 mm und Winkel größer als 0° und kleiner als 360° sind zulässig, auch mit Nachkommastellen. Winkel sehr nahe an 0° oder 360° sind geometrisch nicht ausführbar und werden ebenso wie zu kurze Abschnitte und sich überschneidende oder berührende Konturen mit einer Meldung abgelehnt. Bei ungültiger Eingabe wird die Vorschau ausgeblendet. Die voreingestellte Deckenstärke von 200 mm ist eine beispielhafte Annahme und keine statische Bemessung.

## Projekte und 3D-Export

Oben kann das Projekt benannt und über „Speichern“, „Speichern unter“ und „Projekt öffnen“ als `.gelaender.json` verwaltet werden. Die Projektdatei enthält Namen, Tiefe, Stärke, Abschnittslängen, Winkel, statische Annahmen, Glashöhe und Scheibendicke sowie die Geländer- und Glasbefestigungskonfiguration. Gespeichert werden können nur gültige Konfigurationen mit Namen. „Speichern“ überschreibt die gewählte Datei, wenn der Browser Dateisystemzugriff unterstützt. Andernfalls sowie bei einem Abbruch des Dateidialogs oder einem Schreibfehler wird ein ausdrücklicher Download-Link angeboten; bestehende Dateien werden dabei nicht überschrieben. Ungespeicherte Änderungen werden vor dem Öffnen eines anderen Projekts bestätigt. Dateien des alten Fassadenkonfigurators sind nicht kompatibel.

Neue Projektdateien sowie STEP-Exporte erhalten einen Zeitstempel im Dateinamen (`JJJJ-MM-TT_HH-MM-SS`, lokale Uhrzeit zum Start des Speicherns bzw. Exports). Bei „Speichern“ einer bereits gewählten Datei bleibt deren Name unverändert. Dateidialoge können den vorgeschlagenen Namen manuell ändern.

Im Bereich „06 Export“ kann eine STEP-Datei generiert und anschließend heruntergeladen werden. Der STEP-Export enthält CAD-Volumenkörper, Farben und benannte Layer.

„Reset“ startet eine neue Konfiguration mit den Standardwerten und setzt auch die Ansicht zurück. Ungespeicherte Änderungen müssen zuvor bestätigt werden. Die Verknüpfung zur bisherigen Projektdatei und vorbereitete Downloads werden entfernt; vorhandene Dateien bleiben unverändert. Während eines Speichervorgangs oder CAD-Exports ist Reset nicht verfügbar.

Die Bereiche in der linken Konfigurationsleiste sind beim Start und nach einem Reset eingeklappt und können einzeln geöffnet werden.

Im Bereich „06 Export CAD“ erzeugt „STEP generieren“ eine STEP-Datei mit der Betondecke, allen konfigurierten Profil- und Zubehörteilen, den Glasscheiben sowie den Schrauben als separate geschlossene Volumenkörper in Millimetern. Während des Exports zeigen Fortschrittsbalken und Status den aktuellen Berechnungsstand. Die Teile übernehmen die Farben aus der Vorschau und werden auf den Layern `GEL_Gelaenderschuh`, `GEL_Glasschuh`, `GEL_Klemmleisten`, `GEL_Dichtlippen`, `GEL_Glas`, `GEL_Betondecke` und `GEL_Schrauben` ausgegeben. Bei „Keine Glasbefestigung“ werden Befestigungsteile nicht exportiert; Glas und Grundprofile bleiben erhalten. Bemaßungen und Sichtbarkeitsschalter beeinflussen den Export nicht. Nach der Berechnung steht ein Download-Link bereit; dieser enthält den Stand zum Zeitpunkt des Exportstarts. Der CAD-Kernel wird erst beim Export geladen.

## Export AV

Im Bereich „07 Export AV“ kann eine PDF-Stückliste mit allen Geländerprofilen, Glasschuhen, Klemmleisten, Dichtlippen und schematischen Schrauben heruntergeladen werden. Die Dichtlippen werden je Seite als aufsummierte Laufmeter ohne Einzel- oder Zuschnittlängen ausgewiesen, da sie auf der Baustelle zugeschnitten werden. Das Stahlblech in Montagefall 7A dient nur der Visualisierung und wird nicht in die AV übernommen. Die erste Seite enthält eine über die Seitenbreite laufende Tabelle mit Trennlinien und fortlaufenden Positionsnummern ab 001. Gleiche Teile werden zusammengefasst; Glasschuhe und vorkonfektionierte Klemmleisten stehen jeweils als Summenposition ohne Schnitt-Hinweis. Jedes Profil erhält zusätzlich eine eigene Bearbeitungsseite. Glas und Betondecke sind nicht Teil der Liste.

Für jedes GEL2001-Profil enthält das A3-PDF eine proportionale Draufsicht der modellierten Kontur mit Schnitten, Bohrungen und sämtlichen nummerierten X- und Y-Maßen auf einer Zeichnungsseite. Die SVG-Zeichnungsvorlage wird als Vektorgrafik in das PDF übernommen, damit Rahmen und Logo beim Vergrößern scharf bleiben. Zusätzlich stehen die Schnittpositionen, vorzeichenbehafteten Schnittwinkel und Bohrungspositionen weiterhin in Tabellenform im PDF. Globale Konturkoordinaten identifizieren Anfang und Ende des Profilabschnitts. X wird längs vom äußersten Anfangspunkt des Rohteils gemessen, Y von der Profilkante x = 0 zur gegenüberliegenden Kante; in Richtung Anfang zu Ende liegt positives Y rechts. Bei 7B werden Durchgang Ø 14,0 mm und Senkung Ø 21,0 mm / 90° von oben angegeben; bei 7A die einseitige Bohrung Ø 11,0 mm in der blechseitigen Profilwand. Die Dichtlippenmengen stehen je Seite nur als lfm; genaue Zuschnittlängen werden nicht ausgewiesen. Die Schrauben sind nur schematisch beschrieben. Die Modellangaben sind vor Fertigung fachlich zu prüfen; technische Freigaben, Toleranzen und exakte Herstellerteile werden nicht ersetzt.

## Kalkulation

Unter „08 Kalkulation“ öffnet „Preise eingeben“ die für alle zugängliche Preiseingabe. Es gibt keine Benutzerverwaltung oder Zugriffsbeschränkung. Für jeden Kunden kann eine benannte Preisliste als `.preise.json`-Datei vorbereitet und über den angezeigten Download-Link gespeichert werden. Über „Preisdatei importieren“ wird sie im Dialog geladen; „Preise übernehmen“ aktiviert sie für die Kalkulation. Die Preisdatei ist unabhängig von der Projektdatei und muss separat aufbewahrt werden. Eingaben gelten ohne gespeicherte Preisdatei nur bis zum Neuladen; Reset und Projektwechsel behalten die Sitzungspreise. Standardpreise können in `src/domain/railingPricing.ts` im Objekt `DEFAULT_PRICE_LIST` fest hinterlegt werden; `null` bedeutet, dass der Preis noch fehlt.

Für den Geländerschuh sind Rohprofillänge sowie Preis je laufendem Meter oder je Rohprofil einzugeben; der andere Preis wird automatisch umgerechnet. Berechnet werden die benötigten Längen der Geländerschuhe einschließlich Gehrungsüberständen, zwei Schnitte je Geländerschuh, Glasschuhe und Klemmleisten je Stück sowie die Gesamtlänge beider Dichtlippenbahnen je laufendem Meter. Pro Profilbohrung wird eine schematische Senkkopfschraube Ø 10 × 105 mm berechnet; Hersteller, Gewinde und Befestigungszulassung sind nicht festgelegt. Jede Profilbohrung wird einmal nach Durchmesser berechnet: bis 4 mm, über 4 bis 8 mm und über 8 mm; derzeit haben die Bohrungen 14 mm Durchmesser. Die Profilmenge berücksichtigt keinen zusätzlichen Rohstangenverschnitt. Glas und Betondecke sind nicht enthalten.

„Kalkulation“ fragt beim Klick zuerst den gemeinsamen Nettobetrag für Verpackung und Versand ab und zeigt danach die Einzelpositionen und den Gesamtpreis in Euro netto einschließlich Versand. Für kostenlose Lieferung ist ausdrücklich 0 einzugeben. Das PDF enthält das ALUFEFA-Geländerkonfigurator-Logo und unter der Kalkulation ein komprimiertes Bild der aktuellen 3D-Ansicht ohne Bemaßung. Blickwinkel und Sichtbarkeit entsprechen den Einstellungen beim PDF-Download. Die Positionssummen werden auf Cent gerundet und dann addiert. Fehlende Preise für tatsächlich benötigte Positionen werden gemeldet; bei Änderungen an Geometrie, Glas, Preisen oder Projektnamen muss erneut kalkuliert werden.

Das Kalkulations-PDF verwendet das ALUFEFA-Geländerkonfigurator-Logo; das AV-PDF behält das Logo der Zeichnungsvorlage bei. Die A3-PDF-Vorlage setzt Arial Nova Cond mit Arial-Fallback ein; Text, der direkt als Vektor in jsPDF gezeichnet wird, verwendet die integrierte Helvetica-Kernschrift als Arial-kompatible Ersatzschrift.

## Statische Annahmen

Die Bereiche in der Seitenleiste beginnen mit „01 Geländerkonfiguration“, „02 Maße“ und „03 Statische Annahmen“. Unter „03 Statische Annahmen“ werden Innen- oder Außenbereich und öffentliche oder private Nutzung ausgewählt. Privat ergibt 0,5 kN Verkehrslast, öffentlich 1,0 kN; im Außenbereich werden zusätzlich 1,0 kN Wind angenommen, im Innenbereich kein Wind. Standardmäßig ist privat und Innenbereich gewählt; ältere Projekte ohne diese Angaben werden mit denselben Standardwerten geöffnet. Die Werte sind Annahmen und ersetzen keine statische Bemessung.

## Geländerkonfiguration

Unter „01 Geländerkonfiguration“ wird der Montagefall ausgewählt. Montagefall 7B ist standardmäßig vorausgewählt; auch nach Reset startet eine neue Konfiguration mit 7B. Das Profil GEL2001 wird bei 7B auf der Deckenoberseite angeordnet und bei 7A seitlich am Stahlblech befestigt. Die Rohprofillänge ist auf 4.000 mm einschließlich Gehrung begrenzt und längere Abschnitte werden gestückelt. Unter „02 Maße“ wird die Betondecken- bzw. bei 7A die Stahlblech-Draufsichtkontur eingegeben. Im Bereich „04 Glas - Visualisierung“ werden Höhe, Stärke je Scheibe, maximale Scheibenbreite und Scheibenspalt eingestellt. Standardmäßig ist das Glas 1.100 mm hoch und besteht aus zwei transparenten, neutral dargestellten Scheiben mit je 10 mm Stärke und 1 mm Abstand. Der Glasbeginn liegt 16,05 mm über der Oberkante Betondecke. Die maximale Breite je Glasscheibe beträgt standardmäßig 1.250 mm, der Scheibenspalt zwischen benachbarten Scheiben 5 mm. Jeder gerade Konturabschnitt wird in gleich breite Scheibenfelder geteilt; kein Feld überschreitet die eingestellte maximale Breite. Die Scheibenfelder folgen der Kontur und werden an den Abschnittsecken getrennt. Im Bereich „05 Glasbefestigung“ wird „ALUFEFA Systemteile“ oder „Keine Glasbefestigung“ ausgewählt. Ohne Systemteile bleiben die Glasscheiben sichtbar und exportierbar; Dichtlippen, Klemmleisten und Glasklemmschuhe werden dann weder dargestellt noch exportiert.

Die Glasscheiben sind an Knicken rechtwinklig geschnitten und stoßen stumpf: Der vorherige Abschnitt läuft durch, der folgende endet mit dem eingestellten Scheibenspalt an dessen Außenseite. Die Berechnung berücksichtigt beide Glaslagen. Bei sehr spitzen Winkeln oder zu kurzen Abschnitten wird eine nicht ausführbare Anordnung gemeldet. Vorschau und STEP-Export verwenden dieselbe Geometrie.

Das Profil GEL2001 wird bei 7B auf der Deckenoberseite entlang der eingegebenen Kanten angeordnet und an den Ecken auf Gehrung geschnitten. Die oberen Gummidichtlippen laufen ebenfalls durchgehend entlang der Kontur und werden an den Ecken wie das Grundprofil auf Gehrung geschnitten. Die Klemmleisten sind je 180 mm lang, beginnen 10 mm vom Rand und haben exakt 20 mm lichte Lücke; das letzte Teil wird passend zugeschnitten. Die Glasschuhe sind je 100 mm lang, beginnen 30 mm vom jeweiligen Abschnittsende und werden mit gleichmäßigen lichten Lücken von höchstens 300 mm verteilt. Die Aluminiumteile auf Layer `0` erscheinen hellgrau, Glasschuhe und Klemmkeile mittelgrau, übrige Gummiteile dunkelgrau und Schrauben rot. Die Teile sind über eigene Schalter in der Vorschau einzeln ein- und ausblendbar. Der Randabstand bei 7B wird von der eingegebenen Profilkante zur Betondeckenkante nach innen gemessen und beträgt standardmäßig 0 mm. Er darf höchstens die Betondeckentiefe abzüglich der tatsächlichen Profilbreite betragen; ist die Decke schmaler als das Profil, wird dies gemeldet. Die Projektdatei speichert Montagefall, Randabstand und Glaskonfiguration; ältere Projektdateien ohne Geländer bleiben ohne Geländer.

Bei Montagefall 7A bleibt das GEL2001-Profil unverändert und wird über eine Torbandschraube DIN 603 M10×30,0 mit einem kreisrunden, gewölbten Kopf Ø 25,0 mm und 5,0 mm Höhe seitlich am Stahlblech befestigt. Der Kopf liegt an der Innenseite der blechseitigen Profilwand; seine Spitze sitzt 12,7 mm innerhalb der GEL2001-Kontur. Die Ø 11,0 mm Bohrung geht nur durch diese Profilwand, nicht durch die gegenüberliegende Wand. Die Eingabekontur beschreibt die Draufsicht eines 10,0 mm starken Stahlblechs. Dessen feste Höhe beträgt 195,0 mm (135,0 mm Profilhöhe plus 30,0 mm Überstand oben und unten). Die Achshöhe von 61,0 mm über Profilunterkante stammt aus der Linie auf dem DXF-Layer `Achse_Torbandschraube`. Der Schraubenabstand ist privat innen 740,0 mm, privat außen 400,0 mm, öffentlich innen 370,0 mm und öffentlich außen 270,0 mm. Die Bohrungen werden gleichmäßig mit maximal diesem Abstand angeordnet und halten 50,0 mm Randabstand zu den Profilenden. Vorschau und STEP-Export zeigen Stahlblech, seitlich gebohrtes GEL2001-Profil, rote Torbandschrauben und rote M10-Muttern. Der Schraubenkopf und -schaft bilden im STEP-Export einen Volumenkörper; zwischen Mutter und Stahlblech ist 1,0 mm Abstand vorgesehen. Die AV-Stückliste führt die Torbandschrauben, aber nicht das nur zur Visualisierung dargestellte Stahlblech auf. Die Kalkulation berechnet Schrauben und beide Bohrungen je Befestigungspunkt; Stahlblech und Glas sind nicht in den Preisen enthalten.

Alle in der Anwendung und in den Export-PDFs ausgegebenen Längen werden mit einer Nachkommastelle dargestellt.

Für jedes Profilteil darf die benötigte Rohprofillänge einschließlich der Gehrungsüberstände 4.000 mm nicht überschreiten. Längere Abschnitte werden mit geraden Profilstößen in möglichst wenige Teile aufgeteilt, jeweils zunächst bis zu 4.000 mm. Falls das letzte Teil für die Bohrungsrandabstände zu kurz wäre, wird der vorherige Stoß entsprechend verschoben. Die Enden jedes Teilstücks erhalten jeweils 50 mm Bohrungsrandabstand. Bei nicht ausführbaren Gehrungen wird ein Fehler angezeigt. Die einzelnen Stücke sind auch im STEP-Export getrennte Volumenkörper.

Die Projektdaten zeigen die Abschnittsanzahl und die Gesamtlänge des Geländers als Summe der Profilmittellinien zwischen den Gehrungen. Ohne gültig konfiguriertes Geländer wird für die Länge „–“ angezeigt.

Bei Montagefall 7B liegen mittig im Profilboden Durchgangsbohrungen Ø 14 mm mit Senkung Ø 21 mm und 90° von oben. Auf der Profilmittellinie beträgt der Abstand der äußeren Bohrungsmittelpunkte zu den Enden bzw. Gehrungen 50 mm. Dazwischen werden sie gleichmäßig verteilt; maximaler Abstand: privat innen 320 mm, privat außen 175 mm, öffentlich innen 160 mm, öffentlich außen 110 mm. Bei genau 100 mm Profillänge entsteht eine mittige Bohrung; kürzere oder für die Gehrung ungeeignete Profilteile werden abgelehnt. Die Bohrungen sind in Vorschau und STEP enthalten; die Betondecke wird nicht gebohrt.

In der Vorschau wird an jeder Bohrung eine Schraube schematisch in Rot dargestellt (Ø 10 mm, Gesamtlänge 105 mm, Senkkopf; ohne Gewinde und Antrieb). Dieselbe vereinfachte Geometrie wird pro Schraube als separater STEP-Volumenkörper exportiert; es handelt sich nicht um ein exaktes Herstellermodell. Einige Profilquerschnitte werden aus Performancegründen vereinfacht dargestellt; genaue Querschnitte als DWG-, DXF- und STEP-Dateien sind im ALUFEFA Downloadbereich auf [www.alufefa.at](https://www.alufefa.at) einsehbar.

Die bereitgestellte vereinfachte GEL2001-DXF wird in Millimetern interpretiert. Das Aluminiumprofil wird aus Layer `0`, die Dichtlippen aus `095_DICHTBAND`, die Klemmkeile aus `094_GUMMI` und die Glasschuhe aus `092_KUNSTSTOFF` übernommen. Die aktualisierten, vereinfachten Zubehörkonturen werden ohne Bögen eingebettet; Profil- und Zubehörgeometrie werden durch Tests mit der DXF abgeglichen. Kleine Endpunktlücken im Aluminiumprofil werden geschlossen. Zum Anzeigen ist kein separater Dateiaufruf erforderlich. Der STEP-Export enthält jedes konfigurierte Einzelteil als separaten Volumenkörper, aber keine Bemaßung.

Der visuelle Stil ist in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) dokumentiert. Die bisherigen Fassadenfunktionen sind in der Anwendung nicht mehr eingebunden; deren Quelldateien und Ressourcen bleiben vorerst im Projekt erhalten.

## Voraussetzungen

- Node.js 20 oder neuer
- npm 10 oder neuer

## Lokal starten

```bash
npm install
npm run dev
```

Vite verwendet Port `5181`. Die Anwendung ist lokal unter `http://localhost:5181` erreichbar.

## Produktionsbuild und Tests

```bash
npm run build
npm test
```
#   G E L - K o n f i t u r a t o r - s t a g e  
 