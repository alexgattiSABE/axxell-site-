import { riduci, dorme, inVista } from './utili.js';

// La conversazione d'esempio del chatbot: quando arriva in vista i messaggi entrano uno alla volta, prima di ogni
// risposta compaiono i tre puntini e, a ogni risposta, nel pannello accanto si accende la fonte da cui arriva
// (il testo dell'attività, il gestionale ANIMA, i post social). L'ultima risposta non ha fonte: per prenotare il
// chatbot fa chiamare. Finita, ricomincia; fuori schermo si ferma. Senza JavaScript e col movimento ridotto si vede
// tutta la conversazione, ferma (le classi che nascondono le mette solo questo script).
export function avviaChat() {
  const lista = document.getElementById('seConversazione'), fonti = document.getElementById('seFonti');
  if (!lista || !fonti || riduci) return;
  const voci = [...lista.children];
  let visibile = false;
  inVista(lista, v => { visibile = v; }, .3);
  const passo = async ms => { await dorme(ms); while (!visibile) await dorme(300); };
  const accendi = f => fonti.querySelectorAll('li').forEach(li => li.classList.toggle('attiva', !!f && li.dataset.fonte === f));
  const scrive = document.createElement('li');
  scrive.className = 'se-c-scrive'; scrive.setAttribute('aria-hidden', 'true'); scrive.innerHTML = '<i></i><i></i><i></i>';
  lista.classList.add('in-scena');
  const ciclo = async () => {
    for (;;) {
      await passo(0);
      voci.forEach(v => v.classList.remove('visto')); accendi(null);
      await passo(500);
      for (const v of voci) {
        const bot = v.classList.contains('se-c-bot');
        if (bot) { scrive.style.top = `${v.offsetTop}px`; lista.append(scrive); await passo(900); scrive.remove(); }
        v.classList.add('visto');
        if (bot) { accendi(v.dataset.fonte); await passo(1700); }
        else await passo(600);
      }
      await passo(3500);
    }
  };
  ciclo();
}
