/* CAP 05 — modello 3D interattivo (nostro), a tutta sezione.
 *
 * Era la demo pubblica di Spline (`@splinetool/viewer` + una `.splinecode`
 * ospitata da terzi). Ora è un GLB estratto e compresso in Draco, caricato
 * con three.js r128 (globale, stesso <script> già in pagina per gli altri
 * capitoli) via GLTFLoader/DRACOLoader vendorizzati in locale — zero
 * richieste a spline.design o a un CDN a runtime.
 *
 * Il mount resta lazy — sotto la piega la pagina non paga un byte — e la
 * scena si ferma quando la sezione esce dal DOM o quando il browser chiede
 * meno animazioni. Questo file è la fondazione: monta il GLB grezzo,
 * centrato e inquadrato. Materiali (vetro sulla testa, metallo sul corpo),
 * il point-brain e le fibre delle braccia arrivano nei task successivi —
 * `mount()` resta perciò minimale e ritorna gli handle (`window.__robot`)
 * che quei task aggancieranno.
 */
WC.register('robot', function(ctx){
  var section = document.getElementById('cap05');
  var card    = document.getElementById('wcRobotCard');
  var stage   = document.getElementById('wcRobotStage');
  var hint    = document.getElementById('wcRobotHint');
  if (!section || !card || !stage) return;

  var cleanups = [];

  // Qui c'era un faro CSS che seguiva il cursore sulla card. Da quando la
  // scena occupa tutta la sezione gli sta sopra un canvas opaco: il faro non
  // si vedeva più. Tolto, insieme al suo listener di mousemove.

  // --------------------------------------------------------------- caricam.
  var mounted = false;

  function fail(msg){
    if (hint) hint.textContent = msg;
    stage.classList.add('-failed');
  }

  function mount(){
    if (mounted) return;
    mounted = true;
    var torn = false;

    // Reduced-motion: una scena 3D che gira di continuo è esattamente ciò che
    // l'impostazione chiede di non avere. Resta la card, senza il modello.
    // Stesso esito se three.js (o i loader vendorizzati) non sono disponibili.
    if (!ctx.motionOk || typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
      fail('Modello 3D disattivato');
      return;
    }

    // Task 4: la testa segue il cursore. Il puntatore si traccia in NDC
    // rispetto allo stage (indipendente dal caricamento del modello, come
    // fit()/resize) — tick() (dentro la callback di gltf.load) lo legge
    // per closure. mouseleave (o cursore mai entrato) → active:false →
    // i target di rotazione/faceAmount tornano a 0/riposo nel loop.
    var pointer = { x: 0, y: 0, active: false };
    function onPointerMove(e) {
      var r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      pointer.active = true;
    }
    function onPointerLeave() { pointer.active = false; }
    stage.addEventListener('mousemove', onPointerMove);
    stage.addEventListener('mouseleave', onPointerLeave);
    cleanups.push(function () {
      stage.removeEventListener('mousemove', onPointerMove);
      stage.removeEventListener('mouseleave', onPointerLeave);
    });

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // r128 lascia l'output in LinearEncoding di default: senza correzione
    // gamma il modello (materiale bianco di default, "geometria soltanto")
    // renderizza quasi nero — verificato a schermo. sRGBEncoding è la resa
    // standard three.js, non un tocco di stile riservato al task materiali.
    renderer.outputEncoding = THREE.sRGBEncoding;
    var scene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x0a0410, 0.9));
    var key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 4, 3);
    scene.add(key);

    var draco = new THREE.DRACOLoader();
    draco.setDecoderPath('vendor/draco/');
    var gltf = new THREE.GLTFLoader();
    gltf.setDRACOLoader(draco);

    function fit(){
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(1, h);
      cam.updateProjectionMatrix();
    }
    stage.appendChild(renderer.domElement);

    gltf.load('assets/robot.glb', function(g){
      if (torn) return;
      var model = g.scene;
      // centra e scala il modello nell'inquadratura
      var box = new THREE.Box3().setFromObject(model);
      var c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      model.position.sub(c);
      var wrap = new THREE.Group();
      wrap.add(model);
      scene.add(wrap);
      var maxDim = Math.max(s.x, s.y, s.z);
      cam.position.set(0, 0, maxDim * 1.6);
      cam.lookAt(0, 0, 0);
      // Il GLB estratto non è in unità "piccole": la camera va piazzata a
      // maxDim*1.6 di distanza, che per questo modello supera abbondantemente
      // il far:100 di partenza. Senza adattare il piano lontano alla scala
      // reale del modello la camera lo vede sempre oltre il farplane — scena
      // vuota, canvas trasparente. Il piano vicino segue lo stesso ragionamento.
      cam.near = Math.max(0.01, maxDim / 1000);
      cam.far = maxDim * 20;
      cam.updateProjectionMatrix();
      fit();
      if (hint) hint.remove();

      // Handle esposti per i task successivi (materiali/testa di vetro/
      // point-brain/fibre) e per la verifica headless: window.__robot
      // segnala che il modello è a schermo.
      window.__robot = { model: model, wrap: wrap, scene: scene, camera: cam, renderer: renderer, box: box, state: { faceAmount: 0 } };

      // Split in sotto-parti (testa/corpo/braccia) per i task successivi
      // (materiali per parte, testa che segue il cursore, fibre delle
      // braccia). WC.robotParts.split è definito in robot-parts.js,
      // caricato PRIMA di questo file in index.html.
      if (WC.robotParts) {
        var parts = WC.robotParts.split(model);
        window.__robot.parts = parts;

        // Materiali (Task 3): carbonio su corpo/braccia, vetro Fresnel
        // sulla testa. `mats.glass` è lo ShaderMaterial la cui uniform
        // uOpen/uTime pilotiamo qui sotto (uTime nel loop di render,
        // uOpen arriverà da un'interazione nei task successivi).
        if (WC.robotMaterials) {
          var mats = WC.robotMaterials.applyTo(parts);
          window.__robot.glass = mats.glass;
        }

        // Task 4: la testa (parts.head, incluso il collo — vedi
        // robot-parts.js) passa da figlia diretta di `model` a figlia di un
        // headGroup pivotato al collo (bottom-center del bbox unito della
        // testa), così ruotare headGroup.rotation gira la testa attorno al
        // collo invece che attorno al centro dell'intero robot. Task 5
        // parenta il point-brain allo STESSO headGroup.
        //
        // Le matrixWorld cache sono STALE a questo punto: la prima
        // Box3().setFromObject(model) (sopra) è girata PRIMA di
        // model.position.sub(c), quindi mesh.matrixWorld rappresenta ancora
        // le posizioni pre-centratura finché non arriva il primo
        // renderer.render() (che chiama scene.updateMatrixWorld()). Un
        // updateMatrixWorld(true) esplicito qui forza le matrici correnti
        // (centrate) PRIMA di leggere/scrivere posizioni mondo — altrimenti
        // il pivot e il re-parenting "preserva mondo" userebbero coordinate
        // sbagliate e la testa salterebbe visibilmente al primo frame.
        if (parts.head.length) {
          scene.updateMatrixWorld(true);
          var headParent = parts.head[0].parent; // `model`: gerarchia piatta (vedi robot-parts.js)
          var headBox = new THREE.Box3();
          parts.head.forEach(function (m) { headBox.union(new THREE.Box3().setFromObject(m)); });
          var hc = headBox.getCenter(new THREE.Vector3());
          var pivotWorld = new THREE.Vector3(hc.x, headBox.min.y, hc.z); // bottom-center = collo

          var headGroup = new THREE.Group();
          headGroup.name = 'headGroup';
          headParent.add(headGroup);
          headParent.updateWorldMatrix(true, false);
          headGroup.position.copy(headParent.worldToLocal(pivotWorld.clone()));
          headGroup.updateMatrixWorld(true);

          // Re-parenting "preserva mondo": per ogni mesh calcolo la
          // trasformazione locale rispetto a headGroup che riproduce
          // esattamente la matrixWorld attuale (mesh invariata a schermo),
          // poi la sposto sotto headGroup e scompongo la matrice in
          // position/quaternion/scale locali.
          parts.head.forEach(function (m) {
            m.updateWorldMatrix(true, false);
            var localMat = new THREE.Matrix4().copy(headGroup.matrixWorld).invert().multiply(m.matrixWorld);
            headGroup.add(m);
            localMat.decompose(m.position, m.quaternion, m.scale);
          });

          window.__robot.headGroup = headGroup;

          // Task 5: il point-brain DENTRO la testa. Stesso helper del cervello
          // di Vesper (WC.pointBrain, js/pointbrain.js). Parentato a headGroup,
          // si muove in sincrono con la testa; si accende solo quando la testa
          // guarda il cursore (revealValue nel loop, da state.faceAmount).
          if (WC.pointBrain) {
            // Centro e raggio della testa in coordinate LOCALI di headGroup, non
            // mondo: headGroup ha solo posizione, ma `model` può portare una
            // scala propria dal GLB — lavorare in locale slega il brain da quella
            // scala (il raggio va nelle stesse unità delle mesh figlie).
            headGroup.updateMatrixWorld(true);
            var invHead = new THREE.Matrix4().copy(headGroup.matrixWorld).invert();
            var localHeadBox = new THREE.Box3();
            parts.head.forEach(function (m) {
              m.updateWorldMatrix(true, false);
              localHeadBox.union(new THREE.Box3().setFromObject(m).applyMatrix4(invHead));
            });
            var headCenterLocal = localHeadBox.getCenter(new THREE.Vector3());
            var headSizeLocal = localHeadBox.getSize(new THREE.Vector3());
            var headRadius = Math.max(headSizeLocal.x, headSizeLocal.y, headSizeLocal.z) * 0.5;

            var brain = WC.pointBrain.create({ count: 4000, radius: headRadius * 0.5, color: 0x8bd6ff });
            brain.points.position.copy(headCenterLocal);
            // Draw order: il vetro (Task 3) è transparent + depthWrite:false, non
            // scrive profondità e quindi NON occlude il brain; i punti sono
            // additivi, aggiungono luce sopra a ciò che c'è dietro. renderOrder
            // default (0) li lascia interlacciare per z col guscio di vetro — la
            // lettura più corretta di "cervello dentro il vetro". Verificato a
            // schermo (task5-brain-on) che sono visibili attraverso il vetro
            // aperto e spenti col vetro chiuso.
            headGroup.add(brain.points);

            // Taratura della dimensione dei punti. Nello shader del brain
            // gl_PointSize ≈ uSize * 200 / (-mv.z), con -mv.z ≈ distanza
            // camera→testa in unità MONDO. Il modello non è in unità "piccole"
            // (la camera sta a maxDim*1.6, vedi sopra), quindi la uSize di
            // default (tarata su Vesper: camera vicina, raggio ~1) renderebbe
            // punti invisibili. La lego alla distanza reale così legge a qualunque
            // scala del GLB.
            var headCenterWorld = headGroup.localToWorld(headCenterLocal.clone());
            var camDist = cam.position.distanceTo(headCenterWorld);
            brain.uniforms.uSize.value = 4 * camDist / 200;

            window.__robot.brain = brain;
          }
        }

        // Verifica visiva dello split (Task 2, dietro flag): tinteggia
        // testa/braccia/corpo con colori piatti (MeshBasicMaterial, non
        // sensibile alla luce) così lo screenshot dell'harness mostra
        // chiaramente quali mesh sono finite in quale gruppo.
        if (window.__debugParts) {
          var dbgHead = new THREE.MeshBasicMaterial({ color: 0x22cc55 });
          var dbgArm = new THREE.MeshBasicMaterial({ color: 0x22d8ff });
          var dbgBody = new THREE.MeshBasicMaterial({ color: 0x888888 });
          parts.head.forEach(function (m) { m.material = dbgHead; });
          parts.armL.forEach(function (m) { m.material = dbgArm; });
          parts.armR.forEach(function (m) { m.material = dbgArm; });
          parts.body.forEach(function (m) { m.material = dbgBody; });
        }
      }

      var raf;
      var clockStart = (window.performance && performance.now) ? performance.now() : Date.now();
      var lastTick = clockStart;
      var revealValue = 0;   // Task 5: quanto è "acceso" il brain, insegue faceAmount
      (function tick(){
        raf = requestAnimationFrame(tick);
        var robot = window.__robot;
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        var dt = Math.min(0.05, (now - lastTick) / 1000); lastTick = now;
        if (robot && robot.glass) {
          robot.glass.uniforms.uTime.value = (now - clockStart) / 1000;
        }
        // Task 4: la testa segue il cursore (clampata), faceAmount misura
        // quanto sta "guardando" verso il cursore, e pilota l'apertura del
        // vetro (Task 3). Cursore fuori dallo stage → i target tornano a 0
        // (rotazione) e faceAmount decade a 0 (smorzamento esponenziale,
        // non un salto — coerente con lo smoothing della rotazione).
        if (robot && robot.headGroup && robot.state) {
          var targetYaw = 0, targetPitch = 0;
          if (pointer.active) {
            targetYaw = Math.max(-0.5, Math.min(0.5, pointer.x * 0.5));
            targetPitch = Math.max(-0.3, Math.min(0.3, -pointer.y * 0.35));
            robot.state.faceAmount = 1 - Math.min(1, Math.hypot(pointer.x, pointer.y));
          } else if (robot.hold) {
            // Override deterministico per l'harness (window.__robot.hold): posa
            // la testa (yaw/pitch) e tiene faceAmount a `face`, senza puntatore
            // reale — che l'overlay .wc-robot-copy intercetterebbe al centro.
            targetYaw = robot.hold.yaw || 0;
            targetPitch = robot.hold.pitch || 0;
            robot.state.faceAmount += ((robot.hold.face || 0) - robot.state.faceAmount) * 0.08;
          } else {
            robot.state.faceAmount += (0 - robot.state.faceAmount) * 0.08;
          }
          robot.headGroup.rotation.y += (targetYaw - robot.headGroup.rotation.y) * 0.12;
          robot.headGroup.rotation.x += (targetPitch - robot.headGroup.rotation.x) * 0.12;
          if (robot.glass) {
            robot.glass.uniforms.uOpen.value += (robot.state.faceAmount - robot.glass.uniforms.uOpen.value) * 0.1;
          }
        }
        // Task 5: il brain si accende quando la testa guarda (faceAmount), con
        // lo stesso smoothing morbido del vetro. update() fa respirare i punti
        // e pilota opacità/emissione con revealValue (0 = spento/invisibile).
        if (robot && robot.brain && robot.state) {
          revealValue += (robot.state.faceAmount - revealValue) * 0.08;
          robot.brain.update(dt, revealValue);
        }
        renderer.render(scene, cam);
      })();
      cleanups.push(function(){ cancelAnimationFrame(raf); });
    }, undefined, function(){
      if (torn) return;
      fail('Modello non caricato');
    });

    window.addEventListener('resize', fit);
    cleanups.push(function(){ window.removeEventListener('resize', fit); });
    cleanups.push(function(){
      torn = true;
      draco.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if (window.__robot && window.__robot.renderer === renderer) window.__robot = undefined;
    });
  }

  // Monta con un margine di una schermata: il modello è già in piedi quando
  // la sezione entra, invece di comparire sotto gli occhi di chi guarda.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries){
      if (entries.some(function(e){ return e.isIntersecting; })) { mount(); io.disconnect(); }
    }, { rootMargin: '100% 0px' });
    io.observe(section);
    cleanups.push(function(){ io.disconnect(); });
  } else {
    mount();
  }

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
