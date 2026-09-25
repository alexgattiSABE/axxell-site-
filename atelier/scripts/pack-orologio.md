# assets/orologio/ — la sequenza di fotogrammi del capitolo orologio

Il capitolo **non usa un `<video>`**: usa una sequenza di immagini disegnate su
canvas, una per posizione di scroll. Il perché sta nell'intestazione di
`js/orologio.js` (in breve: cercare dentro un filmato dipende da come il server
manda il file, e senza richieste Range il capitolo resta fermo in silenzio).

## Sorgente

Filmato generato con Magnific, Seedance 2.0 Pro, 10 s, 1080p, 16:9, camera
bloccata. I due estremi sono immagini generate prima e **ricentrate al pixel**
con ffmpeg, così l'orologio sta esattamente al centro e le colonne laterali
restano libere per le frasi:

- fotogramma iniziale — orologio montato, vista frontale
- fotogramma finale — vista esplosa, sette strati in colonna

## Estrazione

```bash
mkdir -p /tmp/oro assets/orologio
ffmpeg -i sorgente.mp4 -vf \
  "fps=8,\
   crop=874:1080:523:0,\
   lutrgb=r='if(gt(val\,240)\,255\,val)':g='if(gt(val\,240)\,255\,val)':b='if(gt(val\,240)\,255\,val)',\
   scale=660:814:flags=lanczos" \
  -q:v 2 /tmp/oro/%03d.png

for f in /tmp/oro/*.png; do
  cwebp -q 72 -m 6 "$f" -o "assets/orologio/orologio-$(basename ${f%.png}).webp"
done
```

I tre passaggi del filtro, e perché ognuno c'è:

- **`crop=874:1080:523:0`** — l'inviluppo dell'oggetto su TUTTI i fotogrammi è
  x 30%–68%; il resto è fondo. Si ritaglia **simmetricamente rispetto al
  centro**, o il centraggio in `contain` del modulo smette di valere. Il bianco
  che si toglie lo rimette il CSS, che lo fa gratis.
  ⚠️ In verticale NON si ritaglia: il bracciale copre tutta l'altezza.
- **`lutrgb ... 240 → 255`** — il fondo del filmato è **248–254, non 255**. Su
  una sezione `#fff` si vedrebbe il rettangolo del canvas stampato sul bianco.
  Questo passaggio NON serve a risparmiare peso (misurato: 43,7 KB contro 43,6,
  cioè niente — il peso è tutto nel metallo, non nel fondo). Serve a far
  sparire il bordo.
- **`scale=660:814`** — a 660 px l'orologio esce a ~46% della larghezza su un
  viewport da 1600, cioè 1,11× di ingrandimento: appena sopra l'uno a uno.

## ⚠️ I DUE NUMERI CHE DEVONO COINCIDERE

`FRAMES` in `js/orologio.js` deve essere **il numero di file davvero presenti**
in `assets/orologio/`. Se è più alto, la fine della sezione chiede fotogrammi
che non esistono; se è più basso, l'ultimo tratto di smontaggio non si vede mai.

E il rapporto fra fotogrammi e altezza della sezione decide se lo scorrimento
sembra continuo o a scatti:

    svh per fotogramma = (altezza sezione − 100) ÷ FRAMES

Sotto ~2,5 svh per fotogramma il passaggio non si nota. Sopra ~4 si vede
saltare. L'altezza sta in `css/sections.css` (`.wc-orologio`).

**Valori attuali:** 80 fotogrammi, sezione 340svh → 240svh di corsa → **3,00
svh per fotogramma**.

## Peso

**Attuale: 2,8 MB per 80 fotogrammi** (~35 KB l'uno).

Il costo sta nel movimento a vista: gli ingranaggi sono la parte cara, e i
fotogrammi della seconda metà pesano il doppio dei primi. Chi misura su un
campione lo prenda **lungo tutto l'arco**, non solo all'inizio, o sottostima
del 40%.

Se sfora, nell'ordine: meno fotogrammi (è la leva che rende di più), poi la
larghezza, poi `-q`. Non si alza la qualità sperando che nessuno se ne accorga:
questa sezione è in fondo a una pagina che ha già cinque scene WebGL.
