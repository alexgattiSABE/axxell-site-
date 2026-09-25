# la-macchina — sorgente originale

Template GetLayers **ascend** (Vite + React), tirato file per file con
`getlayers_source` il 24/08/2026. `getlayers_materialize` non funziona su questo
template: fonde l'intero albero in un HTML portabile e il trasporto MCP cade a
metà, due volte su due.

Qui sta il sorgente COME ARRIVA. La pagina del sito è la traduzione in statico:
- `src/Planet.jsx` è un guscio di 12 righe attorno a `initPlanet(canvas)` →
  in statico non serve React, basta un canvas e una chiamata.
- `src/scene/planet.js` è JavaScript normale → si usa tale e quale.
- `src/App.jsx` è quasi tutto markup + un piccolo effetto (Lenis + reveal) →
  diventa HTML + uno script breve.

Dipendenze della scena, da procurare in locale (niente CDN, come il resto del sito):
three (una versione che abbia ANCORA `WebGL1Renderer` e `sRGBEncoding`, quindi
r128–r151) e i suoi addon: EffectComposer, RenderPass, UnrealBloomPass,
ShaderPass, GammaCorrectionShader, CopyShader, GLTFLoader, DRACOLoader,
OrbitControls. Più il decoder DRACO, che nell'originale arriva da gstatic.

Media (da scaricare, non in contesto): public/assets/planet.glb,
planet-lights.glb, planet-clouds.png.
