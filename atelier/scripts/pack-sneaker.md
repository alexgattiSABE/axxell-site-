# assets/sneaker.* — come sono stati ricavati

Sorgente: `Effetti webiste/sneaker/sneaker/sneaker.mp4` (master GetLayers, senza
watermark) + `sneaker.jpg` come poster.

Il master misurato con ffprobe: **2892×2160, h264, 30 fps, 14,14 s, 42,35 MB a
23,96 Mbps**, con una traccia audio AAC. Spedirlo così avrebbe voluto dire
mettere in fondo alla pagina un file più pesante di tutto il resto messo
insieme.

ffmpeg installato con `winget install --id Gyan.FFmpeg -e` (versione 9.0). Nota:
winget modifica il PATH, ma i processi gia' aperti si portano dietro quello
vecchio — o si riapre il terminale, o si usa il percorso pieno dell'eseguibile.

    # H.264 / MP4 — la riserva, la legge qualunque cosa
    ffmpeg -i sneaker.mp4 -an -vf "scale=-2:1080" \
      -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p \
      -movflags +faststart assets/sneaker.mp4

    # VP9 / WebM — quello che prendono i browser moderni, a parita' di qualita'
    ffmpeg -i sneaker.mp4 -an -vf "scale=-2:1080" \
      -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
      assets/sneaker.webm

    # poster
    ffmpeg -i sneaker.jpg -vf "scale=-2:1080" -c:v libwebp -quality 76 \
      assets/sneaker-poster.webp

Risultato: 1446×1080, **1,59 MB** contro 42,35 (−96%), piu' 83 KB di poster.

## Due scelte, non due dimenticanze

**`-an`, l'audio tolto a monte.** Uno sfondo in loop non ha niente da far
sentire, e un video con audio i browser non lo fanno partire da soli: l'autoplay
senza gesto dell'utente vuole il muto. Un `muted` sul tag sarebbe bastato a
farlo partire, ma quei chilobyte sarebbero comunque scesi lungo la rete di chi
guarda.

**`-movflags +faststart`.** Sposta l'indice del contenitore all'inizio del file.
Senza, il browser deve scaricare fino in fondo prima di poter mostrare il primo
fotogramma — su un video di sfondo si vedrebbe come un buco nero che dura
quanto il download.
