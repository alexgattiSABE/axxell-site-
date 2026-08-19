# assets/human.glb — come è stato ricavato

Sorgente: `Effetti webiste/luminous-saucer/luminous-saucer.html`, dove il
secondo modello (Meshy AI, "Airborne Pose" — il rapito che levita dentro il
raggio) sta **inline in base64** dentro `<script id="humanModel">`.

Come il disco, l'originale è **Draco-compresso**. Spedirlo così avrebbe voluto
dire imbarcare il decoder Draco (WASM) per un modello da 11.232 triangoli: il
decoder pesa più della mesh. La decompressione si paga una volta sola, qui.

Passi, con `npx @gltf-transform/cli@4` (nessuna installazione permanente):

    # 1. estrai il base64 dallo <script> in un .glb
    node -e "
      const fs=require('fs');
      const html=fs.readFileSync('luminous-saucer.html','utf8');
      const m=html.match(/<script id=\"humanModel\"[^>]*>([\s\S]*?)<\/script>/);
      fs.writeFileSync('human-draco.glb', Buffer.from(m[1].trim(),'base64'));
    "
    #    206 KB

    # 2. decomprimi Draco
    npx --yes @gltf-transform/cli@4 copy human-draco.glb human.glb
    #    206 KB -> 547 KB

Risultato: 11.232 triangoli, 7.691 vertici, indici già a 16 bit,
POSITION/NORMAL/TANGENT/TEXCOORD_0, quattro texture WebP da 1024×1024 (base
color 73 KB, metallic-roughness 19 KB, normal 15 KB, emissive 2 KB).
`extensionsRequired` è solo `EXT_texture_webp`. Bounding box ±0.55 in X/Z,
±0.95 in Y: una figura in piedi, alta il doppio di quanto è larga.

## Niente decimazione, al contrario del disco

`saucer.glb` è passato per `simplify --ratio 0.18` perché partiva da 261.790
triangoli. Qui non serve: 11.232 triangoli sono un ventesimo di quelli, e la
figura in scena è alta un decimo del quadro — la geometria non è il peso.
Il peso sono le quattro texture da 1024², che insieme fanno 109 KB dei 547.

Restano in scena TANGENT (che il materiale non legge: `MeshStandardMaterial`
ricava le tangenti dalle derivate) e la mappa emissiva, che nel file è quasi
tutta nera. Toglierle avrebbe recuperato ~90 KB su un asset che ne pesa 547 e
che si scarica solo quando la sezione entra in quadro; non è sembrato valere
un passo in più nella pipeline.
