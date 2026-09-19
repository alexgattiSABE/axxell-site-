# Robot cap. 05 — aspetto identico allo Spline, logo sul petto, solo head tracking

**Data:** 2026-09-19 · **Ramo:** `robot-look-spline` (locale, da `origin/robot-cervello-vesper` @ `c9cdca8`, **nessun push**)
**Riprende:** `specs/2026-08-31-robot-cervello-vesper-design.md` (T1–T7 fatti) e `robot-brief-completo.md`.
**Revisione:** rev. 2 dopo review indipendente (19 punti, tutti verificati sul codice e accolti salvo §9).

## 1. Perché

Il robot di agosto ha la **forma** dello Spline (GLB estratto) ma non il suo **aspetto**: materiali rifatti a
mano, luce emisferica + direzionale, e sopra lo stage un filtro CSS (`brightness(1.28)`), un velo scuro in
basso e `mix-blend-mode:lighten`. A schermo legge grigio-azzurro opaco, luce forte dall'alto, testa tagliata.
Confronto: `~/Progetti/file-sciolti/robot-confronto/1-spline-originale.png` (Spline) vs `2-robot-attuale.png`.

Il 2026-09-19 la scena Spline è stata letta dal vivo (`@splinetool/viewer@1.9.82`, scena
`https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode`, Playwright): i materiali sono 3 `NodeMaterial`
a strati, tutti leggibili (parametri, texture, video, GLSL compilato). Si possono rifare fedelmente.

## 2. Decisioni di Nike (2026-09-19)

1. **Aspetto identico allo Spline**: materiali, colori, riflessi, occhi a LED, luce scura.
2. **Stessa distanza/inquadratura dello Spline, testa intera visibile.**
3. **Via le scritte ai lati**, per ora: `.wc-robot-title` e tutto `.wc-robot-copy`.
4. **Logo sul petto**: la «A» con l'anello (`logo-axxell-icon.svg`), **bianco lucido**, con il **riflesso
   che si sposta seguendo il mouse**.
5. **Cervello visibile SOLO quando il cursore è sulla testa.**
6. **Occhi a LED**: si **spengono in dissolvenza** quando appare il cervello, tornano quando il cursore esce.
7. **Niente levitazione, niente trascinamento.** Unica interazione del corpo: **la testa segue il cursore**.
8. **Strada B**: niente runtime Spline in pagina; si ricopiano materiali, texture, video, luce e camera nella
   nostra scena three.js. (Runtime Spline + oggetti iniettati: già provato da Alex, scartato.)
9. **Telefoni**: fuori scope.

Derivata dal brief originale («ogni volta che col cursore passo su quelle zone devono comparire quegli
elementi»): **a riposo le fibre delle braccia sono spente**; si accendono solo al passaggio del cursore
sul braccio (oggi hanno una luminosità di base `uBaseline 0.16`, `robot-fibers.js:171,183`).

## 3. Fuori scope

- Mobile/touch. FASE 2 del piano di agosto tranne il logo (pancia SABE, corde vocali, etichette, zoom, pannelli).
- Circuito di sfondo (`data-cursor-fx="circuit"`): resta; cambia solo come si compone con lo stage (§5.6).
- Ombre portate: **non si implementano** in questa passata. Gli shader Spline sono compilati con shadow map,
  ma con l'unica luce dietro al robot (z −393) l'effetto atteso è minimo; si verifica sulle coppie (§6) e si
  riapre solo se la differenza si vede.
- TAA: non si replica (usiamo MSAA). Differenze residue di bordo accettate se Nike non le vede.
- Merge su `main` / home: solo con autorizzazione esplicita di Nike.

## 4. Cosa c'è nella scena Spline

**Camera:** `fov 45` (verticale), `zoom 2`, posizione `(0, 146.98, 1000)`, rotazione ≈ `(0.007, 0, 0)`,
`near 70`, `far 100000`. In three: `PerspectiveCamera(45)` con `.zoom = 2` dà la stessa inquadratura
(verificato in review: a 1440×900 cima testa ≈120 px e larghezza testa ≈138 px, screenshot Spline ≈125/137).
**Luce:** una `PointLight` bianca, intensità 5, in `(-595, 579, -393)` (dietro-sinistra-alto) + ambient
+ light probe. **Renderer:** nessun tone mapping, output lineare (`LinearToLinear`), texture campionate
grezze (nessuna decodifica sRGB), sfondo trasparente, AO disattivato (`aoEnabled=false`).
**Mesh:** 80, nello **stesso ordine** del nostro GLB (68 nomi coincidono per indice, le 12 senza nome stanno
agli stessi indici) e nelle **stesse coordinate** della scena Spline. Materiali: `Parts` 69, `Body` 10, `Head` 1.

**Strati, in ordine di composizione (dal primo, la base, all'ultimo)** — blend: 0 normale, 1 multiply,
2 screen, 3 overlay. Uno strato «luce» illumina il risultato di **tutti gli strati precedenti**.

| Materiale | Strati in ordine di composizione |
|---|---|
| **Head** (visore, 1 mesh) | colore `#000000` · **video** planare asse z (repeat 2×2.5, offset 0/−0.19, crop) = occhi · luce Blinn-Phong (specular 0.2, shininess 5, **nessun bump nel compilato**) blend **overlay** · matcap `CHROME.png` α0.6 **screen** · rainbow α0.5 **overlay** |
| **Body** (10 mesh: petto, anello del collo, spalle, avambracci, fianchi, stinchi) | colore 0.3079 · texture `image_0` α0 (serve solo come bump, non è visibile) · matcap `matcap_roughness_3` α0.4 **screen** · luce Blinn-Phong (bump −0.5) **overlay** · rainbow α0.2 **screen** |
| **Parts** (69 mesh) | colore 0.0099 · rainbow **overlay** · matcap `matcap_roughness_3` **screen** · texture α0 (solo bump/roughness) · luce **fisica** (roughness 1, metalness 1, reflectivity 1.5, roughnessMap + bumpMap) α0.5 blend **normale** |

«Rainbow» è la funzione a coseno di Spline (non un film sottile fisico); «movement» è una fase fissa, non una
velocità. Video occhi: MP4 2886×1628, 6,3 s in loop, 470 KB.

## 5. Architettura

Tutto in `website-creation/`. A runtime **nessuna richiesta a Spline**; three r128 resta da cdnjs come oggi
(`index.html:560`), tutto il resto locale.

### 5.1 Estrazione (strumento di sviluppo, FUORI dal repo)
Lo script Playwright di estrazione e il GLSL compilato di Spline restano **fuori dal repo**
(`~/Progetti/file-sciolti/robot-spline-tools/`): il repo è pubblico e servito così com'è, e la scena non cambia.
Nel repo entra **solo l'output**, in `website-creation/assets/robot-spline/`:
- `robot-spline-data.js` — file JS generato (`WC.robotSplineData = {…}`, niente fetch/async): per i 3 materiali
  strati, blend, alpha, parametri numerici; la **matrice UV `mat3`** degli strati planari; camera
  (`fov`, `zoom`, posizione, rotazione, `projectionMatrix`, `matrixWorld`); point light (colore, intensità,
  posizione, **distance, decay**); **ambientLightColor e lightProbe con i valori numerici**; flag ombre per mesh
  (documentazione); per ognuna delle 80 mesh: indice, nome, materiale. Lo script **asserisce** che ogni
  campo sia un numero/vettore reale (nessun `"object"`/`"array[3]"` segnaposto) e che nomi e indici
  coincidano col GLB.
- texture come file: `CHROME.png`, `matcap_roughness_3.png`, bump/roughness map.
- `eyes.mp4` **ridotto a 512 px di larghezza** (H.264, muto), **senza ritaglio**: così la matrice UV estratta
  resta valida così com'è + `eyes-poster.png` (un fotogramma, per il ripiego).
- `logo-axxell-icon.svg` (copiato nel repo).

### 5.2 Materiali — `js/robot-spline-materials.js` (sostituisce `robot-materials.js`)
- Un costruttore per materiale (`head`, `body`, `parts`) → `THREE.ShaderMaterial` **scritto da noi**, che
  compone gli strati nell'ordine e coi blend della tabella §4. Formule riscritte (blend standard, matcap da
  normale di vista, proiezione planare in coordinate oggetto con la `mat3` estratta, Blinn-Phong e luce fisica
  con una point light non fisica — il colore uniform include già il fattore ×π — più ambient e light probe,
  rainbow a coseno). Il GLSL di Spline serve solo a controllarle, non si incolla.
- **Colore grezzo come Spline**: uniform coi valori estratti così come sono (es. 0.3079), texture senza
  decodifica, shader **senza** `encodings_fragment`. In r128 uno ShaderMaterial ignora `outputEncoding`: il
  robot non dipende da quella impostazione, e cervello/fibre (anch'essi senza encoding) non cambiano per
  questo motivo.
- WebGL1: `extensions: { derivatives: true, shaderTextureLOD: true }` dove servono dFdx/fwidth/textureLod.
- Assegnazione: per **indice di mesh**, con asserzione del nome (i nomi del GLTFLoader r128 possono essere
  ripuliti/deduplicati, es. `Cube_3_1`: l'asserzione confronta il nome normalizzato).

### 5.3 Testa: occhi, reveal, cervello
- **Occhi**: `THREE.VideoTexture` di `eyes.mp4` (muted, loop, playsinline), proiezione planare in coordinate
  della mesh visore → ruotano con la testa. Play quando la sezione è in vista, pausa quando esce; autoplay
  negato → poster statico.
- **Reveal**: raycast del cursore sulle mesh del cluster testa (come oggi) → `hoverHead` smorzato 0..1 →
  `uReveal` del materiale `head`. A 0 il visore è identico allo Spline. Salendo: visore trasparente, **occhi
  che sfumano a 0 insieme**, cervello che si accende.
- **Mesh `Parts` dentro il volume del visore** (es. il `Cylinder` interno, y 209–260 dentro il visore
  y 222–304): oggi spariscono perché tutto il cluster testa prende il vetro. Ora hanno il loro materiale
  `Parts`: **sfumano con il reveal** (stesso `uReveal`, alpha → 0, `depthWrite` spento durante il reveal)
  così non coprono il cervello. Le mesh `Parts`/`Body` del collo **fuori** dal visore restano opache.
  L'elenco delle mesh interne si calcola una volta per contenimento nel bbox del visore e si stampa in
  console in debug per controllo.
- **Cervello** (`WC.pointBrain`, invariato): si accende col reveal; `points.visible = hoverHead > 0.01`, così
  a riposo **nessun punto** viene disegnato (lo smorzamento esponenziale non arriva mai a 0 esatto).
- Draw order: cervello, poi interni che sfumano, poi visore (`renderOrder`).

### 5.4 Logo sul petto
- Solo sulla mesh petto (nodo `Body`, indice verificato dallo script): **istanza di materiale separata**
  (stessi strati `Body` + strato logo); le altre 9 mesh `Body` usano l'istanza senza logo.
- Il logo è una maschera (SVG rasterizzato su canvas 2048 px, bianco su trasparente) proiettata in piano
  sul petto in coordinate oggetto; posizione e larghezza in un `CONFIG` in cima al file (si tarano con Nike).
- Strato logo **per ultimo**, sopra overlay/screen, così il bianco non viene tinto: base bianca + riflesso
  speculare stretto da una **luce virtuale** che segue il puntatore (`uLogoLight`, smorzata). Cursore fuori
  dalla sezione → posa di riposo.

### 5.5 Camera, luce, inquadratura — `js/robot.js`
- Camera e luce da `robotSplineData`: `PerspectiveCamera(45)`, `.zoom = 2`, stessa posizione/rotazione,
  near/far; point light (colore, intensità, posizione, distance, decay) + ambient + light probe nelle uniform.
  Via `HemisphereLight` e `DirectionalLight`.
- **Niente ricentratura** del modello (il GLB è già in coordinate Spline).
- **Regola d'inquadratura**: FOV verticale fisso → a ogni dimensione dello stage l'altezza del robot è la
  stessa frazione dell'altezza, **la testa resta sempre intera**. A 1440×900 coincide con Spline. Se a
  1280×720 la cima della testa finisce sotto la barra di navigazione (72 px), si abbassa il bersaglio della
  camera del minimo necessario (valore in `CONFIG`, documentato).
- **Rimossi**: levitazione (`bobAmount`, `wrap.position.y`) e drag-to-rotate (listener
  `pointerdown/move/up`, `dragVel`, ritorno a fronte).
- **Resta**: testa che segue il cursore. Il puntatore si calcola sulla **sezione** (non più su uno stage
  largo 2,2×): stessi clamp (yaw ±0.5, pitch ±0.3), guadagno ritarato perché lo spostamento della testa per
  lo stesso gesto resti quello di oggi.
- `robot-parts.js`: la soglia braccia `armXThreshold` va calcolata **rispetto al centro X del bbox** (−2.9),
  non a 0 — senza ricentratura una mesh passerebbe da corpo a braccio sinistro e una da braccio destro a corpo.
  Test: conteggi 18 testa / 13+13 braccia / 36 corpo invariati.

### 5.6 HTML/CSS
- `index.html`: via `.wc-robot-title` e `.wc-robot-copy` (restano nella storia git); script
  `robot-spline-data.js` + `robot-spline-materials.js` al posto di `robot-materials.js`.
- `css/sections.css`: su `.wc-robot-stage` via `filter:brightness(1.28) contrast(1.03)` e
  `mix-blend-mode:lighten`, `inset:0` al posto di `inset:0 -60%`; via il velo `.wc-robot-card::after`.
  Il circuito resta dietro per **trasparenza reale** del canvas (`alpha:true`, clear a 0): dove c'è il robot
  il robot copre, attorno si vede il circuito. Da verificare a schermo che il circuito non passi davanti.

### 5.7 Pulizia
Eliminati `robot-materials.js` e le sue texture procedurali. Il teardown smaltisce matcap, bump/roughness,
video (pausa + rimozione `<video>` + dispose della texture), maschera logo.

## 6. Verifica

Harness Playwright (Chromium, 1440×900, DPR 1). Riferimento Spline: pagina «solo» con `spline-viewer`
(il Chromium di Playwright su questo Mac decodifica l'mp4 degli occhi: verificato il 2026-09-19;
ripiego `channel:'chrome'` se su un'altra macchina gli occhi non comparissero). Robot a riposo, cursore fuori.
1. **Inquadratura**: maschere della silhouette Spline vs nostra: **IoU ≥ 0.97**; cima della testa entro ±4 px.
   Ripetuto a 1280×720: testa intera, sotto la barra di navigazione.
2. **Aspetto**: ritagli testa / petto (senza logo, flag debug) / braccio / gambe affiancati + differenza media
   per pixel nel riquadro del robot, riportata a ogni ritocco. **Chiusura: Nike, guardando le coppie, non vede
   differenze.**
3. **Occhi**: video che scorre; 3 pose della testa → occhi fermi sul visore, niente sfarfallio dei puntini.
4. **Reveal**: cursore sulla testa → visore trasparente, occhi spenti, cervello intero visibile, nessun
   cilindro interno davanti. Cursore fuori → visore Spline, occhi accesi, `brain.points.visible === false`.
5. **Logo**: 3 posizioni del mouse → il riflesso si sposta; solo sul petto, nessuna altra mesh stampata.
6. **Fibre**: spente a riposo; accese sul braccio sotto il cursore.
7. **Rimozioni**: nessun movimento del corpo in 5 s senza input; un trascinamento non ruota il robot.
8. Console senza errori; dalla pagina nessuna richiesta verso `spline.design`/`unpkg`.

## 7. Rischi

- **Licenza degli asset**: modello, texture e video degli occhi vengono da una scena demo della community
  Spline. Il caveat esisteva già per la geometria e ora si allarga. **Da chiarire prima di andare online.**
  Per non allargarlo ancora: script di estrazione e GLSL Spline fuori dal repo (§5.1).
- **Differenze residue** (TAA, versione three, ombre non fatte): si giudicano sulle coppie.
- **Autoplay video** negato → poster statico.
- **Cervello/fibre** cambiano resa perché spariscono filtro `brightness(1.28)` e `lighten` (non per la
  pipeline colore): riverifica, e se serve si compensa nei **loro** materiali.

## 8. Lavoro e consegna

Ramo locale `robot-look-spline` in `~/Progetti/axxell-site-robot` (worktree di `~/Progetti/axxell-site`).
Commit locali, **nessun push** su `alexgattiSABE/axxell-site-` (repo pubblico di Alex) senza ok esplicito
di Nike che sappia su quale account e repo. Anteprima: server statico sul ramo, `#cap05`.

## 9. Punti della review non accolti

Nessuno respinto. Due precisati: le ombre sono escluse con verifica (§3), non implementate; il riferimento
Spline per gli occhi funziona già col Chromium di Playwright su questo Mac (§6).
