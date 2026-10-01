#!/usr/bin/env python3
"""atlas.html e sabe.html sono copie di index.html con head SEO e pagina iniziale diversi.
Rigenera le due copie da index.html tenendo di ognuna: title, description, canonical,
og:*, twitter:* e la pagina `active`. Uso: python3 scripts/sincronizza-pagine.py"""
import re
SRC = open('index.html').read()
TAG = [r'<title>.*?</title>', r'<meta name="description" content=".*?">', r'<link rel="canonical" href=".*?">',
       r'<meta property="og:title" content=".*?">', r'<meta property="og:description" content=".*?">',
       r'<meta property="og:url" content=".*?">', r'<meta name="twitter:title" content=".*?">',
       r'<meta name="twitter:description" content=".*?">']
for nome, pagina in (('atlas', 'p-atlas'), ('sabe', 'p-sabe')):
    vecchio = open(nome + '.html').read()
    out = SRC
    for t in TAG:
        mv = re.search(t, vecchio); ms = re.search(t, out)
        assert mv and ms, t
        out = out[:ms.start()] + mv.group(0) + out[ms.end():]
    out = out.replace('<div id="p-home" class="page active">', '<div id="p-home" class="page">', 1)
    out = out.replace('<div id="%s" class="page">' % pagina, '<div id="%s" class="page active">' % pagina, 1)
    open(nome + '.html', 'w').write(out)
    print(nome, len(out))
