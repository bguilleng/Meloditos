/* app.js
   Meloditos — Lógica principal del juego.
   Documentación amplia en comentarios para entender cada parte.
*/

/* ------------- CONFIG Y ESTADO ------------- */

// mapping visual A..H -> notas musicales (Do..Do')
/* Comentario pedagógico:
   Usamos letras A..H (requisito). Internamente mappeamos a frecuencias.
   - A => Do (C4)
   - B => Re (D4)
   - C => Mi (E4)
   - D => Fa (F4)
   - E => Sol (G4)
   - F => La (A4)
   - G => Si (B4)
   - H => Do' (C5)
*/
 /* ======================================================
     MELÓDITOS - Script reorganizado y comentado en español
     Estructura general (orden lógico):
       1) Constantes
       2) Estado del juego
       3) Referencias al DOM
       4) Audio: creación y helpers
       5) Utilidades y UI helpers
       6) Visual: notas cayendo
       7) Reproducción de secuencias (con sincronización)
       8) Manejo de entrada del jugador
       9) Grabadora (modo libre)
      10) Enlaces de eventos e inicialización
     Se ha retirado la melodía alegre (sonido) para aciertos: ahora
     las victorias se muestran visualmente (estrellas) sin reproducir
     la secuencia de tonos "cheer" que había antes.
     ====================================================== */

  // ------------------------------------------------------
  // 1) Constantes
  // ------------------------------------------------------
  // Mapa de letra -> frecuencia (Hz) para el timbre piano
  const LETTER_TO_FREQ = { A: 261.63, B: 293.66, C: 329.63, D: 349.23, E: 392.00, F: 440.00, G: 493.88, H: 523.25 };

  // Añadimos melodías con nombres
  const MELODIES = [
  { name: 'Estrellita', notes: ['A','A','E','E','F','F','E','D','D','C','C','B','B','A'] },
  { name: 'Cumpleaños Feliz', notes: ['A','A','B','A','D','C','A','A','B','A','E','D'] },
  { name: 'Campanitas', notes: ['C','C','C','A','C','E','E','E','C','E','G','G'] }
  ];

  // ------------------------------------------------------
  // 2) Estado del juego
  // ------------------------------------------------------
  let state = {
    childName: null,
    childAge: null,
    currentLevel: 1,
    score: 0,
    lives: 5,
    attemptsLeft: 5,
    maxScore: 20,
    minScore: 0,
    masterMode: false,
    recording: false,
    recordedSequence: [],
    logs: [],
    currentTarget: [],
    waitingForInput: false,
    rhythmWindowMs: 600,
    ageScale: 5,
  };

  // ------------------------------------------------------
  // 3) Referencias DOM
  // ------------------------------------------------------
  const modal = document.getElementById('modal');
  const btnStart = document.getElementById('btnStart');
  const modalSave = document.getElementById('modalSave');
  const modalCancel = document.getElementById('modalCancel');
  const inputName = document.getElementById('inputName');
  const inputAge = document.getElementById('inputAge');
  const displayName = document.getElementById('displayName');
  const displayAge = document.getElementById('displayAge');
  const levelLabel = document.getElementById('level');
  const scoreLabel = document.getElementById('score');
  const livesLabel = document.getElementById('lives');
  const attemptsLabel = document.getElementById('attempts');
  const feedback = document.getElementById('feedback');
  const keys = document.querySelectorAll('.key');
  const btnPlayRound = document.getElementById('btnPlayRound');
  const btnNext = document.getElementById('btnNext');
  const btnReset = document.getElementById('btnReset');
  const modeSelect = document.getElementById('modeSelect');
  const masterToggle = document.getElementById('masterToggle');
  const exportCsvBtn = document.getElementById('exportCsv');
  const attemptCounter = document.getElementById('attemptCounter');
  const recentTableBody = document.querySelector('#recentTable tbody');
  const recorderBlock = document.getElementById('recorder');
  const btnStartRecord = document.getElementById('btnStartRecord');
  const btnStopRecord = document.getElementById('btnStopRecord');
  const btnPlayRecording = document.getElementById('btnPlayRecording');
  const recordedList = document.getElementById('recordedList');
  const ageScale = document.getElementById('ageScale');
  const starTemplate = document.getElementById('starTemplate');
  const fallArea = document.getElementById('fallArea');
  const pianoContainer = document.getElementById('piano');
  const lanes = document.getElementById('lanes');

  // ------------------------------------------------------
  // 4) Audio: context y funciones para reproducir tonos
  // ------------------------------------------------------
  let audioCtx = null;
  function ensureAudio() {
    // Crea o devuelve el AudioContext (necesario para WebAudio)
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  /**
   * playPianoTone
   * Sintetiza un sonido tipo piano combinando dos osciladores
   * y aplicando un envolvente (ADSR simplificado).
   * - frequency: frecuencia en Hz
   * - duration: duración en ms
   */
  function playPianoTone(frequency, duration = 500) {
    const ctx = ensureAudio();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!frequency) return;

    const now = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();

    // Tipos de onda y armónicos para dar calidez
    o1.type = 'sine';
    o2.type = 'triangle';
    o1.frequency.value = frequency;
    o2.frequency.value = frequency * 2;

    // Envolvente: ataque muy corto, decaimiento y release
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.8, now + 0.01); // ataque
    g.gain.exponentialRampToValueAtTime(0.3, now + duration / 1000 * 0.4); // decay
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration / 1000); // release

    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.start(now); o2.start(now);
    o1.stop(now + duration / 1000 + 0.05); o2.stop(now + duration / 1000 + 0.05);
  }

  // Wrapper para compatibilidad con llamadas previas
  function playTone(frequency, duration = 500) { playPianoTone(frequency, duration); }

  // Sonido breve de error (buzzer) — útil para retroalimentación negativa
  function playBuzzer() {
    const ctx = ensureAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 120;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.8, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + 0.18);
  }

  // Sonido breve tipo campana — usado para aciertos discretos
  //function playBell(){ playTone(880,160) }

  // NOTA: se ha modificado la función 'cheer' original que reproducía
  // una secuencia de notas. Para evitar cualquier "tono alegre" en
  // el comportamiento por defecto cuando el niño acierta, esta
  // función ya no reproduce sonido y se limita a mostrar una recompensa
  // visual (estrellas). De este modo cumplimos la petición de eliminar
  // la melodía alegre al acertar.
  //function playCheer(){
    // Antes: reproducía una secuencia de tonos.
    // Ahora: únicamente efecto visual (estrellas) — sin audio.
  //  spawnStars(10);
  //}

  // ------------------------------------------------------
  // 5) Utilidades y helpers de UI
  // ------------------------------------------------------
  function nowTimestamp(){return (new Date()).toISOString().replace('T',' ').split('.')[0]}

  // Genera confetti/estrellas visuales — solo elementos DOM y animación
  function spawnStars(count=8){
    for(let i=0;i<count;i++){
      const el=document.createElement('div');
      el.className='confetti';
      el.style.left=`${10+Math.random()*80}%`;
      el.style.top=`${40+Math.random()*40}%`;
      el.style.background=`hsl(${Math.random()*360} 90% 60%)`;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(),1400);
    }
  }

  function updateUI(){
    // Actualiza los indicadores visuales principales con el estado actual
    levelLabel.textContent = state.currentLevel;
    scoreLabel.textContent = state.score;
    livesLabel.textContent = state.lives;
    attemptsLabel.textContent = state.attemptsLeft;
    attemptCounter.textContent = `Intentos registrados: ${state.logs.length}`;
    displayName.textContent = state.childName || '—';
    displayAge.textContent = state.childAge || '—';

    // Monta la tabla con los últimos 5 intentos registrados
    recentTableBody.innerHTML = '';
    const last = state.logs.slice(-5).reverse();
    last.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${l.name}</td><td>${l.level}</td><td>${Array.isArray(l.target)?l.target.join('-'):l.target}</td><td>${l.played}</td><td>${l.result}</td>`;
      recentTableBody.appendChild(tr);
    });

    // Recompensas en forma de estrellas (visual)
    const starsArea = document.getElementById('starsArea');
    starsArea.innerHTML = '';
    const starCount = Math.floor((state.score / 20) * 3);
    for (let i = 0; i < starCount; i++) starsArea.appendChild(starTemplate.content.cloneNode(true));
  }

  function logAttempt(entry){ if(!state.masterMode) return; state.logs.push(entry); updateUI(); }

  async function exportCSV(){
    // Exporta los logs en CSV si el modo maestro está activo y hay registros
    if (state.logs.length === 0) { alert('No hay resultados para exportar.'); return }
    const header=['Niño','Edad','Fecha','Nivel','Objetivo','Respuesta','Resultado','Puntaje','Vidas'];
    const rows = state.logs.map(r => [r.name,r.age,r.datetime,r.level,Array.isArray(r.target)?r.target.join('|'):r.target,r.played,r.result,r.scoreAccum,r.livesRemaining].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(','));
    const csv=[header.join(','),...rows].join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='resultados_meloditos.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

 function getNotePoolForLevel(level){
    // Devuelve un conjunto de notas adaptado al nivel para variar la dificultad
    const pool=['A','B','C','D','E','F','G','H'];
    const offset=(level-1)%pool.length;
    return pool.slice(offset).concat(pool.slice(0,offset));
  }

  //function generateTargetForLevel(level){
    // Genera objetivo según el nivel (ejemplos simples para prototipo)
  //  const pool = getNotePoolForLevel(level);
  //  switch(level){
  //    case 1: return [pool[Math.floor(Math.random()*pool.length)]]; // un solo tono
  //    case 2: { const len = Math.random()<0.5?2:3; const seq=[]; for(let i=0;i<len;i++) seq.push(pool[Math.floor(Math.random()*pool.length)]); return seq }
  //    case 3: return generateTargetForLevel(2); // ritmo basado en secuencia corta
  //    case 4: { const estrellita=['A','A','E','E','F','F','E']; return estrellita.slice(0,5) } // ejemplo de melodía
  //    case 5: return []; // modo libre
  //    default: return [pool[0]];
  //  }
  //}

    // Reemplazo de la generación del nivel 4
  function generateTargetForLevel(level){
    // Genera objetivo según el nivel (ejemplos simples para prototipo)
    const pool = getNotePoolForLevel(level);
    switch(level){
      case 1: return [pool[Math.floor(Math.random()*pool.length)]]; // un solo tono
      case 2: { const len = Math.random()<0.5?2:3; const seq=[]; for(let i=0;i<len;i++) seq.push(pool[Math.floor(Math.random()*pool.length)]); return seq }
      case 3: return generateTargetForLevel(2); // ritmo basado en secuencia corta
      case 4: 
      {
        // Selección aleatoria de una melodía
        const choice = MELODIES[Math.floor(Math.random()*MELODIES.length)];
        state.currentMelodyName = choice.name;
        return choice.notes;
      }
      case 5: return [];
      default: return [pool[0]];
    }
  }

  // ------------------------------------------------------
  // 6) Visual: notas cayendo (implementación)
  // ------------------------------------------------------
  /**
   * spawnFallingNote
   * Crea un elemento visual que cae desde la parte superior del "fallArea"
   * hasta la línea objetivo. Se posiciona horizontalmente centrándose en
   * la tecla correspondiente.
   * - letter: letra de la nota (A..H)
   * - durationMs: duración en ms del desplazamiento vertical
   * - delayMs: retraso antes de iniciar el desplazamiento (para secuencias)
   */
  function spawnFallingNote(letter, durationMs = 700, delayMs = 0) {
    const keyEl = document.querySelector(`.key[data-letter="${letter}"]`);
    if (!keyEl) return;

    const fallRect = fallArea.getBoundingClientRect();
    const keyRect = keyEl.getBoundingClientRect();

    // Calcula la posición X centrada respecto al rectángulo del fallArea
    const centerX = keyRect.left + keyRect.width / 2 - fallRect.left;

    const note = document.createElement('div');
    note.className = 'fall-note';
    // El ancho de la nota es 44px, por eso restamos 22 para centrar
    note.style.left = `${centerX - 22}px`;
    note.innerHTML = `<div>${letter}<small></small></div>`;

    fallArea.appendChild(note);

    // Distancia aproximada que debe recorrer la nota hasta la línea objetivo
    const travelDistance = fallArea.clientHeight - 48; // se ajusta heurísticamente
    note.style.transitionDuration = durationMs + 'ms';

    // Lanza la animación después del retraso opcional
    setTimeout(() => {
      note.style.transform = `translateY(${travelDistance}px)`;
    }, delayMs);

    // Limpieza del DOM una vez finalizada la animación
    setTimeout(() => {
      note.remove();
    }, delayMs + durationMs + 80);
  }

  // ------------------------------------------------------
  // 7) Reproducción de secuencias (con notas cayendo sincronizadas)
  // ------------------------------------------------------
  /**
   * playTargetSequence
   * Reproduce una secuencia de letras: para cada nota se reproduce el
   * audio (timbre piano) y se genera una nota visual que cae.
   * El intervalo entre notas se ajusta con base en la edad/escala.
   */
  function playTargetSequence(seq) {
    if (!seq || seq.length === 0) return;
    const baseInterval = 600;
    const age = state.childAge || state.ageScale || 5;
    const ageFactor = 1 - ((age - 3) / 10);
    const interval = Math.round(baseInterval * (0.9 + ageFactor * 0.5));

    seq.forEach((letter, idx) => {
      const delay = idx * interval;
      setTimeout(() => {
        // Nota visual
        spawnFallingNote(letter, Math.round(interval * 0.95), 0);
        // Sonido (timbre piano)
        const freq = LETTER_TO_FREQ[letter];
        if (freq) playTone(freq, Math.round(interval * 0.9));
        // Resalte breve en la tecla
        highlightKey(letter, Math.min(260, Math.round(interval * 0.7)));
      }, delay);
    });
  }

  /**
   * playSequenceWithTiming
   * Reproducción para modo ritmo: además de emitir el sonido y la nota
   * visual, guarda los tiempos esperados para evaluar la precisión del
   * usuario cuando pulse las teclas.
   */
  function playSequenceWithTiming(seq) {
    state.expectedTimes = [];
    const baseInterval = 600;
    const age = state.childAge || state.ageScale || 5;
    const ageFactor = 1 - ((age - 3) / 10);
    const interval = Math.round(baseInterval * (0.9 + ageFactor * 0.5));
    const start = performance.now() + 120;

    seq.forEach((letter, idx) => {
      const t = start + idx * interval;
      state.expectedTimes.push({ letter, time: t, matched: false });
      const delay = Math.max(0, Math.round(t - performance.now()));

      setTimeout(() => {
        spawnFallingNote(letter, Math.round(interval * 0.95), 0);
        highlightKey(letter, 180);
        const freq = LETTER_TO_FREQ[letter];
        if (freq) playTone(freq, 300);
      }, delay);
    });
  }

  // ------------------------------------------------------
  // 8) Manejo de entrada: resaltado y respuesta a pulsaciones
  // ------------------------------------------------------
  function highlightKey(letter, ms = 220) 
  {
     const el = document.querySelector(`.key[data-letter="${letter}"]`);
     if (!el) return; 
     el.classList.add('active'); setTimeout(()=>el.classList.remove('active'), ms); 
  }

  /**
   * onKeyPress
   * Lógica que se ejecuta cuando el niño pulsa una tecla del piano.
   * - Reproduce el sonido asociado a la tecla
   * - Si está en modo grabación, guarda la nota
   * - Si hay una secuencia objetivo, compara y actualiza puntuación
   */
  function onKeyPress(letter) {
    // Reproducir timbre piano cuando el niño pulsa la tecla
    const freq = LETTER_TO_FREQ[letter];
    if (freq) playTone(freq, 220);

    // Modo grabación (nivel 5)
    if (state.currentLevel === 5 && state.recording) {
      if (state.recordedSequence.length < 8) { state.recordedSequence.push(letter); updateRecordedList(); }
      else { feedbackShow('Máx 8 notas en grabación','info'); }
      logIfMaster([letter], letter, 'Libre', state.score);
      return;
    }

    // Si no hay objetivo establecido, pedimos que se reproduzca primero
    if (!state.currentTarget || state.currentTarget.length === 0) { feedbackShow('Pulsa "Reproducir objetivo" para ver la secuencia','info'); return; }

    // Nivel 1: reconocimiento (una nota)
    if (state.currentLevel === 1) {
      const target = state.currentTarget[0];
      if (letter === target) handleCorrect([target], letter); else handleIncorrect([target], letter);
      return;
    }

    // Niveles 2 y 4: secuencia (comprobación paso a paso)
    if ([2,4].includes(state.currentLevel)) {
      state.userProgress = state.userProgress || [];
      state.userProgress.push(letter);
      const pos = state.userProgress.length - 1;
      const expected = state.currentTarget[pos];
      if (letter === expected) {
        incrementScore(1);
        //playBell();
        spawnStars(4);
        feedbackShow('Acierto parcial ✔','ok');
        logIfMaster(state.currentTarget, letter, 'Parcial', state.score);
        if (state.userProgress.length === state.currentTarget.length) {
          feedbackShow('¡Secuencia completa! 🎉','win');
          // Antes: playCheer() reproducía una melodía sonora.
          // Ahora: sólo recompensa visual para evitar el "tono alegre".
          spawnStars(14);
          completeRound(true);
        }
      } else {
        decrementScore(1);
        playBuzzer();
        feedbackShow('Error en secuencia ✖','error');
        logIfMaster(state.currentTarget, letter, 'Error', state.score);
        state.lives = Math.max(0, state.lives - 1);
        state.attemptsLeft = Math.max(0, state.attemptsLeft - 1);
        resetUserProgress();
        updateUI();
        if (state.attemptsLeft <= 0) endLevelCheck();
      }
      return;
    }

    // Nivel 3: ritmo (comparamos tiempos)
    if (state.currentLevel === 3) {
      const now = performance.now();
      let exp = state.expectedTimes && state.expectedTimes.find(e => !e.matched);
      if (!exp) { feedbackShow('No hay nota expectante','info'); return; }
      const dt = Math.abs(now - exp.time);
      let res = 'Tarde';
      if (dt < state.rhythmWindowMs * 0.35) res = 'Perfecto'; else if (dt < state.rhythmWindowMs * 0.75) res = 'Bien'; else res = 'Tarde';
      if (letter === exp.letter) {
        exp.matched = true;
        const points = (res === 'Perfecto')?2:(res === 'Bien')?1:0;
        if (points > 0) { incrementScore(points); playBell(); spawnStars(3) } else { decrementScore(1); playBuzzer() }
        feedbackShow(`${res} — ${exp.letter}`,'ok');
        logIfMaster(state.currentTarget, letter, res, state.score);
        if (state.expectedTimes.every(e => e.matched)) {
          feedbackShow('¡Buen ritmo! 🎶','win');
          // Recompensa visual en vez de melodía sonora
          spawnStars(14);
          completeRound(true);
        }
      } else {
        decrementScore(1);
        state.lives = Math.max(0, state.lives - 1);
        playBuzzer();
        feedbackShow('Nota incorrecta','error');
        logIfMaster(state.currentTarget, letter, 'Error', state.score);
        state.attemptsLeft = Math.max(0, state.attemptsLeft - 1);
        if (state.attemptsLeft <= 0) endLevelCheck();
      }
      updateUI();
      return;
    }
  }

  // ------------------------------------------------------
  // 9) Gestión de puntuación y estado
  // ------------------------------------------------------
  function incrementScore(n=1){ state.score = Math.min(state.maxScore, state.score + n); updateUI(); }
  function decrementScore(n=1){ state.score = Math.max(state.minScore, state.score - n); updateUI(); }
  function resetUserProgress(){ state.userProgress = []; }

  function completeRound(success){
    state.attemptsLeft = Math.max(0, state.attemptsLeft - 1);
    if (success) incrementScore(1);
    logIfMaster(state.currentTarget, state.userProgress?state.userProgress.join('-'):'-', (success?'Completo':'Fallido'), state.score);
    resetUserProgress(); updateUI();
    if (state.attemptsLeft <= 0) endLevelCheck(); else feedbackShow('Pulsa "Reproducir objetivo" para la siguiente ronda','info');
  }

  function handleIncorrect(target, played){
    decrementScore(1); state.lives = Math.max(0, state.lives - 1); playBuzzer(); feedbackShow('Incorrecto ✖','error'); logIfMaster(target, played, 'Incorrecto', state.score); state.attemptsLeft = Math.max(0, state.attemptsLeft - 1); updateUI(); if (state.attemptsLeft <= 0) endLevelCheck(); }
  function handleCorrect(target, played){
    incrementScore(1); spawnStars(6); /* recompensa visual */ playBell(); feedbackShow('Correcto ✔️','ok'); logIfMaster(target, played, 'Correcto', state.score); state.attemptsLeft = Math.max(0, state.attemptsLeft - 1); updateUI(); if (state.attemptsLeft <= 0) endLevelCheck(); }

  function endLevelCheck(){
    // Comprueba si el jugador ha alcanzado el umbral para pasar de nivel
    if (state.score >= 15) {
      if (state.currentLevel < 5) {
        state.currentLevel++;
        feedbackShow(`¡Nivel superado! Pasas al nivel ${state.currentLevel}`,'win');
        state.score = Math.min(state.score, 20);
        state.lives = 5; state.attemptsLeft = 5; state.currentTarget = []; updateUI();
      } else { feedbackShow('¡Has completado todos los niveles! 🎉','win'); }
    } else {
      feedbackShow('No alcanzaste 15 puntos. Repite el nivel.','error');
      state.lives = 5; state.attemptsLeft = 5; state.score = Math.max(0, state.score - 2); state.currentTarget = []; updateUI();
    }
  }

  function logIfMaster(targetArr, played, result, scoreAccum){ if (!state.masterMode) return; const entry = { name: state.childName||'—', age: state.childAge||'—', datetime: nowTimestamp(), level: state.currentLevel, target: Array.isArray(targetArr)?targetArr:[targetArr], played: played, result: result, scoreAccum: scoreAccum, livesRemaining: state.lives }; state.logs.push(entry); updateUI(); }

  function feedbackShow(msg, type='info'){ feedback.textContent = msg; feedback.className = 'feedback ' + type; if (type === 'win') spawnStars(14); }

  // ------------------------------------------------------
  // 10) Grabadora (nivel 5) — funciones simples para demo
  // ------------------------------------------------------
  function startRecording(){ state.recording = true; state.recordedSequence = []; recorderBlock.classList.remove('hidden'); updateRecordedList(); feedbackShow('Grabando... pulsa teclas (max 8 notas)','info') }
  function stopRecording(){ state.recording = false; feedbackShow('Grabación finalizada','info') }
  function playRecording(){ if (state.recordedSequence.length === 0) { feedbackShow('No hay grabación','info'); return } state.recordedSequence.forEach((letter,i)=>{ setTimeout(()=>{ const f = LETTER_TO_FREQ[letter]; if (f) playTone(f,320); highlightKey(letter,200) }, i*420) }); logIfMaster(state.recordedSequence, state.recordedSequence.join('-'), 'Reproducción', state.score) }
  function updateRecordedList(){ recordedList.textContent = state.recordedSequence.join(' - ') }

  // ------------------------------------------------------
  // 11) Enlaces de eventos y inicialización
  // ------------------------------------------------------
  btnStart.addEventListener('click', ()=> modal.classList.remove('hidden'));
  modalCancel.addEventListener('click', ()=> modal.classList.add('hidden'));
  modalSave.addEventListener('click', ()=> {
    const name = inputName.value.trim() || 'Niño';
    const age = parseInt(inputAge.value, 10) || 5;
    state.childName = name; state.childAge = age; displayName.textContent = name; displayAge.textContent = age; modal.classList.add('hidden'); feedbackShow(`¡Hola ${name}! Elige un modo y pulsa "Reproducir objetivo"`, 'info');
  });
  modeSelect.addEventListener('change', (e)=>{ const level = parseInt(e.target.value, 10); state.currentLevel = level; if (level === 5) recorderBlock.classList.remove('hidden'); else recorderBlock.classList.add('hidden'); state.score = 0; state.lives = 5; state.attemptsLeft = 5; state.currentTarget = []; updateUI(); });
  masterToggle.addEventListener('change', (e)=>{ state.masterMode = e.target.checked; updateUI(); });
  exportCsvBtn.addEventListener('click', exportCSV);
  keys.forEach(k => { k.addEventListener('click', ()=> onKeyPress(k.dataset.letter)); });

  btnPlayRound.addEventListener('click', ()=> {
    const level = state.currentLevel;
    if (level === 5) { feedbackShow('Modo libre: pulsa Grabar para guardar lo que toques','info'); return }

    // Generar objetivo y registrarlo si estamos en modo maestro
    state.currentTarget = generateTargetForLevel(level);
    logIfMaster(state.currentTarget, '-', 'Objetivo mostrado', state.score);
    state.userProgress = [];
    state.waitingForInput = true;

    // Reproducir objetivo con notas visuales sincronizadas
    if (level === 3) {
       playSequenceWithTiming(state.currentTarget); 
    }else{ 
        playTargetSequence(state.currentTarget);
       //generateTargetForLevel(level)
    }

    // Reproducir objetivo con melodias
    if (state.currentLevel === 4) {
      document.getElementById('melodyNameDisplay').textContent = state.currentMelodyName || '—';
    } else {
      document.getElementById('melodyNameDisplay').textContent = '—';
    }
    feedbackShow('Repite la secuencia / pulsa la nota objetivo','info');
  });

  btnNext.addEventListener('click', ()=>{ if (state.attemptsLeft <= 0) { endLevelCheck(); return } state.currentTarget = generateTargetForLevel(state.currentLevel); feedbackShow('Nuevo objetivo listo. Pulsa reproducir para escucharlo.','info'); });
  btnReset.addEventListener('click', ()=>{ state.score = 0; state.lives = 5; state.attemptsLeft = 5; state.currentTarget = []; state.userProgress = []; updateUI(); feedbackShow('Nivel reiniciado','info'); });
  btnStartRecord.addEventListener('click', startRecording);
  btnStopRecord.addEventListener('click', stopRecording);
  btnPlayRecording.addEventListener('click', playRecording);
  ageScale.addEventListener('input', (e)=>{ state.ageScale = parseInt(e.target.value, 10); const val = state.ageScale; const scale = 1 + (5 - val) * 0.06; document.querySelectorAll('.key').forEach(k => k.style.transform = `scale(${scale})`); });

  // Inicializa la UI con valores por defecto
  updateUI();


/* registro maestro: cada nota tocada en libre o en rounds ya hace logIfMaster */

/* Ejecución automática: si el usuario quiere, se puede iniciar una ronda al cargar para testing */
/* Fin archivo app.js */
