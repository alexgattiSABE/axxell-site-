/* CAP 05 — fibre luminose lungo le braccia ("i fasci").
 *
 * Dalla spec (docs/superpowers/specs/2026-08-31-robot-cervello-vesper-design.md
 * §5, dalla voce del copy): «Dietro, il rame si accende dove passi.» Non è un
 * rig anatomico (il GLB non ha ossa, vedi robot-parts.js): sono curve
 * Catmull-Rom ancorate ai tre punti-chiave per braccio che WC.robotParts.split
 * ricava dai bounding box (shoulder=top, elbow=metà, wrist=bottom), poi
 * materializzate come tubi sottili con uno shader emissivo che fa scorrere un
 * gradiente lungo la coordinata u del tubo — la "corrente" del copy.
 *
 * Il modulo consuma SOLO `joints` (Task 2): niente dipendenza da headGroup,
 * materiali o dal loop di robot.js. robot.js aggiunge `object` come figlio di
 * `model` (lo stesso parent delle mesh-braccio, vedi robot-parts.js — la
 * gerarchia del GLB è piatta) e ogni frame chiama `update(dt, surgeL, surgeR)`
 * col segnale di raycast sulle braccia (vedi tick() in robot.js). Essendo
 * figlie di `model`, le fibre restano incollate alle braccia sotto qualunque
 * rotazione del `wrap` (drag, Task 7): joints sono già in coordinate
 * MODEL-LOCALI (WC.robotParts.split gira DOPO la centratura di model, vedi
 * robot.js), lo stesso spazio in cui vive `object`.
 */
window.WC = window.WC || {};

WC.robotFibers = (function () {
  var TUBULAR_SEGMENTS = 40;
  var RADIAL_SEGMENTS = 6;
  var FIBERS_PER_ARM = 3;

  var VERT = [
    'varying vec2 vUv;',
    'varying vec3 vNormalW;',
    'varying vec3 vViewDir;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
    '  vNormalW = normalize(mat3(modelMatrix) * normal);',
    '  vViewDir = normalize(cameraPosition - worldPos.xyz);',
    '  gl_Position = projectionMatrix * viewMatrix * worldPos;',
    '}'
  ].join('\n');

  // uv.x (three.js TubeGeometry) è la coordinata LUNGO il tubo, 0 al primo
  // punto della curva (shoulder) e 1 all'ultimo (wrist) — esattamente la `u`
  // della spec. uv.y gira attorno alla circonferenza, usata solo per un
  // filo di Fresnel così il tubo legge come cilindro illuminato e non come
  // un nastro piatto.
  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'varying vec3 vNormalW;',
    'varying vec3 vViewDir;',
    'uniform float uTime;',
    'uniform float uSurge;',
    'uniform float uSpeed;',
    'uniform float uBaseline;',
    'uniform vec3 uColorCold;',
    'uniform vec3 uColorHot;',
    'void main() {',
    '  float speed = uSpeed * (1.0 + uSurge * 3.0);',
    // tre impulsi ripetuti lungo il tubo (repeats=3.0): un solo scroll
    // continuo si legge quasi statico su una fibra corta come queste; più
    // impulsi che si rincorrono leggono come corrente reale. fract(u*3 -
    // t*speed) fa avanzare la fase di ogni impulso da shoulder (u=0) verso
    // wrist (u=1) quando il tempo cresce.
    '  float repeats = 3.0;',
    '  float phase = fract(vUv.x * repeats - uTime * speed);',
    // pow 5 (era 3): impulso più STRETTO — legge come uno scatto di corrente
    // che passa, non come un'onda larga che tiene il tubo sempre mezzo
    // acceso (verificato a schermo, task6-idle: pow 3 con la baseline
    // alzata leggeva come una barra piena, non come fili sottili).
    '  float band = pow(clamp(1.0 - abs(phase - 0.5) * 2.0, 0.0, 1.0), 5.0);',
    '  vec3 N = normalize(vNormalW);',
    '  vec3 V = normalize(vViewDir);',
    '  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);',
    // baseline sempre acceso (fibre visibili anche a riposo, discrete) +
    // il contributo dell'impulso (cresce forte con uSurge) + un filo di
    // Fresnel che segue la stessa intensità. Tarato a schermo (task6-idle/
    // task6-surge): con depthTest:false (vedi makeMaterial) le fibre sono
    // sempre in vista, ma restano DENTRO al volume del braccio, additive su
    // un guscio di carbonio scuro — serve più baseline di quanto sembri "sulla
    // carta" per leggere come una linea accesa e non sparire nel nero.
    '  float intensity = uBaseline + band * (0.14 + uSurge * 1.35) + fres * (0.06 + uSurge * 0.3);',
    '  vec3 col = mix(uColorCold, uColorHot, clamp(uSurge * 0.7 + band * 0.3, 0.0, 1.0));',
    '  gl_FragColor = vec4(col * intensity, clamp(intensity, 0.0, 1.0));',
    '}'
  ].join('\n');

  function makeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSurge: { value: 0 },
        // Cicli/secondo del pattern ripetuto (repeats=3 nel frammento) a
        // riposo — "flusso lento" del copy; uSurge lo moltiplica fino a x4.
        uSpeed: { value: 0.22 },
        // Tarato a schermo (task6-idle.png): con le fibre DENTRO il volume
        // del braccio (depthTest:false le rende comunque visibili, vedi
        // makeMaterial più sotto) un valore troppo basso spariva contro il
        // carbonio scuro, uno troppo alto leggeva come una barra piena
        // invece che un filo acceso. 0.16 (insieme al raggio dimezzato sopra
        // e al picco degli impulsi più stretto nel frammento) è il punto in
        // cui resta un filo visibile ma discreto.
        uBaseline: { value: 0.16 },
        // Rame (spec: "il rame si accende") a riposo/surge basso, che vira
        // verso un bianco caldo negli impulsi/al surge alto — legge come
        // corrente che si intensifica, non solo come tinta fissa.
        uColorCold: { value: new THREE.Vector3(1.0, 0.63, 0.38) },  // ~0xffa060
        uColorHot: { value: new THREE.Vector3(1.0, 0.93, 0.8) }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // Le fibre corrono ancorate ai giunti (spalla/gomito/polso), quindi in
      // buona parte DENTRO il volume delle mesh-braccio opache (carbonio,
      // vedi robot-materials.js) — con depthTest normale resterebbero
      // occluse quasi ovunque tranne le fessure fra un segmento e l'altro
      // (verificato a schermo: solo un filo acceso nel varco spalla/busto).
      // Il contratto è solo `joints` (niente raggio/sezione reale del
      // braccio da cui calcolare un offset che le porti sempre in
      // superficie): la lettura voluta — "il rame si accende" SOTTO il
      // guscio di carbonio — è più vicina a un bagliore che filtra dalla
      // corrente interna che a un cavo esterno. depthTest:false le rende
      // sempre visibili lungo tutto il tragitto spalla→mano, coerente col
      // resto della sezione (stesso pattern additive+depthTest:false già
      // usato per il campo di stelle in js/glsl.js).
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }

  // Costruisce il fascio di N tubi paralleli per un braccio: le curve sono
  // tutte Catmull-Rom sugli stessi 3 giunti, traslate di un piccolo offset
  // laterale calcolato nel piano perpendicolare all'asse spalla→polso, a
  // FIBERS_PER_ARM angoli distribuiti attorno a quell'asse — legge come un
  // cavo a più fili, non come un'unica linea. Nessuna dipendenza da
  // headWorldSize (non disponibile qui, il contratto è solo `joints`): il
  // raggio si scala sulla lunghezza del braccio stesso.
  function buildArmFibers(shoulder, elbow, wrist, material, group) {
    var mainDir = new THREE.Vector3().subVectors(wrist, shoulder);
    var armLen = mainDir.length();
    if (armLen < 1e-4) return; // giunti degeneri (braccio vuoto, vedi robotParts.split) — niente da disegnare
    mainDir.normalize();

    var up = Math.abs(mainDir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    var perp1 = new THREE.Vector3().crossVectors(mainDir, up).normalize();
    var perp2 = new THREE.Vector3().crossVectors(mainDir, perp1).normalize();

    // Tarato a schermo (task6-idle.png): 0.028 leggeva come una barra piena,
    // non come fili sottili — dimezzato, e lo sparpagliamento del fascio
    // (offsetMag) allargato di proporzione così le 2-3 fibre restano
    // distinguibili invece di fondersi in un unico blocco.
    var radius = armLen * 0.014;
    var offsetMag = radius * 3.4;

    for (var i = 0; i < FIBERS_PER_ARM; i++) {
      var angle = (i / FIBERS_PER_ARM) * Math.PI * 2 + Math.PI / 6;
      var off = perp1.clone().multiplyScalar(Math.cos(angle) * offsetMag)
        .add(perp2.clone().multiplyScalar(Math.sin(angle) * offsetMag));
      var pts = [
        shoulder.clone().add(off),
        elbow.clone().add(off),
        wrist.clone().add(off)
      ];
      var curve = new THREE.CatmullRomCurve3(pts);
      var geo = new THREE.TubeGeometry(curve, TUBULAR_SEGMENTS, radius, RADIAL_SEGMENTS, false);
      var mesh = new THREE.Mesh(geo, material);
      group.add(mesh);
    }
  }

  return {
    /**
     * @param {Object} joints - parts.joints da WC.robotParts.split: Vector3
     *   MODEL-LOCALI {shoulderL, elbowL, wristL, shoulderR, elbowR, wristR}.
     * @returns {{object: THREE.Object3D, update: function(dt, surgeL, surgeR)}}
     */
    create: function (joints) {
      joints = joints || {};
      var object = new THREE.Group();
      object.name = 'robotFibers';

      var matL = makeMaterial();
      var matR = makeMaterial();

      var groupL = new THREE.Group();
      var groupR = new THREE.Group();
      object.add(groupL, groupR);

      if (joints.shoulderL && joints.elbowL && joints.wristL) {
        buildArmFibers(joints.shoulderL, joints.elbowL, joints.wristL, matL, groupL);
      }
      if (joints.shoulderR && joints.elbowR && joints.wristR) {
        buildArmFibers(joints.shoulderR, joints.elbowR, joints.wristR, matR, groupR);
      }

      var time = 0;
      function update(dt, surgeL, surgeR) {
        time += dt || 0;
        matL.uniforms.uTime.value = time;
        matR.uniforms.uTime.value = time;
        matL.uniforms.uSurge.value = surgeL || 0;
        matR.uniforms.uSurge.value = surgeR || 0;
      }

      return { object: object, update: update };
    }
  };
})();
