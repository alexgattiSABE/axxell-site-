/* ALTITUDE — il fluido non disegna sopra l'immagine: la piega.
 *
 * Dal template "Altitude" di GetLayers (Next.js + react-three/react-spring),
 * portato a vanilla. Di quel progetto qui arriva UNA cosa sola, che è la sua:
 * la passata finale, in cui il video di fondo viene campionato spostato dal
 * campo di VELOCITÀ del fluido. Tutto il resto — il masthead, il modulo, la
 * barra di statistiche, le due righe verticali — resta fuori: erano l'hero di
 * un marchio inventato, e questa è una pagina in cui ogni capitolo mostra una
 * tecnica nostra.
 *
 * ── COSA LO DISTINGUE DAL CAP. 03 ──────────────────────────────────────────
 * Lì il fluido È l'immagine: inchiostro colorato sul nero. Qui il fluido non
 * si vede quasi — è il MEZZO. Ogni pixel campiona il video a `uv + velocità`,
 * quindi il cielo si trascina dove il flusso si muove e sta fermo dove è
 * fermo. Sono due capitoli sulla stessa matematica che mostrano due cose
 * diverse, ed è il motivo per cui sta lontano dal 03 nella pagina.
 *
 * ── PERCHÉ IL SOLUTORE È DUPLICATO E NON CONDIVISO ─────────────────────────
 * Dalla riga "contesto" fino a `step()` questo file è js/fluid.js: stesse
 * shader, stessi framebuffer, stesso passo di Navier-Stokes (porting della
 * WebGL Fluid Simulation di Pavel Dobryakov, MIT). Estrarre un motore comune
 * e farci girare sopra tutti e due sarebbe più pulito da leggere e avrebbe
 * voluto dire rimettere le mani nel cap. 03, che è già collaudato a schermo.
 * La copia è consapevole: il prezzo è che una correzione al solutore va fatta
 * in due posti. ⚠️ Chi ne tocca uno controlli l'altro.
 *
 * Le differenze vere rispetto a js/fluid.js sono tre, ed è lì che va guardato:
 *   1. `compositeShader` al posto di `displayShader` — la passata che piega
 *      il video, con l'aberrazione cromatica e la spinta di saturazione;
 *   2. il video come TEXTURE, ricaricata a ogni fotogramma;
 *   3. il vortice segue il puntatore con una molla e si spegne se il puntatore
 *      si ferma, invece di orbitare per sempre attorno al centro.
 *
 * ── PERCHÉ IL WARP È MASCHERATO DALL'INCHIOSTRO ────────────────────────────
 * Il campo di velocità, dopo due mosse di mouse, è diverso da zero quasi
 * ovunque: deformare il fotogramma direttamente lo sbriciolerebbe tutto.
 * Lo spostamento viene quindi moltiplicato per una maschera ricavata
 * dall'inchiostro — che invece sta solo dove sei passato. Con uno smoothstep
 * e non una soglia netta: un bordo duro trasforma la separazione dei colori
 * in fili rossi e verdi visibili invece che in rifrazione.
 */
/* ── DOPPIO USO (Task 6) ─────────────────────────────────────────────────────
 * Stessa disciplina di js/saucer.js (Task 5). (A) `capitoli.html` (legacy): il
 * fluido vive dentro `#capAltitude`, con lo ScrollTrigger di sezione a
 * pinnare/accendere/spegnere — montaggio storico, invariato. (B)
 * `atelier/capitoli.html`: niente sezione; il controller monta canvas+video
 * dentro `#stage-live` e li pilota via `WC.effects.altitude.start(container)`/
 * `.stop()` — nessuno ScrollTrigger.
 *
 * IL VIDEO: `assets/starry.mp4` è H.264, che swiftshader (headless, questa
 * verifica) non decodifica — atteso, non un difetto (vedi task-6-brief.md).
 * `assets/starry.webm` (VP9) è stato aggiunto come SECONDA `<source>`: i
 * browser veri (che decodificano l'H.264 in hardware) prendono la prima e
 * vedono lo stesso video di sempre; solo dove l'H.264 non c'è si cade sul
 * WebM — è così che il montaggio esterno riesce a mostrare il video anche
 * sotto swiftshader.
 *
 * Il corpo è racchiuso in `mountAltitude(ctx, cfg)`: `cfg.canvas`/`cfg.video`
 * sono gli elementi su cui disegnare, `cfg.section` esiste solo nel montaggio
 * legacy, `cfg.external` distingue i due rami SOLO in coda. `resizeCanvas()`
 * legge `canvas.clientWidth/clientHeight` (mai `section`), quindi non serve
 * nessun `rectEl` in più: il layout del `container` esterno basta da solo. */
(function(){
function mountAltitude(ctx, cfg){
  var section  = cfg.section || null;
  var canvas   = cfg.canvas;
  var video    = cfg.video;
  var external = !!cfg.external;
  if (!canvas || !video || (!external && !section)) return null;

  // Reduced-motion: niente simulazione e niente video in movimento. Resta il
  // poster, che il tag mostra da sé, e la copy sopra.
  if (!ctx.motionOk) { if (section) section.classList.add('-static'); return null; }

  // Su telefono il fluido non parte: sono venti passaggi di pressione per
  // fotogramma e non c'è un puntatore da seguire. Resta il video, che è
  // comunque la metà della scena.
  var mobile = window.innerWidth <= 900 || matchMedia('(pointer:coarse)').matches;
  if (mobile && section) { section.classList.add('-plain'); }

  /* Numeri del template, non i nostri: `FLUID_CONFIG` di hero-media.tsx.
   * Sono diversi da quelli del cap. 03 perché servono a un'altra cosa — CURL
   * alto e dissipazione lenta fanno un vortice che resta e continua a girare,
   * che è quello che deve trascinare l'immagine. */
  var config = {
    SIM_RESOLUTION: 200,
    DYE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 0.93,
    VELOCITY_DISSIPATION: 0.96,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 42,
    // 0.13 e non 0.16 del template: la sola deviazione voluta dai suoi numeri,
    // per uno splash un filo più piccolo. Stessa cosa per il raggio d'orbita,
    // 125 invece di 150 — il vortice resta della stessa forma, occupa meno.
    SPLAT_RADIUS: 0.13,
    SPLAT_FORCE: 6000,
    SHADING: true,
    COLOR_UPDATE_SPEED: 4,
    // ---- il vortice ----
    ORBIT_RADIUS: 125,     // px: il punto che mescola gira attorno al cursore
    ORBIT_SPEED: 0.026,    // rad/frame — un giro ogni ~4 s
    STIR: 9,               // quanto spinge, in proporzione a quanto si è mosso
    INK_GAIN: 0.30,        // e quanto è acceso il suo inchiostro
    FOLLOW: 0.09,          // rigidità della molla che insegue il puntatore
    IDLE_MS: 180,          // fermo per tanto → il vortice comincia a spegnersi
    // ---- la piega ----
    WARP: 0.20,            // quanto il flusso trascina l'immagine
    ABERRATION: 0.09       // e di quanto si separano i tre canali
  };

  // ------------------------------------------------------------- contesto
  var params = { alpha: true, depth: false, stencil: false, antialias: false,
                 preserveDrawingBuffer: false };
  var gl = canvas.getContext('webgl2', params);
  var isWebGL2 = !!gl;
  if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
  if (!gl) return;

  var halfFloat, supportLinearFiltering;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    if (!halfFloat) return;
  }
  var halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;

  function supportRenderTextureFormat(internalFormat, format, type){
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteFramebuffer(fbo); gl.deleteTexture(texture);
    return ok;
  }

  function getSupportedFormat(internalFormat, format, type){
    if (!supportRenderTextureFormat(internalFormat, format, type)) {
      if (internalFormat === gl.R16F)  return getSupportedFormat(gl.RG16F, gl.RG, type);
      if (internalFormat === gl.RG16F) return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
      return null;
    }
    return { internalFormat: internalFormat, format: format };
  }

  var formatRGBA, formatRG, formatR;
  if (isWebGL2) {
    formatRGBA = getSupportedFormat(gl.RGBA16F, gl.RGBA, halfFloatTexType);
    formatRG   = getSupportedFormat(gl.RG16F,   gl.RG,   halfFloatTexType);
    formatR    = getSupportedFormat(gl.R16F,    gl.RED,  halfFloatTexType);
  } else {
    formatRGBA = getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);
    formatRG   = formatRGBA;
    formatR    = formatRGBA;
  }
  if (!formatRGBA) return;                      // niente render target: si esce
  if (!supportLinearFiltering) config.DYE_RESOLUTION = Math.min(config.DYE_RESOLUTION, 512);

  // --------------------------------------------------------------- shader
  function compileShader(type, source, keywords){
    if (keywords) source = keywords.map(function(k){ return '#define ' + k + '\n'; }).join('') + source;
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error('[WC altitude]', gl.getShaderInfoLog(shader));
    return shader;
  }

  function Program(vs, fs){
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) console.error('[WC altitude]', gl.getProgramInfoLog(this.program));
    this.uniforms = {};
    var count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) {
      var name = gl.getActiveUniform(this.program, i).name;
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
  }
  Program.prototype.bind = function(){ gl.useProgram(this.program); };

  var baseVertexShader = compileShader(gl.VERTEX_SHADER, [
    'precision highp float;',
    'attribute vec2 aPosition;',
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform vec2 texelSize;',
    'void main(){',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  vL = vUv - vec2(texelSize.x, 0.0);',
    '  vR = vUv + vec2(texelSize.x, 0.0);',
    '  vT = vUv + vec2(0.0, texelSize.y);',
    '  vB = vUv - vec2(0.0, texelSize.y);',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n'));

  var copyShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision mediump float; precision mediump sampler2D;',
    'varying highp vec2 vUv; uniform sampler2D uTexture;',
    'void main(){ gl_FragColor = texture2D(uTexture, vUv); }'
  ].join('\n'));

  var clearShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision mediump float; precision mediump sampler2D;',
    'varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value;',
    'void main(){ gl_FragColor = value * texture2D(uTexture, vUv); }'
  ].join('\n'));


  /* LA PASSATA FINALE — l'unica shader che non viene dal motore del fluido.
   *
   * Disegna il VIDEO, spostato dalla velocità del fluido, e ci posa sopra
   * l'inchiostro. In ordine:
   *   · `mask` — dove c'è inchiostro, e quindi dove è lecito deformare;
   *   · `flow` — la velocità, limitata a MAXD: oltre, l'immagine si strappa
   *     invece di piegarsi;
   *   · i tre canali campionati a distanze diverse lungo lo spostamento, che
   *     è l'aberrazione cromatica — forte dove il flusso corre, assente dove
   *     è fermo, come farebbe una lente;
   *   · una spinta di saturazione proporzionale allo spostamento, che è quello
   *     che fa leggere la deformazione come rifrazione e non come sfocatura;
   *   · l'inchiostro, con la finta luce dal gradiente del motore originale.
   *
   * `cover()` rifà `object-fit:cover` in uv: si campiona un ritaglio della
   * texture invece di deformarla. Senza, un video 4:3 su una finestra 16:9
   * uscirebbe schiacciato. */
  var compositeShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uDye; uniform sampler2D uVideo; uniform sampler2D uVelocity;',
    'uniform vec2 texelSize; uniform vec2 uSimTexel;',
    'uniform vec2 uVideoScale; uniform vec2 uVideoOffset;',
    'uniform float uWarp; uniform float uAberration; uniform float uFade;',
    'vec2 cover(vec2 uv){ return uv * uVideoScale + uVideoOffset; }',
    'const float MAXD = 0.035;',
    'void main(){',
    '  vec3 ink = texture2D(uDye, vUv).rgb;',
    '  float mask = smoothstep(0.015, 0.32, max(ink.r, max(ink.g, ink.b)));',
    '  vec2 flow = texture2D(uVelocity, vUv).xy * uSimTexel * uWarp;',
    '  float d = length(flow);',
    '  if (d > MAXD) flow *= MAXD / d;',
    '  vec2 disp = flow * mask;',
    '  float strength = clamp(length(disp) / MAXD, 0.0, 1.0);',
    '  vec2 shift = disp * uAberration;',
    '  vec3 media;',
    '  media.r = texture2D(uVideo, cover(vUv + disp + shift)).r;',
    '  media.g = texture2D(uVideo, cover(vUv + disp)).g;',
    '  media.b = texture2D(uVideo, cover(vUv + disp - shift)).b;',
    '  float lum = dot(media, vec3(0.299, 0.587, 0.114));',
    '  media += (media - vec3(lum)) * strength * 0.55;',
    '  vec3 c = ink;',
    '#ifdef SHADING',
    '  vec3 lc = texture2D(uDye, vL).rgb;',
    '  vec3 rc = texture2D(uDye, vR).rgb;',
    '  vec3 tc = texture2D(uDye, vT).rgb;',
    '  vec3 bc = texture2D(uDye, vB).rgb;',
    '  float dx = length(rc) - length(lc);',
    '  float dy = length(tc) - length(bc);',
    '  vec3 n = normalize(vec3(dx, dy, length(texelSize)));',
    '  c *= clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);',
    '#endif',
    '  gl_FragColor = vec4((media + c) * uFade, 1.0);',
    '}'
  ].join('\n'), config.SHADING ? ['SHADING'] : null);

  var splatShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio;',
    'uniform vec3 color; uniform vec2 point; uniform float radius;',
    'void main(){',
    '  vec2 p = vUv - point.xy; p.x *= aspectRatio;',
    '  vec3 splat = exp(-dot(p, p) / radius) * color;',
    '  vec3 base = texture2D(uTarget, vUv).xyz;',
    '  gl_FragColor = vec4(base + splat, 1.0);',
    '}'
  ].join('\n'));

  var advectionShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;',
    'uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;',
    'vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize){',
    '  vec2 st = uv / tsize - 0.5; vec2 iuv = floor(st); vec2 fuv = fract(st);',
    '  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);',
    '  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);',
    '  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);',
    '  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);',
    '  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);',
    '}',
    'void main(){',
    '#ifdef MANUAL_FILTERING',
    '  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;',
    '  vec4 result = bilerp(uSource, coord, dyeTexelSize);',
    '#else',
    '  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;',
    '  vec4 result = texture2D(uSource, coord);',
    '#endif',
    '  gl_FragColor = result / (1.0 + dissipation * dt);',
    '}'
  ].join('\n'), supportLinearFiltering ? null : ['MANUAL_FILTERING']);

  var divergenceShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision mediump float; precision mediump sampler2D;',
    'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;',
    'varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uVelocity;',
    'void main(){',
    '  float L = texture2D(uVelocity, vL).x; float R = texture2D(uVelocity, vR).x;',
    '  float T = texture2D(uVelocity, vT).y; float B = texture2D(uVelocity, vB).y;',
    '  vec2 C = texture2D(uVelocity, vUv).xy;',
    '  if (vL.x < 0.0) { L = -C.x; } if (vR.x > 1.0) { R = -C.x; }',
    '  if (vT.y > 1.0) { T = -C.y; } if (vB.y < 0.0) { B = -C.y; }',
    '  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);',
    '}'
  ].join('\n'));

  var curlShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision mediump float; precision mediump sampler2D;',
    'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;',
    'varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uVelocity;',
    'void main(){',
    '  float L = texture2D(uVelocity, vL).y; float R = texture2D(uVelocity, vR).y;',
    '  float T = texture2D(uVelocity, vT).x; float B = texture2D(uVelocity, vB).x;',
    '  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);',
    '}'
  ].join('\n'));

  var vorticityShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;',
    'void main(){',
    '  float L = texture2D(uCurl, vL).x; float R = texture2D(uCurl, vR).x;',
    '  float T = texture2D(uCurl, vT).x; float B = texture2D(uCurl, vB).x;',
    '  float C = texture2D(uCurl, vUv).x;',
    '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));',
    '  force /= length(force) + 0.0001;',
    '  force *= curl * C; force.y *= -1.0;',
    '  vec2 velocity = texture2D(uVelocity, vUv).xy + force * dt;',
    '  gl_FragColor = vec4(min(max(velocity, -1000.0), 1000.0), 0.0, 1.0);',
    '}'
  ].join('\n'));

  var pressureShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision mediump float; precision mediump sampler2D;',
    'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;',
    'varying highp vec2 vT; varying highp vec2 vB;',
    'uniform sampler2D uPressure; uniform sampler2D uDivergence;',
    'void main(){',
    '  float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;',
    '  float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;',
    '  float divergence = texture2D(uDivergence, vUv).x;',
    '  gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n'));

  var gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision mediump float; precision mediump sampler2D;',
    'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;',
    'varying highp vec2 vT; varying highp vec2 vB;',
    'uniform sampler2D uPressure; uniform sampler2D uVelocity;',
    'void main(){',
    '  float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;',
    '  float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;',
    '  vec2 velocity = texture2D(uVelocity, vUv).xy;',
    '  velocity.xy -= vec2(R - L, T - B);',
    '  gl_FragColor = vec4(velocity, 0.0, 1.0);',
    '}'
  ].join('\n'));

  var copyProgram      = new Program(baseVertexShader, copyShader);
  var clearProgram     = new Program(baseVertexShader, clearShader);
  var compositeProgram = new Program(baseVertexShader, compositeShader);
  var splatProgram     = new Program(baseVertexShader, splatShader);
  var advectionProgram = new Program(baseVertexShader, advectionShader);
  var divergenceProg   = new Program(baseVertexShader, divergenceShader);
  var curlProgram      = new Program(baseVertexShader, curlShader);
  var vorticityProgram = new Program(baseVertexShader, vorticityShader);
  var pressureProgram  = new Program(baseVertexShader, pressureShader);
  var gradientProgram  = new Program(baseVertexShader, gradientSubtractShader);

  // ----------------------------------------------------------- framebuffer
  var quadBuffer = gl.createBuffer();
  var quadIndex  = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndex);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target){
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function createFBO(w, h, internalFormat, format, type, param){
    gl.activeTexture(gl.TEXTURE0);
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture: texture, fbo: fbo, width: w, height: h,
      texelSizeX: 1 / w, texelSizeY: 1 / h,
      attach: function(id){ gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; },
      destroy: function(){ gl.deleteFramebuffer(fbo); gl.deleteTexture(texture); }
    };
  }

  function createDoubleFBO(w, h, internalFormat, format, type, param){
    var fbo1 = createFBO(w, h, internalFormat, format, type, param);
    var fbo2 = createFBO(w, h, internalFormat, format, type, param);
    return {
      width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
      get read(){ return fbo1; }, set read(v){ fbo1 = v; },
      get write(){ return fbo2; }, set write(v){ fbo2 = v; },
      swap: function(){ var t = fbo1; fbo1 = fbo2; fbo2 = t; },
      destroy: function(){ fbo1.destroy(); fbo2.destroy(); }
    };
  }

  function resizeFBO(target, w, h, internalFormat, format, type, param){
    var next = createFBO(w, h, internalFormat, format, type, param);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(next);
    target.destroy();
    return next;
  }

  function resizeDoubleFBO(target, w, h, internalFormat, format, type, param){
    if (target.width === w && target.height === h) return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write.destroy();
    target.write = createFBO(w, h, internalFormat, format, type, param);
    target.width = w; target.height = h;
    target.texelSizeX = 1 / w; target.texelSizeY = 1 / h;
    return target;
  }

  function getResolution(resolution){
    var aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    var min = Math.round(resolution), max = Math.round(resolution * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  var dye, velocity, divergence, curl, pressure;

  function initFramebuffers(){
    var simRes = getResolution(config.SIM_RESOLUTION);
    var dyeRes = getResolution(config.DYE_RESOLUTION);
    var filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);

    dye = dye == null
      ? createDoubleFBO(dyeRes.width, dyeRes.height, formatRGBA.internalFormat, formatRGBA.format, halfFloatTexType, filtering)
      : resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, formatRGBA.internalFormat, formatRGBA.format, halfFloatTexType, filtering);

    velocity = velocity == null
      ? createDoubleFBO(simRes.width, simRes.height, formatRG.internalFormat, formatRG.format, halfFloatTexType, filtering)
      : resizeDoubleFBO(velocity, simRes.width, simRes.height, formatRG.internalFormat, formatRG.format, halfFloatTexType, filtering);

    if (divergence) divergence.destroy();
    if (curl) curl.destroy();
    if (pressure) pressure.destroy();
    divergence = createFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, halfFloatTexType, gl.NEAREST);
    curl       = createFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, halfFloatTexType, gl.NEAREST);
    pressure   = createDoubleFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, halfFloatTexType, gl.NEAREST);
  }

  /* -------------------------------------------------------------- palette
   * I DUE COLORI SONO QUELLI DEL TEMPLATE, non quelli del sito: `--vortex-warm`
   * (#ffd75a) e `--vortex-cool` (#8ccfff), letti dai suoi token. Qui prima
   * c'erano le quattro fasce di tinta del cap. 03 (ciano→fucsia): stessa
   * meccanica, ma su un cielo notturno blu l'inchiostro freddo spariva dentro
   * il fondo e lo splash non si leggeva più come lo splash di GetLayers.
   *
   * La scelta cade VICINO a un capo o all'altro e quasi mai in mezzo: una
   * distribuzione uniforme passerebbe la maggior parte delle macchie nel
   * grigiore centrale, e i due colori non si leggerebbero mai come due colori.
   * A mescolarli ci pensa il solutore. La sbilanciatura verso il caldo (55%) è
   * loro e ha un motivo: su un cielo blu l'inchiostro freddo riceve una spinta
   * gratis dal fondo, e una divisione a metà esce tutta azzurra. */
  var VORTEX_WARM = [1.000, 0.843, 0.353];   // #ffd75a
  var VORTEX_COOL = [0.549, 0.812, 1.000];   // #8ccfff

  function generateColor(){
    var t = Math.random() < 0.55 ? Math.random() * 0.2 : 0.8 + Math.random() * 0.2;
    return {
      r: (VORTEX_WARM[0] + (VORTEX_COOL[0] - VORTEX_WARM[0]) * t) * config.INK_GAIN,
      g: (VORTEX_WARM[1] + (VORTEX_COOL[1] - VORTEX_WARM[1]) * t) * config.INK_GAIN,
      b: (VORTEX_WARM[2] + (VORTEX_COOL[2] - VORTEX_WARM[2]) * t) * config.INK_GAIN
    };
  }

  // -------------------------------------------------------------- puntatore
  var pointer = {
    texcoordX: 0, texcoordY: 0, prevTexcoordX: 0, prevTexcoordY: 0,
    deltaX: 0, deltaY: 0, moved: false, seen: false, color: generateColor()
  };

  function correctDeltaX(delta){
    var aspect = canvas.width / canvas.height;
    return aspect < 1 ? delta * aspect : delta;
  }
  function correctDeltaY(delta){
    var aspect = canvas.width / canvas.height;
    return aspect > 1 ? delta / aspect : delta;
  }
  // Qui c'era `correctRadius`, che scalava il raggio della macchia per
  // l'aspetto del riquadro. Tolta: la correzione la fa già lo shader, e
  // applicarla due volte gonfiava ogni macchia. Vedi il commento in `splat`.

  // Le coordinate sono relative al CANVAS, non alla finestra: il canvas vive
  // dentro il capitolo 03 e per metà scroll è pinnato, quindi la sua origine
  // non coincide con quella della pagina. Fuori dal riquadro non si splatta e
  // il puntatore si dimentica: rientrando non deve tirare una riga da un bordo
  // all'altro.
  function movePointer(clientX, clientY){
    var r = canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    var x = (clientX - r.left) / r.width;
    var y = 1 - (clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) { pointer.seen = false; pointer.moved = false; return; }
    if (!pointer.seen) {
      // Primo contatto: si registra la posizione e basta. Senza questo la
      // prima scia parte dall'angolo in basso a sinistra.
      pointer.seen = true;
      pointer.texcoordX = pointer.prevTexcoordX = x;
      pointer.texcoordY = pointer.prevTexcoordY = y;
      pointer.color = generateColor();
      return;
    }
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = x;
    pointer.texcoordY = y;
    pointer.deltaX = correctDeltaX(x - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(y - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
  }

  var onMouseMove = function(e){ movePointer(e.clientX, e.clientY); };
  var onTouchMove = function(e){
    var t = e.targetTouches[0];
    if (t) movePointer(t.clientX, t.clientY);
  };
  var onLeave = function(){ pointer.seen = false; pointer.moved = false; };
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('mouseout', onLeave, { passive: true });

  // ------------------------------------------------------------- passaggi
  function splat(x, y, dx, dy, color){
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
    // Raggio grezzo, come flowstate. Qui prima passava per `correctRadius`, che
    // lo moltiplica per l'aspetto — ma la correzione dell'aspetto la fa GIÀ lo
    // shader (`p.x *= aspectRatio`), quindi era doppia: su un riquadro 16:10
    // ogni macchia usciva ~26% più larga, e con la persistenza di flowstate
    // l'inchiostro si accumulava fino a saturare a bianco. Visto a schermo.
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
  }

  function step(dt){
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProg.bind();
    gl.uniform2f(divergenceProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProg.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (var i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradientProgram.bind();
    gl.uniform2f(gradientProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradientProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    var velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function scaleByPixelRatio(v){ return Math.floor(v * Math.min(window.devicePixelRatio || 1, 1.5)); }

  function resizeCanvas(){
    var w = scaleByPixelRatio(canvas.clientWidth);
    var h = scaleByPixelRatio(canvas.clientHeight);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w; canvas.height = h;
      return true;
    }
    return false;
  }

  // Svuota colore e velocità e disegna un frame vuoto. Serve all'uscita dalla
  // sezione: senza, rientrando si vedrebbe per un istante la scia congelata di
  // mezz'ora prima, e la velocità residua ripartirebbe da sola.
  /* Svuotamento a `gl.clear`, non a shader.
   *
   * Qui prima si passava per `clearProgram` — lo stesso che in `step()` scala la
   * pressione — con `value` a 0, cioè si moltiplicava il campo per zero, e poi
   * si scambiavano i buffer. Non svuotava: verificato chiamandolo a mano dalla
   * console con la scena piena, e il quadro restava tal quale. Che la
   * moltiplicazione per zero non arrivasse a destinazione o che lo scambio la
   * rimettesse indietro poco importa — la strada giusta è un altra: azzerare il
   * framebuffer con la GL, che è quello che serve e non ha shader di mezzo.
   *
   * Si azzerano ENTRAMBI i buffer di ogni coppia, non uno solo: con la doppia
   * bufferizzazione, svuotare solo quello di scrittura lascia l'altro pieno e
   * il primo scambio lo rimette in quadro. */
  function clearFbo(target){
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function clearSim(){
    clearFbo(dye.read);      clearFbo(dye.write);
    clearFbo(velocity.read); clearFbo(velocity.write);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    render();
  }

  resizeCanvas();
  initFramebuffers();


  /* --------------------------------------------------------- il video texture
   * Il video non è un elemento sotto al canvas: è una TEXTURE. Deve esserlo —
   * la piega campiona il fotogramma a `uv + spostamento`, e un livello DOM
   * separato non è campionabile da uno shader. Il canvas disegna il video *e*
   * l'inchiostro; finché la texture non ha un fotogramma, il `<video>` vero
   * resta visibile sotto e non si vede alcuno stacco. */
  var videoTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([0, 0, 0, 255]));

  var videoReady = false, videoLoaded = false;

  function loadVideo(){
    if (videoLoaded) return;
    videoLoaded = true;
    var srcs = video.querySelectorAll('source[data-src]');
    for (var i = 0; i < srcs.length; i++) {
      srcs[i].src = srcs[i].getAttribute('data-src');
      srcs[i].removeAttribute('data-src');
    }
    video.load();
    var p = video.play();
    if (p && p.catch) p.catch(function(){});
  }

  function uploadVideo(){
    if (video.readyState < 2 || !video.videoWidth) return;
    gl.activeTexture(gl.TEXTURE0 + 4);
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    // Il fotogramma arriva dall'alto in basso, le texcoord del fluido vanno dal
    // basso in alto: senza il capovolgimento il cielo starebbe sotto. Si rimette
    // subito a posto, perché è stato globale della GL e i framebuffer del
    // solutore non devono ereditarlo.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    videoReady = true;
  }

  /* ------------------------------------------------------------- il vortice
   * Il modello è quello del template: NON si splatta dove sta il cursore. Un
   * punto invisibile orbita attorno a una molla che insegue il cursore, ed è
   * il MOVIMENTO di quel punto che il solutore arriccia in vortice. Uno splat
   * fermo sarebbe una macchia; è il giro a farne un mulinello.
   *
   * L'intensità si spegne se il puntatore sta fermo più di IDLE_MS: il vortice
   * smette di essere alimentato e si dissolve da solo in un secondo. Il warp è
   * moltiplicato per la stessa intensità, quindi a cursore fermo l'immagine
   * torna ferma — non "quasi ferma". */
  var sx = 0, sy = 0, sSeeded = false;          // la molla, in px canvas
  var intensity = 0, lastMoveAt = 0;
  var orbitAngle = 0, orbitSeeded = false, oPrevX = 0, oPrevY = 0;
  var vColor = null, lastVColor = 0;

  function driveVortex(now){
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 1 || h < 1) return;

    // Il puntatore in pixel del canvas. `pointer` lo tiene in texcoord con la
    // Y capovolta, perché è così che lo vuole il solutore.
    if (pointer.seen) {
      var px = pointer.texcoordX * w, py = (1 - pointer.texcoordY) * h;
      if (!sSeeded) { sSeeded = true; sx = px; sy = py; }
      sx += (px - sx) * config.FOLLOW;
      sy += (py - sy) * config.FOLLOW;
      if (pointer.moved) { lastMoveAt = now; pointer.moved = false; }
    }

    var awake = pointer.seen && (now - lastMoveAt) < config.IDLE_MS;
    // Entra in fretta e se ne va piano: un vortice che sparisce alla stessa
    // velocità con cui arriva sembra un interruttore.
    intensity += ((awake ? 1 : 0) - intensity) * (awake ? 0.12 : 0.035);
    if (intensity < 0.01) { orbitSeeded = false; return; }

    var base = Math.min(config.ORBIT_RADIUS, w * 0.22, h * 0.28);
    var r = base * (0.72 + 0.28 * Math.sin(orbitAngle * 0.37));
    orbitAngle += config.ORBIT_SPEED;
    var x = sx + Math.cos(orbitAngle) * r;
    var y = sy + Math.sin(orbitAngle) * r;

    if (!orbitSeeded) { orbitSeeded = true; oPrevX = x; oPrevY = y; return; }

    // Il colore cambia ogni 120 ms lungo la banda, come nel template. Nessun
    // guadagno in più: `INK_GAIN` è già dentro `generateColor`, e qui prima
    // c'era un ×3.3 preso dal cap. 03 — dove serve, perché lì l'inchiostro è
    // la scena. Su un video, satura e il vortice diventa un sole bianco piatto.
    if (!vColor || now - lastVColor > 120) { vColor = generateColor(); lastVColor = now; }
    var dx = (x - oPrevX) * config.STIR, dy = (y - oPrevY) * config.STIR;
    oPrevX = x; oPrevY = y;
    // In texcoord la Y è capovolta rispetto ai pixel dello schermo.
    splat(x / w, 1 - y / h, dx, -dy,
          { r: vColor.r * intensity, g: vColor.g * intensity, b: vColor.b * intensity });
  }

  /* ---------------------------------------------------------- la resa a schermo */
  var fade = 0;

  function render(){
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.BLEND);

    compositeProgram.bind();
    gl.uniform2f(compositeProgram.uniforms.texelSize,
                 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform2f(compositeProgram.uniforms.uSimTexel,
                 velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(compositeProgram.uniforms.uDye, dye.read.attach(0));
    gl.uniform1i(compositeProgram.uniforms.uVelocity, velocity.read.attach(1));

    gl.activeTexture(gl.TEXTURE0 + 4);
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.uniform1i(compositeProgram.uniforms.uVideo, 4);

    // `cover` in uv: si campiona un ritaglio della texture. Il rapporto del
    // video è quello vero quando c'è, 1 finché la texture è il pixel nero —
    // se no il primo fotogramma esce stirato.
    var va = videoReady && video.videoHeight ? video.videoWidth / video.videoHeight : 1;
    var ca = gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight);
    var scaleX = va > ca ? ca / va : 1;
    var scaleY = va > ca ? 1 : va / ca;
    gl.uniform2f(compositeProgram.uniforms.uVideoScale, scaleX, scaleY);
    gl.uniform2f(compositeProgram.uniforms.uVideoOffset, (1 - scaleX) / 2, (1 - scaleY) / 2);

    gl.uniform1f(compositeProgram.uniforms.uWarp, config.WARP * intensity);
    gl.uniform1f(compositeProgram.uniforms.uAberration, config.ABERRATION);
    gl.uniform1f(compositeProgram.uniforms.uFade, fade);
    blit(null);
  }


  resizeCanvas();
  initFramebuffers();

  var lastTime = Date.now(), raf = 0, running = false;

  function update(){
    if (!running) return;
    raf = requestAnimationFrame(update);

    var now = Date.now();
    var dt = Math.min((now - lastTime) / 1000, 0.016666);
    lastTime = now;

    if (document.hidden) return;
    if (resizeCanvas()) initFramebuffers();

    // Il canvas entra in dissolvenza sopra il <video> vero: finché la texture
    // non ha un fotogramma i due sono la stessa immagine, quindi il passaggio
    // non si vede. Serve solo a non far comparire un rettangolo nero nel caso
    // la texture arrivi in ritardo.
    fade = Math.min(1, fade + dt * 1.6);

    uploadVideo();
    driveVortex(now);
    step(dt);
    render();
  }

  function start(){
    if (running || document.hidden) return;
    running = true; lastTime = Date.now();
    loadVideo();
    var p = video.play();
    if (p && p.catch) p.catch(function(){});
    resizeCanvas();
    raf = requestAnimationFrame(update);
  }
  function stop(){
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    if (!video.paused) video.pause();
    pointer.seen = false; pointer.moved = false;
    sSeeded = false; orbitSeeded = false; intensity = 0; fade = 0;
    // Svuotare all'uscita: se no, rientrando si vedrebbe per un istante il
    // vortice congelato di prima, e la velocità residua ripartirebbe da sola
    // deformando l'immagine senza che nessuno l'abbia toccata.
    clearSim();
  }

  /* ── MONTAGGIO ESTERNO (capitoli.html) ─────────────────────────────────────
   * Nessuna sezione, nessuno ScrollTrigger: lo pilota il controller. `start()`/
   * `stop()` sono le STESSE funzioni del ramo legacy — caricano il video,
   * fanno partire il solutore, lo svuotano allo stop — solo che qui a
   * chiamarle è l'API esterna invece di uno ScrollTrigger di sezione. */
  if (external){
    var wantRun = false;
    var onVisE = function(){ if (document.hidden) stop(); else if (wantRun) start(); };
    document.addEventListener('visibilitychange', onVisE);
    return {
      start: function(){ wantRun = true; start(); },
      stop:  function(){ wantRun = false; stop(); },
      resize: function(){ if (resizeCanvas()) initFramebuffers(); },
      dispose: function(){
        stop();
        document.removeEventListener('visibilitychange', onVisE);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('mouseout', onLeave);
        if (dye) dye.destroy();
        if (velocity) velocity.destroy();
        if (pressure) pressure.destroy();
        if (divergence) divergence.destroy();
        if (curl) curl.destroy();
        gl.deleteTexture(videoTex);
        gl.deleteBuffer(quadBuffer);
        gl.deleteBuffer(quadIndex);
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    };
  }

  /* ── MONTAGGIO LEGACY (capitoli.html) — invariato ─────────────────────────*/
  // Il video comincia a scendere mezza schermata prima, come la sneaker: il
  // capitolo deve avere già un cielo quando ci arrivi.
  var stPre = ScrollTrigger.create({
    trigger: section, start: 'top bottom+=50%', end: 'bottom top-=50%',
    onEnter: loadVideo, onEnterBack: loadVideo
  });
  // La simulazione vive solo dentro il capitolo: sono venti passaggi di
  // pressione per fotogramma più una texture video ricaricata ogni frame, non
  // è roba da tenere accesa su tutta la pagina.
  var stLife = ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: function(self){ self.isActive ? start() : stop(); }
  });
  var onVis = function(){ if (document.hidden) stop(); else if (stLife.isActive) start(); };
  document.addEventListener('visibilitychange', onVis);
  if (stLife.isActive) start();

  section.classList.add('-live');

  return function(){
    stop();
    stPre.kill(); stLife.kill();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('mouseout', onLeave);
    section.classList.remove('-live');
    if (dye) dye.destroy();
    if (velocity) velocity.destroy();
    if (pressure) pressure.destroy();
    if (divergence) divergence.destroy();
    if (curl) curl.destroy();
    gl.deleteTexture(videoTex);
    gl.deleteBuffer(quadBuffer);
    gl.deleteBuffer(quadIndex);
    var lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  };
}

/* ── I DUE PADRONI ───────────────────────────────────────────────────────────
 * Legacy: si registra come sempre; se la sezione non c'è (capitoli.html) l'init
 * è un no-op innocuo. Esterno: un handle recuperabile che monta video+canvas
 * dentro il `container` che gli passa il controller. */
WC.register('altitude', function(ctx){
  var canvas  = document.getElementById('wcAltCanvas');
  var section = document.getElementById('capAltitude');
  var video   = document.getElementById('wcAltVideo');
  if (!canvas || !section || !video) return;
  return mountAltitude(ctx, { canvas: canvas, section: section, video: video, external: false });
});

WC.effects = WC.effects || {};
WC.effects.altitude = (function(){
  var inst = null, host = null;
  return {
    start: function(container){
      // `#stage-live` è condiviso da più effetti pilotabili (Task 6): spostare
      // sempre l'host in coda ai figli — anche quando `inst` esiste già — lo
      // fa dipingere sopra i canvas congelati degli altri (vedi la nota
      // gemella in js/saucer.js). `position:absolute` invece di `relative`:
      // serve comunque da riferimento ai figli assoluti (video/canvas), ma in
      // più stacca l'host dal FLUSSO — niente più figli-100%-altezza che si
      // spingono a vicenda fuori dal riquadro visibile.
      if (inst){ container.appendChild(host); inst.start(); return; }
      host = document.createElement('div');
      host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;';
      var vid = document.createElement('video');
      vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = 'none';
      vid.setAttribute('aria-hidden', 'true');
      vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      // Stesso ordine del markup legacy: mp4 prima (i browser veri lo prendono,
      // decodificato in hardware), webm dopo — è il fallback che copre swiftshader.
      var s1 = document.createElement('source');
      s1.type = 'video/mp4'; s1.setAttribute('data-src', 'assets/starry.mp4');
      var s2 = document.createElement('source');
      s2.type = 'video/webm'; s2.setAttribute('data-src', 'assets/starry.webm');
      vid.appendChild(s1); vid.appendChild(s2);
      var canv = document.createElement('canvas');
      canv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
      host.appendChild(vid); host.appendChild(canv);
      container.appendChild(host);
      var ctx = { motionOk: WC.motionOk, desktop: WC.desktop };
      inst = mountAltitude(ctx, { canvas: canv, video: vid, section: null, external: true });
      if (!inst){ if (host && host.parentNode) host.parentNode.removeChild(host); host = null; return; }
      inst.start();
    },
    stop:   function(){ if (inst) inst.stop(); },
    resize: function(){ if (inst) inst.resize(); }
  };
})();
})();
