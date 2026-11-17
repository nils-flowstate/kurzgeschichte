# Modelle (glTF/GLB)

Lege hier deine Modelle ab und trage sie in `public/timeline/story.json` ein. Eine Anleitung
steht in der Haupt-README unter „Eigene Modelle einsetzen“.

Vorgesehene Dateinamen (frei wählbar, nur Vorschlag):

| Figur/Objekt (ID in story.json) | Vorschlag |
| --- | --- |
| `protagonist` | `protagonist.glb` (männlich, dunkle Haare, sportlich, Jeans, weißes Hemd, Jackett) |
| `rebecca` | `rebecca.glb` |
| `robert` | `robert.glb` |
| `ceo` | `ceo.glb` |
| `woman_red_coat` | `woman_red_coat.glb` |
| `husky` | `husky.glb` |
| `man_black_suit` | `man_black_suit.glb` (schwarzer Anzug, Sonnenbrille) |
| `receptionist` | `receptionist.glb` |
| `black_sedan` | `black_sedan.glb` (Front in +Z, Räder am Boden) |
| Requisiten `letter`, `usb`, `phone`, `ceo_mug`, `water_glass`, `bucket`, `papers_stack` | `props/<id>.glb` |

Tipps:
- Maßstab: 1 Einheit = 1 Meter, Figur steht auf y = 0 und blickt nach +Z.
- Mixamo-Rigs funktionieren direkt: Knochennamen unter `bones` eintragen, Clip-Namen unter `animations`.
- Texturen eingebettet (GLB) und möglichst ≤ 2K, damit der M1 flüssig bleibt.
