# HANDOFF — Robot (home) & Effetti speciali (atelier)

> Passaggio di consegne per continuare il lavoro su un altro PC. Leggi questo **prima** di
> toccare codice, poi apri il piano/spec del pezzo su cui lavori. Repo: `github.com/alexgattiSABE/axxell-site-`.

## Dove sta cosa

Due lavori, **due branch separati** (non ancora mergiati in `main`):

| Lavoro | Branch | Piano | Spec |
|---|---|---|---|
| 🤖 Robot con cervello (home, sez. CAP 05) | `robot-cervello-vesper` | `docs/superpowers/plans/2026-08-31-robot-cervello-vesper.md` | `docs/superpowers/specs/2026-08-31-robot-cervello-vesper-design.md` |
| ✨ Effetti speciali di atelier | `atelier-effetti-sottocostellazione` | `docs/superpowers/plans/2026-08-31-atelier-effetti-sottocostellazione.md` | `docs/superpowers/specs/2026-08-31-atelier-effetti-sottocostellazione-design.md` |

Un branch alla volta:
```bash
git fetch origin
git checkout robot-cervello-vesper            # oppure atelier-effetti-sottocostellazione
```
Le **checkbox dei piani non sono aggiornate** (restano `[ ]`): lo stato vero è nei commit, riassunto qui sotto.

---

## 🤖 Robot — quasi finito (7/7 task + rifiniture)

Sostituito lo Spline preso in prestito con un **GLB nostro** (Draco, three r128 vendorato); mesh
separate testa/corpo/braccia; carbonio + vetro Fresnel sulla testa; la testa segue il cursore;
**point-brain di Vesper dentro la testa di vetro**; visore scuro + lente Lithos; fibre luminose nelle
braccia; interazione completa (levitazione/drag/reduced-motion/cleanup). Poi due passate di ritocco e
il titolo-invito sopra il robot. Ultimo commit di lavoro: `8d3f03e`.

**Da dove ripartire:** la **Self-Review** in fondo al piano (sez. "Self-Review"), poi **innesto nella
home vera + merge su `main`** — la home pubblicata usa ancora lo Spline in prestito. È a un passo.

Anteprima locale:
```bash
cd <root del branch robot> && python3 -m http.server 8801
# apri http://localhost:8801/index.html#cap05
```

---

## ✨ Effetti atelier — 8 task su 9

Fatto: fork della pagina, **DNA helix come asse centrale**, 7 card sui cluster dell'elica con poster
congelati, scroll infinito + contatore NN/07 + lista dei tipi, controller **wake/freeze** (un solo
effetto vivo a fuoco), risveglio di saucer/vesper/orologio/altitude/lithos/warp, pagine di dettaglio
per-effetto + ingresso/ritorno. L'esperienza vive dentro **`atelier/capitoli.html`** (l'originale è
salvato in `atelier/capitoli-legacy.html`; `effetti.html` è stato rimosso). Ultimo commit: `2af7d1e`.

**Da dove ripartire: Task 9** del piano — *"Sipario, e lo scambio: effetti.html diventa
/atelier/capitoli"* → sipario d'ingresso, rifinitura mobile/`prefers-reduced-motion`, verifica finale,
poi merge su `main`.

Anteprima locale:
```bash
cd <root del branch effetti> && python3 -m http.server 8802
# apri http://localhost:8802/atelier/capitoli.html
```

---

## Note per chi riprende (incl. l'assistente AI)

- **Contesto = questi piani/spec nel repo.** La memoria dell'assistente della sessione precedente NON
  viaggia: parti leggendo piano + spec del pezzo su cui lavori.
- **Ordine consigliato:** prima il **robot** (self-review + merge, è al traguardo), poi finire gli
  **effetti** col Task 9.
- **Harness di verifica a schermo:** i piani puntano a `~/axxell-chatbot/node_modules` per Playwright,
  path della macchina originale. Su un altro PC: `npm i -D playwright && npx playwright install chromium`
  e aggiorna il path negli script in `scratchpad/`.
- **Vincoli da non violare** (nei piani): niente host esterni oltre Google Fonts, three r128 UMD globale
  per l'atelier, un solo contesto WebGL heavy vivo per volta, tinta scene via CONFIG mai shader.
