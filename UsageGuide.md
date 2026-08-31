# Atlas Docs – Kurzanleitung für Endnutzer

Diese Anleitung erklärt die tägliche Nutzung von Atlas Docs. Informationen zur
Installation, Konfiguration und Datensicherung stehen in der
[Setup-Anleitung](SETUP.md).

## 1. Erste Schritte

1. Melde dich mit deinem lokalen Konto oder dem eingerichteten
   Single-Sign-on-Anbieter an.
2. Wähle oben den gewünschten **Bereich (Space)** aus.
3. Erstelle links über **Datei** ein Dokument, Diagramm, Gantt-Plan, Todo-Board,
   Textdatei oder Canvas. Über den Reiter **Importieren** kannst du vorhandene
   Dateien übernehmen; Atlas öffnet unterstützte Formate im passenden Editor
   oder in einer browsernativen Vorschau. Mit **Ordner** kannst du Inhalte
   strukturieren.
4. Bearbeite den Inhalt. Änderungen werden während der Arbeit automatisch
   synchronisiert.
5. Lege vor wichtigen Änderungen über **Version speichern** einen
   Wiederherstellungspunkt an.

## 2. Bereiche, Ordner und Dateien

Ein Bereich bündelt zusammengehörige Ordner, Dateien und Zugriffsrechte. Die
Suche in der Seitenleiste durchsucht Datei- und Ordnernamen, nicht den Inhalt
der Dokumente.

- **Bereich wechseln:** Öffne die Bereichsauswahl oben oder nutze
  `Strg/Cmd + Umschalt + K`.
- **Neue Datei:** Klicke links auf **Datei** oder nutze
  `Strg/Cmd + Umschalt + N`.
- **Neuer Ordner:** Klicke auf **Ordner**. In einem vorhandenen Ordner kannst du
  auch Unterordner anlegen.
- **Verschieben und sortieren:** Ziehe Einträge an die gewünschte Position oder
  nutze das Aktionsmenü eines Eintrags.
- **In neuem Tab öffnen:** Nutze die mittlere Maustaste oder
  `Strg/Cmd + Klick` auf einen Bereich oder eine Datei.
- **Vollbild:** Nutze die Vollbildtaste in der Dateikopfzeile. Die Arbeitsbereich-
  Navigation verschwindet; dieselbe Taste beendet die Ansicht wieder.
- **Umbenennen:** Dateinamen werden über den Titel im geöffneten Dokument
  geändert. Ordner und Bereiche besitzen eine eigene Umbenennen-Aktion.
- **Löschen:** Das Papierkorb-Symbol löscht eine Datei oder ein Canvas nach
  Bestätigung. Gelöschte Inhalte und ihre Versionen können nicht über die
  Oberfläche wiederhergestellt werden.

Atlas Docs kennt folgende Dateitypen:

| Dateityp | Geeignet für | Download |
| --- | --- | --- |
| Markdown | Notizen, Dokumentation, Checklisten und Tabellen | `.md` |
| LaTeX | Wissenschaftliche oder technisch gesetzte Dokumente | `.tex` |
| Mermaid | Diagramm-Quelltext mit Diagrammvorschau | `.mmd` oder `.mermaid` |
| Gantt | Visuelle Projektplanung und Mermaid-Gantt-Importe | `.gantt` |
| Todo | Priorisierte Aufgaben mit Markdown-Beschreibung, Status und Frist | `.todos.json` |
| Text | Unformatierter, gemeinsam bearbeitbarer Text | `.txt` oder Originalname |
| Canvas | Diagramme, Skizzen und visuelle Planung mit Excalidraw | `.excalidraw` |
| PDF | Unveränderbare Dokumente, Angebote und Anhänge | Original-PDF |
| Weitere Uploads | Bilder, Audio, Video und sonstige Dateien | Originaldatei |

## 3. Markdown verwenden

In **Schreiben** bearbeitest du den Inhalt, unter **Vorschau** siehst du das
gerenderte Ergebnis. Die Formatierungsleiste bietet Fett, Kursiv,
Durchgestrichen, Inline-Code und Links.

Links werden in der Vorschau farbig und unterstrichen dargestellt. Codeblöcke
mit den Sprachangaben `java`, `python`, `c`, `c#`, `c++` oder `bash` erhalten
Syntaxfarben; die Kurzformen `py`, `cs` und `sh` werden ebenfalls erkannt.

### Todo-Boards

Klicke in einem Todo-Board auf **Aufgabe hinzufügen**. Der Dialog bündelt Titel,
Beschreibung, Status, Priorität und Frist. Die Beschreibung wird als Markdown
eingegeben und direkt als Vorschau angezeigt; über das Stift-Symbol einer Karte
kannst du alle Werte später wieder ändern.

### Slash-Befehle

Tippe `/` in eine leere oder begonnene Zeile. Suche anschließend einen Befehl
und bestätige ihn mit `Enter` oder `Tab`.

| Befehl | Fügt ein |
| --- | --- |
| `/table` | Tabelle |
| `/codeblock` | Codeblock |
| `/image` | Bild-Upload |
| `/heading1`, `/heading2`, `/heading3` | Überschrift |
| `/bullet`, `/numbered` | Aufzählung oder nummerierte Liste |
| `/checklist` | Aufgabe mit Kontrollkästchen |
| `/quote` | Zitat |
| `/divider` | Trennlinie |
| `/link` | Link |

Bilder lassen sich außerdem mit `Strg/Cmd + V` aus der Zwischenablage
einfügen. Unterstützt werden PNG, JPEG, WebP und GIF. Die maximale Größe für
Bilder, Importe und PDF-Anhänge legt die Installation fest; standardmäßig sind
es 25 MB.

Über **PDF anhängen** in der Formatierungsleiste kannst du zusätzlich eine PDF
an eine Markdown-Seite anhängen. Die Datei bleibt an diese Seite gebunden und
ist nur für Personen sichtbar, die Zugriff auf die Seite oder deren
Freigabeordner haben.

### Tabellen

Markdown-Tabellen können direkt als visuelle Tabelle bearbeitet werden.

- **Zeile/Spalte hinzufügen:** Nutze die Schaltflächen unter der Tabelle.
- **Zeile/Spalte entfernen:** Nutze die entsprechenden Schaltflächen. Falls
  eine strukturelle Änderung nicht sicher möglich ist, wechsle über
  **Quelltext bearbeiten** in den vollständigen Markdown-Text.
- **Pfeil links/rechts:** Wechselt am Anfang oder Ende eines Feldes in die
  benachbarte Zelle. Innerhalb des Textes bewegt sich der Cursor normal.
- **Pfeil hoch/runter:** Wechselt in die Zelle darüber oder darunter und hält
  die Cursorposition möglichst bei.

## 4. LaTeX verwenden

Bearbeite den Text unter **Quelltext** und kontrolliere das Ergebnis unter
**Vorschau**. Über das Download-Symbol erhältst du die ursprüngliche `.tex`-
Datei. Das Drucker-Symbol öffnet den Browserdialog für den PDF-Export. Die
Vorschau basiert auf LaTeX.js und ersetzt keinen vollständigen TeX-Compiler.

## 5. Mermaid-Diagramme verwenden

Mermaid-Dateien können entweder als **Diagramm** oder als **Text + Diagramm**
angezeigt werden. Über **Einstellungen → Präferenzen → Dateien öffnen** legst
du fest, welche Ansicht beim nächsten Öffnen standardmäßig verwendet wird.

## 6. Gantt-Planner verwenden

Ein Gantt-Plan öffnet direkt im visuellen Planner. Erstelle eine Aufgabe über
**Neue Aufgabe**, gib Start- und Enddatum an und ziehe die Leiste später auf
einen anderen Zeitraum oder an ihrem Rand länger beziehungsweise kürzer.

- **Doppelklick auf eine Aufgabe:** Titel, Termine, Abschnitt, Fortschritt und
  Status bearbeiten.
- **Heute:** Springt zum heutigen Datum und schaltet bei Bedarf die Ausgrauung
  vergangener Zeiträume um.
- **Importieren:** Übernimmt einen Mermaid-Gantt-Text in den Planner.
- **Farben und Status:** Unter **Einstellungen → Präferenzen → Gantt-Ansicht**
  lassen sich Bedeutung und Farbe der Status festlegen.

Atlas speichert den Plan weiterhin als Mermaid-Gantt-Text. Damit bleibt er auch
außerhalb von Atlas Docs lesbar und exportierbar.

## 7. PDF-Dateien und weitere Uploads verwenden

PDF-Dateien können über **Datei → Importieren** als eigene, nicht bearbeitbare
PDF-Seite angelegt werden. Atlas zeigt sie direkt an; über die Aktionsleiste
kannst du sie herunterladen oder über einen Seiten- beziehungsweise
Ordnerfreigabelink teilen. Für Markdown- und LaTeX-Dateien öffnet
**Als PDF exportieren** den Browser-Druckdialog mit einem A4-Drucklayout.

Weitere Dateien bleiben unverändert. Atlas zeigt bei PDF, Bild-, Audio- und
Videodateien eine browsernative Vorschau, sofern der Browser das Format
unterstützt. Nicht darstellbare Dateien können jederzeit heruntergeladen
werden.

## 8. Canvas verwenden

Ein Canvas ist eine eigenständige Excalidraw-Datei. Formen, Text, Verbindungen
und Zeichnungen werden wie Dokumente live mit anderen Personen synchronisiert.
Über das Download-Symbol kannst du das Canvas als `.excalidraw` speichern und
in kompatiblen Anwendungen weiterverwenden.

## 9. Zusammenarbeit und Versionen

Der **LIVE**-Status und die Avatare zeigen aktive Mitwirkende. Bearbeitbare
Dokumente, Diagramme, Planungen, Todo-Boards und Canvases werden in Echtzeit
übertragen.

- **Version speichern:** Erstellt bewusst einen benannten Stand des aktuellen
  Inhalts.
- **Historie:** Zeigt gespeicherte Versionen und ermöglicht ihre
  Wiederherstellung.
- **Download:** Exportiert die geöffnete Datei in ihrem nativen Format.

Eine Wiederherstellung verändert den aktuellen Inhalt für alle Mitwirkenden.
Speichere deshalb vorher bei Bedarf eine zusätzliche Version.

## 10. Seiten und Ordner freigeben

Bereichseigentümer und Instanzadministratoren können über das
**Teilen-Symbol** neben der Historie einen Link ausschließlich für die geöffnete
Seite erzeugen. Empfänger benötigen dafür kein Atlas-Konto und sehen weder den
restlichen Bereich noch Ordner, Rechte oder Historie.

1. Vergib eine eindeutige Bezeichnung für den Link.
2. Wähle **Nur lesen** oder **Inhalt bearbeiten**.
3. Lege eine Laufzeit von 7, 30 oder 90 Tagen fest – alternativ **Nie**.
4. Erstelle den Link und kopiere ihn sofort. Der vollständige Link wird aus
   Sicherheitsgründen nur einmal angezeigt.

Ein Bearbeitungslink darf Dokument- oder Canvas-Inhalte ändern, aber keine
Seitentitel, Bilder, Versionen oder Bereichseinstellungen verwalten. Berechtigungen
aktiver Links können nachträglich geändert und Links jederzeit widerrufen
werden.

Über das Teilen-Symbol neben einem Ordner können dieselben Rollen den gesamten
Ordnerbaum freigeben. Der Link enthält alle Unterordner und die aktuell darin
liegenden Dateien, aber keine benachbarten Ordner oder den restlichen Bereich.
Verschobene Dateien werden entsprechend in die Freigabe aufgenommen oder aus
ihr entfernt.

> Ein Freigabelink ist ein Zugangsschlüssel. Teile ihn nur über einen
> vertrauenswürdigen Kanal und widerrufe ihn, sobald er nicht mehr benötigt
> wird.

## 11. Rollen und Rechte

| Rolle | Inhalte lesen | Inhalte bearbeiten | Bereich und Rechte verwalten |
| --- | :---: | :---: | :---: |
| Betrachter (`VIEWER`) | Ja | Nein | Nein |
| Bearbeiter (`EDITOR`) | Ja | Ja | Nein |
| Eigentümer (`OWNER`) | Ja | Ja | Ja |

Zugriff kann direkt oder über ein Team vergeben werden. Nur Eigentümer und
Administratoren können einen Bereich umbenennen, löschen oder seine Rechte
verwalten. Instanzadministratoren verwalten zusätzlich Benutzer und Teams.

## 12. Einstellungen

Öffne unten links dein Profilfeld. Es führt zur eigenständigen Seite
**Einstellungen**, die die Optionen in Account, Design, Präferenzen sowie Daten
& Export gruppiert. Dort kannst du Folgendes anpassen:

- Profilbild
- Anzeigename und bei lokalen Konten auch das Passwort
- Sprache Deutsch oder Englisch
- helles, dunkles oder systemabhängiges Farbschema
- Schriftarten und Textgröße
- Standardansichten für Markdown, LaTeX, Mermaid und Gantt
- Startbereich beim Öffnen von Atlas ohne direkten Seiten- oder Bereichslink
- kompakte Navigation
- Bedeutung, Farbe und Vergangenheitsausgrauung im Gantt-Planner

Die Einstellungen werden mit deinem Konto gespeichert und gelten auch auf
anderen Geräten. Unter **Daten & Export** kannst du außerdem alle für dich
sichtbaren Bereiche als portables ZIP exportieren. Dieser Export enthält aktuelle, in PostgreSQL
gespeicherte Inhalte, referenzierte Bilder und PDF-Dateien beziehungsweise
PDF-Anhänge, aber keine Konten, Rechte, Sitzungen oder Versionshistorie.

## 13. Tastenkürzel

`Strg` gilt für Windows und Linux, `Cmd` für macOS.

| Tastenkürzel | Wirkung |
| --- | --- |
| `Strg/Cmd + Umschalt + N` | Neue Datei im aktuellen Bereich |
| `Strg/Cmd + Umschalt + K` | Bereichsauswahl öffnen |
| `Esc` | Obersten geöffneten Dialog schließen |
| `Strg/Cmd + B` | Markierten Markdown-Text fett formatieren |
| `Strg/Cmd + I` | Markierten Markdown-Text kursiv formatieren |
| `Strg/Cmd + K` | Markierten Markdown-Text als Link formatieren |
| `Tab` | Im Editor zwei Leerzeichen einrücken; im Slash-Menü Befehl übernehmen |
| `Umschalt + Tab` | Einrückung entfernen; ohne Einrückung zum vorherigen Bedienelement wechseln |
| `Enter` | Slash-Befehl übernehmen; Markdown-Listen fortsetzen |
| `Pfeil links/rechts` | An Zellgrenzen zur benachbarten Tabellenzelle wechseln |
| `Pfeil hoch/runter` | In visuellen Tabellen die Zeile wechseln |
| `Strg/Cmd + V` | Bild aus der Zwischenablage in Markdown einfügen |
| `Strg/Cmd + Klick` | Datei oder Bereich in einem neuen Browser-Tab öffnen |

Browser- und Betriebssystemkürzel können je nach Umgebung Vorrang haben.

## 14. Gute Arbeitsweise

- Speichere vor großen Umbauten eine benannte Version.
- Verwende Freigabelinks mit Ablaufdatum, wenn dauerhafter Zugriff nicht nötig
  ist.
- Nutze **Nur lesen**, sofern Empfänger keine Änderungen vornehmen müssen.
- Lade native `.md`-, `.tex`-, `.excalidraw`- oder `.pdf`-Dateien herunter, wenn du einen
  einzelnen Inhalt außerhalb von Atlas Docs weiterverwenden möchtest.
- Prüfe beim Import, ob die Datei das für deine Installation geltende
  Uploadlimit einhält.
- Wende dich bei fehlenden Rechten oder Anmeldeproblemen an den zuständigen
  Atlas-Administrator.
