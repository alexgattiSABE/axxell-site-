/* CAP 05 — materiali Spline (Head/Body/Parts) costruiti dai dati estratti
 * (WC.robotSplineData) sullo shader di robot-spline-glsl.js. Assegnazione per
 * INDICE di mesh (stesso ordine della scena Spline) con controllo del nome. */
window.WC = window.WC || {};
WC.robotSplineMaterials = (function () {
  // Logo «A» sul petto (Task 7). Tutta la taratura sta qui — si ritocca con Nike.
  //  - u/v/width: FRAZIONI del bounding box della mesh del petto (coordinate
  //    oggetto). u/v = centro del quadrato del logo, width = larghezza. A
  //    0.5/0.70/0.36 la «A» è un distintivo alto sul petto, ~95 px a 1440×900.
  //  - base/spec/shininess: il «bianco lucido». base = bianco pieno di fondo
  //    (0.84 → il logo legge bianco anche dove il riflesso non batte), spec =
  //    quanto brucia il riflesso (2.2: il cuore satura a 255), shininess =
  //    quanto è stretto (320: la striscia copre ~1/3 della «A»).
  //  - lightDist/lightSwing: posizione della luce virtuale, in LARGHEZZE DEL
  //    LOGO. dist = quanto sta davanti al logo (3.4: abbastanza lontana da dare
  //    una striscia coerente invece di un puntino), swing = quanto si sposta di
  //    lato col puntatore a fondo corsa (1.7: oltre, il riflesso esce dalla «A»
  //    perché il petto è quasi piatto — la normale spazia solo ±12°).
  //  - lightRest: dove sta la luce quando il puntatore è fuori (in coordinate
  //    puntatore: x a sinistra, y in alto).
  var LOGO_CONFIG = { u: 0.5, v: 0.70, width: 0.36, base: 0.84, spec: 2.2, shininess: 320,
    lightDist: 3.4, lightSwing: 1.7, lightRest: { x: -0.35, y: -0.35 } };
  var LOGO_SVG = 'assets/robot-spline/logo-axxell-icon.svg';
  var LOGO_TEX_SIZE = 2048;

  function v3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
  function m3(a) { var m = new THREE.Matrix3(); m.fromArray(a); return m; }
  function tex(path, g, list) {
    // onError: senza, una texture che non arriva è uno strato nero
    // trasparente e basta — il materiale continua a funzionare, cambia solo
    // l'aspetto, e non si sa da dove. Con il warn il percorso si legge in
    // console. `console.warn` e non `error`: la sezione non è rotta, e
    // l'harness deve restare console-clean.
    var t = new THREE.TextureLoader().load(path, undefined, undefined, function () {
      console.warn('[robot] texture non caricata:', path);
    });
    t.encoding = THREE.LinearEncoding;
    t.flipY = g.flipY !== false;
    if (g.wrapS) t.wrapS = g.wrapS;
    if (g.wrapT) t.wrapT = g.wrapT;
    list.push(t);
    return t;
  }
  function common(D, m, list) {
    return {
      uBaseColor: { value: v3(m.base.color) },
      uLightPos: { value: new THREE.Vector3() },
      uLightColor: { value: v3(D.light.color) },
      uLightDistance: { value: D.light.distance },
      uLightDecay: { value: D.light.decay },
      uAmbient: { value: v3(D.ambient) },
      uProbe: { value: D.probe.map(v3) },
      uLightAlpha: { value: m.light.alpha },
      uLightMode: { value: m.light.mode },
      uMatcap: { value: tex(m.matcap.tex, m.matcap, list) },
      uMatcapAlpha: { value: m.matcap.alpha },
      uMatcapMode: { value: m.matcap.mode },
      uMatcapRot: { value: m.matcap.rotation || 0 },
      uRbFilm: { value: m.rainbow.film },
      uRbMove: { value: m.rainbow.movement },
      uRbWaves: { value: v3(m.rainbow.wavelengths) },
      uRbOffset: { value: v3(m.rainbow.offset) },
      uRbAlpha: { value: m.rainbow.alpha },
      uRbMode: { value: m.rainbow.mode },
      uOpacity: { value: 1 }
    };
  }
  function tri(m, u, list) {
    u.uTri = { value: tex(m.tri.tex, m.tri, list) };
    u.uTriMat = { value: m3(m.tri.mat) };
    u.uTriSize = { value: new THREE.Vector2(m.tri.size[0], m.tri.size[1]) };
    u.uTriBlend = { value: m.tri.blending };
    u.uBumpScale = { value: m.bumpScale };
  }
  // lights:true solo per ricevere da three l'ombra della point light (shadow map,
  // matrice, parametri): l'illuminazione resta nelle nostre uniform. Le uniform
  // luci di three si clonano da UniformsLib; le nostre si aggiungono così come
  // sono (UniformsUtils.merge clonerebbe anche le texture).
  function shader(define, uniforms) {
    var d = {}; d[define] = '';
    var u = THREE.UniformsUtils.merge([THREE.UniformsLib.lights]);
    Object.keys(uniforms).forEach(function (k) { u[k] = uniforms[k]; });
    var mat = new THREE.ShaderMaterial({
      defines: d, uniforms: u, lights: true,
      vertexShader: WC.robotSplineGLSL.vert, fragmentShader: WC.robotSplineGLSL.frag,
      extensions: { derivatives: true, shaderTextureLOD: true }
    });
    return mat;
  }

  function create(D) {
    var list = [];
    var P = D.materials.Parts, B = D.materials.Body;
    var pu = common(D, P, list); tri(P, pu, list);
    pu.uRoughness = { value: P.light.roughness };
    pu.uMetalness = { value: P.light.metalness };
    pu.uReflectivity = { value: P.light.reflectivity };
    pu.uF90 = { value: 0.0 };   // A/B sulle coppie: 0.0 (come Spline compilato su ANGLE) vs 1.0
    var bu = common(D, B, list); tri(B, bu, list);
    bu.uSpecular = { value: v3(B.light.specular) };
    bu.uShininess = { value: B.light.shininess };

    // Head (visore): strato «video» planare con gli occhi a LED, poi luce,
    // matcap e rainbow come Spline. Il video parte/si ferma con la sezione
    // (setPlaying, da robot.js); finché non scorre davvero si mostra il poster.
    var Hd = D.materials.Head;
    var video = document.createElement('video');
    // crossOrigin PRIMA di src: assegnato dopo, un video già in corso di
    // fetch (o già in cache CORS-less) può restare senza l'attributo — qui è
    // innocuo (stesso host), ma è l'ordine giusto per non doverlo ricordare
    // il giorno in cui eyes.mp4 finisse su un host/CDN diverso.
    video.crossOrigin = 'anonymous';
    video.src = Hd.video.src; video.muted = true; video.defaultMuted = true; video.loop = true;
    video.playsInline = true; video.setAttribute('playsinline', ''); video.preload = 'auto';
    var vtex = new THREE.VideoTexture(video);
    vtex.encoding = THREE.LinearEncoding; vtex.flipY = Hd.video.flipY !== false;
    // Mipmap: lo shader preleva il video SP_VIDEO_SS² volte per pixel e ogni
    // prelievo legge la mipmap adatta al suo passo (textureGrad, sp_head in
    // robot-spline-glsl.js) — così i puntini dei LED non sfarfallano. Spline a
    // runtime usa minFilter 1006 senza mipmap e li ammorbidisce con la TAA.
    vtex.generateMipmaps = true; vtex.minFilter = THREE.LinearMipmapLinearFilter; vtex.magFilter = THREE.LinearFilter;
    var poster = tex(Hd.video.poster, { flipY: Hd.video.flipY }, list);
    list.push(vtex);
    var hu = common(D, Hd, list);
    hu.uSpecular = { value: v3(Hd.light.specular) };
    hu.uShininess = { value: Hd.light.shininess };
    hu.uVideo = { value: poster };         // poster finché il video non scorre davvero
    hu.uVideoMat = { value: m3(Hd.video.mat) };
    hu.uVideoSize = { value: new THREE.Vector2(Hd.video.size[0], Hd.video.size[1]) };
    hu.uVideoCrop = { value: Hd.video.crop ? 1 : 0 };
    hu.uVideoAlpha = { value: Hd.video.alpha };
    hu.uVideoMode = { value: Hd.video.mode };
    hu.uEyes = { value: 1 };
    // Dal poster al video al primo fotogramma presentato: a quel punto la
    // VideoTexture (r128, requestVideoFrameCallback) ha già un'immagine da
    // caricare — niente fotogramma nero fra poster e video.
    function useVideo() { hu.uVideo.value = vtex; }
    function onPlaying() {
      if (hu.uVideo.value === vtex) return;
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(useVideo); else useVideo();
    }
    video.addEventListener('playing', onPlaying);

    var head = shader('MAT_HEAD', hu);
    // DUE reveal, uno per zona. Testa (cursore sul visore): il visore diventa
    // quasi trasparente, gli occhi si spengono e le mesh DENTRO il visore
    // sfumano, così il cervello (robot.js) si vede intero. Pancia (cursore sul
    // torso): il torso diventa quasi trasparente e si vede la sfera, mentre la
    // «A» resta piena. A riposo ogni pezzo ha alpha 1 e scrive depth come un
    // opaco: stesso aspetto di prima del reveal, pixel per pixel.
    // Ordine di disegno, tutto nella coda trasparente: sfera della pancia e
    // cervello (renderOrder 0) → interni (1) → visore (2) → torso (3), scritto
    // in robot.js dove le mesh sono note.
    //
    // Due reveal indipendenti, due gruppi di interni. Prima ce n'era UNO solo,
    // del modulo: aprire la testa avrebbe sfumato anche gli interni della
    // pancia e viceversa. Ogni gruppo tiene i materiali che sfumano col SUO
    // reveal e le mesh la cui ombra segue lo stesso reveal.
    var groups = {
      head:  { materials: [], castMeshes: [] },
      belly: { materials: [], castMeshes: [] }
    };
    var REVEAL_MIN_ALPHA = 0.045;   // stesso valore del vetro di agosto (uMinAlpha)
    // Il minimo del torso è staccato da quello del visore perché i due pezzi
    // non si assomigliano: il visore è uno specchietto, il torso è la massa più
    // grande del robot. Lo spec lo indica come la manopola da girare se
    // l'interno «legge come un buco» — guardato a schermo (09-pancia-reveal.png,
    // fondo quasi nero della sezione) a 0.06 il torso si apre e la sagoma resta
    // leggibile, quindi resta questo.
    var BELLY_MIN_ALPHA = 0.06;
    head.transparent = true;
    var byName = { Parts: shader('MAT_PARTS', pu), Body: shader('MAT_BODY', bu), Head: head };
    var all = [byName.Parts, byName.Body, head];
    var lightWorld = v3(D.light.worldPosition);
    // Sfumatura degli interni di un gruppo, uguale per testa e pancia.
    // Ombre: un pezzo quasi trasparente non può proiettare l'ombra piena di un
    // opaco, e la shadow map non conosce l'alpha — le mesh del gruppo smettono
    // di proiettarla a metà reveal (r > 0.5) e la riprendono tornando sotto,
    // dove il pezzo che le copre è ancora per metà opaco.
    function fadeInside(g, r) {
      g.materials.forEach(function (m) { m.uniforms.uOpacity.value = 1 - r; m.depthWrite = r === 0; });
      g.castMeshes.forEach(function (e) { e.mesh.castShadow = e.cast && r <= 0.5; });
    }
    var api = {
      byName: byName, textures: list, all: all,
      video: video,
      // Logo «A» sul petto: lo riempie makeChest (null finché non è chiamata).
      logo: null,
      // Istanza del SOLO petto: stesso materiale Body più il define LOGO, così
      // la «A» resta stampata su quella mesh e su nessun'altra delle 10 Body.
      makeChest: function (mesh) {
        var m = byName.Body.clone();   // uniform clonate per valore...
        // ...ma le texture restano quelle condivise (come makeInside: un clone
        // sarebbe un secondo upload sulla GPU della stessa immagine).
        m.uniforms.uMatcap.value = byName.Body.uniforms.uMatcap.value;
        m.uniforms.uTri.value = byName.Body.uniforms.uTri.value;
        m.defines = { MAT_BODY: '', LOGO: '' };
        // Il clone eredita `transparent: false` da Body: senza questo, uOpacity
        // scenderebbe e non succederebbe niente — la pancia non si aprirebbe.
        // A riposo non cambia un pixel: alpha 1 e depthWrite attiva danno lo
        // stesso risultato di un opaco, solo disegnato nella coda trasparente.
        m.transparent = true;
        mesh.geometry.computeBoundingBox();
        var bb = mesh.geometry.boundingBox, sz = bb.getSize(new THREE.Vector3());
        // L'SVG si rasterizza su un canvas: dell'immagine serve solo l'alpha
        // (la «A» e l'anello sono pieni, il resto è trasparente). Finché non
        // carica il canvas è vuoto → alpha 0 → nessun logo, nessun lampo.
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = LOGO_TEX_SIZE;
        var ltex = new THREE.CanvasTexture(canvas);
        ltex.encoding = THREE.LinearEncoding;
        list.push(ltex);
        // Misura PRIMA di src, e non per caso: l'SVG non ha width/height, solo
        // un viewBox. Chrome lo rasterizza alla dimensione di destinazione di
        // drawImage e la «A» esce netta; Firefox e i Safari più vecchi lo
        // rasterizzano alla dimensione INTRINSECA dell'immagine (in mancanza
        // di width/height, la misura di default di un <img>: 300×150) e poi
        // ingrandiscono quel francobollo a 2048 — la «A» esce morbida. Dando
        // all'<img> una misura esplicita la dimensione intrinseca c'è, ed è
        // quella a cui disegniamo. Va messa prima di `src` perché un'immagine
        // già in cache può risolversi subito, anche in modo sincrono.
        var img = new Image(LOGO_TEX_SIZE, LOGO_TEX_SIZE);
        img.onload = function () {
          canvas.getContext('2d').drawImage(img, 0, 0, LOGO_TEX_SIZE, LOGO_TEX_SIZE);
          ltex.needsUpdate = true;
        };
        img.onerror = function () { console.warn('[robot] logo non caricato:', LOGO_SVG); };
        img.src = LOGO_SVG;
        m.uniforms.uLogo = { value: ltex };
        m.uniforms.uLogoCenter = { value: new THREE.Vector2(bb.min.x + sz.x * LOGO_CONFIG.u, bb.min.y + sz.y * LOGO_CONFIG.v) };
        m.uniforms.uLogoWidth = { value: sz.x * LOGO_CONFIG.width };
        m.uniforms.uLogoLight = { value: new THREE.Vector3() };
        m.uniforms.uLogoBase = { value: LOGO_CONFIG.base };
        m.uniforms.uLogoSpec = { value: LOGO_CONFIG.spec };
        m.uniforms.uLogoShin = { value: LOGO_CONFIG.shininess };
        m.uniforms.uLogoOn = { value: 1 };
        m.needsUpdate = true;
        mesh.material = m;
        all.push(m);                   // così setCamera aggiorna anche questa
        var ws = mesh.getWorldScale(new THREE.Vector3());
        var worldWidth = sz.x * LOGO_CONFIG.width * Math.abs(ws.x);
        api.logo = {
          material: m,
          // Larghezza della «A» in unità MONDO. Tutti gli scostamenti della luce
          // ci sono proporzionati, così il riflesso resta DENTRO il logo
          // qualunque sia la scala del GLB.
          worldWidth: worldWidth,
          // Punto d'aggancio della luce: il centro del logo sulla FACCIA del
          // petto (non il centro del bbox del petto, che sta dentro il corpo —
          // una luce lì nascerebbe quasi sulla superficie e il riflesso sarebbe
          // un puntino impazzito invece di una striscia).
          anchor: new THREE.Vector3(m.uniforms.uLogoCenter.value.x, m.uniforms.uLogoCenter.value.y, bb.max.z).applyMatrix4(mesh.matrixWorld),
          lightDist: worldWidth * LOGO_CONFIG.lightDist,
          lightSwing: worldWidth * LOGO_CONFIG.lightSwing,
          lightRest: LOGO_CONFIG.lightRest,
          setOn: function (on) { m.uniforms.uLogoOn.value = on ? 1 : 0; }
        };
        return m;
      },
      // Posizione (view space) della luce virtuale che fa brillare la «A».
      setLogoLight: function (v) { if (api.logo) api.logo.material.uniforms.uLogoLight.value.copy(v); },
      setPlaying: function (on) {
        if (on) { var pr = video.play(); if (pr && pr.catch) pr.catch(function () { hu.uVideo.value = poster; }); }
        else video.pause();
      },
      // r = reveal della testa (0..1, smorzato in robot.js). Agli estremi si
      // aggancia al valore esatto: sotto 0.01 è riposo vero (alpha 1, depth
      // scritta, occhi pieni: identico a prima; il cervello sotto quella
      // soglia non si disegna), sopra 0.995 è reveal pieno (uEyes 0 → lo
      // shader del visore salta i 16 prelievi del video).
      // Ombre: un vetro quasi trasparente non può proiettare l'ombra piena di
      // un opaco, e la shadow map non conosce l'alpha — visore e interni
      // smettono di proiettarla a metà reveal (r > 0.5) e la riprendono
      // tornando sotto, dove il visore è ancora per metà opaco.
      setReveal: function (r) {
        r = r > 0.995 ? 1 : (r < 0.01 ? 0 : r);
        hu.uEyes.value = 1 - r;
        hu.uOpacity.value = 1 + (REVEAL_MIN_ALPHA - 1) * r;
        head.depthWrite = r === 0;
        fadeInside(groups.head, r);
      },
      // r = reveal della pancia (0..1, smorzato in robot.js), gemello di
      // setReveal: il torso diventa quasi trasparente e si vede la sfera di
      // SABE dietro la «A» — che resta PIENA, perché il suo strato si riprende
      // l'alpha nel fragment (outA = max(uOpacity, lm), robot-spline-glsl.js).
      // Stessi agganci agli estremi del reveal della testa: sotto 0.01 è riposo
      // vero (alpha 1, depth scritta: identico a prima, e la sfera sotto quella
      // soglia non si disegna), sopra 0.995 è reveal pieno.
      // Il petto è l'ISTANZA col logo creata da makeChest: senza quella non
      // c'è niente da aprire (e il reveal non ha senso), quindi qui si esce.
      setBellyReveal: function (r) {
        if (!api.logo) return;
        r = r > 0.995 ? 1 : (r < 0.01 ? 0 : r);
        var m = api.logo.material;
        m.uniforms.uOpacity.value = 1 + (BELLY_MIN_ALPHA - 1) * r;
        // r === 0 ⟺ uOpacity tornata a 1: sotto, il torso non scrive più depth
        // (scriverla da trasparente cancellerebbe la sfera che sta dietro).
        m.depthWrite = r === 0;
        fadeInside(groups.belly, r);
      },
      // Interni di una zona (le mesh Parts dentro il volume del visore o del
      // torso, scelte da robot.js): ognuna riceve un clone trasparente di
      // Parts, così sfuma col reveal della SUA zona senza toccare le altre
      // mesh Parts. `capo` = la mesh che copre la zona (visore o torso): anche
      // la sua ombra segue quel reveal. `gruppo` = 'head' | 'belly'.
      // Restituisce il gruppo (materiali + mesh che proiettano), così chi lo
      // chiama può esporlo senza che i due reveal si pestino i piedi.
      makeInside: function (meshes, capo, gruppo) {
        var g = groups[gruppo];
        if (!g) throw new Error('[robot] makeInside: gruppo sconosciuto "' + gruppo + '"');
        meshes.forEach(function (mesh) {
          var m = byName.Parts.clone();   // uniform clonate per valore...
          // ...ma le texture restano quelle condivise (un clone sarebbe un
          // secondo upload sulla GPU della stessa immagine).
          m.uniforms.uMatcap.value = byName.Parts.uniforms.uMatcap.value;
          m.uniforms.uTri.value = byName.Parts.uniforms.uTri.value;
          m.transparent = true;
          g.materials.push(m); all.push(m);
          mesh.material = m; mesh.renderOrder = 1;
          g.castMeshes.push({ mesh: mesh, cast: mesh.castShadow });
        });
        if (capo) g.castMeshes.push({ mesh: capo, cast: capo.castShadow });
        return g;
      },
      setCamera: function (cam) {
        cam.updateMatrixWorld(true);
        var lv = lightWorld.clone().applyMatrix4(cam.matrixWorldInverse);
        all.forEach(function (m) { if (m && m.uniforms.uLightPos) m.uniforms.uLightPos.value.copy(lv); });
      },
      dispose: function () {
        video.removeEventListener('playing', onPlaying);
        video.pause(); video.removeAttribute('src'); video.load();
        all.forEach(function (m) { if (m) m.dispose(); });
        list.forEach(function (t) { t.dispose(); });
      }
    };
    return api;
  }

  // GLTFLoader r128 ripulisce i nomi (spazi→_, e deduplica con _1, _2…):
  // si confrontano le basi senza i suffissi numerici.
  function base(n) { return String(n || '').replace(/[\s.\[\]:\/]/g, '_').replace(/(_\d+)+$/, '').toLowerCase(); }

  // Le mesh portano userData.splineIndex (indice del nodo glTF, messo da
  // robot.js al caricamento): l'ordine di model.traverse NON è stabile, quindi
  // si ordina per indice (byMaterial esce sempre nello stesso ordine).
  function assign(model, D, mats) {
    var list = []; model.traverse(function (o) { if (o.isMesh && o.userData.splineIndex !== undefined) list.push(o); });
    if (list.length !== D.meshes.length) throw new Error('[robot] mesh ' + list.length + ' ≠ ' + D.meshes.length);
    list.sort(function (a, b) { return a.userData.splineIndex - b.userData.splineIndex; });
    var out = { visor: null, chest: null, byMaterial: { Head: [], Body: [], Parts: [] } };
    list.forEach(function (mesh) {
      var i = mesh.userData.splineIndex, d = D.meshes[i];
      if (!d) throw new Error('[robot] mesh "' + mesh.name + '": indice di nodo ' + i + ' assente nei dati Spline (' + D.meshes.length + ' mesh)');
      if (!out.byMaterial[d.material]) throw new Error('[robot] mesh ' + i + ': materiale Spline sconosciuto "' + d.material + '"');
      if (d.name && base(d.name) !== base(mesh.name)) throw new Error('[robot] mesh ' + i + ': "' + mesh.name + '" ≠ Spline "' + d.name + '"');
      mesh.geometry.computeBoundingBox();
      var bb = mesh.geometry.boundingBox;
      if (bb.min.distanceTo(v3(d.bboxMin)) > 1.5 || bb.max.distanceTo(v3(d.bboxMax)) > 1.5) throw new Error('[robot] mesh ' + i + ' con bbox diverso da Spline');
      out.byMaterial[d.material].push(mesh);
      if (d.material === 'Head') out.visor = mesh;
      if (d.material === 'Body' && /^body$/i.test(base(d.name))) out.chest = mesh;
      // mats.byName ha sempre Head/Body/Parts (create(), sopra) e d.material
      // ha già superato il controllo "materiale Spline sconosciuto" qualche
      // riga più su: mats.byName[d.material] esiste sempre qui.
      mesh.material = mats.byName[d.material];
      mesh.userData.splineMaterial = d.material;
    });
    // Il visore è UNO: se i dati ne portassero due, visor/reveal/occhi
    // finirebbero su una mesh a caso.
    if (out.byMaterial.Head.length !== 1) throw new Error('[robot] mesh con materiale Head: ' + out.byMaterial.Head.length + ' (atteso 1)');
    return out;
  }

  return { create: create, assign: assign };
})();
