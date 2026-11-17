# Audio

Lege hier Dateien mit genau diesen Namen ab (mp3, ogg, wav und m4a funktionieren, solange der Name
in `story.json` passt). Fehlt eine Datei, spielt der Player einen synthetischen Platzhalter.

| Datei | Verwendung | Platzhalter |
| --- | --- | --- |
| `ambience_city.mp3` | Stadt-Atmo (Verkehr, Morgen), loopbar | city |
| `ambience_office.mp3` | Büro-Atmo (Lüftung, Stimmen leise), loopbar | office |
| `car_horn.mp3` | Hupe | horn |
| `car_pass.mp3` | Auto fährt vorbei | car |
| `elevator_ding.mp3` | Aufzug-Gong | ding |
| `husky_bark.mp3` | Husky bellt | bark |
| `music_end.mp3` | Schlussmusik / Übergabe | music |
| `music_intro.mp3` | Musik Kapitel 1 | music |
| `music_letter.mp3` | Musik/Drone beim Lesen des Briefs | drone |
| `music_mission.mp3` | Musik zum Auftrag (8. Stock) | drone |
| `music_relief.mp3` | Erleichterung (Rebecca) | music |
| `music_tension.mp3` | Spannung: Verstecken in der Küche | tension |

Weitere Geräusche (Türen, Tippen, Papier, Kaffee …) sind bisher nur synthetisch.
Wenn du ihnen in `public/timeline/story.json` ein `"file"` gibst, werden sie ebenfalls ersetzt.

Lautstärke pro Eintrag: `volume` (0–1). Gruppen über `bus`: `music`, `ambience`, `sfx`, `voice`.
Für gesprochene Dialoge kannst du später `sound`-Einträge mit `bus: "voice"` zu den Untertiteln anlegen.
