/* CAP 05 — materiali del robot (carbonio su corpo/braccia, vetro Fresnel
 * sulla testa).
 *
 * Carbonio: MeshStandardMaterial scuro, poco ruvido, abbastanza metallico —
 * risponde alle luci già in scena (HemisphereLight + DirectionalLight,
 * robot.js) leggendo come fibra di carbonio, non plastica opaca.
 *
 * Vetro testa: ShaderMaterial scritto da zero per una mesh 3D curva (non
 * l'adattamento di uno shader piatto). Fresnel classico
 * `fres = pow(1 - max(dot(N,V),0), uPower)`: guardando la testa di fronte
 * (fres basso) il vetro è quasi trasparente — lascerà intravedere il
 * point-brain del Task 5 — di taglio (fres alto) diventa scuro e
 * riflettente. `uOpen` (0..1) modula quanto è trasparente la zona frontale:
 * 1 = "aperto" (vetro sottile, molto trasparente al centro), 0 = "chiuso"
 * (anche il centro legge come vetro scuro pieno). `uTime` alimenta uno
 * shimmer molto leggero sulla superficie, per non essere statica come una
 * texture piatta.
 */
window.WC = window.WC || {};

WC.robotMaterials = (function () {
  function hexToVec3(hex) {
    var r = ((hex >> 16) & 255) / 255;
    var g = ((hex >> 8) & 255) / 255;
    var b = (hex & 255) / 255;
    return new THREE.Vector3(r, g, b);
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
    'varying vec3 vNormalW;',
    'varying vec3 vViewDir;',
    'varying vec3 vWorldPos;',
    'uniform vec3 uTint;',
    'uniform float uPower;',
    'uniform float uOpen;',
    'uniform float uTime;',
    // alpha "di fronte" agli estremi di uOpen: chiuso = quasi pieno,
    // aperto = molto trasparente (deve lasciar vedere il cervello dietro).
    'uniform float uFacingAlphaClosed;',
    'uniform float uFacingAlphaOpen;',
    // alpha di taglio: sempre alta, vetro scuro pieno indipendentemente da uOpen.
    'uniform float uGrazeAlpha;',
    'void main() {',
    '  vec3 N = normalize(vNormalW);',
    '  vec3 V = normalize(vViewDir);',
    '  float ndv = clamp(dot(N, V), 0.0, 1.0);',
    '  float fres = pow(1.0 - ndv, uPower);',
    // fronte: interpola fra chiuso e aperto secondo uOpen.
    '  float facingAlpha = mix(uFacingAlphaClosed, uFacingAlphaOpen, uOpen);',
    // di taglio prende il sopravvento via fres, indipendentemente da uOpen.
    '  float alpha = mix(facingAlpha, uGrazeAlpha, fres);',
    // shimmer molto leggero sulla superficie (non una texture piatta).
    '  float shimmer = 0.035 * sin(uTime * 0.6 + vWorldPos.x * 0.02 + vWorldPos.y * 0.015);',
    // colore: tinta scura di base, si schiarisce verso il bordo (lettura
    // "riflettente" di taglio). Sfondo della sezione è quasi nero: una
    // tinta troppo vicina al nero puro rende "chiuso, alpha alta" identico
    // a "aperto, alpha bassa su sfondo nero" — indistinguibili. closedBoost
    // alza il valore percepito quando uOpen è basso, indipendentemente da
    // fres, cosà il chiuso legge come materiale (vetro scuro) e non come
    // buco nero.
    '  vec3 base = uTint * (0.9 + 0.9 * fres);',
    '  vec3 closedBoost = uTint * 2.0 * (1.0 - uOpen);',
    '  vec3 rim = vec3(0.62, 0.74, 0.88) * (fres * fres) * (0.22 + 0.18 * (1.0 - uOpen));',
    '  vec3 col = base + closedBoost + rim + shimmer * fres;',
    '  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));',
    '}'
  ].join('\n');

  return {
    carbon: function () {
      return new THREE.MeshStandardMaterial({
        color: 0x0b0d10,
        roughness: 0.42,
        metalness: 0.55
      });
    },

    glassHead: function (opts) {
      opts = opts || {};
      var tint = hexToVec3(opts.tint !== undefined ? opts.tint : 0x0a0f14);
      return new THREE.ShaderMaterial({
        uniforms: {
          uTint: { value: tint },
          uPower: { value: opts.power !== undefined ? opts.power : 2.4 },
          uOpen: { value: opts.open !== undefined ? opts.open : 1.0 },
          uTime: { value: 0 },
          uFacingAlphaClosed: { value: opts.facingAlphaClosed !== undefined ? opts.facingAlphaClosed : 0.9 },
          // Bassa: la testa non è un guscio singolo ma ~18 mesh spesso
          // sovrapposte in screen space (casco+anelli collo), quindi lo
          // stacking "over" di più layer trasparenti alza l'opacità
          // percepita anche con alpha per-layer molto bassa (vedi side:
          // FrontSide sopra). Tarato a schermo (Step 4) per restare
          // chiaramente trasparente anche sommando i layer reali del modello.
          uFacingAlphaOpen: { value: opts.facingAlphaOpen !== undefined ? opts.facingAlphaOpen : 0.05 },
          uGrazeAlpha: { value: opts.grazeAlpha !== undefined ? opts.grazeAlpha : 0.96 }
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        // La testa non è un unico guscio: sono 18 mesh separate (casco,
        // anelli del collo...) spesso sovrapposte in screen space. Con
        // DoubleSide ogni mesh contribuisce DUE layer (fronte+retro) allo
        // stacking alpha "over" — verificato a schermo: anche con alpha
        // bassa per singolo layer, 18+ layer sovrapposti si sommano fino a
        // leggere quasi pieni. FrontSide dimezza lo stacking; il resto lo
        // fa l'alpha "di fronte" tenuta molto bassa (vedi uFacingAlphaOpen).
        side: THREE.FrontSide
      });
    },

    applyTo: function (parts) {
      var carb = this.carbon();
      parts.body.concat(parts.armL, parts.armR).forEach(function (m) { m.material = carb; });
      var glass = this.glassHead({ tint: 0x0a0f14 });
      parts.head.forEach(function (m) { m.material = glass; });
      return { glass: glass };
    }
  };
})();
