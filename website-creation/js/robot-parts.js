/* CAP 05 — parti del robot (mesh nominate, split testa/braccia/corpo).
 *
 * robot.glb ha 80 mesh separate (niente join/weld, vedi Task 1) ma la
 * gerarchia è PIATTA: sono tutte figlie dirette della scena, non ci sono
 * gruppi "Head"/"Arm"/"Body" pronti da prendere. Solo tre nomi sono
 * affidabili (`Head 2`/`Head_2`, `Body`, e i due nodi `Hand`) — gli altri
 * 76 sono nomi generici dell'esportatore (`Cube`, `Rectangle_7`,
 * `Ellipse_3_1`, `mesh_11`...). Lo split quindi va per POSIZIONE, con i
 * nomi come assist quando matchano (regex testa) — esattamente il metodo
 * suggerito dal brief, con le soglie ritarate sui dati reali (Step 1 di
 * Task 2: `console.log('MESH', n.name, n.getWorldPosition(...))` su tutte
 * le 80 mesh, vedi task-2-report.md per il dump completo).
 *
 * Verificato sul dump: il modello (centrato) ha bbox Y da -273.82 a
 * +273.82. Le mesh si dividono in tre fasce Y ben separate da gap reali
 * (non soglie arbitrarie che tagliano un cluster a metà):
 *   - testa: 18 mesh, Y in [167.43, 224.26] — cluster del casco/collo,
 *     separato dal resto da un gap fino a 145.33 (spalla più alta).
 *   - fascia toracica/braccia: Y in [-3.84, 145.33], le mesh con |X|
 *     grande (>~54) sono le braccia (spalla→gomito→avambraccio→mano),
 *     quelle con |X| piccolo (<~41) sono il petto/busto.
 *   - gambe/bacino: Y sotto -27 con |X| moderato, mai oltre la soglia
 *     braccio.
 * Soglia collo: brief proponeva 0.82*size.y, ma con 0.82 la mesh
 * `Cylinder_3` (Y=167.43, un anello del collo) restava fuori per 8 unità
 * e finiva "corpo" spezzando visivamente il casco. 0.79 cade nel gap
 * reale (tra 145.33 e 167.43) e cattura tutte e 18 le mesh del cluster
 * testa senza toccarne di corpo/spalla. Soglie fascia/asse X (0.45/0.16)
 * confermate identiche al brief: separano nettamente le 26 mesh braccio
 * (13 per lato, tutte con la coppia mirror `_1`) dalle 36 mesh corpo.
 */
window.WC = window.WC || {};
WC.robotParts = {
  split: function (model) {
    var meshes = [];
    model.traverse(function (n) { if (n.isMesh) meshes.push(n); });

    var box = new THREE.Box3().setFromObject(model);
    var size = box.getSize(new THREE.Vector3());
    var min = box.min;

    function centerOf(m) { return new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); }

    // Soglia collo: sopra questa Y (mondo/modello, il modello è già
    // centrato da robot.js) una mesh appartiene al cluster testa/casco.
    var neck = min.y + size.y * 0.79;
    // Fascia toracica: sotto il collo, sopra il bacino — le mesh in
    // questa fascia con |X| oltre la soglia laterale sono un braccio.
    var armBandLow = min.y + size.y * 0.45;
    var armXThreshold = size.x * 0.16;

    var head = [], body = [], armL = [], armR = [];
    meshes.forEach(function (m) {
      var byName = (m.name || '').toLowerCase();
      var c = centerOf(m);
      var isHead = /head|helmet|visor|face|glass/.test(byName) || c.y >= neck;
      if (isHead) { head.push(m); return; }
      var inArmBand = c.y > armBandLow && c.y < neck;
      if (inArmBand && Math.abs(c.x) > armXThreshold) {
        (c.x < 0 ? armL : armR).push(m);
        return;
      }
      body.push(m);
    });

    // Giunti per braccio: bbox unita del gruppo, centro X/Z costante,
    // shoulder=top del bbox, wrist=bottom, elbow=punto medio. Metodo
    // dato dalla ruling del controller (nessuna gerarchia scheletrica nel
    // GLB da cui leggere ossa vere) — sufficiente per ancorare le curve
    // delle fibre luminose in T6, non un rig anatomico.
    function jointsFor(arr) {
      if (!arr.length) {
        return { shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3() };
      }
      var b = new THREE.Box3();
      arr.forEach(function (m) { b.union(new THREE.Box3().setFromObject(m)); });
      var cx = (b.min.x + b.max.x) / 2;
      var cz = (b.min.z + b.max.z) / 2;
      var top = b.max.y, bottom = b.min.y;
      return {
        shoulder: new THREE.Vector3(cx, top, cz),
        elbow: new THREE.Vector3(cx, (top + bottom) / 2, cz),
        wrist: new THREE.Vector3(cx, bottom, cz)
      };
    }

    var jL = jointsFor(armL), jR = jointsFor(armR);

    return {
      head: head, body: body, armL: armL, armR: armR,
      joints: {
        shoulderL: jL.shoulder, elbowL: jL.elbow, wristL: jL.wrist,
        shoulderR: jR.shoulder, elbowR: jR.elbow, wristR: jR.wrist
      }
    };
  }
};
