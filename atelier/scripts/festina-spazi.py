#!/usr/bin/env python3
"""Dove si possono mettere le parole sopra `assets/festina.mp4`.

Le quattro frasi del capitolo Festina non sono posizionate a occhio: stanno nei
rettangoli che restano BIANCHI per tutta la finestra in cui sono a schermo.
Questo script è il modo in cui quei rettangoli sono stati trovati, ed è il modo
in cui vanno ritrovati se un giorno il filmato cambia. I numeri che stampa
vanno riportati in due posti, che devono restare d'accordo:

  - le finestre (secondi)   → `WIN` in `js/festina.js`
  - i rettangoli (frazioni) → `.wc-festina-say[data-say="n"]` in `css/sections.css`

COME DECIDE COSA È OCCUPATO
Lo sfondo non è bianco pieno: è una parete da studio con un gradiente e una
vignettatura agli angoli, e sui bordi scende fino a ~180 di luminanza. Una
soglia assoluta segnerebbe come "oggetto" mezza cornice. Qui invece lo sfondo
si stima localmente (sfocatura a scatola di raggio 12 celle) e si segna come
occupato ciò che è più scuro del proprio intorno di 16 livelli — più tutto ciò
che è francamente scuro sotto 150, per non perdere i pezzi metallici su fondo
già grigio. Poi si dilata di 2 celle: è il margine di rispetto fra una parola e
un ingranaggio.

RISULTATO NOTO (filmato attuale, 241 fotogrammi a 24 fps)
Fra 3,05 s e 7,80 s — l'esplosione — non esiste nessun rettangolo utile: il più
grande vale l'1-3% dell'inquadratura. È il motivo per cui in quel tratto il
capitolo non dice niente.

USO
    ffmpeg -v error -i assets/festina.mp4 -vf "scale=128:72,format=gray" \
           -f rawvideo -pix_fmt gray gray.raw
    python3 scripts/festina-spazi.py gray.raw
"""
import sys
import numpy as np

W, H, FPS = 128, 72, 24
RAW = sys.argv[1] if len(sys.argv) > 1 else 'gray.raw'

v = np.fromfile(RAW, dtype=np.uint8)
n = v.size // (H * W)
v = v[:n * H * W].reshape(n, H, W).astype(np.float32)


def boxblur(a, r):
    """Media a scatola separabile via somme cumulate: niente scipy."""
    p = np.pad(a, ((0, 0), (r, r), (r, r)), mode='edge')
    c = p.cumsum(axis=1)
    c = np.concatenate([np.zeros((n, 1, c.shape[2]), np.float32), c], axis=1)
    b = (c[:, 2 * r + 1:, :] - c[:, :-2 * r - 1, :]) / (2 * r + 1)
    c = b.cumsum(axis=2)
    c = np.concatenate([np.zeros((n, c.shape[1], 1), np.float32), c], axis=2)
    return (c[:, :, 2 * r + 1:] - c[:, :, :-2 * r - 1]) / (2 * r + 1)


occ = ((boxblur(v, 12) - v) > 16) | (v < 150)
for _ in range(2):                                   # dilatazione = margine
    o = occ.copy()
    o[:, 1:, :] |= occ[:, :-1, :]; o[:, :-1, :] |= occ[:, 1:, :]
    o[:, :, 1:] |= occ[:, :, :-1]; o[:, :, :-1] |= occ[:, :, 1:]
    occ = o


def rects(free, minw, minh):
    """Tutti i rettangoli liberi massimali (istogramma per righe)."""
    out, h = [], np.zeros(W, dtype=int)
    for y in range(H):
        h = np.where(free[y], h + 1, 0)
        stack = []
        for x in range(W + 1):
            cur = h[x] if x < W else 0
            start = x
            while stack and stack[-1][1] >= cur:
                sx, sh = stack.pop()
                if sh >= minh and (x - sx) >= minw:
                    out.append((sx, y - sh + 1, x - sx, sh))
                start = sx
            stack.append((start, cur))
    return out


def cerca(t0, t1, minw=.16, minh=.09, top=5):
    a, b = int(t0 * FPS), min(n, int(np.ceil(t1 * FPS)))
    rs = rects(~occ[a:b].any(axis=0), int(minw * W), int(minh * H))
    rs.sort(key=lambda r: -r[2] * r[3])
    print(f"--- [{t0:5.2f}-{t1:5.2f}s]" + ("" if rs else "  nessuno spazio utile"))
    for x, y, w, h in rs[:top]:
        print(f"    x{x/W:.2f} y{y/H:.2f} w{w/W:.2f} h{h/H:.2f}"
              f"   area {w*h/(W*H)*100:4.1f}%")


def verifica(nome, t0, t1, x, y, w, h):
    a, b = int(t0 * FPS), min(n, int(np.ceil(t1 * FPS)))
    m = occ[a:b, int(y * H):int(np.ceil((y + h) * H)),
                 int(x * W):int(np.ceil((x + w) * W))]
    sporchi = m.any(axis=(1, 2))
    if sporchi.any():
        primo = (a + int(np.where(sporchi)[0][0])) / FPS
        print(f"  ✗ {nome}: primo fotogramma sporco a {primo:.2f}s")
    else:
        print(f"  ✓ {nome}: libero su tutti i {b-a} fotogrammi")


if __name__ == '__main__':
    print(f"{n} fotogrammi, {n/FPS:.2f}s\n")
    print("SPAZIO LIBERO, finestra per finestra")
    for t in np.arange(0, n / FPS - 1, 1.0):
        cerca(t, t + 1.0, top=2)

    print("\nI QUATTRO RETTANGOLI IN PRODUZIONE")
    verifica('1 destra alta',    0.00,  1.80, .70, .26, .28, .40)
    verifica('2 sinistra str.',  1.90,  2.90, .01, .30, .15, .55)
    verifica('3 destra str.',    7.80,  8.95, .81, .02, .18, .58)
    verifica('4 sinistra bassa', 8.90, 10.04, .01, .45, .30, .50)
