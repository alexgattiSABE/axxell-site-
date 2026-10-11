import { $ } from './utili.js';
import { avviaSfondo } from './sfondo.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';

// Le pagine di testo (privacy, note legali): sfondo, logo in alto e menu del telefono, come le altre pagine.
avviaSfondo($('bg'));
avviaLogoHeader();
avviaMenu();
