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
      window.__robot = { model: model, wrap: wrap, scene: scene, camera: cam, renderer: renderer, box: box };

      // Split in sotto-parti (testa/corpo/braccia) per i task successivi
      // (materiali per parte, testa che segue il cursore, fibre delle
      // braccia). WC.robotParts.split è definito in robot-parts.js,
      // caricato PRIMA di questo file in index.html.
      if (WC.robotParts) {
        var parts = WC.robotParts.split(model);
        window.__robot.parts = parts;

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
      (function tick(){
        raf = requestAnimationFrame(tick);
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
