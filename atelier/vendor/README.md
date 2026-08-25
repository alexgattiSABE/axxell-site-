# vendor/ — le librerie di terze parti, servite da noi

Questi file **non si modificano a mano**: sono i build ufficiali, scaricati e
messi qui così come sono.

## Perché non stanno su un CDN

Prima arrivavano da `cdn.jsdelivr.net` e `cdnjs.cloudflare.com`. Con jsdelivr
irraggiungibile la pagina non degradava: restava **nera**. GSAP non si
definisce, il velo del loader non si toglie mai, e sotto non c'è niente da
vedere — verificato bloccando il dominio e ricaricando. Un portfolio che
dipende da un dominio di terzi per esistere è un portfolio fragile.

Serviti da noi: se risponde il sito rispondono anche loro, non c'è un secondo
handshake TLS verso un altro host, e nessun terzo vede l'IP di chi visita —
che è anche il motivo per cui questa scelta semplifica la parte GDPR.

## Cosa c'è, e da dove viene

Ogni file è stato verificato contro l'hash `integrity` che stava scritto nei
tag `<script>` di `index.html` e `parliamone.html` prima della migrazione:
sono **gli stessi byte** che serviva il CDN, non una versione diversa.

| file | versione | origine |
|---|---|---|
| `gsap.min.js` | GSAP 3.13.0 | `cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js` |
| `ScrollTrigger.min.js` | GSAP 3.13.0 | idem, `/dist/ScrollTrigger.min.js` |
| `SplitText.min.js` | GSAP 3.13.0 | idem, `/dist/SplitText.min.js` |
| `CustomEase.min.js` | GSAP 3.13.0 | idem, `/dist/CustomEase.min.js` |
| `Flip.min.js` | GSAP 3.13.0 | idem, `/dist/Flip.min.js` |
| `ScrambleTextPlugin.min.js` | GSAP 3.13.0 | idem, `/dist/ScrambleTextPlugin.min.js` |
| `lenis.min.js` | Lenis 1.1.20 | `cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js` |
| `three.min.js` | three.js r128 | `cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` |
| `lottie_light.min.js` | lottie-web 5.12.2 | `cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js` |
| `email.min.js` | @emailjs/browser 4.4.1 | `cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js` |

`three.min.js` serve solo a `index.html` (capitoli 3D). `lottie_light.min.js` e
`email.min.js` solo a `parliamone.html` (spunta di conferma e invio del form).
Da non confondere con `../../vendor/`, alla radice del sito: lì ci sono i build
ES module di three, che questa pagina non usa.

## Aggiornarne uno

1. scarica il file nuovo dall'URL della tabella con la versione nuova;
2. aggiorna versione e URL qui sopra;
3. alza il `?v=` nei tag `<script>` delle due pagine, sennò chi ha già
   visitato il sito continua a prendere il vecchio dalla cache;
4. riguarda la pagina a schermo — non basta che carichi.

Nei tag non c'è `integrity`: stessa origine, non c'è un terzo di cui fidarsi.
Se un giorno si tornasse a un CDN, l'attributo va rimesso.

## three.js r128 è vecchio (2021)

Non è stato aggiornato in questo giro perché il codice dei capitoli 3D è
scritto sulle sue API (`THREE.sRGBEncoding`, `encoding` sulle texture, niente
color management nuovo): salire di versione è un lavoro a sé, da fare guardando
ogni scena. Ora però la versione è congelata in un file nostro, non appesa a
quello che il CDN decide di servire.
