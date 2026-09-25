# I master GetLayers, intatti

Questi sono i `source` restituiti da `getlayers_materialize(target:'other')`,
**come arrivano**, prima di qualunque adattamento. Non sono serviti dal sito:
stanno qui perché se un adattamento va rifatto si riparte da questi invece che
da una nuova materializzazione (che è contingentata e, su alcuni template, non
funziona affatto).

L'adattamento applicato a ognuno è sempre lo stesso mestiere:
1. la **funzione che compone i percorsi** — ce n'è una sola per master
   (`A()`, `asset()`, `ASSET_BASE_URL`) — si punta a `assets/` locale, e lì si
   fa anche la sostituzione d'estensione verso WebP;
2. i CDN (three, lenis, decoder DRACO, font di terzi) si vendorizzano;
3. `<base href="/atelier/<mondo>/">`, che senza è 404 su tutto;
4. titolo, descrizione, ritorno alla mappa, contrassegno «mondo dimostrativo»;
5. la copy si ri-veste in italiano — attenzione ai titoli **segmentati**
   (prima lettera staccata per il corsivo) e a quelli in markup `<span>`:
   le sostituzioni piatte falliscono in silenzio.

`la-macchina` non ha il suo master qui: su `ascend` la materializzazione cade
sempre, e il sorgente è stato preso file per file — sta in `../_src-la-macchina/`.
