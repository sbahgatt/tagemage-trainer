// Practice modes: drill / redo runner, and the full mock exam.
(function () {
  'use strict';
  const T = window.TM;
  const U = window.TMUI;
  const { SUBTESTS, SUB, TYPES, LETTERS, esc, md, fmtTime, typeLabel, store, save, getQ } = T;

  // ---------------- shared review list ----------------
  function reviewItem(q, chosen, n) {
    return `<div class="panel">
      <div class="qhead"><strong>Question ${n}</strong><span class="qtag">${esc(typeLabel(q.subtest, q.type))} · difficulty ${q.difficulty}</span></div>
      ${U.stemHTML(q)}${U.optionsHTML(q, { chosen, reveal: true })}${U.feedbackHTML(q, chosen)}</div>`;
  }
  function reviewList(ids, answerOf) {
    let html = '';
    let lastPassage = null;
    ids.forEach((id, k) => {
      const q = getQ(id);
      if (!q) return;
      if (q.passage && q.passage !== lastPassage) {
        lastPassage = q.passage;
        html += `<details class="panel flat"><summary>Show the text: ${esc((T.BANK.passages[q.passage] || {}).title || '')}</summary>${U.passageHTML(q.passage).replace('class="passage"', 'class="passage" style="position:static;max-height:none;margin-top:12px"')}</details>`;
      }
      html += reviewItem(q, answerOf(id), k + 1);
    });
    return html;
  }

  // ---------------- question pools ----------------
  function seenMap() {
    const m = {};
    for (const a of store.S.attempts) { const e = (m[a.id] = m[a.id] || { n: 0, wrong: 0 }); e.n++; if (!a.ok) e.wrong++; }
    return m;
  }
  function nextSeed() { store.S.genSeed = (store.S.genSeed + 1) % 2147483647; return store.S.genSeed; }
  function generated(st, type, count) {
    const types = type === 'all' ? window.TMGen.TYPES[st] : [type];
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 5) {
      const t = types[Math.floor(Math.random() * types.length)];
      if (!window.TMGen.TYPES[st].includes(t)) break;
      const q = window.TMGen.generate(st, t, nextSeed());
      if (q) out.push(q.id);
    }
    return out;
  }
  function drillPool(st, type) {
    const takenMocks = new Set(store.S.mocks.map((m) => m.set));
    return T.BANK.questions.filter((q) => q.subtest === st && (type === 'all' || q.type === type) && (q.set === 'drill' || takenMocks.has(q.set)));
  }
  function pickQuestions({ st, type, count, source }) {
    const genOK = st === 'CA' || st === 'LO';
    if (source === 'gen' && genOK) return { ids: generated(st, type, count), note: '' };
    const seen = seenMap();
    const rank = (q) => { const s = seen[q.id]; return !s ? 0 : s.wrong ? 1 : 2; };
    let cands = drillPool(st, type);
    let ids = [];
    if (st === 'CT' && type === 'all') {
      const byP = {};
      for (const q of cands) (byP[q.passage] = byP[q.passage] || []).push(q);
      const passages = T.shuffle(Object.keys(byP)).sort((a, b) => Math.min(...byP[a].map(rank)) - Math.min(...byP[b].map(rank)));
      for (const p of passages) {
        if (ids.length >= count) break;
        ids.push(...byP[p].sort((a, b) => a.id.localeCompare(b.id)).map((q) => q.id));
      }
      ids = ids.slice(0, Math.max(count, 5));
    } else {
      cands = T.shuffle(cands).sort((a, b) => rank(a) - rank(b));
      ids = cands.slice(0, count).map((q) => q.id);
      if (st === 'CT') ids.sort();
    }
    let note = '';
    if (ids.length < count && genOK && source !== 'bank-only') {
      ids.push(...generated(st, type, count - ids.length));
      note = 'Topped up with generated questions.';
    } else if (ids.length < count) {
      note = `Only ${ids.length} question${ids.length === 1 ? '' : 's'} available for this choice right now.`;
    }
    return { ids, note };
  }

  // ---------------- runner (drill + redo) ----------------
  let run = null;
  function startRun({ mode, title, ids, timed, note }) {
    if (!ids.length) { T.toast('No questions match that choice yet.'); return; }
    run = { mode, title, ids, i: 0, res: {}, timed, deadline: timed ? Date.now() + ids.length * T.PACE_SECONDS * 1000 : null, qStart: Date.now(), revealed: false, chosen: null, finished: false, note };
    save();
    U.go('#/run');
  }
  function finishRun() {
    if (!run || run.finished) return;
    // Anything not answered (timer ran out) counts as skipped.
    for (const id of run.ids) {
      if (!run.res[id]) {
        const q = getQ(id);
        run.res[id] = { chosen: null, ms: 0 };
        T.record(q, null, 0, run.mode);
      }
    }
    run.finished = true;
    save();
    U.rerender();
  }
  function answerCurrent(chosen) {
    const id = run.ids[run.i];
    const q = getQ(id);
    const ms = Date.now() - run.qStart;
    run.res[id] = { chosen, ms };
    T.record(q, chosen, ms, run.mode);
    save();
    run.revealed = true;
    U.rerender();
    const fb = document.querySelector('.feedback');
    if (fb) fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function nextQuestion() {
    if (run.i >= run.ids.length - 1) { finishRun(); return; }
    run.i++;
    run.revealed = false;
    run.chosen = null;
    run.qStart = Date.now();
    U.rerender();
    window.scrollTo(0, 0);
  }

  const runView = {
    render() {
      if (!run) return `<div class="panel"><p>No practice in progress.</p><a class="btn primary" href="#/drill">Start a drill</a></div>`;
      if (run.finished) return summaryHTML();
      const id = run.ids[run.i];
      const q = getQ(id);
      const head = `<div class="spread" style="margin-bottom:12px">
        <div><h2 style="margin:0">${esc(run.title)}</h2><span class="muted small">Question ${run.i + 1} of ${run.ids.length}${run.note ? ' · ' + esc(run.note) : ''}</span></div>
        <div class="row">${run.timed ? `<span class="timer" id="runTimer" aria-label="Time left">--:--</span>` : ''}<span class="qclock" id="qClock"></span>
        <button class="btn ghost" data-act="quit">End practice</button></div></div>`;
      const qBlock = `<div>
        <div class="qhead"><span class="qtag">${esc(SUB[q.subtest].name)} · ${esc(typeLabel(q.subtest, q.type))} · difficulty ${q.difficulty}</span></div>
        ${U.stemHTML(q)}
        ${U.optionsHTML(q, { chosen: run.revealed ? (run.res[id] || {}).chosen : run.chosen, reveal: run.revealed })}
        ${run.revealed
          ? `${U.feedbackHTML(q, run.res[id].chosen)}<div class="row"><button class="btn primary big" data-act="next">${run.i >= run.ids.length - 1 ? 'See results' : 'Next question'}</button><span class="kbd-hint muted small"><span class="kbd">Enter</span></span></div>`
          : `<div class="row"><button class="btn primary big" data-act="check" ${run.chosen === null ? 'disabled' : ''}>Check answer</button><button class="btn" data-act="skip">Skip</button>
             <span class="kbd-hint muted small"><span class="kbd">A</span>–<span class="kbd">E</span> choose · <span class="kbd">Enter</span> check · <span class="kbd">S</span> skip</span></div>`}
      </div>`;
      return head + (q.passage ? `<div class="qlayout with-passage">${U.passageHTML(q.passage)}${qBlock}</div>` : `<div class="narrow">${qBlock}</div>`);
    },
    tick() {
      if (!run || run.finished) return;
      const qc = document.getElementById('qClock');
      if (qc && !run.revealed) {
        const s = (Date.now() - run.qStart) / 1000;
        qc.textContent = `this question ${fmtTime(s)}`;
        qc.classList.toggle('over', s > 60);
        qc.title = s > 60 ? 'Over a minute: eliminate what you can, pick, and move on.' : '';
      }
      if (run.timed) {
        const left = (run.deadline - Date.now()) / 1000;
        const el = document.getElementById('runTimer');
        if (el) { el.textContent = fmtTime(left); el.classList.toggle('warn', left < 120 && left >= 30); el.classList.toggle('danger', left < 30); }
        if (left <= 0) { T.toast('Time is up.'); finishRun(); }
      }
    },
    on: {
      choose(el) { if (run.revealed) return; run.chosen = Number(el.dataset.i); U.rerender(); },
      check() { if (run.chosen !== null) answerCurrent(run.chosen); },
      skip() { answerCurrent(null); },
      next: nextQuestion,
      quit() {
        if (!confirm('End this practice now? Questions you have not answered will be counted as skipped.')) return;
        finishRun();
      },
      again() { startRun(Object.assign({}, run.again)); },
      markPending,
      redoMissed() {
        const missed = run.ids.filter((id) => run.res[id] && run.res[id].chosen !== getQ(id).answer);
        startRun({ mode: 'redo', title: 'Redo: missed questions', ids: missed, timed: false });
      },
    },
    key(ev) {
      if (!run || run.finished) return;
      const k = ev.key.toLowerCase();
      if (!run.revealed) {
        const i = 'abcde'.indexOf(k) >= 0 ? 'abcde'.indexOf(k) : '12345'.indexOf(k);
        if (i >= 0 && k.length === 1) { run.chosen = i; U.rerender(); return; }
        if (k === 'enter' && run.chosen !== null) { ev.preventDefault(); answerCurrent(run.chosen); return; }
        if (k === 's') { answerCurrent(null); return; }
      } else if (k === 'enter' || k === 'n') { ev.preventDefault(); nextQuestion(); }
    },
  };

  function pendingHTML() {
    const p = window.TMPending;
    if (!p || store.S.plan.done[p.id]) return '';
    return `<div class="panel next-card"><div class="spread"><span>${p.last ? 'That was the last step of' : 'Part of'} plan session <strong>${esc(p.title)}</strong>.</span>
      <button class="btn ${p.last ? 'primary' : ''}" data-act="markPending">Mark session done</button></div></div>`;
  }
  function markPending() { const p = window.TMPending; if (p) { store.S.plan.done[p.id] = Date.now(); save(); window.TMPending = null; T.toast('Session marked done.'); U.rerender(); } }

  function summaryHTML() {
    const total = run.ids.length;
    const right = run.ids.filter((id) => run.res[id].chosen === getQ(id).answer).length;
    const skipped = run.ids.filter((id) => run.res[id].chosen === null).length;
    const ms = run.ids.reduce((a, id) => a + run.res[id].ms, 0);
    const missed = total - right;
    return `<h1>${esc(run.title)}: results</h1>
      <div class="kpis">
        <div class="kpi"><div class="v">${right}/${total}</div><div class="l">right (${Math.round((right / total) * 100)}%)</div></div>
        <div class="kpi"><div class="v">${skipped}</div><div class="l">skipped${skipped ? ': next time, guess (no penalty)' : ''}</div></div>
        <div class="kpi"><div class="v">${Math.round(ms / Math.max(1, total - skipped) / 1000)} s</div><div class="l">average per answered question (target ≤ 80 s)</div></div>
      </div>
      <div class="row" style="margin-bottom:20px">
        ${missed ? `<button class="btn primary" data-act="redoMissed">Redo the ${missed} I missed</button>` : ''}
        <a class="btn" href="#/drill">New drill</a><a class="btn" href="#/plan">Back to my plan</a>
      </div>
      ${pendingHTML()}
      <p class="muted">Wrong and skipped questions were added to your <a href="#/mistakes">mistakes log</a>.</p>
      <h2>Review</h2>${reviewList(run.ids, (id) => run.res[id].chosen)}`;
  }

  // ---------------- drill setup ----------------
  function drillSettings() {
    store.S.settings.drill = Object.assign({ st: 'CA', type: 'all', count: 10, timed: true, source: 'bank' }, store.S.settings.drill || {});
    return store.S.settings.drill;
  }
  const drillView = {
    render() {
      const d = drillSettings();
      const genOK = d.st === 'CA' || d.st === 'LO';
      const avail = drillPool(d.st, d.type).length;
      const seg = (name, items, val) => `<div class="seg" role="group">${items.map(([v, l]) => `<button data-act="set" data-k="${name}" data-v="${v}" aria-pressed="${String(v) === String(val)}">${l}</button>`).join('')}</div>`;
      return `<div class="narrow"><h1>Drill</h1>
        <p class="muted">Pick a sub-test and a question type. You get the answer, the traps and the method card after every question.</p>
        <div class="panel">
          <div class="field"><span>Sub-test</span>${seg('st', SUBTESTS.map((s) => [s.key, s.short]), d.st)}</div>
          <label class="field"><span>Question type</span>
            <select data-k="type"><option value="all">All types (mixed)</option>${Object.entries(TYPES[d.st]).map(([k, l]) => `<option value="${k}" ${k === d.type ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <div class="field"><span>Number of questions</span>${seg('count', [[5, '5'], [10, '10'], [15, '15']], d.count)}
            ${d.st === 'CT' && d.type === 'all' ? '<span class="muted small">Compréhension comes in whole texts of 5 questions.</span>' : ''}</div>
          <div class="field"><span>Timing</span>${seg('timed', [['true', 'Timed (80 s per question)'], ['false', 'Untimed']], d.timed)}</div>
          ${genOK ? `<div class="field"><span>Questions from</span>${seg('source', [['bank', 'Question bank'], ['gen', 'Random generator (unlimited)']], d.source)}</div>` : ''}
          <p class="muted small">${avail} bank question${avail === 1 ? '' : 's'} available for this choice${genOK ? ', plus unlimited generated ones' : ''}. New questions come first, then ones you got wrong.</p>
          <button class="btn primary big" data-act="start">Start drill</button>
        </div></div>`;
    },
    mount(el) {
      const sel = el.querySelector('select[data-k="type"]');
      if (sel) sel.addEventListener('change', () => { drillSettings().type = sel.value; save(); U.rerender(); });
    },
    on: {
      set(el) {
        const d = drillSettings();
        const k = el.dataset.k;
        let v = el.dataset.v;
        if (k === 'count') v = Number(v);
        if (k === 'timed') v = v === 'true';
        d[k] = v;
        if (k === 'st') { d.type = 'all'; if (v !== 'CA' && v !== 'LO') d.source = 'bank'; }
        save();
        U.rerender();
      },
      start() {
        const d = drillSettings();
        const { ids, note } = pickQuestions(d);
        const title = `${SUB[d.st].short}${d.type !== 'all' ? ' · ' + typeLabel(d.st, d.type) : ''}`;
        startRun({ mode: 'drill', title, ids, timed: d.timed, note, again: null });
      },
    },
  };

  // ---------------- mock exam ----------------
  const ex = () => store.S.exam;
  const curSubKey = () => SUBTESTS[ex().sub].key;
  const curIds = () => T.mockQuestions(ex().set, curSubKey()).map((q) => q.id);

  function startExam(set) {
    store.S.exam = { set, phase: 'intro', sub: 0, cur: 0, answers: {}, flags: {}, times: {}, subs: {}, startedAt: Date.now() };
    save();
    U.rerender();
  }
  function beginSub() {
    const e = ex();
    e.phase = 'run';
    e.cur = 0;
    e.deadline = Date.now() + T.SUB_SECONDS * 1000;
    e.lastTick = Date.now();
    save();
    U.rerender();
    window.scrollTo(0, 0);
  }
  function endSub() {
    const e = ex();
    if (e.phase !== 'run') return;
    const key = curSubKey();
    const qs = T.mockQuestions(e.set, key);
    let right = 0, wrong = 0, blank = 0, ms = 0;
    for (const q of qs) {
      const a = e.answers[q.id];
      if (a === undefined || a === null) blank++;
      else if (a === q.answer) right++;
      else wrong++;
      ms += e.times[q.id] || 0;
    }
    e.subs[key] = { right, wrong, blank, score: T.subScore(right), ms, usedMs: Math.min(T.SUB_SECONDS * 1000, T.SUB_SECONDS * 1000 - Math.max(0, e.deadline - Date.now())) };
    e.phase = e.sub === SUBTESTS.length - 1 ? 'finishing' : 'between';
    save();
    if (e.phase === 'finishing') finishExam();
    else U.rerender();
  }
  function finishExam() {
    const e = ex();
    const subScores = Object.fromEntries(SUBTESTS.map((s) => [s.key, e.subs[s.key].score]));
    const fin = T.finalScore(subScores);
    for (const s of SUBTESTS) {
      for (const q of T.mockQuestions(e.set, s.key)) {
        const a = e.answers[q.id];
        T.record(q, a === undefined ? null : a, e.times[q.id] || 0, 'exam');
      }
    }
    store.S.mocks.push({ set: e.set, at: Date.now(), subs: e.subs, parts: fin.parts, score: fin.total, answers: e.answers, times: e.times });
    store.S.exam = null;
    save();
    U.go(`#/result/${store.S.mocks.length - 1}`);
  }

  function sheetHTML(ids) {
    const e = ex();
    return `<nav class="sheet" aria-label="Answer sheet">${ids.map((id, i) => {
      const cls = [];
      if (e.answers[id] !== undefined && e.answers[id] !== null) cls.push('answered');
      if (i === e.cur) cls.push('current');
      if (e.flags[id]) cls.push('flagged');
      const lab = e.answers[id] != null ? LETTERS[e.answers[id]] : i + 1;
      return `<button class="${cls.join(' ')}" data-act="goto" data-i="${i}" aria-label="Question ${i + 1}${e.answers[id] != null ? ', answered ' + LETTERS[e.answers[id]] : ''}">${lab}</button>`;
    }).join('')}</nav>`;
  }

  function examRunHTML() {
    const e = ex();
    const key = curSubKey();
    const ids = curIds();
    const q = getQ(ids[e.cur]);
    const answered = ids.filter((id) => e.answers[id] != null).length;
    const side = `<div class="panel" style="padding:14px 16px">
        <div class="spread"><strong>${esc(SUB[key].name)}</strong><span class="timer" id="examTimer">--:--</span></div>
        <div class="muted small">Sub-test ${e.sub + 1} of 6 · ${answered}/15 answered</div>
        ${sheetHTML(ids)}
        <button class="btn" data-act="finishSub" style="width:100%">Finish this sub-test</button>
        <button class="btn ghost small" data-act="abandon" style="width:100%;margin-top:6px;min-height:32px">Abandon this mock</button>
      </div>`;
    const qBlock = `<div>
        ${q.passage ? '' : side}
        <div class="qhead"><strong>Question ${e.cur + 1} / 15</strong><span class="qclock" id="qClock"></span></div>
        ${U.stemHTML(q)}
        ${U.optionsHTML(q, { chosen: e.answers[q.id] != null ? e.answers[q.id] : null, reveal: false })}
        <div class="spread">
          <div class="row"><button class="btn" data-act="prev" ${e.cur === 0 ? 'disabled' : ''}>Previous</button>
          <button class="btn primary" data-act="nextQ" ${e.cur === 14 ? 'disabled' : ''}>Next</button></div>
          <div class="row"><button class="btn ghost" data-act="clear" ${e.answers[q.id] == null ? 'disabled' : ''}>Clear answer</button>
          <button class="btn ghost" data-act="flag">${e.flags[q.id] ? 'Unflag' : 'Flag for later'}</button></div>
        </div>
        <p class="kbd-hint muted small" style="margin-top:12px"><span class="kbd">A</span>–<span class="kbd">E</span> answer · <span class="kbd">←</span> <span class="kbd">→</span> move · no calculator, use paper.</p>
      </div>`;
    if (q.passage) return `<div class="qlayout with-passage">${U.passageHTML(q.passage)}<div>${side}${qBlock}</div></div>`;
    return `<div class="narrow">${qBlock}</div>`;
  }

  function subStrip(key, s) {
    const pct = (s.score / 60) * 100;
    return `<div class="strip"><span>${esc(SUB[key].name)}</span>
      <div class="track" role="img" aria-label="${s.score} out of 60"><div class="fill" style="left:0;width:${pct}%"></div></div>
      <strong class="num" style="text-align:right">${s.score}/60</strong></div>`;
  }

  const examView = {
    keepScroll: false,
    render() {
      const e = ex();
      if (!e) return examHomeHTML();
      if (e.phase === 'intro') return examIntroHTML();
      if (e.phase === 'run') return examRunHTML();
      if (e.phase === 'between') {
        const key = curSubKey();
        const s = e.subs[key];
        const nextKey = SUBTESTS[e.sub + 1].key;
        const ids = curIds();
        return `<div class="narrow"><h1>${esc(SUB[key].name)}: done</h1>
          <div class="panel">${subStrip(key, s)}
            <p>${s.right} right · ${s.wrong} wrong · ${s.blank} blank. Time used: ${fmtTime(s.usedMs / 1000)}.</p>
            ${s.blank ? `<p class="callout">${s.blank} blank${s.blank > 1 ? 's' : ''}. With no penalty for wrong answers, every blank is a free chance of +4 thrown away. Fill every bubble before time runs out.</p>` : ''}
            <p class="muted small">This sub-test is now locked, as on the real test. In the real exam there is no break: the next sub-test starts straight away.</p>
            <div class="row"><button class="btn primary big" data-act="nextSub">Start ${esc(SUB[nextKey].name)} (20:00)</button>
            <button class="btn" data-act="toggleReview">${e.showReview ? 'Hide' : 'Review'} this sub-test now</button></div>
          </div>
          ${e.showReview ? reviewList(ids, (id) => (e.answers[id] == null ? null : e.answers[id])) : ''}</div>`;
      }
      return examHomeHTML();
    },
    tick() {
      const e = ex();
      if (!e || e.phase !== 'run') return;
      const now = Date.now();
      const ids = curIds();
      const id = ids[e.cur];
      const delta = Math.min(2000, now - (e.lastTick || now));
      e.times[id] = (e.times[id] || 0) + delta;
      e.lastTick = now;
      const left = (e.deadline - now) / 1000;
      const el = document.getElementById('examTimer');
      if (el) { el.textContent = fmtTime(left); el.classList.toggle('warn', left < 180 && left >= 60); el.classList.toggle('danger', left < 60); }
      const qc = document.getElementById('qClock');
      if (qc) { const s = e.times[id] / 1000; qc.textContent = fmtTime(s); qc.classList.toggle('over', s > 60); }
      if (Math.floor(now / 1000) % 5 === 0) save();
      if (left <= 0) { T.toast('Time is up for this sub-test.'); endSub(); }
    },
    leave() { if (ex()) save(); },
    on: {
      start(el) { startExam(el.dataset.set); },
      cancelIntro() { store.S.exam = null; save(); U.rerender(); },
      begin: beginSub,
      choose(el) {
        const e = ex();
        if (e.phase !== 'run') return;
        const id = curIds()[e.cur];
        e.answers[id] = Number(el.dataset.i);
        save();
        U.rerender();
      },
      clear() { const e = ex(); delete e.answers[curIds()[e.cur]]; save(); U.rerender(); },
      flag() { const e = ex(); const id = curIds()[e.cur]; e.flags[id] = !e.flags[id]; save(); U.rerender(); },
      goto(el) { ex().cur = Number(el.dataset.i); U.rerender(); },
      prev() { const e = ex(); if (e.cur > 0) { e.cur--; U.rerender(); } },
      nextQ() { const e = ex(); if (e.cur < 14) { e.cur++; U.rerender(); } },
      finishSub() {
        const e = ex();
        const blanks = curIds().filter((id) => e.answers[id] == null).length;
        const msg = blanks
          ? `You have ${blanks} blank${blanks > 1 ? 's' : ''}. Wrong answers cost nothing, so guess them first. Finish anyway? You can't come back to this sub-test.`
          : 'Finish this sub-test? You can\'t come back to it.';
        if (confirm(msg)) endSub();
      },
      toggleReview() { const e = ex(); e.showReview = !e.showReview; save(); U.rerender(); },
      nextSub() { const e = ex(); e.sub++; e.showReview = false; beginSub(); },
      abandon() {
        if (!confirm('Abandon this mock? Nothing from it will be saved.')) return;
        store.S.exam = null; save(); U.rerender();
      },
    },
    key(ev) {
      const e = ex();
      if (!e || e.phase !== 'run') return;
      const k = ev.key.toLowerCase();
      const i = 'abcde'.indexOf(k);
      if (i >= 0 && k.length === 1) { e.answers[curIds()[e.cur]] = i; save(); U.rerender(); return; }
      if (ev.key === 'ArrowRight' && e.cur < 14) { e.cur++; U.rerender(); }
      if (ev.key === 'ArrowLeft' && e.cur > 0) { e.cur--; U.rerender(); }
    },
  };

  function examHomeHTML() {
    const sets = T.mockSets();
    const taken = {};
    store.S.mocks.forEach((m, i) => { (taken[m.set] = taken[m.set] || []).push({ ...m, idx: i }); });
    const rows = sets.map((set) => {
      const t = taken[set] || [];
      const complete = SUBTESTS.every((s) => T.mockQuestions(set, s.key).length === 15);
      return `<div class="session" style="grid-template-columns:1fr auto">
        <div><div class="s-title">Mock exam ${set.slice(4)}</div>
          <div class="muted small">${t.length ? t.map((m) => `<a href="#/result/${m.idx}">${T.fmtDate(m.at)}: ${m.score}/600</a>`).join(' · ') : 'Not taken yet'}</div></div>
        <div>${complete ? `<button class="btn ${t.length ? '' : 'primary'}" data-act="start" data-set="${set}">${t.length ? 'Retake' : 'Start'}</button>` : '<span class="badge">Incomplete</span>'}</div></div>`;
    }).join('');
    return `<div class="narrow"><h1>Mock exam</h1>
      <p>A full TAGE MAGE in the real order: 6 sub-tests × 15 questions × 20 minutes. Plan 2 hours with no interruptions, paper and a pen, and no calculator.</p>
      <div class="panel">${rows || '<p class="muted">No mock exams in the question bank yet.</p>'}</div>
      <p class="muted small">Retaking a mock you've already seen inflates your score; use it for timing practice only.</p></div>`;
  }
  function examIntroHTML() {
    const e = ex();
    return `<div class="narrow"><h1>Mock exam ${e.set.slice(4)}</h1>
      <div class="panel prose">
        <h2 style="margin-top:0">Rules (same as the real test)</h2>
        <ul>
          <li>6 sub-tests in this order: ${SUBTESTS.map((s) => esc(s.name)).join(', ')}.</li>
          <li>15 questions and 20 minutes each. When time runs out the sub-test closes, and you can't go back to it or start the next one early.</li>
          <li>Within a sub-test you can move between questions, change answers, and leave blanks.</li>
          <li><strong>Scoring: +4 for a right answer, 0 for wrong or blank.</strong> Never leave a blank: a guess can only help.</li>
          <li>No calculator. Use scrap paper.</li>
          <li>The clock keeps running if you leave the page or close the tab, like a real exam room.</li>
        </ul>
        <h3>Pacing</h3>
        <p>About 80 seconds per question. At one minute, cross out what you can, pick an answer, flag it and move on. Keep the last 30 seconds of each sub-test to fill every empty bubble.</p>
        <div class="row" style="margin-top:16px"><button class="btn primary big" data-act="begin">Start sub-test 1: ${esc(SUBTESTS[0].name)}</button>
        <button class="btn ghost" data-act="cancelIntro">Not now</button></div>
      </div></div>`;
  }

  // ---------------- mock result ----------------
  const resultView = {
    on: { markPending },
    render(args) {
      const idx = Number(args[0]);
      const m = store.S.mocks[idx];
      if (!m) return '<p>Result not found.</p>';
      const target = store.S.settings.target;
      const gap = target - m.score;
      const right = SUBTESTS.reduce((a, s) => a + m.subs[s.key].right, 0);
      const blanks = SUBTESTS.reduce((a, s) => a + m.subs[s.key].blank, 0);
      const open = args[1];
      return `<h1>Mock exam ${m.set.slice(4)}: ${m.score}/600</h1>
        <p class="muted">${new Date(m.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · ${right}/90 right · ${blanks} blank${blanks === 1 ? '' : 's'}</p>
        <div class="kpis">
          <div class="kpi"><div class="v">${m.score}</div><div class="l">score out of 600</div></div>
          <div class="kpi"><div class="v">${gap > 0 ? '−' + gap : '+' + Math.abs(gap)}</div><div class="l">${gap > 0 ? `below your ${target} target (≈ ${T.rightFor(target) - right} more right answers)` : `above your ${target} target`}</div></div>
          ${T.PARTS.map((p, i) => `<div class="kpi"><div class="v">${m.parts[i]}</div><div class="l">${esc(p.name)} /60</div></div>`).join('')}
        </div>
        <div class="panel"><h2>By sub-test</h2>
          ${SUBTESTS.map((s) => subStrip(s.key, m.subs[s.key])).join('')}
          <div class="scroll-x"><table style="margin-top:12px"><thead><tr><th>Sub-test</th><th class="n">Right</th><th class="n">Wrong</th><th class="n">Blank</th><th class="n">Avg time / question</th><th></th></tr></thead><tbody>
          ${SUBTESTS.map((s) => { const r = m.subs[s.key]; return `<tr><td>${esc(s.name)}</td><td class="n">${r.right}</td><td class="n">${r.wrong}</td><td class="n">${r.blank}</td><td class="n">${Math.round(r.ms / 15000)} s</td><td><a href="#/result/${idx}/${s.key}">Review</a></td></tr>`; }).join('')}
          </tbody></table></div>
          ${blanks ? `<p class="callout">You left ${blanks} blank${blanks > 1 ? 's' : ''}. Random guesses on those would have been worth about +${Math.round(blanks * 0.2 * 4 * 600 / 360)} points on average.</p>` : ''}
        </div>
        ${pendingHTML()}
        <div class="row" style="margin-bottom:16px"><a class="btn primary" href="#/mistakes">Redo my mistakes</a><a class="btn" href="#/progress">See my progress</a></div>
        ${open ? `<h2>Review: ${esc(SUB[open].name)}</h2>${reviewList(T.mockQuestions(m.set, open).map((q) => q.id), (id) => (m.answers[id] == null ? null : m.answers[id]))}` : '<p class="muted">Pick a sub-test above to review every question with explanations.</p>'}`;
    },
  };

  U.register('drill', drillView);
  U.register('run', runView);
  U.register('exam', examView);
  U.register('result', resultView);
  window.TMModes = { startRun, pickQuestions, reviewList, generated, hasRun: () => !!run && !run.finished };
})();
