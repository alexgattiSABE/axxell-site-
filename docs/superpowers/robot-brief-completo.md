# Robot home (CAP 05) — BRIEF COMPLETO (visione dell'utente)

> ⚠️ **Leggi questo prima del piano.** Il piano `plans/2026-08-31-robot-cervello-vesper.md` copre
> **solo la parte tecnica** (GLB, materiali, cervello, fibre, interazione = ~1/3 di questa visione). Il
> resto della visione era rimasto **solo nella conversazione** della sessione originale (2026-08-27/31)
> e non era su file: qui è messo per iscritto perché non si perda di nuovo. Estensione del piano coi
> task mancanti: sezione "FASE 2" in fondo al piano.

## Brief originale (parole dell'utente, verbatim)

> «Voglio che prendi il robot che muove la testa col movimento del cursore e lo metti nella sezione
> home del sito. Nella testa del robot ci metti il cervello che trovi in ATLAS (si deve vedere solo
> quando ci passo sopra col mouse, e deve anche lui muoversi perfettamente a sincrono con la testa);
> nel petto del robot ci metti la A di Axxell; mantieni il background del circuito elettrico; nella
> pancia voglio l'effetto che trovi nella sezione SABE del sito; fai un flusso di energia per
> rappresentare le corde vocali e gli arti; ogni volta che col cursore passo su quelle zone devono
> comparire quegli elementi, in particolare: sulla testa deve uscire, come in un'anatomia (quindi una
> linea spezzata, prima obliqua poi orizzontale, sopra quest'ultima alla quale viene fuori il nome), la
> voce "testa"; per la pancia "anima"; per il braccio destro "chatbot" e quello sinistro "social
> automation". Ogni volta che clicco in una di quelle zone, si deve attivare uno zoom e devo vedere
> tutte le info che si trovano per i vari prodotti. Sotto ogni titolo voglio il tab "scopri ->".»

Chiarimenti successivi dell'utente:
- «Replica il codice del robot nell'atelier e riadatta a ciò che dobbiamo fare noi, **mantenendo la sua
  struttura originale** e inserendo dentro le particelle che si vedono solo al click.»
- «Al click voglio **zoom** su parte del corpo. Esempio: click su testa → zoom su testa, la testa si
  rende **quasi trasparente** per mostrare l'interno in cui si trova il cervello di particelle di ATLAS.»
- «Deve essere **UGUALE al robot dell'atelier**» (aspetto/colori) — con screenshot di riferimento.

## Le 4 zone anatomiche (etichette CONFERMATE dall'utente, 2026-09-03)

Stile etichetta all'hover: **linea spezzata** che esce dalla zona — prima **obliqua** poi
**orizzontale** — e **sopra il tratto orizzontale** compare il nome. Sotto ogni titolo: tab **«scopri →»**.
Al **click**: **zoom** sulla zona (la parte diventa quasi trasparente per mostrare l'interno) + pannello
con **tutte le info del prodotto**.

| Zona | Etichetta | Interno mostrato | Prodotto (pannello al click) |
|---|---|---|---|
| Testa | **testa** | cervello di particelle di ATLAS | ATLAS |
| Pancia | **anima** | effetto della sezione SABE del sito | SABE |
| Braccio destro | **chatbot** | flusso d'energia (arto) | chatbot |
| Braccio sinistro | **social automation** | flusso d'energia (arto) | social automation |

## Stato: fatto ✅ / mancante ❌

**✅ Fatto (piano T1–T7):**
- Testa che segue il cursore.
- Cervello ATLAS (point-brain Vesper) dentro la testa, reveal all'hover, sincrono.
- Background del circuito elettrico.
- Flusso d'energia negli arti (fibre braccia).

**🟡 In iterazione (non chiuso):**
- Aspetto/colori **uguali al robot dell'atelier** (spec: "materiali da iterare, non identici"). Riferimenti
  a schermo in `.superpowers/sdd/2026-08-31-robot-cervello-vesper/` (`ref1-*`, `ref2-*`, `baseline.png`).

**❌ Mancante — NON ancora nel piano tecnico (vedi FASE 2):**
- La **A di Axxell sul petto**.
- Nella **pancia**: l'effetto della **sezione SABE** ("anima").
- **Corde vocali** come flusso d'energia (oltre agli arti).
- **Etichette anatomiche all'hover** (linea spezzata obliqua→orizzontale + nome) per le 4 zone.
- **Click → zoom** sulla zona, con la parte che diventa **quasi trasparente**.
- **Pannello info prodotto** al click (ATLAS / SABE / chatbot / social automation).
- Tab **«scopri →»** sotto ogni titolo.

## Vincoli / note

- Base = **robot dell'atelier**, struttura originale mantenuta. Le particelle interne compaiono su
  hover (reveal) e il click porta lo zoom.
- **NON metterlo in home / merge finché l'utente non autorizza** (richiesta esplicita nel brief).
- Un solo contesto WebGL heavy vivo per volta (come nel resto del piano).
