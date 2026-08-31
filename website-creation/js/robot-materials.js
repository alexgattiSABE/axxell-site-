/* CAP 05 — materiali del robot (carbonio su corpo/braccia, visore scuro con
 * lente Lithos sulla testa).
 *
 * Carbonio "come lo Spline" (correzione utente ref1): MeshStandardMaterial
 * scuro (near-black), poco ruvido e molto metallico, con una .normalMap a
 * TRAMA ESAGONALE procedurale (la "fibra") e una .envMap da studio prefiltrata
 * PMREM (riflesso lucido) — legge come carbonio scuro lucido e riflettente,
 * non come plastica grigia piatta. Vedi carbon()/buildCarbonNormalMap()/
 * buildCarbonEnvMap(). Le due texture sono smaltite nel teardown di robot.js
 * (via userData, come l'envMap del vetro testa).
 *
 * Vetro testa (CORREZIONE utente 2026-08-31 — vedi
 * docs/superpowers/specs/2026-08-31-robot-cervello-vesper-design.md §2/§3):
 * a riposo è un VISORE SCURO, OPACO E RIFLETTENTE come lo Spline originale —
 * non più una traslucenza globale pilotata da uOpen. Niente interni visibili
 * a riposo, niente cervello. Perché un nero quasi pieno legga come VETRO e
 * non come un buco nero piatto su un fondo a sua volta quasi nero, serve un
 * riflesso vero: un piccolo envMap equirettangolare (canvas procedurale,
 * gradiente scuro + una fascia luminosa "da studio") campionato lungo il
 * vettore di riflessione `reflect(-V,N)`. È il riflesso — non lo
 * schiarimento del tinta — a rendere leggibile il vetro sul nero.
 *
 * Il reveal del cervello non è più un'apertura globale (uOpen): è una LENTE
 * LOCALE alla Lithos. robot.js fa il raycast del cursore sulle mesh della
 * testa ogni frame e passa qui il punto colpito (uLensPos, mondo) più un
 * fattore di attivazione smorzato (uLensActive, 0..1). Il fragment calcola
 * la distanza dal punto e apre una finestra morbida (smoothstep su
 * uLensRadius) SOLO lì: alpha scende, il vetro diventa trasparente e lascia
 * vedere il cervello sotto; il resto della testa resta il visore scuro
 * opaco. Fuori dalla testa (nessun hit) uLensActive tende a 0 e tutto torna
 * opaco.
 */
window.WC = window.WC || {};

WC.robotMaterials = (function () {
  function hexToVec3(hex) {
    var r = ((hex >> 16) & 255) / 255;
    var g = ((hex >> 8) & 255) / 255;
    var b = (hex & 255) / 255;
    return new THREE.Vector3(r, g, b);
  }

  /* Piccolo envMap procedurale, dependency-free: gradiente scuro di base +
   * una fascia luminosa orizzontale in alto (softbox da studio) più una
   * seconda, più tenue, in basso (secondo rimbalzo). Campionato in v da
   * `acos(R.y)/PI`: v≈0 (riga in alto della texture) corrisponde a normali
   * che guardano verso l'alto (la calotta della testa) — esattamente dove
   * nella foto di riferimento (viewer-live.png) passa lo sweep chiaro. La
   * fascia, essendo indipendente da u (l'azimuth), disegna un anello
   * completo attorno alla testa: da una camera perlopiù frontale se ne vede
   * la porzione anteriore, che legge come lo sweep del riferimento senza
   * bisogno di geometria di scena reale (fuori scope, YAGNI di questo task).
   */
  /* Normal map procedurale a trama di carbonio: tre onde piane a 60° sommate
   * danno un reticolo ESAGONALE (l'interferenza triangolare classica), da cui
   * si ricava un campo di altezza e quindi le normali per differenze finite.
   * Il pattern è PERIODICO (freq intera) e le differenze usano indici
   * wrap-around, quindi la texture è tileabile senza cuciture — necessario
   * perché va ripetuta molte volte sul corpo per leggere come micro-trama
   * fitta e non come esagoni giganti. */
  function buildCarbonNormalMap() {
    var size = 128;
    var freq = 6;                 // celle esagonali per tile
    var TWO_PI = Math.PI * 2;
    var height = new Float32Array(size * size);
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var fx = x / size, fy = y / size;
        var a = Math.cos(TWO_PI * freq * fx);
        var b = Math.cos(TWO_PI * freq * (0.5 * fx + fy));
        var c = Math.cos(TWO_PI * freq * (0.5 * fx - fy));
        height[y * size + x] = a + b + c; // ~[-3,3]
      }
    }
    var canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(size, size);
    var strength = 1.1;
    for (var yy = 0; yy < size; yy++) {
      for (var xx = 0; xx < size; xx++) {
        var xl = (xx - 1 + size) % size, xr = (xx + 1) % size;
        var yu = (yy - 1 + size) % size, yd = (yy + 1) % size;
        var dx = (height[yy * size + xr] - height[yy * size + xl]) * 0.5;
        var dy = (height[yd * size + xx] - height[yu * size + xx]) * 0.5;
        var nx = -dx * strength, ny = -dy * strength, nz = 1.0;
        var inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        var i = (yy * size + xx) * 4;
        img.data[i]     = Math.round((nx * inv * 0.5 + 0.5) * 255);
        img.data[i + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
        img.data[i + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);        // micro-trama fitta sul corpo
    tex.needsUpdate = true;
    return tex;
  }

  /* envMap per il CORPO in carbonio: lo stesso gradiente da studio del vetro
   * testa (buildEnvMap, equirettangolare), ma prefiltrato via PMREMGenerator
   * così un MeshStandardMaterial lo campiona correttamente in base alla
   * rugosità (riflesso lucido leggibile, non un ambiente piatto). Se il
   * renderer/PMREM non è disponibile si ripiega sull'equirect grezzo (three
   * r128 lo campiona comunque come riflesso, solo meno accurato). Il
   * chiamante deve smaltire la texture ritornata nel teardown. */
  function buildCarbonEnvMap(renderer) {
    var equirect = buildEnvMap();
    if (renderer && THREE.PMREMGenerator) {
      var pmrem = new THREE.PMREMGenerator(renderer);
      var rt = pmrem.fromEquirectangular(equirect);
      pmrem.dispose();
      equirect.dispose();        // consumata dal PMREM, non più utile
      return rt.texture;
    }
    return equirect;
  }

  function buildEnvMap() {
    var w = 256, h = 128;
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');

    var bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#060810');
    bg.addColorStop(0.5, '#0a0d16');
    bg.addColorStop(1, '#03040a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Fascia principale: STRETTA (≈15% dell'altezza) e non satura (picco
    // 0.55, non bianco pieno) — è il "riflesso da studio" che fa leggere il
    // nero come vetro lucido. Larga e satura (primo tentativo) copriva mezza
    // testa di un bianco piatto sulle superfici curve della mascella (molte
    // normali diverse condividono lo stesso v=acos(R.y)/PI su una cupola):
    // stretta legge come uno SWEEP, non come una sorgente che illumina.
    var bandTop = h * 0.05, bandBot = h * 0.4;
    var band = ctx.createLinearGradient(0, bandTop, 0, bandBot);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(222,233,255,0.55)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, bandTop, w, bandBot - bandTop);

    // Seconda fascia, più stretta e più tenue, più in basso: un secondo
    // rimbalzo più freddo, appena percettibile.
    var band2Top = h * 0.64, band2Bot = h * 0.78;
    var band2 = ctx.createLinearGradient(0, band2Top, 0, band2Bot);
    band2.addColorStop(0, 'rgba(140,160,205,0)');
    band2.addColorStop(0.5, 'rgba(140,160,205,0.18)');
    band2.addColorStop(1, 'rgba(140,160,205,0)');
    ctx.fillStyle = band2;
    ctx.fillRect(0, band2Top, w, band2Bot - band2Top);

    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;   // u (azimuth) gira tutto attorno
    tex.wrapT = THREE.ClampToEdgeWrapping;
    if (THREE.EquirectangularReflectionMapping) {
      tex.mapping = THREE.EquirectangularReflectionMapping;
    }
    tex.needsUpdate = true;
    return tex;
  }

  var VERT = [
    'varying vec3 vNormalW;',
    'varying vec3 vViewDir;',
    'varying vec3 vWorldPos;',
    'void main() {',
    '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
    '  vWorldPos = worldPos.xyz;',
    '  vNormalW = normalize(mat3(modelMatrix) * normal);',
    '  vViewDir = normalize(cameraPosition - worldPos.xyz);',
    '  gl_Position = projectionMatrix * viewMatrix * worldPos;',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    '#define PI 3.14159265359',
    'varying vec3 vNormalW;',
    'varying vec3 vViewDir;',
    'varying vec3 vWorldPos;',
    'uniform vec3 uTint;',
    'uniform float uPower;',
    'uniform float uTime;',
    'uniform sampler2D uEnvMap;',
    'uniform float uEnvIntensity;',
    // alpha a riposo (visore chiuso, opaco) e alpha dentro la lente (quasi
    // trasparente, lascia vedere il cervello).
    'uniform float uBaseAlpha;',
    'uniform float uMinAlpha;',
    // lente Lithos: attiva 0..1 (smorzata in robot.js), centro in MONDO,
    // raggio del falloff morbido.
    'uniform float uLensActive;',
    'uniform vec3 uLensPos;',
    'uniform float uLensRadius;',
    // equirettangolare: u = azimuth attorno a Y, v = polare (0=su, 1=giù).
    'vec2 equirectUv(vec3 dir) {',
    '  float u = atan(dir.z, dir.x) / (2.0 * PI) + 0.5;',
    '  float v = acos(clamp(dir.y, -1.0, 1.0)) / PI;',
    '  return vec2(u, v);',
    '}',
    'void main() {',
    '  vec3 N = normalize(vNormalW);',
    '  vec3 V = normalize(vViewDir);',
    '  float ndv = clamp(dot(N, V), 0.0, 1.0);',
    '  float fres = pow(1.0 - ndv, uPower);',
    '  vec3 R = reflect(-V, N);',
    '  vec3 envColor = texture2D(uEnvMap, equirectUv(R)).rgb;',
    '  float shimmer = 0.02 * sin(uTime * 0.6 + vWorldPos.x * 0.02 + vWorldPos.y * 0.015);',
    // corpo del colore: tinta scura di base + il riflesso campionato +
    // un piccolo rim Fresnel di taglio, come un vetro lucido vero (è il
    // riflesso a farlo leggere come vetro, non uno schiarimento piatto).
    '  vec3 base = uTint * (0.8 + 0.5 * fres);',
    '  vec3 rim = vec3(0.62, 0.75, 0.92) * (fres * fres) * 0.45;',
    '  vec3 col = base + envColor * uEnvIntensity + rim + shimmer;',
    // lente Lithos: finestra morbida centrata su uLensPos (mondo), raggio
    // uLensRadius; dentro l'alpha scende a uMinAlpha (quasi trasparente),
    // fuori resta uBaseAlpha (visore opaco). uLensActive porta l'intero
    // effetto a 0 quando il cursore non è sulla testa.
    '  float d = distance(vWorldPos, uLensPos);',
    // smoothstep vuole edge0 < edge1: 1.0 - smoothstep(raggio*0.5, raggio, d)
    // dà lo stesso falloff (1 al centro dove d è piccolo, 0 fuori dal raggio)
    // di smoothstep(raggio, raggio*0.5, d) ma con edge in ordine crescente
    // (edge0>edge1 non è garantito dallo spec GLSL, anche se funzionava).
    '  float lens = uLensActive * (1.0 - smoothstep(uLensRadius * 0.5, uLensRadius, d));',
    '  float alpha = mix(uBaseAlpha, uMinAlpha, lens);',
    '  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));',
    '}'
  ].join('\n');

  return {
    /* Carbonio "come lo Spline" (correzione utente 2026-08-31): non più un
     * MeshStandardMaterial piatto (leggeva come plastica grigia opaca), ma un
     * carbonio scuro LUCIDO e RIFLETTENTE — resta near-black, non schiarito:
     *  - .normalMap: trama esagonale procedurale (buildCarbonNormalMap) →
     *    micro-superficie intrecciata, la "fibra";
     *  - .envMap: gradiente da studio prefiltrato PMREM (buildCarbonEnvMap) →
     *    il corpo scuro cattura la luce e riflette invece di leggere piatto;
     *  - roughness bassa + metalness alta → il riflesso legge come vetro/
     *    carbonio lucido, non come plastica.
     * Le due texture vanno smaltite nel teardown (robot.js le legge da
     * userData, come fa già per l'envMap del vetro testa). */
    carbon: function (opts) {
      opts = opts || {};
      var mat = new THREE.MeshStandardMaterial({
        color: 0x0b0d10,
        roughness: 0.30,
        metalness: 0.72
      });
      var normalMap = buildCarbonNormalMap();
      mat.normalMap = normalMap;
      mat.normalScale = new THREE.Vector2(0.35, 0.35);
      var envMap = buildCarbonEnvMap(opts.renderer);
      mat.envMap = envMap;
      mat.envMapIntensity = 1.1;
      // Per il dispose in robot.js (Material.dispose() NON smaltisce le sue
      // texture): stesse chiavi userData del vetro testa.
      mat.userData.normalMap = normalMap;
      mat.userData.envMap = envMap;
      return mat;
    },

    buildEnvMap: buildEnvMap,

    glassHead: function (opts) {
      opts = opts || {};
      var tint = hexToVec3(opts.tint !== undefined ? opts.tint : 0x05070b);
      var envMap = opts.envMap || buildEnvMap();
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uTint: { value: tint },
          uPower: { value: opts.power !== undefined ? opts.power : 2.4 },
          uTime: { value: 0 },
          uEnvMap: { value: envMap },
          uEnvIntensity: { value: opts.envIntensity !== undefined ? opts.envIntensity : 0.6 },
          // Vicina a 1: il visore a riposo deve leggere OPACO (niente
          // interni/cervello visibili). Non 1.0 pieno: la testa è ~18 mesh
          // spesso sovrapposte in screen space (casco+anelli collo), lo
          // stacking "over" di più layer trasparenti alza comunque
          // l'opacità percepita — vedi side:FrontSide sotto.
          uBaseAlpha: { value: opts.baseAlpha !== undefined ? opts.baseAlpha : 0.93 },
          // Bassa: dentro la lente deve lasciar vedere il cervello anche
          // sommando 2-3 mesh sovrapposte nella cupola. Tarata a schermo.
          uMinAlpha: { value: opts.minAlpha !== undefined ? opts.minAlpha : 0.045 },
          uLensActive: { value: 0 },
          uLensPos: { value: new THREE.Vector3(1e6, 1e6, 1e6) },
          // Placeholder: robot.js lo sovrascrive con 0.18 * dimensione
          // mondo della testa, appena la testa è nota (mount()).
          uLensRadius: { value: opts.lensRadius !== undefined ? opts.lensRadius : 1.0 }
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        // La testa non è un unico guscio: sono 18 mesh separate (casco,
        // anelli del collo...) spesso sovrapposte in screen space. Con
        // DoubleSide ogni mesh contribuirebbe DUE layer (fronte+retro) allo
        // stacking alpha "over" — verificato a schermo in Task 3: FrontSide
        // dimezza lo stacking e resta la lettura corretta (vetro, non
        // doppio bordo).
        side: THREE.FrontSide
      });
      mat.userData.envMap = envMap; // per il dispose in robot.js
      return mat;
    },

    applyTo: function (parts, renderer) {
      var carb = this.carbon({ renderer: renderer });
      parts.body.concat(parts.armL, parts.armR).forEach(function (m) { m.material = carb; });
      var glass = this.glassHead({ tint: 0x05070b });
      parts.head.forEach(function (m) {
        m.material = glass;
        // Task 5b: la lente Lithos maschera lo spazio via l'ALPHA del vetro
        // (opaco fuori dalla lente, quasi trasparente dentro) — ma perché
        // funzioni il vetro deve essere disegnato DOPO il brain, non prima.
        // Entrambi transparent+depthWrite:false: senza un renderOrder
        // esplicito three.js li ordina per distanza CENTRO-oggetto dalla
        // camera (non per pixel), e il centro della nuvola di punti
        // (dentro la cupola) può risultare "più vicino" del guscio che la
        // contiene per come sono costruiti i bounding sphere — verificato a
        // schermo: senza questo, il brain intero restava visibile anche
        // fuori dalla lente (il guscio, disegnato PRIMA, non lo copriva più
        // in nessun punto). renderOrder=2 (> del default 0 del brain, vedi
        // robot.js) forza SEMPRE guscio-dopo-brain: dove il guscio è opaco
        // (fuori lente) lo ricopre, dove è quasi trasparente (dentro lente)
        // lo lascia passare — la lettura "cervello dentro il vetro,
        // acceso solo sotto la lente" torna corretta.
        m.renderOrder = 2;
      });
      return { glass: glass, carbon: carb };
    }
  };
})();
