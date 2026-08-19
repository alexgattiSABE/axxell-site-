# assets/festina.mp4 — ricompressione per lo scrub

Sorgente: `festina.mp4` fornito dall'utente — 1280×720, 24 fps, 241 fotogrammi,
10,04 s, 5,1 MB, **con traccia audio**.

Il capitolo non riproduce niente: mette `currentTime` dove dice lo scroll. Un
video pensato per la riproduzione è il file sbagliato per farlo, per due motivi.

**I keyframe.** Il master ne ha uno ogni ~4 secondi. Per mostrare un istante
qualsiasi il decoder riparte dall'ultimo keyframe e decodifica tutto quello che
c'è in mezzo — in scrub si vede: l'immagine si aggancia a scatti. Qui il
keyframe è **ogni 6 fotogrammi**, cioè al massimo cinque da decodificare per
salto.

**L'audio.** Non si sente mai, e sono chilobyte che scendono lo stesso.

```bash
ffmpeg -i festina.mp4 -an -vf "scale=1280:720" \
  -c:v libx264 -crf 27 -preset slow \
  -g 6 -keyint_min 6 -sc_threshold 0 \
  -pix_fmt yuv420p -movflags +faststart assets/festina.mp4

# poster: primo fotogramma, è quello che si vede prima del caricamento
ffmpeg -i festina.mp4 -frames:v 1 -vf "scale=1280:720" -q:v 6 /tmp/p.jpg
cwebp -q 80 /tmp/p.jpg -o assets/festina-poster.webp
```

Risultato: **2,2 MB** (−57%) + 29 KB di poster.

## Perché CRF 27 a 1280 e non le altre due strade provate

| variante | peso | SSIM vs master |
|---|---|---|
| 1280, CRF 25, g=6 | 2,7 MB | 0,9937 |
| **1280, CRF 27, g=6** | **2,2 MB** | **0,9921** |
| 1152, CRF 26, g=6 | 2,0 MB | 0,9879 |
| 1280, CRF 27, g=1 (all-intra) | 4,1 MB | — |
| 1280, VP9 CRF 34 | 3,4 MB | — |

Fra la prima e la seconda la differenza non si vede; fra la seconda e la terza
sì, sugli ingranaggi — ed è l'unica cosa che questo filmato ha da mostrare. Il
webm non c'è di proposito: VP9 qui esce **più pesante** dell'h264 e non aggiunge
nessuna compatibilità (l'mp4 lo legge chiunque). L'all-intra dà il seek perfetto
ma raddoppia il peso: con un keyframe ogni 6 fotogrammi la differenza in scrub
non si percepisce.

## Se il filmato cambia

Le frasi sono agganciate a rettangoli misurati sul contenuto. Non si spostano a
mano: si rilancia `scripts/festina-spazi.py` (l'intestazione dice come) e si
riportano finestre e rettangoli in `js/festina.js` e `css/sections.css`.
