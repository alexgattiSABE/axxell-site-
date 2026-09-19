# Robot cap. 05 — aspetto identico allo Spline, logo sul petto, solo head tracking

**Data:** 2026-09-19 · **Ramo:** `robot-look-spline` (locale, creato da `origin/robot-cervello-vesper` @ `c9cdca8`, **nessun push**)
**Riprende:** `specs/2026-08-31-robot-cervello-vesper-design.md` (T1–T7 fatti) e `robot-brief-completo.md`.

## 1. Perché

Il robot di agosto ha la **forma** dello Spline (GLB estratto) ma non il suo **aspetto**: i materiali
furono rifatti a mano (carbonio procedurale, visore con envMap finta, luce emisferica + direzionale) e a
schermo il robot legge grigio-azzurro opaco, con luce forte dall'alto e la testa tagliata in cima.
Confronto a schermo: `~/Progetti/file-sciolti/robot-confronto/1-spline-originale.png` (Spline) vs
`2-robot-attuale.png` (nostro).

Il 2026-09-19 abbiamo letto la scena Spline dal vivo (runtime `@splinetool/viewer@1.9.82`, scena
`https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode`, Playwright): i materiali **non sono
opachi** come si credeva ad agosto. Sono 3 `NodeMaterial` a strati, tutti leggibili (parametri, texture,
video, GLSL compilato). Quindi si possono rifare **fedelmente**.

## 2. Decisioni di Nike (2026-09-19)

1. **Aspetto identico allo Spline**: materiali, colori, riflessi, occhi a LED, luce scura.
2. **Stessa distanza/inquadratura dello Spline, testa intera visibile.**
3. **Via le scritte ai lati** del robot, per ora: `.wc-robot-title` («Analizza l'anatomia di Axxell») e
   tutto `.wc-robot-copy` (eyebrow, h2 «Non un video…», lead, nota).
4. **Logo sul petto**: la «A» con l'anello (`logo-axxell-icon.svg`, bianca su trasparente),
   **bianco lucido**, con il **riflesso che si sposta seguendo il mouse**.
5. **Cervello visibile SOLO quando il cursore è sulla testa.** Mai in altri momenti.
6. **Occhi a LED**: quando appare il cervello si **spengono in dissolvenza**; tornano quando il cursore esce.
7. **Niente levitazione, niente trascinamento.** L'unica interazione del corpo è la **testa che segue il cursore**.
8. **Strada B**: niente runtime Spline in pagina. Il robot resta la nostra scena three.js; si
   ricopiano da Spline materiali, texture, video, luce e camera. (La strada «runtime Spline + oggetti
   iniettati» l'aveva già provata Alex: scartata.)
9. **Telefoni**: fuori scope, si progettano a parte.

## 3. Fuori scope

- Mobile/touch (punto 9). Resta il comportamento attuale: nessuna garanzia di resa.
- FASE 2 del piano di agosto tranne il logo: pancia SABE (T9), corde vocali (T10), etichette (T11),
  zoom al click (T12), pannelli prodotto (T13).
- Fibre delle braccia e circuito di sfondo (`data-cursor-fx="circuit"`): **restano come sono**, non si
  ritoccano qui (vanno solo riverificate a schermo col nuovo aspetto).
- Merge su `main` / messa in home: solo con autorizzazione esplicita di Nike (vincolo del brief).

## 4. Cosa c'è nella scena Spline (letto il 2026-09-19)

**Camera:** `fov 45`, `zoom 2`, posizione `(0, 146.98, 1000)`, rotazione ≈ `(0.007, 0, 0)`, `near 70`, `far 100000`.
**Luce:** una sola `PointLight` bianca, intensità 5, in `(-595, 579, -393)`, con ombre; più `ambientLightColor`.
**Renderer:** `toneMapping` nessuno, `outputEncoding` lineare (3000), sfondo trasparente, TAA.
**Mesh:** 80. Materiali: `Parts` su 69 mesh, `Body` su 10, `Head` su 1 (il visore).

**Strati per materiale** (dall'alto in basso; blend: 0 normale, 1 multiply, 2 screen, 3 overlay):

| Materiale | Strati |
|---|---|
| **Head** (visore) | colore `#000000` · **video** planare asse z (repeat 2×2.5, offset 0/−0.19, crop) = occhi a LED · luce Blinn-Phong (specular 0.2, shininess 5, bump) in **overlay** · matcap `CHROME.png` α0.6 in **screen** · iridescenza (film 5, movimento 3) α0.5 in **overlay** |
| **Body** (petto) | colore grigio 0.308 · texture `image_0` planare/triplanare repeat 10×10 (trama carbonio) · matcap `matcap_roughness_3` α0.4 **screen** · luce Blinn-Phong (bump −0.5) **overlay** · iridescenza (film 7, mov. 4) α0.2 **screen** |
| **Parts** (giunti, arti, collo…) | colore quasi nero 0.0099 · iridescenza (film 10) **overlay** · matcap `matcap_roughness_3` **screen** · texture (α0) · luce **fisica** (roughness 1, metalness 1, reflectivity 1.5, roughnessMap+bumpMap) α0.5 |

Video occhi: MP4 2886×1628, 6,3 s in loop, 470 KB (due ovali di LED a puntini che pulsano). Il
GLSL compilato dei tre materiali è stato salvato per riferimento.

## 5. Architettura

Tutto dentro `website-creation/`. Nessuna richiesta a Spline o CDN a runtime (come oggi).

### 5.1 Estrazione (strumento di sviluppo, non caricato dal sito)
`scripts/spline-estrai.mjs` (Playwright): apre la scena Spline e salva in
`website-creation/assets/robot-spline/`:
- `materials.json` — per ognuno dei 3 materiali: strati, blend mode, alpha, parametri, valori delle uniform;
- `mesh-materials.json` — per ogni mesh Spline: nome, posizione mondo, materiale (`Head`/`Body`/`Parts`);
- `scene.json` — camera (anche `projectionMatrix`/`matrixWorld`), luce, ambient, renderer;
- texture come file (`CHROME.png`, `matcap_roughness_3.png`, `image_0.png`, bump/roughness map) ed
  `eyes.mp4`, più `eyes-poster.webp` (un fotogramma, per il ripiego);
- il GLSL compilato **solo come riferimento** in `scripts/spline-ref/` (non caricato, non copiato nel sito).

Si rilancia a mano se la scena cambia; l'output è committato.

### 5.2 Materiali — `js/robot-spline-materials.js` (sostituisce `robot-materials.js`)
- Un costruttore per materiale (`head`, `body`, `parts`) → `THREE.ShaderMaterial` scritto da noi, che
  compone gli strati **nello stesso ordine e con gli stessi blend** di Spline. Le formule (blend mode
  standard, matcap da normale di vista, proiezione planare in coordinate oggetto, Blinn-Phong / luce
  fisica con una point light, iridescenza a film sottile) si **riscrivono**; il GLSL di Spline serve
  solo a controllarle, non si incolla.
- Parametri e texture letti da `assets/robot-spline/*` (niente numeri magici nel codice).
- Pipeline colore uguale a Spline: output lineare, nessun tone mapping. Il point-brain e le fibre
  vanno riverificati a schermo sotto questa pipeline (se cambiano resa, si compensa nei loro
  materiali, non si cambia la pipeline del robot).
- Assegnazione per mesh: da `mesh-materials.json`, abbinando per nome + posizione le 80 mesh del GLB.
  Il visore (`Head`) è **una sola mesh**: il resto del cluster testa (anelli del collo ecc.) è `Parts`.

### 5.3 Testa: occhi, reveal, cervello
- **Occhi**: `THREE.VideoTexture` di `eyes.mp4` (muted, loop, playsinline), proiezione planare
  in coordinate della mesh → gli occhi **ruotano con la testa**, non scivolano. Il video parte quando
  la sezione è in vista e si mette in pausa quando esce. Se l'autoplay è negato: poster statico.
- **Reveal** (invariato nella logica di agosto): raycast del cursore sulle mesh testa → `hoverHead`
  smorzato 0..1 → uniform `uReveal` del materiale `head`. A `uReveal=0` il visore è **identico allo
  Spline** (opaco). Salendo: il visore diventa trasparente e **gli occhi sfumano a 0** insieme;
  il cervello (`WC.pointBrain`, invariato) si accende con lo stesso segnale. A `uReveal=0` il
  cervello è **spento e invisibile** (nessun punto disegnato).
- Draw order come oggi: visore trasparente dopo il cervello (`renderOrder`).

### 5.4 Logo sul petto
- Solo sulla mesh `Body` (il petto). Il logo è una **maschera** (SVG rasterizzato su canvas ad alta
  risoluzione, bianco su trasparente) proiettata in piano sul petto in coordinate oggetto, centrata
  in alto sul petto; posizione e larghezza in un `CONFIG` in cima al file (si tarano con Nike a schermo).
- Dentro la maschera: **bianco lucido** — base bianca + riflesso speculare stretto da una **luce
  virtuale** la cui posizione segue il puntatore (uniform `uLogoLight`, smorzata). Muovi il mouse →
  il riflesso scorre sulla «A». Cursore fuori dalla sezione → la luce torna a una posa di riposo.
- Fuori dalla maschera il petto resta identico allo Spline.

### 5.5 Camera, luce, inquadratura — `js/robot.js`
- Camera e luce da `scene.json`: stessa posizione, fov, zoom e near/far di Spline; point light con
  stessi colore/intensità/posizione e stesso ambient. Via `HemisphereLight` e `DirectionalLight`.
- **Niente ricentratura** del modello: il GLB sta nelle coordinate della scena Spline (da verificare
  confrontando le posizioni in `mesh-materials.json`; se il GLB fosse stato spostato si applica
  l'offset misurato, non un bbox-center).
- L'aspect del canvas segue lo stage; a parità di viewport (1440×900) l'inquadratura deve coincidere
  con quella Spline, testa intera visibile.
- **Rimossi**: levitazione (`bobAmount`, `wrap.position.y`), drag-to-rotate (listener
  `pointerdown/move/up`, `dragVel`, ritorno a fronte). **Resta**: testa che segue il cursore (clamp
  e smorzamento attuali), reveal testa, surge delle fibre.

### 5.6 HTML/CSS — `index.html`
- Via `.wc-robot-title` e `.wc-robot-copy` dal DOM (restano nella storia git). CSS relativo ripulito.
- Script: `robot-spline-materials.js` al posto di `robot-materials.js`.

### 5.7 Pulizia
`robot-materials.js` e le sue texture procedurali (carbonio esagonale, envMap canvas) si eliminano;
il teardown di `robot.js` smaltisce le nuove texture (matcap, carbonio, video + pausa/rimozione del
`<video>`, maschera logo).

## 6. Verifica

Harness Playwright (headless Chromium, viewport 1440×900, stessa DPR) che produce **coppie affiancate**
Spline (pagina «solo» con `spline-viewer`) vs nostra scena, robot a riposo, cursore fuori:
1. **Inquadratura**: silhouette sovrapposte (differenza del contorno ≤ pochi pixel), testa intera visibile.
2. **Aspetto**: ritagli testa / petto / braccio / gambe affiancati. Guida numerica: differenza media
   per pixel nel riquadro del robot, da far scendere a ogni ritocco. **Criterio di chiusura: Nike,
   guardando le coppie, non vede differenze.**
3. **Occhi**: video che scorre, occhi fermi sul visore mentre la testa gira (sequenza di 3 pose).
4. **Reveal**: cursore sulla testa → visore trasparente, occhi spenti, cervello visibile; cursore fuori
   → visore Spline, occhi accesi, **nessun punto del cervello a schermo** (controllo per pixel).
5. **Logo**: 3 posizioni del mouse → il riflesso si sposta.
6. **Rimozioni**: nessun movimento del corpo in 5 s senza input; un drag non ruota il robot.
7. Console senza errori; nessuna richiesta di rete verso `spline.design`/`unpkg` dalla pagina del sito.

## 7. Rischi

- **Licenza degli asset.** Modello, texture (matcap, carbonio) e video degli occhi vengono da una
  scena demo della community Spline, non nostra. Il caveat esisteva già per la geometria (spec di
  agosto) e ora si allarga. **Da chiarire prima di andare online** (vedi le questioni legali aperte).
- **Differenze residue** non eliminabili: Spline usa TAA e un'altra versione di three.js; noi r128 con
  MSAA. Bordi e rumore potranno differire di poco: si giudica sulle coppie a schermo.
- **Video in autoplay**: bloccato da alcuni browser o dal risparmio energetico → poster statico.
- **Pipeline colore lineare**: può alterare cervello/fibre tarati sotto sRGB → riverifica (§5.2).

## 8. Lavoro e consegna

Ramo locale `robot-look-spline` in `~/Progetti/axxell-site-robot` (worktree di `~/Progetti/axxell-site`).
Commit locali, **nessun push** su `alexgattiSABE/axxell-site-` (repo pubblico di Alex) senza ok
esplicito di Nike che sappia su quale account e repo. Anteprima: server statico sul ramo, `#cap05`.
