// Core: constants, storage, scoring, question lookup, stats. No DOM here except toast().
(function () {
  'use strict';
  const BANK = window.TM_BANK || { questions: [], passages: {}, methods: {}, plan: null };

  const SUBTESTS = [
    { key: 'CT', name: 'Compréhension de textes', short: 'Compréhension' },
    { key: 'CA', name: 'Calcul', short: 'Calcul' },
    { key: 'RA', name: 'Raisonnement et argumentation', short: 'Raisonnement' },
    { key: 'CM', name: 'Conditions minimales', short: 'Cond. minimales' },
    { key: 'EX', name: 'Expression', short: 'Expression' },
    { key: 'LO', name: 'Logique', short: 'Logique' },
  ];
  const SUB = Object.fromEntries(SUBTESTS.map((s) => [s.key, s]));
  // Official 2025+ structure: 3 parts out of 60, final = average × 10.
  const PARTS = [
    { name: 'Résolution de problèmes', subs: ['CA', 'CM'] },
    { name: 'Aptitudes verbales', subs: ['CT', 'EX'] },
    { name: 'Raisonnement logique', subs: ['RA', 'LO'] },
  ];
  const TYPES = {
    CT: { idee_principale: 'Idée principale', detail: 'Détail du texte', inference: 'Inférence', sens_mot: 'Sens d’un mot', intention_auteur: 'Intention de l’auteur' },
    CA: { pourcentages: 'Pourcentages', fractions: 'Fractions', ratios: 'Ratios', puissances: 'Puissances', equations: 'Équations', geometrie: 'Géométrie', moyennes: 'Moyennes', vitesses: 'Vitesses', probabilites: 'Probabilités', denombrement: 'Dénombrement' },
    RA: { renforcer: 'Renforcer', affaiblir: 'Affaiblir', hypothese: 'Hypothèse implicite', conclusion: 'Conclusion', faille: 'Faille' },
    CM: { arithmetique: 'Arithmétique', algebre: 'Algèbre', geometrie: 'Géométrie', statistiques: 'Statistiques', nombres: 'Propriétés des nombres' },
    EX: { synonyme: 'Synonymes', phrase_fautive: 'Phrase fautive', completion_phrase: 'Compléter une phrase', completion_paragraphe: 'Compléter un paragraphe', grammaire: 'Grammaire' },
    LO: { suite_numerique: 'Suites de nombres', suite_lettres: 'Suites de lettres', dominos: 'Dominos', spatial: 'Spatial', matrice: 'Matrices' },
  };
  const CM_OPTIONS = [
    'La condition (1) seule suffit, mais pas la condition (2) seule.',
    'La condition (2) seule suffit, mais pas la condition (1) seule.',
    'Les deux conditions ensemble suffisent, mais aucune seule ne suffit.',
    'Chaque condition seule suffit.',
    'Même ensemble, les deux conditions ne suffisent pas.',
  ];
  const LETTERS = 'ABCDE';
  const SUB_SECONDS = 20 * 60;
  const PACE_SECONDS = 80;

  // ---------- storage ----------
  const KEY = 'tagemage.v1';
  function blank() {
    return {
      version: 1,
      created: Date.now(),
      attempts: [], // {id, st, type, mode, chosen (null = skipped), ok, ms, at}
      mocks: [],    // {set, at, subs: {CT: {right, wrong, blank, score, ms}}, score, answers, times}
      errors: {},   // id -> {count, lastAt, resolved, lastChoice}
      plan: { done: {} }, // sessionId -> timestamp
      settings: { target: 330, examDate: '2027-01-15', theme: 'auto' },
      exam: null,
      genSeed: Math.floor(Math.random() * 1e9),
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 1) {
          const b = blank();
          return Object.assign(b, s, { settings: Object.assign(b.settings, s.settings || {}), plan: Object.assign(b.plan, s.plan || {}) });
        }
      }
    } catch (e) { /* storage blocked or corrupt: start fresh in memory */ }
    return blank();
  }
  const store = { S: load() };
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(store.S));
      return true;
    } catch (e) {
      toast('Progress could not be saved: browser storage is full or blocked. Export a backup.');
      return false;
    }
  }
  function replaceState(obj) {
    if (!obj || obj.version !== 1 || !Array.isArray(obj.attempts)) throw new Error('This file is not a TAGE MAGE trainer backup.');
    const b = blank();
    store.S = Object.assign(b, obj, { settings: Object.assign(b.settings, obj.settings || {}), plan: Object.assign(b.plan, obj.plan || {}) });
    save();
  }

  // ---------- questions ----------
  const byId = {};
  for (const q of BANK.questions) byId[q.id] = q;
  function prep(q) {
    if (!q) return null;
    if (q.subtest === 'CM' && !q.options) q.options = CM_OPTIONS.slice();
    return q;
  }
  function getQ(id) {
    if (byId[id]) return prep(byId[id]);
    if (id && id.startsWith('g-') && window.TMGen) {
      const q = window.TMGen.fromId(id);
      if (q) { byId[id] = q; return q; }
    }
    return null;
  }
  const mockSets = () => [...new Set(BANK.questions.map((q) => q.set).filter((s) => /^mock\d+$/.test(s)))].sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  function mockQuestions(set, st) {
    return BANK.questions.filter((q) => q.set === set && q.subtest === st).sort((a, b) => a.id.localeCompare(b.id)).map(prep);
  }
  const typeLabel = (st, t) => (TYPES[st] && TYPES[st][t]) || t;

  // ---------- scoring ----------
  const subScore = (right) => right * 4; // 0..60
  function finalScore(subScores) {
    const parts = PARTS.map((p) => (subScores[p.subs[0]] + subScores[p.subs[1]]) / 2);
    return { parts, total: Math.round(((parts[0] + parts[1] + parts[2]) / 3) * 10) };
  }
  const scoreFromRight = (right90) => Math.round((right90 * 600) / 90);
  const rightFor = (score) => Math.ceil((score * 90) / 600);

  // ---------- recording ----------
  function record(q, chosen, ms, mode) {
    const ok = chosen === q.answer;
    store.S.attempts.push({ id: q.id, st: q.subtest, type: q.type, mode, chosen, ok, ms: Math.round(ms), at: Date.now() });
    const E = store.S.errors;
    if (!ok) {
      const e = E[q.id] || { count: 0 };
      E[q.id] = { count: e.count + 1, lastAt: Date.now(), resolved: false, lastChoice: chosen };
    } else if (E[q.id] && mode === 'redo') {
      E[q.id].resolved = true;
      E[q.id].resolvedAt = Date.now();
    }
  }

  // ---------- stats ----------
  function groupStats(filterFn, keyFn) {
    const out = {};
    for (const a of store.S.attempts) {
      if (filterFn && !filterFn(a)) continue;
      const k = keyFn(a);
      const g = (out[k] = out[k] || { n: 0, ok: 0, skipped: 0, ms: 0 });
      g.n++;
      if (a.ok) g.ok++;
      if (a.chosen === null) g.skipped++;
      g.ms += a.ms;
    }
    for (const g of Object.values(out)) { g.acc = g.n ? g.ok / g.n : 0; g.avgS = g.n ? g.ms / g.n / 1000 : 0; }
    return out;
  }
  const bySubtest = (f) => groupStats(f, (a) => a.st);
  const byType = (f) => groupStats(f, (a) => `${a.st}/${a.type}`);
  function weakestTypes(n = 3, minAttempts = 4) {
    const t = byType();
    let rows = Object.entries(t).filter(([, g]) => g.n >= minAttempts);
    if (rows.length < n) rows = Object.entries(t).filter(([, g]) => g.n >= 2);
    // Lower accuracy first; slower average time breaks ties.
    rows.sort((a, b) => a[1].acc - b[1].acc || b[1].avgS - a[1].avgS);
    return rows.slice(0, n).map(([k, g]) => ({ key: k, st: k.split('/')[0], type: k.split('/')[1], ...g }));
  }
  function estimate() {
    // Expected score from the last 30 answers in each sub-test (needs at least 8 per sub-test).
    const subs = {};
    for (const s of SUBTESTS) {
      const recent = store.S.attempts.filter((a) => a.st === s.key).slice(-30);
      if (recent.length < 8) return null;
      subs[s.key] = subScore((recent.filter((a) => a.ok).length / recent.length) * 15);
    }
    return finalScore(subs).total;
  }
  const unresolved = () => Object.entries(store.S.errors).filter(([, e]) => !e.resolved).map(([id]) => id);

  // ---------- misc ----------
  let toastTimer;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  function shuffle(arr, rand = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  window.TM = {
    BANK, SUBTESTS, SUB, PARTS, TYPES, CM_OPTIONS, LETTERS, SUB_SECONDS, PACE_SECONDS,
    store, save, replaceState, blank, getQ, prep, mockSets, mockQuestions, typeLabel,
    subScore, finalScore, scoreFromRight, rightFor, record,
    bySubtest, byType, weakestTypes, estimate, unresolved,
    toast, esc, md, fmtTime, fmtDate, shuffle,
  };
})();
