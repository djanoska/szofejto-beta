const DIGRAPHS = ['dzs', 'cs', 'dz', 'gy', 'ly', 'ny', 'sz', 'ty', 'zs'];

const MAX_ATTEMPTS = 8;
const WORD_LEN = 5;

const STORAGE_KEY = 'szofejto_daily_state';

let wordList = [];
let secretWordTokens = [];

let currentAttempt = 0;
let currentGuessTokens = [];

let gameOver = false;
let isChecking = false;


// ======================================================
// DÁTUM
// ======================================================

function getTodayString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return year + '-' + month + '-' + day;
}


// ======================================================
// SZÓ TOKENIZÁLÁSA
// ======================================================

function tokenize(word) {
  const tokens = [];
  let i = 0;

  const lower = word.toLowerCase().trim();

  while (i < lower.length) {
    let matched = null;

    for (const dg of DIGRAPHS) {
      if (lower.startsWith(dg, i)) {
        matched = dg;
        break;
      }
    }

    if (matched) {
      tokens.push(matched);
      i += matched.length;
    } else {
      tokens.push(lower[i]);
      i++;
    }
  }

  return tokens;
}


// ======================================================
// NAPI SEED
// ======================================================

function createDailySeed(dateString) {
  let hash = 2166136261;

  for (let i = 0; i < dateString.length; i++) {
    hash ^= dateString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
    hash >>>= 0;
  }

  return hash >>> 0;
}


// ======================================================
// SEED-ELT RANDOM
// ======================================================

function seededRandom(seed) {
  let value = seed >>> 0;

  return function () {
    value += 0x6D2B79F5;

    let t = value;

    t = Math.imul(
      t ^ (t >>> 15),
      t | 1
    );

    t ^= t + Math.imul(
      t ^ (t >>> 7),
      t | 61
    );

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


// ======================================================
// NAPI SZÓ
// ======================================================

function getDailyWord() {
  if (wordList.length === 0) {
    return null;
  }

  const today = getTodayString();

  const seed = createDailySeed(today);
  const random = seededRandom(seed);

  const index = Math.floor(
    random() * wordList.length
  );

  return wordList[index];
}


// ======================================================
// GRID
// ======================================================

function initGrid() {
  const grid = document.getElementById('grid');

  if (!grid) {
    console.error('A #grid elem nem található!');
    return;
  }

  grid.innerHTML = '';

  for (let r = 0; r < MAX_ATTEMPTS; r++) {

    const row = document.createElement('div');

    row.className = 'row';
    row.id = 'row-' + r;

    for (let c = 0; c < WORD_LEN; c++) {

      const cell = document.createElement('div');

      cell.className = 'cell';
      cell.id = 'cell-' + r + '-' + c;

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }
}


// ======================================================
// ÜZENET
// ======================================================

function showMsg(text) {
  const msg = document.getElementById('msg');

  if (msg) {
    msg.textContent = text;
  }
}


// ======================================================
// SZAVAK BETÖLTÉSE
// ======================================================

async function loadWords() {

  try {

    const response = await fetch('szavak.txt');

    if (!response.ok) {
      throw new Error('A szavak.txt nem tölthető be.');
    }

    const text = await response.text();

    wordList = text
      .split(/\r?\n/)
      .map(function (word) {
        return word.trim().toLowerCase();
      })
      .filter(function (word) {
        return (
          word.length > 0 &&
          tokenize(word).length === WORD_LEN
        );
      });

    if (wordList.length === 0) {
      showMsg('Hiba a szavak beolvasásakor!');
      return;
    }

    const dailyWord = getDailyWord();

    if (!dailyWord) {
      showMsg('Nem sikerült kiválasztani a napi szót!');
      return;
    }

    secretWordTokens = tokenize(dailyWord);

    //console.log('Mai szó:', dailyWord);
    //console.log('Szavak száma:', wordList.length);

    const restored = loadGameState();

    if (restored) {
      restoreGame();
    } else {

      currentAttempt = 0;
      currentGuessTokens = [];
      gameOver = false;
      isChecking = false;

    }

  } catch (error) {

    console.error(error);

    showMsg(
      'Nem sikerült betölteni a szavakat!'
    );

  }
}


// ======================================================
// BILLENTYŰKEZELÉS
// ======================================================

function handleKeyPress(key) {

  if (gameOver || isChecking) {
    return;
  }


  // TÖRLÉS

  if (key === 'back') {

    if (currentGuessTokens.length > 0) {

      currentGuessTokens.pop();

      updateRowVisuals();

      saveGameState();
    }

    return;
  }


  // ENTER

  if (key === 'enter') {

    if (currentGuessTokens.length === WORD_LEN) {

      checkGuess();

    } else {

      showMsg('Nincs meg az 5 betű!');
    }

    return;
  }


  // BETŰ

  if (currentGuessTokens.length < WORD_LEN) {

    currentGuessTokens.push(key);

    updateRowVisuals();

    saveGameState();
  }
}


// ======================================================
// AKTUÁLIS SOR
// ======================================================

function updateRowVisuals() {

  for (let c = 0; c < WORD_LEN; c++) {

    const cell = document.getElementById(
      'cell-' + currentAttempt + '-' + c
    );

    if (cell) {

      cell.textContent =
        currentGuessTokens[c] || '';

    }
  }
}


// ======================================================
// ÉKEZETES BETŰK
// ======================================================

function getBaseKey(letter) {
  return letter;
}


// ======================================================
// KIÉRTÉKELÉS
// ======================================================

function calculateStatuses(guessTokens) {

  const secretRemaining =
    secretWordTokens.map(function (token) {
      return token.toLowerCase();
    });

  const guessLower =
    guessTokens.map(function (token) {
      return token.toLowerCase();
    });

  const statuses =
    Array(WORD_LEN).fill('absent');


  // PONTOS EGYEZÉS

  for (let i = 0; i < WORD_LEN; i++) {

    if (
      guessLower[i] ===
      secretRemaining[i]
    ) {

      statuses[i] = 'correct';

      secretRemaining[i] = null;
    }
  }


  // RÉSZLEGES EGYEZÉS

  for (let i = 0; i < WORD_LEN; i++) {

    if (statuses[i] === 'correct') {
      continue;
    }

    const index =
      secretRemaining.indexOf(
        guessLower[i]
      );

    if (index !== -1) {

      statuses[i] = 'present';

      secretRemaining[index] = null;
    }
  }

  return statuses;
}


// ======================================================
// BILLENTYŰZET SZÍNEZÉSE
// ======================================================

function updateKeyboard(
  guessTokens,
  statuses
) {

  for (let i = 0; i < WORD_LEN; i++) {

    const key =
      getBaseKey(guessTokens[i]);

    const keyBtn =
      document.querySelector(
        '#keyboard .key[data-key="' +
        key +
        '"]'
      );

    if (!keyBtn) {
      continue;
    }


    // ZÖLD

    if (statuses[i] === 'correct') {

      keyBtn.classList.remove('present');
      keyBtn.classList.remove('absent');

      keyBtn.classList.add('correct');

    }


    // SÁRGA

    else if (
      statuses[i] === 'present'
    ) {

      if (
        !keyBtn.classList.contains('correct')
      ) {

        keyBtn.classList.remove('absent');

        keyBtn.classList.add('present');
      }

    }


    // SZÜRKE

    else if (
      statuses[i] === 'absent'
    ) {

      if (
        !keyBtn.classList.contains('correct') &&
        !keyBtn.classList.contains('present')
      ) {

        keyBtn.classList.add('absent');
      }
    }
  }
}


// ======================================================
// STÁTUSZOK + ANIMÁCIÓ
// ======================================================

function applyStatuses(
  guessTokens,
  attempt,
  animate
) {

  const statuses =
    calculateStatuses(guessTokens);


  for (let i = 0; i < WORD_LEN; i++) {

    const cell =
      document.getElementById(
        'cell-' +
        attempt +
        '-' +
        i
      );

    if (!cell) {
      continue;
    }


    // BETŰ MINDIG LEGYEN A CELLÁBAN

    cell.textContent =
      guessTokens[i] || '';


    // ANIMÁCIÓ

    if (animate) {

      setTimeout(function () {

        cell.classList.remove(
          'correct',
          'present',
          'absent',
          'flip'
        );

        void cell.offsetWidth;

        cell.classList.add('flip');


        setTimeout(function () {

          cell.classList.remove(
            'correct',
            'present',
            'absent'
          );

          cell.classList.add(
            statuses[i]
          );

        }, 300);

      }, i * 150);

    }


    // F5 UTÁNI VISSZAÁLLÍTÁS

    else {

      cell.classList.remove(
        'correct',
        'present',
        'absent',
        'flip'
      );

      cell.classList.add(
        statuses[i]
      );

      cell.textContent =
        guessTokens[i] || '';
    }
  }


  updateKeyboard(
    guessTokens,
    statuses
  );

  return statuses;
}


// ======================================================
// SZÓ ELLENŐRZÉSE
// ======================================================

async function checkGuess() {

  if (isChecking) {
    return;
  }

  isChecking = true;


  const guessString =
    currentGuessTokens
      .join('')
      .toLowerCase();


  // SZEREPEL A LISTÁBAN?

  if (!wordList.includes(guessString)) {

    showMsg(
      'Nincs ilyen szó a listában!'
    );

    isChecking = false;

    return;
  }


  showMsg('');


  // PRÓBÁLKOZÁS MENTÉSE

  const submittedGuess =
    [...currentGuessTokens];

  saveSubmittedGuess(
    currentAttempt,
    submittedGuess
  );


  // KIÉRTÉKELÉS

  applyStatuses(
    submittedGuess,
    currentAttempt,
    true
  );


  // ANIMÁCIÓ MEGVÁRÁSA

  await new Promise(function (resolve) {

    setTimeout(
      resolve,
      1000
    );

  });


  // NYERT

  if (
    guessString ===
    secretWordTokens
      .join('')
      .toLowerCase()
  ) {

    gameOver = true;

    currentGuessTokens = [];

    showMsg(
      'Gratulálok, eltaláltad!'
    );

    saveGameState();

    isChecking = false;

    return;
  }


  // KÖVETKEZŐ SOR

  currentAttempt++;

  currentGuessTokens = [];


  // ELFOGYOTT A PRÓBÁLKOZÁS

  if (
    currentAttempt >=
    MAX_ATTEMPTS
  ) {

    gameOver = true;

    showMsg(
      'Vége! A szó: ' +
      secretWordTokens
        .join('')
        .toUpperCase()
    );
  }


  saveGameState();

  isChecking = false;
}


// ======================================================
// PRÓBÁLKOZÁS MENTÉSE
// ======================================================

function saveSubmittedGuess(
  attempt,
  guess
) {

  let state =
    getStoredState();


  if (!state) {

    state = {
      date: getTodayString(),
      guesses: []
    };
  }


  if (
    !Array.isArray(
      state.guesses
    )
  ) {

    state.guesses = [];
  }


  state.guesses[attempt] =
    [...guess];


  state.date =
    getTodayString();


  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );
}


// ======================================================
// TELJES JÁTÉKÁLLAPOT MENTÉSE
// ======================================================

function saveGameState() {

  let state =
    getStoredState();


  if (!state) {

    state = {
      date: getTodayString(),
      guesses: []
    };
  }


  if (
    !Array.isArray(
      state.guesses
    )
  ) {

    state.guesses = [];
  }


  state.date =
    getTodayString();

  state.currentAttempt =
    currentAttempt;

  state.currentGuessTokens =
    [...currentGuessTokens];

  state.gameOver =
    gameOver;


  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );
}


// ======================================================
// MENTETT ÁLLAPOT LEKÉRÉSE
// ======================================================

function getStoredState() {

  const saved =
    localStorage.getItem(
      STORAGE_KEY
    );


  if (!saved) {
    return null;
  }


  try {

    return JSON.parse(saved);

  } catch (error) {

    console.error(
      'Hibás mentett játékállapot.',
      error
    );

    localStorage.removeItem(
      STORAGE_KEY
    );

    return null;
  }
}


// ======================================================
// MENTETT ÁLLAPOT BETÖLTÉSE
// ======================================================

function loadGameState() {

  const state =
    getStoredState();


  if (!state) {
    return false;
  }


  // ÚJ NAP

  if (
    state.date !==
    getTodayString()
  ) {

    localStorage.removeItem(
      STORAGE_KEY
    );

    return false;
  }


  // PRÓBÁLKOZÁS

  if (
    Number.isInteger(
      state.currentAttempt
    )
  ) {

    currentAttempt =
      state.currentAttempt;

  } else {

    currentAttempt = 0;
  }


  // AKTUÁLIS BETŰK

  if (
    Array.isArray(
      state.currentGuessTokens
    )
  ) {

    currentGuessTokens =
      state.currentGuessTokens;

  } else {

    currentGuessTokens = [];
  }


  // JÁTÉK VÉGE

  gameOver =
    state.gameOver === true;

  isChecking = false;


  return true;
}


// ======================================================
// JÁTÉK VISSZAÁLLÍTÁSA
// ======================================================

function restoreGame() {

  const state =
    getStoredState();


  if (!state) {
    return;
  }


  const guesses =
    Array.isArray(state.guesses)
      ? state.guesses
      : [];


  // KORÁBBI PRÓBÁLKOZÁSOK

  for (
    let r = 0;
    r < guesses.length;
    r++
  ) {

    const guess =
      guesses[r];


    if (
      !Array.isArray(guess) ||
      guess.length !== WORD_LEN
    ) {

      continue;
    }


    const statuses =
      calculateStatuses(guess);


    for (
      let c = 0;
      c < WORD_LEN;
      c++
    ) {

      const cell =
        document.getElementById(
          'cell-' +
          r +
          '-' +
          c
        );


      if (!cell) {
        continue;
      }


      // BETŰ

      cell.textContent =
        guess[c];


      // FONTOS:
      // MINDEN RÉGI OSZTÁLY TÖRLÉSE

      cell.classList.remove(
        'correct',
        'present',
        'absent',
        'flip'
      );


      // ÚJ STÁTUSZ

      cell.classList.add(
        statuses[c]
      );
    }


    // BILLENTYŰZET

    updateKeyboard(
      guess,
      statuses
    );
  }


  // AKTUÁLIS SOR

  if (
    !gameOver &&
    currentGuessTokens.length > 0
  ) {

    updateRowVisuals();
  }
}


// ======================================================
// BILLENTYŰZET ESEMÉNY
// ======================================================

const keyboard =
  document.getElementById(
    'keyboard'
  );


if (keyboard) {

  keyboard.addEventListener(
    'click',
    function (e) {

      const target =
        e.target.closest('.key');


      if (target) {

        handleKeyPress(
          target.dataset.key
        );
      }
    }
  );
}

// ======================================================
// INFORMÁCIÓS POPUP
// ======================================================

const infoButton = document.getElementById('info-button');
const infoModal = document.getElementById('info-modal');
const closeInfo = document.getElementById('close-info');

if (infoButton && infoModal && closeInfo) {

  infoButton.addEventListener('click', function () {
    infoModal.classList.add('show');
  });

  closeInfo.addEventListener('click', function () {
    infoModal.classList.remove('show');
  });

  infoModal.addEventListener('click', function (e) {
    if (e.target === infoModal) {
      infoModal.classList.remove('show');
    }
  });

}

// ======================================================
// ÉJFÉLI AUTOMATIKUS RESET
// ======================================================

function scheduleMidnightReset() {

  const now = new Date();

  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0
  );

  const millisecondsUntilMidnight =
    nextMidnight.getTime() - now.getTime();

  setTimeout(function () {

    resetDailyGame();

    // Következő éjfél beállítása
    scheduleMidnightReset();

  }, millisecondsUntilMidnight);
}


function resetDailyGame() {

  // Régi napi állapot törlése
  localStorage.removeItem(STORAGE_KEY);

  // Új játékállapot
  currentAttempt = 0;
  currentGuessTokens = [];
  gameOver = false;
  isChecking = false;

  // Új napi szó
  const dailyWord = getDailyWord();

  if (dailyWord) {
    secretWordTokens = tokenize(dailyWord);
  }

  // Rács törlése
  initGrid();

  // Billentyűzet állapotainak törlése
  document
    .querySelectorAll('#keyboard .key')
    .forEach(function (key) {

      key.classList.remove(
        'correct',
        'present',
        'absent'
      );

    });

  // Üzenet törlése
  showMsg('');
}


// Indítás
initGrid();

loadWords();

scheduleMidnightReset();


// ======================================================
// INDÍTÁS
// ======================================================

initGrid();

loadWords();
