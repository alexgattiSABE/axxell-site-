/* CAP 05 — materiali Spline (Head/Body/Parts) costruiti dai dati estratti
 * (WC.robotSplineData) sullo shader di robot-spline-glsl.js. Assegnazione per
 * INDICE di mesh (stesso ordine della scena Spline) con controllo del nome. */
window.WC = window.WC || {};
WC.robotSplineMaterials = (function () {
  function v3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
  function m3(a) { var m = new THREE.Matrix3(); m.fromArray(a); return m; }
  function tex(path, g, list) {
    var t = new THREE.TextureLoader().load(path);
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
    video.src = Hd.video.src; video.muted = true; video.defaultMuted = true; video.loop = true;
    video.playsInline = true; video.setAttribute('playsinline', ''); video.preload = 'auto'; video.crossOrigin = 'anonymous';
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
    var byName = { Parts: shader('MAT_PARTS', pu), Body: shader('MAT_BODY', bu), Head: head };
    var all = [byName.Parts, byName.Body, head];
    var lightWorld = v3(D.light.worldPosition);
    return {
      byName: byName, textures: list, all: all,
      video: video,
      setPlaying: function (on) {
        if (on) { var pr = video.play(); if (pr && pr.catch) pr.catch(function () { hu.uVideo.value = poster; }); }
        else video.pause();
      },
      // r = reveal della testa (0..1): gli occhi si spengono mentre si apre.
      // L'alpha del visore arriva nel Task 6.
      setReveal: function (r) { hu.uEyes.value = 1 - r; },
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
  }

  // GLTFLoader r128 ripulisce i nomi (spazi→_, e deduplica con _1, _2…):
  // si confrontano le basi senza i suffissi numerici.
  function base(n) { return String(n || '').replace(/[\s.\[\]:\/]/g, '_').replace(/(_\d+)+$/, '').toLowerCase(); }

  // Le mesh portano userData.splineIndex (indice del nodo glTF, messo da
  // robot.js al caricamento): l'ordine di model.traverse NON è stabile, quindi
  // si ordina per indice (byMaterial esce sempre nello stesso ordine).
  function assign(model, D, mats, opts) {
    var skip = (opts && opts.skip) || null;
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
      if (skip && skip.has(mesh)) return;
      var m = mats.byName[d.material];
      if (!m) return;
      mesh.material = m;
      mesh.userData.splineMaterial = d.material;
    });
    // Il visore è UNO: se i dati ne portassero due, visor/reveal/occhi
    // finirebbero su una mesh a caso.
    if (out.byMaterial.Head.length !== 1) throw new Error('[robot] mesh con materiale Head: ' + out.byMaterial.Head.length + ' (atteso 1)');
    return out;
  }

  return { create: create, assign: assign };
})();
