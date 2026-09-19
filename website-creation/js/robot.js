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
 * meno animazioni. Questo file è la fondazione: monta il GLB grezzo e lo
 * inquadra con la camera/luce della scena Spline (`WC.robotSplineData`,
 * Task 2) — niente ricentratura, il modello resta nelle coordinate Spline.
 * Materiali (vetro sulla testa, metallo sul corpo), il point-brain e le
 * fibre delle braccia arrivano nei task successivi — `mount()` resta
 * perciò minimale e ritorna gli handle (`window.__robot`) che quei task
 * aggancieranno.
 */
WC.register('robot', function(ctx){
  // Tarature del comportamento (non dell'aspetto: quello arriva da Spline).
  // yawGain: prima il puntatore si misurava su uno stage largo 2,2× la
  // sezione, quindi lo stesso gesto girava la testa di 0.5/2.2 per unità:
  // stesso gesto, stessa rotazione di prima.
  var CONFIG = { yawGain: 0.2273, pitchGain: 0.35, yawMax: 0.5, pitchMax: 0.3, minHeadTopPx: 80 };
  var D = WC.robotSplineData;
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

  // Task 7: cleanup unificato. Un solo helper che attraversa un Object3D e
  // smaltisce geometrie e materiali (array di materiali incluso) — lo
  // riusa il teardown finale (sotto) per il MODELLO (corpo/braccia in
  // carbonio, testa in vetro: headGroup è figlio di `model`, quindi anche
  // il vetro ci rientra), per il BRAIN e per le FIBRE. `.dispose()` su una
  // risorsa già smaltita è un no-op sicuro in three.js (spara solo
  // l'evento 'dispose'), quindi se due chiamate si sovrappongono — es. il
  // brain e le fibre sono ENTRAMBI già discendenti di `model` nella
  // gerarchia attuale, quindi disposeObject3D(model) da solo li
  // coprirebbe già — non è un problema. Le chiamate restano comunque
  // esplicite e separate: non fanno affidamento su quella gerarchia, così
  // restano corrette anche se un task futuro riparenta brain/fibre altrove.
  function disposeObject3D(root){
    if (!root) return;
    root.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
        else obj.material.dispose();
      }
    });
  }

  function mount(){
    if (mounted) return;
    mounted = true;
    var torn = false;

    // Reduced-motion: una scena 3D che gira di continuo è esattamente ciò che
    // l'impostazione chiede di non avere. Resta la card, senza il modello.
    // Stesso esito se three.js (o i loader vendorizzati) non sono disponibili.
    if (!ctx.motionOk || typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined' || !D) {
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
    // Camera della scena Spline: stessi fov/zoom/posizione/orientamento.
    var cam = new THREE.PerspectiveCamera(D.camera.fov, 1, D.camera.near, D.camera.far);
    cam.zoom = D.camera.zoom;
    cam.position.fromArray(D.camera.position);
    cam.quaternion.fromArray(D.camera.quaternion);
    var headTopWorld = null;

    var draco = new THREE.DRACOLoader();
    draco.setDecoderPath('vendor/draco/');
    var gltf = new THREE.GLTFLoader();
    gltf.setDRACOLoader(draco);

    function fit(){
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(1, h);
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
      // FOV verticale fisso: il robot occupa sempre la stessa frazione di
      // altezza, la testa resta intera. Se su schermi bassi la cima della
      // testa finisse sotto la nav, si abbassa l'immagine del minimo.
      if (headTopWorld) {
        var pt = headTopWorld.clone().project(cam);
        var y = (1 - pt.y) / 2 * h;
        var need = CONFIG.minHeadTopPx - y;
        if (need > 0) { cam.setViewOffset(w, h, 0, -need, w, h); cam.updateProjectionMatrix(); }
      }
    }
    stage.appendChild(renderer.domElement);

    gltf.load('assets/robot.glb', function(g){
      if (torn) return;
      var model = g.scene;
      // Il GLB è nelle coordinate della scena Spline: niente ricentratura,
      // la camera Spline lo inquadra così com'è.
      scene.add(model);
      model.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(model);
      if (hint) hint.remove();

      // Handle esposti per i task successivi (materiali/testa di vetro/
      // point-brain/fibre) e per la verifica headless: window.__robot
      // segnala che il modello è a schermo.
      window.__robot = { model: model, scene: scene, camera: cam, renderer: renderer, box: box, state: { faceAmount: 0 }, pointer: pointer };

      // Split in sotto-parti (testa/corpo/braccia) per i task successivi
      // (materiali per parte, testa che segue il cursore, fibre delle
      // braccia). WC.robotParts.split è definito in robot-parts.js,
      // caricato PRIMA di questo file in index.html.
      if (WC.robotParts) {
        var parts = WC.robotParts.split(model);
        window.__robot.parts = parts;

        // Materiali: carbonio su corpo/braccia, visore scuro con envMap +
        // reveal a tutta testa (RITOCCO 2 — vedi robot-materials.js).
        // `mats.glass` è lo ShaderMaterial le cui uniform pilotiamo qui sotto:
        // uTime nel loop di render, uReveal (0..1) dal raycast del cursore
        // sulla testa (tick() più sotto).
        if (WC.robotMaterials) {
          // `renderer` serve al carbonio per prefiltrare l'envMap via PMREM
          // (riflesso lucido sul corpo scuro — vedi robot-materials.js).
          var mats = WC.robotMaterials.applyTo(parts, renderer);
          window.__robot.glass = mats.glass;
          window.__robot.carbon = mats.carbon;
        }

        // Task 6 (rework): le fibre luminose nelle braccia ("i fasci").
        // robot-fibers.js ora ricava il percorso dalle mesh-braccio VERE
        // (`parts.armL`/`parts.armR`, campionate e affettate lungo l'asse
        // spalla→polso) e lo spinge sulla superficie visibile del braccio —
        // `parts.joints` resta il seme dell'asse, non più il percorso stesso
        // (vedi robot-fibers.js per il perché: i giunti da soli danno una
        // linea verticale dritta, non la vera piega del braccio). Nessuna
        // dipendenza da headGroup/materiali.
        // Figlie DIRETTE di `model` (aggiunto sotto): resta incollato alle
        // braccia — gerarchia FLAT confermata (`mesh.parent === model`).
        // `model` va passato qui perché `parts.joints` (costruiti in
        // robot-parts.js via `Box3.setFromObject`, quindi in coordinate
        // MONDO, non model-locali — nonostante il commento precedente in
        // questo file lo desse per scontato) va convertito in model-locale
        // prima di combinarlo con i vertici campionati (vedi
        // robot-fibers.js `buildArm`, fix ref1: quel mismatch di frame era
        // la causa radice della fibra che deviava). Il surge per lato (0..1,
        // "la corrente si accende dove passi") è pilotato dal raycast del
        // cursore sulle mesh-braccio in tick(), più sotto.
        if (WC.robotFibers && parts.joints) {
          var fibers = WC.robotFibers.create({ joints: parts.joints, armL: parts.armL, armR: parts.armR, model: model });
          model.add(fibers.object);
          window.__robot.fibers = fibers;
        }

        // Task 4: la testa (parts.head, incluso il collo — vedi
        // robot-parts.js) passa da figlia diretta di `model` a figlia di un
        // headGroup pivotato al collo (bottom-center del bbox unito della
        // testa), così ruotare headGroup.rotation gira la testa attorno al
        // collo invece che attorno al centro dell'intero robot. Task 5
        // parenta il point-brain allo STESSO headGroup.
        //
        // updateMatrixWorld(true) di sicurezza prima di leggere/scrivere
        // posizioni mondo per il pivot della testa: già chiamato una volta
        // subito dopo scene.add(model) (sopra) e non più invalidato nel
        // frattempo — il modello non viene più ricentrato e split() non
        // sposta nulla. Resta qui perché costa nulla e protegge il pivot e
        // il re-parenting "preserva mondo" (sotto) se in futuro qualcosa a
        // monte tornasse a muovere il modello prima di questo punto.
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

          var hb = new THREE.Box3(); parts.head.forEach(function (m) { hb.union(new THREE.Box3().setFromObject(m)); });
          headTopWorld = new THREE.Vector3((hb.min.x + hb.max.x) / 2, hb.max.y, (hb.min.z + hb.max.z) / 2);
          fit();

          // Task 5: il point-brain DENTRO la testa. Stesso helper del cervello
          // di Vesper (WC.pointBrain, js/pointbrain.js). Parentato a headGroup,
          // si muove in sincrono con la testa; si accende col reveal a tutta
          // testa quando il cursore ci passa sopra (RITOCCO 2 — vedi tick()).
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

            // RITOCCO 2 (correzione utente): ora il reveal è a TUTTA testa —
            // si vede il cervello INTERO, non più una macchia sotto la lente —
            // quindi il cervello va INGRANDITO e CENTRATO per riempire
            // l'interno della testa e leggere chiaramente come cervello
            // (emisferi + cervelletto), non piccolo nella calotta.
            //   - raggio: 0.66 del raggio-testa (era 0.42) → occupa gran parte
            //     del volume interno. headRadius è ricavato dal bbox testa che
            //     include il collo, quindi 0.66 riempie la calotta cranica
            //     senza sfondare la silhouette del visore (tarato a schermo,
            //     ref2-head-reveal).
            //   - offset verticale ridotto (0.22 invece di 0.35 dell'altezza):
            //     il bbox testa è tirato in basso dal collo, un piccolo
            //     rialzo centra il cervello nel cranio; troppo alto (0.35) lo
            //     spingeva contro la calotta ora che è grande.
            var brainRadius = headRadius * 0.66;
            var brainPos = headCenterLocal.clone().add(new THREE.Vector3(0, headSizeLocal.y * 0.22, 0));
            // Taratura della dimensione dei punti. Nello shader del brain
            // gl_PointSize ≈ uSize * 200 / (-mv.z), con -mv.z ≈ distanza
            // camera→testa in unità MONDO. Il modello non è in unità
            // "piccole" (la camera Spline sta a ~1000 unità, vedi D.camera
            // sopra), quindi la uSize di Vesper (0.067: camera vicina,
            // raggio ~1) renderebbe punti invisibili. La lego alla distanza
            // reale così legge a qualunque scala del GLB.
            var headCenterWorld = headGroup.localToWorld(headCenterLocal.clone());
            var camDist = cam.position.distanceTo(headCenterWorld);
            // gl_PointSize non segue lo zoom né il fov, la geometria sì.
            // Prima: fov 32°. Ora fov 45° con zoom 2 (fov effettivo ≈ 23,4°).
            // fovScale mantiene lo stesso rapporto punti/cervello di prima.
            var fovScale = Math.tan(THREE.MathUtils.degToRad(16)) / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / cam.zoom);
            var brainUSize = 4 * camDist / 200 * fovScale;

            // Draw order (Task 5b): il vetro (transparent+depthWrite:false) e
            // il brain (THREE.Points, additivo, anch'esso
            // transparent+depthWrite:false) finiscono entrambi nella coda
            // "trasparenti" di three.js, ordinata per distanza centro-oggetto
            // — non per pixel. `renderOrder = 2` sul guscio di vetro (in
            // robot-materials.js) forza SEMPRE guscio-dopo-brain: il suo alpha
            // globale (uReveal) fa da maschera — a riposo opaco copre il
            // cervello, rivelato lo lascia vedere su tutta la testa.
            function placeBrain(brain) {
              brain.points.position.copy(brainPos);
              brain.uniforms.uSize.value = brainUSize;
              headGroup.add(brain.points);
              window.__robot.brain = brain;
            }

            // ref1 (correzione utente): il cervello del robot ora campiona LA
            // STESSA mesh cotta di Vesper (assets/brain-mesh.bin) con la STESSA
            // palette (WC.pointBrain.vesperBrainUniforms), così legge IDENTICO
            // a quello di Vesper — non più una nuvola procedurale generica.
            // Il fetch è asincrono ma dentro il flusso torn-guarded del mount:
            // se il teardown è già scattato (torn) o la mesh non arriva, si
            // ripiega sulla nuvola procedurale (comportamento precedente),
            // senza mai crashare. Il brain, appena creato, è aggiunto a
            // headGroup (figlio di model) e smaltito dal teardown unificato.
            fetch('assets/brain-mesh.bin').then(function (res) {
              if (!res.ok) throw new Error('brain mesh: ' + res.status + ' ' + res.statusText);
              return res.arrayBuffer();
            }).then(function (buf) {
              if (torn || !window.__robot) return;
              var decoded = WC.pointBrain.decodeBrainMesh(buf);
              var srcGeo = new THREE.BufferGeometry();
              srcGeo.setAttribute('position', new THREE.BufferAttribute(decoded.positions, 3));
              srcGeo.setIndex(new THREE.BufferAttribute(decoded.indices, 1));
              var brain = WC.pointBrain.create({
                // ~stessa DENSITÀ di Vesper (baseline tier: 26000 punti sulla
                // stessa mesh) così la forma reale del cervello legge fitta
                // come là, non rada come i 4000 procedurali di prima.
                count: 24000,
                radius: brainRadius,
                sampleFrom: new THREE.Mesh(srcGeo),
                uniforms: WC.pointBrain.vesperBrainUniforms()
              });
              srcGeo.dispose();
              placeBrain(brain);
            }).catch(function (err) {
              if (torn || !window.__robot) return;
              // Fallback: nuvola procedurale azzurra (come prima) — la sezione
              // resta in piedi anche se la mesh non carica. console.warn (non
              // error) così l'harness resta "console-clean".
              console.warn('[robot] mesh del cervello non caricata, uso la nuvola procedurale:', err);
              placeBrain(WC.pointBrain.create({ count: 4000, radius: brainRadius, color: 0x8bd6ff }));
            });
          }
        }
        fit();

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
      // RITOCCO 2: reveal a TUTTA testa. Un solo Raycaster riusato ogni frame
      // (niente allocazioni); se il cursore colpisce una qualunque mesh della
      // testa, un fattore smorzato `hoverHead` (0..1, esponenziale come
      // rotazione/faceAmount) sale a 1 — sia il vetro (uReveal, uguale su
      // tutta la testa) sia il brain (update(dt, reveal)) seguono questo
      // stesso segnale, così il visore diventa trasparente e il cervello
      // intero si accende insieme.
      var raycaster = new THREE.Raycaster();
      var lensNdc = new THREE.Vector2();
      var hoverHead = 0;
      // Task 6: surge delle fibre per braccio (0..1, smorzato) — stesso
      // Raycaster riusato (Task 7: stesso raggio del reveal testa sotto,
      // niente secondo setFromCamera — il puntatore è lo stesso NDC per i
      // due test, cambiano solo gli oggetti intersecati), un'intersezione
      // per frame contro parts.armL/armR separatamente. Persistono fuori da
      // tick() (come hoverHead) per lo smoothing esponenziale frame-su-frame.
      var surgeL = 0, surgeR = 0;
      (function tick(){
        raf = requestAnimationFrame(tick);
        var robot = window.__robot;
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        var dt = Math.min(0.05, (now - lastTick) / 1000); lastTick = now;
        if (robot && robot.glass) {
          robot.glass.uniforms.uTime.value = (now - clockStart) / 1000;
        }
        // Task 4: la testa segue il cursore (clampata, smorzata). Task 5b
        // (correzione utente): questo resta INDIPENDENTE dal reveal — la
        // testa gira dietro al cursore anche da visore chiuso. faceAmount
        // resta calcolato (diagnostica dell'harness) ma non pilota più
        // nulla del vetro/brain.
        if (robot && robot.headGroup && robot.state) {
          var targetYaw = 0, targetPitch = 0;
          if (pointer.active) {
            targetYaw = Math.max(-CONFIG.yawMax, Math.min(CONFIG.yawMax, pointer.x * CONFIG.yawGain));
            targetPitch = Math.max(-CONFIG.pitchMax, Math.min(CONFIG.pitchMax, -pointer.y * CONFIG.pitchGain));
            robot.state.faceAmount = 1 - Math.min(1, Math.hypot(pointer.x, pointer.y));
          } else if (robot.hold) {
            // Override deterministico per l'harness (window.__robot.hold): posa
            // la testa (yaw/pitch) senza dover simulare un vero mousemove
            // sul canvas.
            targetYaw = robot.hold.yaw || 0;
            targetPitch = robot.hold.pitch || 0;
          }
          if (!pointer.active) {
            // hold e "nessun input" decadono faceAmount a 0 allo stesso modo
            // (diagnostica dell'harness: non pilota più vetro/brain).
            robot.state.faceAmount += (0 - robot.state.faceAmount) * 0.08;
          }
          robot.headGroup.rotation.y += (targetYaw - robot.headGroup.rotation.y) * 0.12;
          robot.headGroup.rotation.x += (targetPitch - robot.headGroup.rotation.x) * 0.12;
        }
        // Task 7 (nit): un solo setFromCamera per frame quando il puntatore
        // è attivo — reveal testa e surge delle fibre (braccia)
        // testano oggetti DIVERSI ma partono dallo STESSO NDC (pointer.x/y
        // rispetto allo stage, la stessa camera che renderizza lo stage,
        // flip di segno su y come da convenzione NDC three.js): il secondo
        // setFromCamera di Task 6 era una ricomputazione ridondante dello
        // stesso raggio, non un raggio diverso.
        if (pointer.active) {
          lensNdc.set(pointer.x, -pointer.y);
          raycaster.setFromCamera(lensNdc, cam);
        }
        // RITOCCO 2: raycast del cursore sulle mesh testa. Un hit su una
        // QUALSIASI mesh della testa alza il target a 1 → il visore diventa
        // trasparente su TUTTA la testa (uReveal, uguale ovunque). Nessun hit
        // (cursore fuori dalla testa, o fuori dallo stage) → target 0, il
        // visore torna scuro/opaco morbidamente.
        if (robot && robot.glass && robot.parts && robot.parts.head && robot.parts.head.length) {
          var hoverTarget = 0;
          if (pointer.active && raycaster.intersectObjects(robot.parts.head, false).length) {
            hoverTarget = 1;
          }
          hoverHead += (hoverTarget - hoverHead) * 0.18;
          robot.glass.uniforms.uReveal.value = hoverHead;
        }
        // RITOCCO 2: il brain si accende con lo STESSO segnale del reveal a
        // tutta testa (non più la lente locale, non legato a faceAmount).
        // update() fa respirare i punti e pilota opacità/emissione con reveal
        // (0 = spento/invisibile — visore scuro, niente cervello in vista).
        if (robot && robot.brain) {
          robot.brain.update(dt, hoverHead);
          // Lo smorzamento esponenziale non arriva mai a 0 esatto: sotto la
          // soglia il cervello non viene proprio disegnato (decisione 5).
          robot.brain.points.visible = hoverHead > 0.01;
        }
        // Task 6: raycast del cursore sulle mesh-braccio, un lato alla
        // volta — a differenza del reveal testa (una sola zona, la testa)
        // qui servono DUE segnali indipendenti, uno per braccio, così il
        // fascio che si accende è solo quello sotto il cursore. Salita
        // rapida (0.15/frame) quando il cursore è sopra, decadimento lento
        // (0.05/frame) quando se ne va — "la corrente si accende dove
        // passi" (copy §5) e si spegne morbida, non di scatto.
        if (robot && robot.fibers && robot.parts) {
          var armLHit = false, armRHit = false;
          if (pointer.active) {
            if (robot.parts.armL.length && raycaster.intersectObjects(robot.parts.armL, false).length) armLHit = true;
            if (robot.parts.armR.length && raycaster.intersectObjects(robot.parts.armR, false).length) armRHit = true;
          }
          surgeL += ((armLHit ? 1 : 0) - surgeL) * (armLHit ? 0.15 : 0.05);
          surgeR += ((armRHit ? 1 : 0) - surgeR) * (armRHit ? 0.15 : 0.05);
          robot.fibers.update(dt, surgeL, surgeR);
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
      // Task 7: smaltimento GPU unificato. Se il GLB non è mai arrivato a
      // caricare (fail() nel ramo di errore di gltf.load, o teardown prima
      // che load() risolva) window.__robot resta undefined: non c'è nulla
      // da attraversare, solo renderer/canvas da smaltire sotto.
      var robot = window.__robot;
      if (robot) {
        disposeObject3D(robot.model);
        if (robot.brain && robot.brain.points) disposeObject3D(robot.brain.points);
        if (robot.fibers && robot.fibers.object) disposeObject3D(robot.fibers.object);
        // L'envMap del vetro testa è una CanvasTexture creata ad-hoc
        // (robot-materials.js), non gestita da nessun altro loader/cache né
        // toccata da disposeObject3D (che smaltisce geometrie/materiali, non
        // le texture referenziate dentro le uniform di uno ShaderMaterial) —
        // va smaltita qui a parte, altrimenti resta un WebGLTexture orfano
        // ad ogni mount/unmount della sezione.
        if (robot.glass && robot.glass.userData.envMap) robot.glass.userData.envMap.dispose();
        // Stesso ragionamento per il carbonio (Task ref1): normalMap +
        // envMap sono CanvasTexture/PMREM create ad-hoc in robot-materials.js,
        // non toccate da disposeObject3D (che smaltisce geometrie/materiali,
        // non le texture referenziate da un materiale) — vanno smaltite qui a
        // parte, altrimenti restano WebGLTexture orfane ad ogni mount/unmount.
        if (robot.carbon) {
          if (robot.carbon.userData.normalMap) robot.carbon.userData.normalMap.dispose();
          if (robot.carbon.userData.envMap) robot.carbon.userData.envMap.dispose();
        }
      }
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
