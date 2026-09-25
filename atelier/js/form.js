WC.register('form', function(ctx){
  var form   = document.getElementById('wcForm');
  var btn    = document.getElementById('wcSubmit');
  var label  = document.getElementById('wcSubmitLabel');
  var err    = document.getElementById('wcFormErr');
  var ok     = document.getElementById('wcFormOk');
  if (!form || !btn || !err || !ok) return;
  if (typeof emailjs === 'undefined') {
    // Senza il provider il form non deve fingere di funzionare.
    err.textContent = 'Modulo non disponibile. Scrivi a info@axxell.ai.';
    err.hidden = false;
    btn.disabled = true;
    return;
  }

  // Chiavi pubbliche, identiche a quelle già in uso su index.html.
  emailjs.init('Jass-MWY1fZy7RTCk');

  function fail(msg){ err.textContent = msg; err.hidden = false; }

  var onSubmit = function(e){
    e.preventDefault();
    err.hidden = true;

    var nome  = document.getElementById('wcNome').value.trim();
    var email = document.getElementById('wcEmail').value.trim();
    var msg   = document.getElementById('wcMsg').value.trim();

    if (!nome || !email || !msg) { fail('Compila tutti i campi.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { fail('Email non valida.'); return; }

    btn.disabled = true;
    label.textContent = 'Invio…';

    emailjs.send('service_ma1qdph', 'template_btru4ua', {
      nome: nome,
      email: email,
      messaggio: msg,
      origine: 'website-creation'
    }).then(function(){
      form.hidden = true;
      ok.hidden = false;
      if (typeof lottie !== 'undefined') {
        var a = lottie.loadAnimation({
          container: document.getElementById('wcFormOkLottie'),
          renderer: 'svg', loop: false, autoplay: ctx.motionOk,
          path: 'assets/success.json'
        });
        // Con reduced-motion la spunta va all'ULTIMO fotogramma, non al
        // primo: un primo fotogramma vuoto non comunicherebbe il successo.
        if (!ctx.motionOk) {
          a.addEventListener('DOMLoaded', function(){ a.goToAndStop(a.totalFrames - 1, true); });
        }
      }
    }).catch(function(e2){
      console.error('[WC] invio fallito', e2);
      btn.disabled = false;
      label.textContent = 'Invia';
      fail('Invio non riuscito. Scrivi a info@axxell.ai.');
    });
  };

  form.addEventListener('submit', onSubmit);
  return function(){ form.removeEventListener('submit', onSubmit); };
});
