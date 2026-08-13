/* CURSORE FLUIDO — capitolo 03, la colonna di vetro.
 *
 * Vive solo dentro quel capitolo: il canvas sta nel pin e il loop parte e si
 * ferma con la sezione. Dentro non serve premere niente — basta muovere il
 * mouse — ma fuori non gira affatto.
 *
 * Porting della WebGL Fluid Simulation di Pavel Dobryakov (MIT, 2017,
 * github.com/PavelDoGreat/WebGL-Fluid-Simulation) adattato a questa pagina.
 * Cosa cambia rispetto al sorgente, e perché:
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
 * 4. VORTICITÀ E RAGGIO BASSI. CURL 2 invece di 30, SPLAT_RADIUS 0.07 invece
 *    di 0.25: una scia che segue il cursore, non uno spruzzo che invade la
 *    pagina. La dissipazione è alta per lo stesso motivo — il testo sotto deve
 *    restare leggibile.
 * 5. TRASPARENTE. Il canvas non ha fondo: si compone sopra la scena 3D del
 *    capitolo in mix-blend-mode screen (vedi sections.css).
 *
 * Con reduced-motion il modulo non parte affatto.
 */
WC.register('fluid', function(ctx){
  var canvas = document.getElementById('wcFluid');
  if (!canvas || !ctx.motionOk) return;

  var mobile = window.innerWidth <= 640 || matchMedia('(pointer:coarse)').matches;

  var config = {
    SIM_RESOLUTION: mobile ? 96 : 128,
    DYE_RESOLUTION: mobile ? 384 : 768,
    DENSITY_DISSIPATION: 1.5,
    VELOCITY_DISSIPATION: 1.1,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: mobile ? 12 : 16,
    CURL: 2,               // vorticità bassa: niente riccioli isterici
    SPLAT_RADIUS: 0.09,    // raggio piccolo: scia, non spruzzo
    SPLAT_FORCE: 5000,
    SHADING: true,
    COLOR_UPDATE_SPEED: 4
  };

  // ------------------------------------------------------------- contesto
  var params = { alpha: true, depth: false, stencil: false, antialias: false,
                 // Il canvas non si vede: lo rilegge js/spine.js come texture
                 // per portare la scia dentro la scena 3D. Senza
                 // preserveDrawingBuffer il buffer può già essere stato
                 // svuotato quando l'altro contesto va a caricarlo, e si
                 // ottiene un frame nero sì e uno no.
                 preserveDrawingBuffer: true };
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
    // Il sorgente moltiplica per 0.15 su fondo nero pieno. Qui la scia si somma
    // a una scena già illuminata: sotto 0.3 sparisce e sembra rotta.
    c.r *= 0.34; c.g *= 0.34; c.b *= 0.34;
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
  function correctRadius(radius){
    var aspect = canvas.width / canvas.height;
    return aspect > 1 ? radius * aspect : radius;
  }

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
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100));
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
  function clearSim(){
    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, dye.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, 0);
    blit(dye.write); dye.swap();
    gl.uniform1i(clearProgram.uniforms.uTexture, velocity.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, 0);
    blit(velocity.write); velocity.swap();
    render();
  }

  resizeCanvas();
  initFramebuffers();

  var lastTime = Date.now(), colorTimer = 0, raf = 0, running = false;

  function update(){
    if (!running) return;
    raf = requestAnimationFrame(update);

    var now = Date.now();
    var dt = Math.min((now - lastTime) / 1000, 0.016666);
    lastTime = now;

    if (document.hidden) return;
    if (resizeCanvas()) initFramebuffers();

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

  function start(){
    if (running || document.hidden) return;
    running = true; lastTime = Date.now();
    raf = requestAnimationFrame(update);
  }
  function stop(){
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    pointer.seen = false; pointer.moved = false;
    clearSim();
  }

  // Il fluido esiste solo dove ha un senso: il capitolo della colonna. Fuori
  // da lì non gira nemmeno il loop — sono venti passaggi di pressione per
  // frame, non è roba da tenere accesa su tutta la pagina.
  var stLife = ScrollTrigger.create({
    trigger: '#cap03', start: 'top bottom', end: 'bottom top',
    onToggle: function(self){ self.isActive ? start() : stop(); }
  });
  var onVis = function(){ if (document.hidden) stop(); else if (stLife.isActive) start(); };
  document.addEventListener('visibilitychange', onVis);
  if (stLife.isActive) start();

  return function(){
    stop();
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
