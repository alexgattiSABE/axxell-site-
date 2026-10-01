#!/usr/bin/env python3
"""Aggiunge le fasce chiare (classe `lt`) ai blocchi delle pagine del sito.
Uso: python3 scripts/tema-chiaro.py index.html [atlas.html sabe.html]
Idempotente: salta i blocchi che hanno già `lt`. L'atelier non c'entra (ha i suoi file)."""
import re, sys
# per pagina: indici (0, 1, 2...) dei blocchi di contenuto che diventano chiari
CHIARE = {'p-sabe': {0, 2, 4, 6, 7}, 'p-servizi': {0, 2}, 'p-visione': {0, 2, 4}, 'p-atlas': {0, 2, 4, 6}}
TUTTE = {'p-privacy', 'p-legale'}   # documenti di testo: tutta la pagina chiara
SALTA = ('scene-3d', 'pg-hero', 'ss-strip', 'cta-band', 'contact-bar', 'cal-wrap', 'mono-tag', 'axc-stage', 'at-tier')

def lavora(path):
    L = open(path).read().split('\n')
    page = None; k = 0; alt = False; n = 0
    for i, l in enumerate(L):
        m = re.match(r'<div id="(p-\w+)" class="page', l)
        if m: page = m.group(1); k = 0; alt = False; continue
        if page is None or not re.match(r'  <div class="', l): continue
        cls = re.match(r'  <div class="([^"]*)"', l).group(1)
        if any(x in cls for x in SALTA): continue
        if not cls.startswith('inner'): continue
        chiara = page in TUTTE or k in CHIARE.get(page, ())
        k += 1
        if not chiara or ' lt' in ' ' + cls: continue
        extra = ' lt lt-alt' if alt else ' lt'
        alt = not alt
        L[i] = l.replace('class="' + cls + '"', 'class="' + cls + extra + '"', 1); n += 1
    open(path, 'w').write('\n'.join(L))
    print(path, n, 'blocchi chiari')

for f in sys.argv[1:]: lavora(f)
