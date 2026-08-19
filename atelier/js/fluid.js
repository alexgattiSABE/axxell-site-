/* FLOWSTATE — il fluido del capitolo 03.
 *
 * Vive solo dentro quel capitolo: il canvas sta nel pin e il loop parte e si
 * ferma con la sezione. Dentro non serve premere niente — basta muovere il
 * mouse — ma fuori non gira affatto.
 *
 * Il motore è la WebGL Fluid Simulation di Pavel Dobryakov (MIT, 2017,
 * github.com/PavelDoGreat/WebGL-Fluid-Simulation). La SCENA è quella di
 * `Effetti webiste/flowstate`, che di quel motore è una versione con altri
 * numeri e due aggiunte sue: la macchiata d'ingresso e il cursore automatico
 * che orbita. Prima qui erano arrivati solo due dei suoi valori (CURL 42 e
 * SPLAT_RADIUS 0.22); adesso c'è tutto — vedi i punti 4 e 6.
 *
 * Perché ci sta bene: il capitolo 03 è stato svuotato (la colonna di vetro è
 * stata tolta, la copy è fuori schermo), quindi il fluido non è più un velo
 * sopra una scena — è la scena. Che è esattamente quello che è in flowstate,
 * dove sta a tutto schermo dietro l'hero.
 *
 * Cosa cambia rispetto ai due sorgenti, e perché:
 *
 * 1. NIENTE PRESS-AND-HOLD. Nell'originale il mousemove splatta solo se il
 *    pulsante è premuto. Qui il puntatore è sempre "giù": muovere il mouse
 *    basta. Il primo movimento non genera delta, altrimenti la scia partirebbe
 *    dall'angolo 0,0 con una frustata.
 * 2. NIENTE BLOOM NÉ SUNRAYS. Sono ~400 righe e due catene di framebuffer in
 *    più, e i sunrays sono proprio quello che tira fuori il giallo. Via tutti
 *    e due: meno GPU e nessun colore fuori palette.
 * 3. PALETTE CHIUSA. Il generateColor originale pesca una tinta a caso su
 *    tutto il cerchio: escono verdi, gialli e arancioni. Qui le tinte sono
 *    limitate a quattro fasce — ciano, blu, viola, fucsia/rosa — le stesse
 *    del cap. 03.
 * 4. I NUMERI SONO QUELLI DI FLOWSTATE — risoluzioni, dissipazioni, iterazioni
 *    di pressione — TRANNE due, vorticità e raggio della macchia, abbassati
 *    perché qui il capitolo regge quattordici salve di fuochi e con i suoi si
 *    impastava. Vedi il blocco `config`.
 * 5. TRASPARENTE. Il canvas non ha fondo e si compone in mix-blend-mode screen
 *    (vedi sections.css). Il fondo opaco di flowstate (BACK_COLOR 4,5,12) NON
 *    arriva: qui sotto c'è già il nero della pagina, e un secondo nero opaco
 *    coprirebbe la giuntura fra le sezioni.
 * 6. L'ENTRATA E IL CURSORE AUTOMATICO, i due "project tweak" di flowstate:
 *    una macchiata densa quando il capitolo entra in quadro, e un puntatore
 *    invisibile che orbita per sempre attorno al centro. Senza il secondo, la
 *    sezione torna nera mezzo secondo dopo che smetti di muovere il mouse — e
 *    su un capitolo vuoto quello è tutto quello che c'è da vedere.
 *
 * Con reduced-motion il modulo non parte affatto.
 */
WC.register('fluid', function(ctx){
  var canvas  = document.getElementById('wcFluid');
  var section = document.getElementById('cap03');
  var pinEl   = document.getElementById('wcSpinePin');
  var copyEl  = section && section.querySelector('.wc-spine-copy');
  var footEl  = section && section.querySelector('.wc-spine-foot');
  var invite  = document.getElementById('wcSpineInvite');
  var nextEl  = document.getElementById('wcSpineNext');
  if (!canvas || !ctx.motionOk) {
    // Senza fluido la sezione non ha più una sequenza da srotolare, e i suoi
    // 300svh diventerebbero due schermate di nero sotto al testo.
    if (section) section.classList.add('-static');
    return;
  }

  var mobile = window.innerWidth <= 640 || matchMedia('(pointer:coarse)').matches;

  // Numeri di "flowstate", tutti. Prima ne erano arrivati due (CURL e raggio) e
  // il resto era rimasto della taratura vecchia; ora il capitolo è nero e vuoto
  // — la colonna di vetro è stata tolta — quindi non c'è più niente da non
  // coprire, ed è caduto anche l'unico valore che era stato scostato.
  var config = {
    SIM_RESOLUTION: mobile ? 128 : 200,
    DYE_RESOLUTION: mobile ? 384 : 512,
    /* ⚠️ LE DISSIPAZIONI NON SI COPIANO DAL FILE: i due motori usano formule
     * diverse, e lo stesso numero vuol dire due cose opposte.
     *
     *   flowstate (Dobryakov 2017):  gl_FragColor = dissipation * source
     *   qui       (Dobryakov 2020):  gl_FragColor = source / (1.0 + dissipation * dt)
     *
     * Là 0.958 è il fattore che RESTA a ogni frame — 4,2% perso ogni frame,
     * cioè il 92% perso in un secondo. Qui 0.958 dà 1/(1+0.958·0,0167) = 0,984
     * per frame: il 62% perso in un secondo, cinque volte più lento. Messo
     * pari pari, l'inchiostro si accumulava fino a saturare a bianco e il
     * capitolo diventava una parete grigia — visto a schermo prima di fare i
     * conti.
     *
     * La conversione è d = (1/k − 1)/dt con dt = 1/60:
     *   densità   k=0.958 → 2.63
     *   velocità  k=0.96  → 2.50
     * Cambiando i valori del file, rifare questo passaggio. */
    DENSITY_DISSIPATION: 2.63,
    VELOCITY_DISSIPATION: 2.50,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: mobile ? 12 : 20,
    /* Vorticità e raggio sono gli unici due valori scostati da flowstate (che
     * ha 42 e 0.22). Con i suoi, l'inchiostro è colato grosso e arricciato:
     * bello da fermo, ma su un capitolo che deve reggere quattordici salve di
     * fuochi si impasta in una parete. Più bassi, i getti restano filamenti
     * distinti e i botti si contano. */
    CURL: 16,              // vorticità: quanto si arriccia il flusso
    // 0.22: raddoppiato. A 0.11 la scia era un filo sottile che si perdeva
    // sul nero — era tarata quando il capitolo aveva ancora la colonna di
    // vetro dietro e l'inchiostro le si sovrapponeva. Adesso il fluido è tutto
    // quello che c'è in questa schermata, e deve occuparla.
    SPLAT_RADIUS: 0.22,    // e quanto è grossa ogni macchia
    SPLAT_FORCE: 5000,
    SHADING: true,
    COLOR_UPDATE_SPEED: 4,
    // ---- l'entrata e il cursore automatico, i due "project tweak" del file ----
    BURST_SPLATS: 34,      // la macchiata densa all'ingresso
    BURST_WAVES: 8,        // più le ondate che la seguono, una per frame
    ORBIT_RADIUS: 300,     // px CSS: il cursore finto gira attorno al centro
    ORBIT_SPEED: 0.026,    // rad/frame — un giro ogni ~4 s
    ORBIT_DELAY: 700       // ms dopo l'ingresso: prima si vede la macchiata
  };

  /* LA SEQUENZA, in quote di scroll del pin (0 = la sezione si incastra,
   * 1 = si sgancia). I quattro tempi del capitolo:
   *
   *   0 → FIRE      il fluido di flowstate come lo conosce il file: la
   *                 macchiata d'ingresso, il cursore automatico che orbita, il
   *                 testo a schermo.
   *   FIRE → BOOM   i fuochi. Salve di scoppi radiali a quote regolari, mentre
   *                 il testo si spegne. Quattordici e non una: un botto solo è
   *                 un lampo, quattordici sono uno spettacolo che finisce.
   *   BOOM → DARK   nessuno splatta più e l'orbita si ferma. L'inchiostro si
   *                 dissolve da sé — non serve cancellarlo, ci pensa la
   *                 dissipazione, ed è per quello che si legge come fumo che si
   *                 posa invece che come un interruttore.
   *   DARK → 1      nero, e poi l'invito.
   *
   * Scorrendo all'indietro tutto si riavvolge: le salve si riarmano (vedi
   * `lastSalvo`) e il testo torna. */
  /* ⚠️ QUESTE QUOTE SONO FRAZIONI DELLA CORSA, non svh: se cambia l'altezza
   * della sezione in css/sections.css cambiano TUTTE le durate.
   *
   * Tarati sui 760svh attuali, cioè 660svh di corsa tolta la schermata
   * inchiodata. Ricalcolati — non scelti a occhio — e ogni volta con lo stesso
   * metodo: si decide quanti svh deve durare ogni tratto, poi si divide.
   *
   * Ultimo giro (760svh): si sono accorciate DUE cose sole.
   *   l'attesa prima dell'invito   427 -> 290svh
   *   la coda dopo la consegna      99 ->  36svh
   * Il vuoto fra le due frasi resta 259svh identico: è il tempo in cui si fa
   * la cosa che l'invito chiede, e accorciarlo sarebbe togliere il capitolo.
   *
   * Da dove sono usciti i 137svh dell'attesa: 74 dall'attacco muto prima del
   * primo botto (era una schermata intera in cui non succedeva niente) e 63
   * dalla finestra dei fuochi, che scende da 250 a 210svh — con le salve
   * ridotte in proporzione, o si sarebbero sovrapposte di nuovo. */
  var SEQ = {
    fire: 0.045,         // quando parte il primo botto   (~30svh, era ~104)
    boom: 0.364,         // quando finisce l'ultimo       (~240svh)
    dark: 0.427,         // da qui il campo è vuoto       (~282svh)
    /* L'invito ha oltre un TERZO della corsa davanti a sé: nero, la scritta lì,
     * e il cursore che disegna. È il tempo che serve alla battuta finale, non
     * riempitivo — ed è per questo che questo tratto NON si è toccato mentre si
     * accorciava tutto il resto. */
    invite: 0.439,       // ~290svh (era ~427)
    /* E dopo l'invito, la consegna al capitolo successivo. L'invito si spegne
       mentre questa entra: due righe al centro nello stesso momento si
       contendono lo stesso posto.

       La CODA dopo la consegna è scesa da ~99 a ~36svh. Serviva a non far
       salire la sezione successiva mentre l'ultima riga era ancora a schermo,
       e per quello 36 bastano: la frase è già sfumata da un pezzo. */
    next: 0.832,         // ~549svh
    nextOut: 0.945,      // ~624svh, e restano 36svh di nero
    /* I fuochi, ritarati dopo averli visti a schermo: erano quattordici in un
     * quinto della corsa, cioè tutti addosso, grossi e accecanti.
     *
     *   quanti   14 → 30   e la finestra da 0,20 a 0,48 di corsa: su 620svh
     *                      sono ~10svh di scroll fra un botto e il successivo,
     *                      contro i ~6 di prima su una sezione più corta. Si
     *                      succedono invece di sovrapporsi.
     *   bracci   18 → 11   una corolla, non una palla piena
     *   spinta 2600 → 1250 il raggio si dimezza: stanno larghi, non si toccano
     *   luce     12 → 4.5  l'inchiostro non brucia più a bianco */
    /* 25 e non più 30: la finestra dei fuochi è scesa da 250 a 210svh, e a
       parità di salve si sarebbero riavvicinate a ~7svh l'una dall'altra —
       cioè tornate a sovrapporsi, che era il difetto già corretto una volta.
       Ridotte in proporzione restano a ~8,4svh: si succedono. */
    salvos: 25,          // quante salve nella finestra dei fuochi
    salvoArms: 11,       // scoppi per salva, disposti in cerchio
    salvoForce: 1250,    // spinta verso l'esterno di ogni scoppio
    salvoInk: 4.5,       // e quanto è acceso il suo inchiostro
    salvoApart: 0.34     // e quanto devono stare lontani due botti di fila
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
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error('[WC fluid]', gl.getShaderInfoLog(shader));
    return shader;
  }

  function Program(vs, fs){
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) console.error('[WC fluid]', gl.getProgramInfoLog(this.program));
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

  var displayShader = compileShader(gl.FRAGMENT_SHADER, [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform sampler2D uTexture; uniform vec2 texelSize;',
    'void main(){',
    '  vec3 c = texture2D(uTexture, vUv).rgb;',
    '#ifdef SHADING',
    '  vec3 lc = texture2D(uTexture, vL).rgb;',
    '  vec3 rc = texture2D(uTexture, vR).rgb;',
    '  vec3 tc = texture2D(uTexture, vT).rgb;',
    '  vec3 bc = texture2D(uTexture, vB).rgb;',
    '  float dx = length(rc) - length(lc);',
    '  float dy = length(tc) - length(bc);',
    '  vec3 n = normalize(vec3(dx, dy, length(texelSize)));',
    '  float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);',
    '  c *= diffuse;',
    '#endif',
    '  float a = max(c.r, max(c.g, c.b));',
    '  gl_FragColor = vec4(c, a);',
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
  var displayProgram   = new Program(baseVertexShader, displayShader);
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

  // -------------------------------------------------------------- palette
  // Quattro fasce di tinta: ciano, blu, viola, fucsia/rosa. Fuori restano
  // verde (0.25-0.45), giallo e arancione (0.06-0.20) e il rosso pieno.
  var HUE_BANDS = [[0.50, 0.575], [0.60, 0.70], [0.70, 0.80], [0.82, 0.92]];

  function hsvToRgb(h, s, v){
    var i = Math.floor(h * 6), f = h * 6 - i;
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: return { r: v, g: t, b: p };
      case 1: return { r: q, g: v, b: p };
      case 2: return { r: p, g: v, b: t };
      case 3: return { r: p, g: q, b: v };
      case 4: return { r: t, g: p, b: v };
      default: return { r: v, g: p, b: q };
    }
  }

  function generateColor(){
    var band = HUE_BANDS[(Math.random() * HUE_BANDS.length) | 0];
    var c = hsvToRgb(band[0] + Math.random() * (band[1] - band[0]), 0.86 + Math.random() * 0.14, 1);
    // 0.92, il valore di flowstate. Era 0.34 perché la scia si sommava alla
    // colonna di vetro illuminata e sopra quella bruciava; il capitolo adesso è
    // nero, e a 0.34 su nero l'inchiostro si legge spento.
    c.r *= 0.92; c.g *= 0.92; c.b *= 0.92;
    return c;
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

  /* ---- L'ENTRATA — `multipleSplats` di flowstate ----
   * Macchie sparse su tutto il riquadro, ognuna con la sua spinta, con
   * l'inchiostro moltiplicato per dieci: sono i nuclei che poi saturano a
   * bianco e da cui si aprono i vortici. Nel file parte al caricamento della
   * pagina; qui parte quando il capitolo entra in quadro, che è il momento in
   * cui il fluido nasce (fuori dalla sezione il loop non gira nemmeno).
   *
   * Le coordinate del file sono in pixel di canvas, qui sono texcoord 0..1 —
   * il nostro `splat` prende già lo spazio normalizzato. Le velocità invece
   * restano nelle stesse unità: ±500, come nel file. */
  function multipleSplats(amount){
    for (var i = 0; i < amount; i++) {
      var c = generateColor();
      c.r *= 10.0; c.g *= 10.0; c.b *= 10.0;
      splat(Math.random(), Math.random(),
            1000 * (Math.random() - 0.5), 1000 * (Math.random() - 0.5), c);
    }
  }

  // Rampa morbida fra due quote. Scritta qui e non presa da `WC.glsl` perché
  // questo modulo non dipende da three: è WebGL a mano, e `glsl.js` tira dentro
  // THREE per i suoi helper di colore e di pulviscolo.
  function smoothstep(a, b, x){
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  /* ---- I FUOCHI ----
   * Uno scoppio non è una manciata di macchie sparse come `multipleSplats`: è
   * un punto da cui tutto parte VERSO L'ESTERNO. Le macchie stanno su un
   * cerchietto attorno al centro e la loro spinta punta in fuori, quindi il
   * fluido apre una corolla invece di fare una nuvola. Tutte dello stesso
   * colore: un fuoco d'artificio è di un colore solo, e mescolandoli si
   * ottiene la stessa poltiglia dell'ingresso. */
  var lastFwX = -9, lastFwY = -9;

  function firework(){
    /* Due botti di fila non devono cadere vicini: presi a caso puro capitava
     * di continuo che il secondo si aprisse dentro il primo, e si leggevano
     * come un unico scoppio slabbrato. Si tira finché il punto non è lontano
     * abbastanza dal precedente — al massimo otto volte, poi si tiene quello
     * che è uscito: meglio un botto vicino che nessun botto. */
    var cx = 0, cy = 0;
    for (var tries = 0; tries < 8; tries++) {
      cx = 0.16 + Math.random() * 0.68;
      cy = 0.20 + Math.random() * 0.60;
      var ddx = cx - lastFwX, ddy = cy - lastFwY;
      if (ddx * ddx + ddy * ddy > SEQ.salvoApart * SEQ.salvoApart) break;
    }
    lastFwX = cx; lastFwY = cy;
    var c = generateColor();
    c.r *= SEQ.salvoInk; c.g *= SEQ.salvoInk; c.b *= SEQ.salvoInk;
    for (var i = 0; i < SEQ.salvoArms; i++) {
      var a = (i / SEQ.salvoArms) * Math.PI * 2 + Math.random() * 0.25;
      var r = 0.015 + Math.random() * 0.025;
      splat(cx + Math.cos(a) * r, cy + Math.sin(a) * r,
            Math.cos(a) * SEQ.salvoForce, Math.sin(a) * SEQ.salvoForce, c);
    }
  }

  /* ---- IL CURSORE AUTOMATICO ----
   * Un puntatore invisibile che gira attorno al centro per sempre, del tutto
   * indipendente da quello vero: non si ferma quando muovi il mouse e il mouse
   * non lo sposta — i due convivono nello stesso campo di fluido. È lui che fa
   * la differenza fra "un effetto che risponde al cursore" e una scena che
   * vive: senza, passato mezzo secondo dalla macchiata d'ingresso il capitolo
   * torna nero finché non passi col mouse.
   *
   * Il raggio respira (0.72 → 1.0 del massimo) invece di essere fisso, così
   * l'orbita spazza un disco e non un anello sottile.
   *
   * Splatta con inchiostro schiarito ×3.2 e non passando dal percorso del
   * puntatore vero: quello depositerebbe una tinta ~6 volte più fioca, e a
   * macchiata svanita sembrerebbe che non stia succedendo niente. */
  var orbitAngle = 0, orbitSeeded = false, vPrevX = 0, vPrevY = 0;
  var virtualColor = null, lastVColor = 0, awakeSince = 0;

  function driveVirtualPointer(now){
    if (now - awakeSince < config.ORBIT_DELAY) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    var cx = w / 2, cy = h / 2;
    // Il raggio è in pixel, non in texcoord: in texcoord un cerchio su un
    // riquadro largo diventerebbe un'ellisse schiacciata.
    var base = Math.min(config.ORBIT_RADIUS, w * 0.35, h * 0.35);
    var r = base * (0.72 + 0.28 * Math.sin(orbitAngle * 0.37));
    orbitAngle += config.ORBIT_SPEED;
    // Gira per sempre, come nel file. C'è stato un passaggio in cui si fermava
    // dopo un giro solo: ma dopo quel giro l'inchiostro si posa in un paio di
    // secondi, e il capitolo resta un rettangolo nero finché non ci passi sopra
    // col mouse. Su una sezione la cui unica scena è questa, non regge.
    var x = cx + Math.cos(orbitAngle) * r;
    var y = cy + Math.sin(orbitAngle) * r;
    if (!orbitSeeded) {
      // Primo giro: si registra la posizione e basta, se no il primo frame
      // tira una frustata dall'angolo.
      orbitSeeded = true; vPrevX = x; vPrevY = y;
      return;
    }
    if (!virtualColor || now - lastVColor > 120) {
      virtualColor = generateColor();
      virtualColor.r *= 3.2; virtualColor.g *= 3.2; virtualColor.b *= 3.2;
      lastVColor = now;
    }
    var dx = (x - vPrevX) * 9.0, dy = (y - vPrevY) * 9.0;
    vPrevX = x; vPrevY = y;
    // In texcoord la Y è capovolta rispetto ai pixel dello schermo.
    splat(x / w, 1 - y / h, dx, -dy, virtualColor);
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

  function render(){
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    displayProgram.bind();
    if (config.SHADING)
      gl.uniform2f(displayProgram.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
    blit(null);
  }

  // Il buffer di disegno non segue i CSS pixel: si scala col devicePixelRatio,
  // ma non oltre 1.5 — sopra si paga solo GPU.
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

  var lastTime = Date.now(), colorTimer = 0, raf = 0, running = false;
  // Stato della sequenza: la quota del pin, l'ultima salva sparata, e se
  // l'orbita è ancora accesa.
  var seqProgress = 0, lastSalvo = -1, orbitOn = true, cleared = false;
  // Le ondate che seguono la macchiata d'ingresso: si svuotano una per frame,
  // così l'entrata dura qualche decimo invece di essere un fotogramma solo.
  var splatStack = [];

  function update(){
    if (!running) return;
    raf = requestAnimationFrame(update);

    var now = Date.now();
    var dt = Math.min((now - lastTime) / 1000, 0.016666);
    lastTime = now;

    if (document.hidden) return;
    if (resizeCanvas()) initFramebuffers();

    stepSequence();
    if (splatStack.length) multipleSplats(splatStack.pop());
    if (orbitOn) driveVirtualPointer(now);

    colorTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorTimer >= 1) { colorTimer = colorTimer % 1; pointer.color = generateColor(); }

    if (pointer.moved) {
      pointer.moved = false;
      splat(pointer.texcoordX, pointer.texcoordY,
            pointer.deltaX * config.SPLAT_FORCE, pointer.deltaY * config.SPLAT_FORCE,
            pointer.color);
    }

    step(dt);
    render();
  }

  /* Il pilota della sequenza. Legge la quota di scroll e decide tre cose: se
   * l'orbita gira, se è il momento di una salva, e quanto sono accesi i testi.
   *
   * Le salve non partono "quando u supera x": partirebbero a ogni frame finché
   * u resta lì. Partono quando cambia il GRADINO — la finestra dei fuochi è
   * divisa in `SEQ.salvos` scalini e il botto scatta al passaggio da uno al
   * successivo. Tornando indietro `lastSalvo` si riazzera e si possono
   * rivedere. */
  function stepSequence(){
    var u = seqProgress;

    orbitOn = u < SEQ.boom;

    if (u < SEQ.fire) {
      lastSalvo = -1;
    } else if (u < SEQ.boom) {
      var stepIdx = Math.floor((u - SEQ.fire) / (SEQ.boom - SEQ.fire) * SEQ.salvos);
      if (stepIdx > lastSalvo) { lastSalvo = stepIdx; firework(); }
    }

    /* IL NERO, garantito. Dopo l'ultima salva nessuno splatta più e la
     * dissipazione porterebbe via l'inchiostro da sola — ma in quanto tempo lo
     * decide chi scorre, non noi: passando in fretta da `boom` a `invite` sono
     * tre decimi di secondo, e la scritta comparirebbe su una nuvola ancora
     * accesa. Quindi il campo lo si spegne per davvero, in due mosse:
     *   1. il canvas sfuma a zero fra `boom` e `dark` — è quello che si vede,
     *      e sopra la dissipazione vera si legge come fumo che si posa;
     *   2. arrivati a `dark` la simulazione viene SVUOTATA una volta sola, e
     *      il canvas torna opaco: da lì il campo è vergine, e il primo colpo di
     *      cursore disegna sul nero invece che sugli avanzi dei fuochi.
     * Tornando indietro `cleared` si riarma e la sequenza si rigioca. */
    if (u >= SEQ.dark) {
      if (!cleared) { cleared = true; clearSim(); }
      canvas.style.opacity = '1';
    } else {
      cleared = false;
      canvas.style.opacity = (1 - smoothstep(SEQ.boom, SEQ.dark, u)).toFixed(3);
    }

    // I testi. Quello del capitolo si spegne mentre i fuochi lo coprono;
    // l'invito arriva quando il campo è già vuoto.
    var copyA = 1 - smoothstep(SEQ.fire, SEQ.boom, u);
    // L'invito entra, e si spegne quando arriva la consegna.
    // Le dissolvenze sono frazioni della corsa come le quote: allungata la
    // sezione, sono riscalate dello stesso fattore (520/860) — se no una
    // comparsa che durava 62svh ne sarebbe durate 102, e l'invito sarebbe
    // arrivato a piena luce molto più tardi invece che nello stesso punto.
    var inviteA = smoothstep(SEQ.invite, Math.min(1, SEQ.invite + 0.073), u)
                * (1 - smoothstep(SEQ.next - 0.012, SEQ.next + 0.018, u));
    var nextA = smoothstep(SEQ.next, SEQ.next + 0.021, u)
              * (1 - smoothstep(SEQ.nextOut, Math.min(1, SEQ.nextOut + 0.012), u));
    if (copyEl) copyEl.style.opacity = copyA.toFixed(3);
    if (footEl) footEl.style.opacity = copyA.toFixed(3);
    if (invite) invite.style.opacity = inviteA.toFixed(3);
    if (nextEl) nextEl.style.opacity = nextA.toFixed(3);
  }

  function start(){
    if (running || document.hidden) return;
    running = true; lastTime = Date.now();
    // L'entrata si rigioca ogni volta che il capitolo torna in quadro, e non
    // una volta sola al caricamento come nel file: uscendo dalla sezione la
    // simulazione viene svuotata (vedi `stop`), quindi rientrando il campo è
    // vuoto e senza la macchiata si tornerebbe su un rettangolo nero.
    awakeSince = lastTime;
    orbitSeeded = false; orbitAngle = 0;
    resizeCanvas();
    multipleSplats(config.BURST_SPLATS);
    for (var i = 0; i < config.BURST_WAVES; i++)
      splatStack.push(10 + ((Math.random() * 10) | 0));
    raf = requestAnimationFrame(update);
  }
  function stop(){
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    pointer.seen = false; pointer.moved = false;
    splatStack.length = 0;
    clearSim();
  }

  // Il pin: la schermata resta ferma e i 200svh di corsa diventano il tempo
  // della sequenza. `pinSpacing: false` come negli altri capitoli — lo spazio
  // di scroll ce l'ha già la sezione (300svh in sections.css).
  var stPin = pinEl && ScrollTrigger.create({
    trigger: '#cap03', start: 'top top', end: 'bottom bottom',
    pin: pinEl, pinSpacing: false, anticipatePin: 1,
    onUpdate: function(self){ seqProgress = self.progress; }
  });
  // Il fluido esiste solo dove ha un senso: dentro il capitolo. Fuori da lì non
  // gira nemmeno il loop — sono venti passaggi di pressione per frame, non è
  // roba da tenere accesa su tutta la pagina.
  var stLife = ScrollTrigger.create({
    trigger: '#cap03', start: 'top bottom', end: 'bottom top',
    onToggle: function(self){ self.isActive ? start() : stop(); }
  });
  var onVis = function(){ if (document.hidden) stop(); else if (stLife.isActive) start(); };
  document.addEventListener('visibilitychange', onVis);
  if (stLife.isActive) start();

  return function(){
    stop();
    if (stPin) stPin.kill();
    stLife.kill();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('mouseout', onLeave);
    if (dye) dye.destroy();
    if (velocity) velocity.destroy();
    if (pressure) pressure.destroy();
    if (divergence) divergence.destroy();
    if (curl) curl.destroy();
    gl.deleteBuffer(quadBuffer);
    gl.deleteBuffer(quadIndex);
    var lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  };
});
