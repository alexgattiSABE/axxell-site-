# assets/saucer.glb — come è stato ricavato

Sorgente: `Effetti webiste/luminous-saucer/luminous-saucer.html`, dove il
modello (Meshy AI "Luminous Saucer") sta **inline in base64** dentro
`<script id="saucerModel">` — sono quelli i 2,4 MB dei 2,5 del file.

L'originale è **Draco-compresso** (`KHR_draco_mesh_compression` in
`extensionsRequired`) e ha **261.790 triangoli**. Spedirlo così avrebbe voluto
dire imbarcare il decoder Draco (WASM) per ogni visitatore, e far decomprimere
un quarto di milione di triangoli sul suo telefono. La decompressione si paga
una volta sola, qui.

Passi, con `npx @gltf-transform/cli@4` (nessuna installazione permanente):

    # 1. estrai il base64 dallo <script> in un .glb
    #    (vedi il node -e usato in sessione: legge l'HTML, decodifica, scrive)

    # 2. decomprimi Draco
    npx --yes @gltf-transform/cli@4 copy saucer.glb saucer-plain.glb
    #    1,62 MB -> 9,98 MB

    # 3. decima la mesh
    npx --yes @gltf-transform/cli@4 simplify saucer-plain.glb saucer-lo.glb \
        --ratio 0.18 --error 0.002
    #    9,98 MB -> 1,85 MB, 261.790 -> 47.122 triangoli

Risultato: 47.122 triangoli, 29.059 vertici, POSITION/NORMAL/TANGENT/TEXCOORD_0,
tre texture WebP (base color 92 KB, metallic-roughness 46 KB, normal 29 KB).
`extensionsRequired` ora è solo `EXT_texture_webp`. Bounding box ±0.95 in X/Z,
±0.32 in Y: un disco piatto.

## Non fatto, e perché

`resize --width 1024` fallisce in questo ambiente: libvips non digerisce il
colourspace di questi WebP (`parameter space not set`). Non è servito comunque
— le tre texture insieme fanno 167 KB, cioè meno del 10% del file. Il peso sta
tutto nella geometria (1,60 MB), che è float32 non quantizzato con indici a 32
bit. Da lì si recuperano ~280 KB passando gli indici a 16 bit (i vertici sono
29.059, ci stanno larghi) come è stato fatto per `spine.glb`.
