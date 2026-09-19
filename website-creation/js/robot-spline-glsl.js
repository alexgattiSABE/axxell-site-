/* CAP 05 — gli strati dei materiali Spline, riscritti in GLSL nostro.
 * Formule: blend normale/multiply/screen/overlay, matcap da normale di vista,
 * proiezione planare/triplanare in coordinate OGGETTO (vPosition), bump da
 * derivate, «rainbow» a coseno, Blinn-Phong e GGX con UNA point light
 * (luce non fisica: il colore uniform include già ×π) + ambient + light probe.
 * Ombra portata della point light (Task 4b): shadow map a cubo di three
 * (materiale con lights:true, vedi robot-spline-materials.js), filtrata come
 * Spline e applicata SOLO alla luce diretta (sp_light), se la mesh riceve ombre.
 * Nessun encodings_fragment: output grezzo come la scena Spline (lineare→lineare).
 * Riferimento (NON copiato): GLSL compilato di Spline in
 * ~/Progetti/file-sciolti/robot-spline-tools/spline-ref/. */
window.WC = window.WC || {};
WC.robotSplineGLSL = {
  vert: [
    // Ombra della point light (Task 4b): three calcola vPointShadowCoord (vettore
    // luce→frammento in mondo, spostato di normalBias lungo la normale) con i suoi
    // chunk; servono `transformedNormal` e `worldPosition` con questi nomi.
    '#include <common>',
    '#include <shadowmap_pars_vertex>',
    'varying vec3 vViewPosition;',
    'varying vec3 vNormal;',
    'varying vec3 vPosition;',
    'varying vec3 vObjectNormal;',
    'varying vec3 vWNormal;',
    'varying vec3 vWorldViewDir;',
    'void main() {',
    '  vec3 transformedNormal = normalMatrix * normal;',
    '  vNormal = transformedNormal;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  vViewPosition = -mv.xyz;',
    '  vPosition = position;',
    '  vObjectNormal = normal;',
    '  vWNormal = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);',
    '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
    '  vWorldViewDir = worldPosition.xyz - cameraPosition;',
    '#include <shadowmap_vertex>',
    '}'
  ].join('\n'),

  frag: [
    '#include <common>',
    '#include <packing>',
    '#include <shadowmap_pars_fragment>',
    'uniform bool receiveShadow;',      // three lo imposta per mesh (lights_pars_begin non si include: non serve)
    '#define SP_RPI 0.3183098861837907',
    '#define SP_EPS 1e-6',
    'varying vec3 vViewPosition;',
    'varying vec3 vNormal;',
    'varying vec3 vPosition;',
    'varying vec3 vObjectNormal;',
    'varying vec3 vWNormal;',
    'varying vec3 vWorldViewDir;',
    'uniform vec3 uBaseColor;',
    'uniform vec3 uLightPos;',        // view space
    'uniform vec3 uLightColor;',
    'uniform float uLightDistance;',
    'uniform float uLightDecay;',
    'uniform vec3 uAmbient;',
    'uniform vec3 uProbe[9];',
    'uniform float uLightAlpha;',
    'uniform int uLightMode;',
    'uniform sampler2D uMatcap;',
    'uniform float uMatcapAlpha;',
    'uniform int uMatcapMode;',
    'uniform float uMatcapRot;',
    'uniform float uRbFilm;',
    'uniform float uRbMove;',
    'uniform vec3 uRbWaves;',
    'uniform vec3 uRbOffset;',
    'uniform float uRbAlpha;',
    'uniform int uRbMode;',
    'uniform float uOpacity;',
    '#if defined(MAT_BODY) || defined(MAT_PARTS)',
    'uniform sampler2D uTri;',
    'uniform mat3 uTriMat;',
    'uniform vec2 uTriSize;',
    'uniform float uTriBlend;',
    'uniform float uBumpScale;',
    '#endif',
    '#if defined(MAT_HEAD) || defined(MAT_BODY)',
    'uniform vec3 uSpecular;',
    'uniform float uShininess;',
    '#endif',
    '#ifdef MAT_PARTS',
    'uniform float uRoughness;',
    'uniform float uMetalness;',
    'uniform float uReflectivity;',
    'uniform float uF90;',            // Spline non assegna specularF90 per Parts: ANGLE lo azzera → 0.0
    '#endif',
    '#ifdef MAT_HEAD',
    'uniform sampler2D uVideo;',
    'uniform mat3 uVideoMat;',
    'uniform vec2 uVideoSize;',
    'uniform float uVideoCrop;',
    'uniform float uVideoAlpha;',
    'uniform int uVideoMode;',
    'uniform float uEyes;',           // 1 = occhi accesi, 0 = spenti (reveal)
    '#endif',

    'vec3 sp_blend(vec3 a, vec3 b, float alpha, int mode) {',
    '  if (mode == 1) return mix(a, a * b, alpha);',
    '  if (mode == 2) return mix(a, 1.0 - (1.0 - a) * (1.0 - b), alpha);',
    '  if (mode == 3) { vec3 t = mix(1.0 - 2.0 * (1.0 - a) * (1.0 - b), 2.0 * a * b, step(a, vec3(0.5))); return clamp(mix(a, t, alpha), 0.0, 1.0); }',
    '  return mix(a, b, alpha);',
    '}',
    'float sp_lum(vec3 c) { return dot(vec3(0.2126729, 0.7151522, 0.0721750), c); }',
    'vec3 sp_matcap(vec3 n) {',
    '  vec3 v = normalize(vViewPosition);',
    '  vec3 x = normalize(vec3(v.z, 0.0, -v.x));',
    '  vec3 y = cross(v, x);',
    '  vec2 uv = vec2(dot(x, n), dot(y, n));',
    '  uv = mat2(cos(uMatcapRot), sin(uMatcapRot), -sin(uMatcapRot), cos(uMatcapRot)) * uv;',
    '  return texture2D(uMatcap, uv * 0.495 + 0.5).rgb;',
    '}',
    'vec3 sp_rainbow() {',
    '  vec3 waves = uRbWaves * vec3(1.0, 0.8, 0.6) + 1.0;',
    '  float ang = dot(normalize(vWorldViewDir + uRbOffset * -0.001), normalize(vWNormal));',
    '  return clamp(0.5 + 0.5 * cos((uRbFilm / waves) * ang + uRbMove), 0.0, 2.0);',
    '}',
    'vec3 sp_applyRainbow(vec3 c) {',
    '  vec3 rb = sp_rainbow();',
    '  return sp_blend(c, rb, uRbAlpha * clamp(rb.r + rb.g + rb.b, 0.0, 1.0), uRbMode);',
    '}',
    // Ombra della point light come la calcola Spline — NON il getPointShadow di
    // three r128 (9 prelievi fissi a ±radius texel, risultato 0..1: sulle coppie
    // braccio/gambe/petto dà 2.37/1.97/1.42 contro 1.73/1.40/0.85 di questa).
    // Di three si usano solo shadow map, vPointShadowCoord, cubeToUV e texture2DCompare.
    //  - 8 prelievi su un disco di Vogel (angolo aureo), raggio (shadowRadius + 5)
    //    texel, texel anisotropo 1/(mapSize·(4,2)), spostamento (x, y, −x);
    //  - Spline ruota il disco a ogni pixel e a ogni frame e lo media con la TAA:
    //    qui la media si fa in un colpo su SP_SHADOW_ROT rotazioni fisse, senza rumore;
    //  - Spline parte da 1.0 prima di sommare gli 8 prelievi e divide per 8: in piena
    //    luce il fattore vale 9/8, in ombra piena 1/8. Tenuto così: è quello che si
    //    vede in Spline (senza, le coppie peggiorano a 2.39/1.88/1.31).
    '#if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0',
    '#define SP_SHADOW_ROT 4',
    'float sp_shadow() {',
    '  PointLightShadow s = pointLightShadows[0];',
    '  vec2 texel = 1.0 / (s.shadowMapSize * vec2(4.0, 2.0));',
    '  vec3 lp = vPointShadowCoord[0].xyz;',      // luce → frammento, in mondo
    '  float cmp = (length(lp) - s.shadowCameraNear) / (s.shadowCameraFar - s.shadowCameraNear) + s.shadowBias;',
    '  vec3 dir = normalize(lp);',
    '  float lit = 0.0;',
    '  for (int k = 0; k < SP_SHADOW_ROT; k++) {',
    '    float rot = 6.283185307179586 * float(k) / float(SP_SHADOW_ROT);',
    '    for (int i = 0; i < 8; i++) {',
    '      float th = float(i) * 2.399963 + rot;',
    '      vec2 v = vec2(cos(th), sin(th)) * sqrt((float(i) + 0.5) / 8.0) * texel * (s.shadowRadius + 5.0);',
    '      lit += texture2DCompare(pointShadowMap[0], cubeToUV(dir + vec3(v.x, v.y, -v.x), texel.y), cmp);',
    '    }',
    '  }',
    '  return (1.0 + lit / float(SP_SHADOW_ROT)) / 8.0;',
    '}',
    '#endif',
    'vec3 sp_light(out vec3 color) {',
    '  vec3 d = uLightPos + vViewPosition;',   // luce − posizione (posizione = −vViewPosition)
    '  float dist = length(d);',
    '  float att = 1.0;',
    '  if (uLightDistance > 0.0 && uLightDecay > 0.0) att = pow(clamp(-dist / uLightDistance + 1.0, 0.0, 1.0), uLightDecay);',
    '  color = uLightColor * att;',
    '#if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0',
    '  if (receiveShadow) color *= sp_shadow();',
    '#endif',
    '  return normalize(d);',
    '}',
    'vec3 sp_F(vec3 f0, float f90, float vh) { float f = exp2((-5.55473 * vh - 6.98316) * vh); return f0 * (1.0 - f) + f90 * f; }',
    'vec3 sp_indirect(vec3 n) {',
    '  vec3 w = normalize((vec4(n, 0.0) * viewMatrix).xyz);',
    '  vec3 r = uProbe[0] * 0.886227 + uProbe[1] * 2.0 * 0.511664 * w.y + uProbe[2] * 2.0 * 0.511664 * w.z + uProbe[3] * 2.0 * 0.511664 * w.x',
    '    + uProbe[4] * 2.0 * 0.429043 * w.x * w.y + uProbe[5] * 2.0 * 0.429043 * w.y * w.z + uProbe[6] * (0.743125 * w.z * w.z - 0.247708)',
    '    + uProbe[7] * 2.0 * 0.429043 * w.x * w.z + uProbe[8] * 0.429043 * (w.x * w.x - w.y * w.y);',
    '  return uAmbient + r;',
    '}',
    '#if defined(MAT_HEAD) || defined(MAT_BODY)',
    // Blinn-Phong è lineare nel colore diffuso: luce(d) = k·d + s. Si separa
    // k (diffusa diretta + indiretta) da s (speculare) perché la testa lo
    // riapplica a più campioni del video senza ricalcolare luce e ombra.
    'void sp_blinnPhongKS(vec3 n, out vec3 k, out vec3 s) {',
    '  vec3 lc; vec3 L = sp_light(lc); vec3 V = normalize(vViewPosition);',
    '  vec3 irr = clamp(dot(n, L), 0.0, 1.0) * lc;',
    '  vec3 H = normalize(L + V);',
    '  float nh = clamp(dot(n, H), 0.0, 1.0), vh = clamp(dot(V, H), 0.0, 1.0);',
    '  float sh = max(0.0001, uShininess);',
    '  vec3 spec = sp_F(uSpecular, 1.0, vh) * (0.25 * SP_RPI * (sh * 0.5 + 1.0) * pow(nh, sh));',
    '  k = (irr + sp_indirect(n)) * SP_RPI;',
    '  s = irr * spec;',
    '}',
    'vec3 sp_blinnPhong(vec3 diffuse, vec3 n) { vec3 k, s; sp_blinnPhongKS(n, k, s); return k * diffuse + s; }',
    '#endif',
    '#ifdef MAT_PARTS',
    'vec3 sp_physical(vec3 diffuse, vec3 n, float rough) {',
    '  vec3 lc; vec3 L = sp_light(lc); vec3 V = normalize(vViewPosition);',
    '  float nl = clamp(dot(n, L), 0.0, 1.0); vec3 irr = nl * lc;',
    '  vec3 dcol = diffuse * (1.0 - uMetalness);',
    '  vec3 f0 = mix(vec3(0.16 * uReflectivity * uReflectivity), diffuse, uMetalness);',
    '  float a = rough * rough, a2 = a * a;',
    '  vec3 H = normalize(L + V);',
    '  float nv = clamp(dot(n, V), 0.0, 1.0), nh = clamp(dot(n, H), 0.0, 1.0), vh = clamp(dot(V, H), 0.0, 1.0);',
    '  float gv = nl * sqrt(a2 + (1.0 - a2) * nv * nv), gl = nv * sqrt(a2 + (1.0 - a2) * nl * nl);',
    '  float vis = 0.5 / max(gv + gl, SP_EPS);',
    '  float den = nh * nh * (a2 - 1.0) + 1.0;',
    '  float D = SP_RPI * a2 / (den * den);',
    '  return irr * sp_F(f0, uF90, vh) * (vis * D) + irr * SP_RPI * dcol + sp_indirect(n) * SP_RPI * dcol;',
    '}',
    '#endif',
    '#if defined(MAT_BODY) || defined(MAT_PARTS)',
    'vec2 sp_triUv(vec2 p) { return (uTriMat * vec3(p / (uTriSize * 0.5), 1.0) / 2.0 + 0.5).xy; }',
    'vec2 sp_dHdxy(vec2 uv) {',
    '  vec2 dx = dFdx(uv), dy = dFdy(uv);',
    '  float h = uBumpScale * sp_lum(texture2D(uTri, uv).rgb);',
    '  return vec2(uBumpScale * sp_lum(texture2D(uTri, uv + dx).rgb) - h, uBumpScale * sp_lum(texture2D(uTri, uv + dy).rgb) - h);',
    '}',
    'vec3 sp_perturb(vec3 n, vec2 dh, float face) {',
    '  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);',
    '  vec3 r1 = normalize(cross(sy, n)), r2 = normalize(cross(n, sx));',
    '  float det = dot(sx, r1) * face;',
    '  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));',
    '}',
    '#endif',
    // Visore (Head): la catena di strati di Spline per UN campione del video —
    // video planare sul nero, luce Blinn-Phong (k·c + s), matcap, rainbow.
    // Spline campiona il video senza mipmap (minFilter 1006 a runtime, anche se
    // il layer dichiara 1008) e i puntini dei LED li ammorbidisce la sua TAA:
    // jitter subpixel accumulato, cioè la media del colore FINALE sull'area del
    // pixel. Qui la stessa media in un colpo: SP_VIDEO_SS² campioni del video
    // sull'impronta del pixel, ognuno fatto passare per tutta la catena (la
    // catena non è lineare: mediare prima il video spegne i puntini). Ogni
    // campione legge la mipmap adatta al suo passo, così niente sfarfallio
    // anche a testa piccola.
    '#ifdef MAT_HEAD',
    '#define SP_VIDEO_SS 4',
    'vec3 sp_head(vec4 vt, vec2 uv, float vmask, vec3 k, vec3 s, vec3 mc, vec3 rb, float rba) {',
    '  float va = vmask * vt.a;',
    '  if (uVideoCrop > 0.5 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) va = 0.0;',
    '  vec3 c = sp_blend(uBaseColor, vt.rgb, va, uVideoMode);',
    '  c = sp_blend(c, k * c + s, uLightAlpha, uLightMode);',
    '  c = sp_blend(c, mc, uMatcapAlpha, uMatcapMode);',
    '  return sp_blend(c, rb, rba, uRbMode);',
    '}',
    '#endif',

    'void main() {',
    '  float face = gl_FrontFacing ? 1.0 : -1.0;',
    '  vec3 n = normalize(vNormal);',
    '  vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));',
    '  if (dot(n, fn) < 0.0) n *= -1.0;',
    '  vec3 c = uBaseColor;',
    '#if defined(MAT_BODY) || defined(MAT_PARTS)',
    '  vec2 uv0 = sp_triUv(vPosition.xy), uv1 = sp_triUv(vPosition.zy), uv2 = sp_triUv(vPosition.xz);',
    '  vec3 tw = pow(abs(normalize(vObjectNormal)), vec3((1.0 - uTriBlend) * 125.0 + 3.0));',
    '  tw /= dot(tw, vec3(1.0));',
    '  vec3 nb = normalize(sp_perturb(n, sp_dHdxy(uv0), face) * tw.z + sp_perturb(n, sp_dHdxy(uv1), face) * tw.x + sp_perturb(n, sp_dHdxy(uv2), face) * tw.y);',
    '#endif',

    '#ifdef MAT_HEAD',
    '  vec2 vuv = (uVideoMat * vec3(vPosition.xy / (uVideoSize * 0.5), 1.0) / 2.0 + 0.5).xy;',
    '  vec2 vdx = dFdx(vuv), vdy = dFdy(vuv);',
    '  float vmask = uVideoAlpha * step(0.0, dot(vObjectNormal, vec3(0.0, 0.0, 1.0))) * uEyes;',
    '  vec3 hk, hs; sp_blinnPhongKS(n, hk, hs);',
    '  vec3 mc = sp_matcap(n), rb = sp_rainbow();',
    '  float rba = uRbAlpha * clamp(rb.r + rb.g + rb.b, 0.0, 1.0);',
    '  if (vmask > 0.0) {',
    '    vec3 acc = vec3(0.0);',
    '    float fs = float(SP_VIDEO_SS);',
    '    for (int i = 0; i < SP_VIDEO_SS; i++) for (int j = 0; j < SP_VIDEO_SS; j++) {',
    '      vec2 o = (vec2(float(i), float(j)) + 0.5) / fs - 0.5;',
    '      vec2 uv = vuv + o.x * vdx + o.y * vdy;',
    '      acc += sp_head(texture2DGradEXT(uVideo, uv, vdx / fs, vdy / fs), uv, vmask, hk, hs, mc, rb, rba);',
    '    }',
    '    c = acc / (fs * fs);',
    '  } else {',
    '    c = sp_head(vec4(0.0), vuv, 0.0, hk, hs, mc, rb, rba);',
    '  }',
    '#endif',

    '#ifdef MAT_BODY',
    '  c = sp_blend(c, sp_matcap(nb), uMatcapAlpha, uMatcapMode);',
    '  c = sp_blend(c, sp_blinnPhong(c, nb), uLightAlpha, uLightMode);',
    '  c = sp_applyRainbow(c);',
    '#endif',

    '#ifdef MAT_PARTS',
    '  c = sp_applyRainbow(c);',
    '  c = sp_blend(c, sp_matcap(nb), uMatcapAlpha, uMatcapMode);',
    '  float rough = clamp((sp_lum(texture2D(uTri, uv0).rgb) * tw.z + sp_lum(texture2D(uTri, uv1).rgb) * tw.x + sp_lum(texture2D(uTri, uv2).rgb) * tw.y) * uRoughness, 0.04, 1.0);',
    '  c = sp_blend(c, sp_physical(c, nb, rough), uLightAlpha, uLightMode);',
    '#endif',

    '  gl_FragColor = vec4(c, uOpacity);',
    '}'
  ].join('\n')
};
