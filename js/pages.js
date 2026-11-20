// Pages: home, progress dashboard, mistakes, plan, briefing, settings.
(function () {
  'use strict';
  const T = window.TM;
  const U = window.TMUI;
  const M = window.TMModes;
  const { SUBTESTS, SUB, esc, md, store, save, typeLabel } = T;
  const plan = T.BANK.plan;

  const pct = (x) => `${Math.round(x * 100)}%`;
  const daysTo = (iso) => Math.ceil((new Date(iso + 'T12:00:00') - new Date()) / 86400000);
  const lastMock = () => store.S.mocks[store.S.mocks.length - 1];

  // ---------- launching plan steps ----------
  function launch(l, title) {
    if (!l) return;
    if (l.mode === 'exam') {
      if (store.S.exam) { U.go('#/exam'); return; }
      const sets = T.mockSets();
      const set = l.set === 'next' ? sets.find((s) => !store.S.mocks.some((m) => m.set === s)) || sets[sets.length - 1] : l.set;
      store.S.exam = { set, phase: 'intro', sub: 0, cur: 0, answers: {}, flags: {}, times: {}, subs: {}, startedAt: Date.now() };
      save();
      U.go('#/exam');
    } else if (l.mode === 'drill' || l.mode === 'gen') {
      const { ids, note } = M.pickQuestions({ st: l.st, type: l.type || 'all', count: l.count || 10, source: l.mode === 'gen' ? 'gen' : 'bank' });
      M.startRun({ mode: 'drill', title: title || `${SUB[l.st].short}${l.type && l.type !== 'all' ? ' · ' + typeLabel(l.st, l.type) : ''}`, ids, timed: l.timed !== false, note });
    } else if (l.mode === 'weak') {
      const weak = T.weakestTypes(3);
      if (!weak.length) { T.toast('Not enough answers yet to find weak spots. Doing a mixed drill instead.'); }
      const per = Math.max(3, Math.round((l.count || 12) / Math.max(1, weak.length)));
      let ids = [];
      for (const w of weak) ids.push(...M.pickQuestions({ st: w.st, type: w.type, count: per, source: 'bank' }).ids);
      if (!ids.length) ids = M.pickQuestions({ st: 'CA', type: 'all', count: 10, source: 'bank' }).ids;
      M.startRun({ mode: 'drill', title: title || 'Weak spots', ids, timed: l.timed !== false, note: weak.map((w) => typeLabel(w.st, w.type)).join(', ') });
    } else if (l.mode === 'redo') {
      const ids = T.unresolved().filter((id) => T.getQ(id)).slice(-(l.count || 15));
      if (!ids.length) { T.toast('No mistakes to redo. Nice.'); return; }
      M.startRun({ mode: 'redo', title: title || 'Redo my mistakes', ids: T.shuffle(ids), timed: !!l.timed });
    } else if (l.mode === 'read') {
      U.go(l.href);
    }
  }

  // ---------- "what next" ----------
  function sessionDone(id) { return !!store.S.plan.done[id]; }
  function nextAdvice() {
    if (store.S.exam) return { title: 'Finish the mock exam in progress', why: 'Your mock is still open and its clock is running.', launch: { mode: 'exam' }, label: 'Resume the mock' };
    if (!plan) return null;
    const next = plan.sessions.find((s) => !sessionDone(s.id));
    if (!next) return { title: 'Plan complete', why: 'Keep sharp with mixed drills and your mistakes log until test day.', launch: { mode: 'weak', count: 12 }, label: 'Drill my weak spots' };
    const unres = T.unresolved().length;
    const doneIds = Object.entries(store.S.plan.done).sort((a, b) => a[1] - b[1]).map(([id]) => id);
    const lastDone = plan.sessions.find((s) => s.id === doneIds[doneIds.length - 1]);
    const pastDiagnostic = plan.sessions.findIndex((x) => x.id === next.id) >= 3; // never before the diagnostic and its review
    if (pastDiagnostic && unres >= 25 && next.kind !== 'mock' && next.kind !== 'light' && !(lastDone && lastDone.kind === 'redo')) {
      return { title: 'Mistakes clinic first (20 min), then: ' + next.title, why: `You have ${unres} unresolved mistakes. Clearing them now is the fastest way to points: they are exactly the questions you can't do yet.`, launch: { mode: 'redo', count: 15 }, label: 'Redo 15 mistakes', session: next };
    }
    let why = next.why || '';
    if (next.kind === 'weak') {
      const w = T.weakestTypes(3);
      if (w.length) why = `Your weakest question types right now: ${w.map((x) => `${typeLabel(x.st, x.type)} (${pct(x.acc)})`).join(', ')}.`;
    }
    return { title: next.title, why, session: next };
  }

  function sessionSteps(s) {
    return `<ol class="s-steps">${s.steps.map((st) => `<li>${md(st)}</li>`).join('')}</ol>`;
  }
  function sessionLaunchers(s) {
    return (s.launch || []).map((l, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-act="launch" data-s="${s.id}" data-i="${i}">${esc(l.label || 'Start')}</button>`).join('');
  }
  function nextCardHTML() {
    const a = nextAdvice();
    if (!a) return '';
    const s = a.session;
    return `<div class="panel next-card">
      <div class="spread"><h2 style="margin:0">Next: ${esc(a.title)}</h2>${s ? `<span class="badge">${s.minutes} min</span>` : ''}</div>
      ${a.why ? `<p class="muted" style="margin-top:6px">${md(a.why)}</p>` : ''}
      ${s && !a.launch ? sessionSteps(s) : ''}
      <div class="row" style="margin-top:12px">
        ${a.launch ? `<button class="btn primary" data-act="adviceLaunch">${esc(a.label)}</button>` : sessionLaunchers(s)}
        ${s ? `<button class="btn ghost" data-act="markDone" data-s="${s.id}">Mark session done</button>` : ''}
      </div></div>`;
  }
  const commonOn = {
    launch(el) {
      const s = plan.sessions.find((x) => x.id === el.dataset.s);
      const l = s.launch[Number(el.dataset.i)];
      window.TMPending = l.mode === 'read' ? null : { id: s.id, title: s.title, last: Number(el.dataset.i) === s.launch.length - 1 || l.mode === 'exam' };
      launch(l, s.title);
    },
    adviceLaunch() { const a = nextAdvice(); launch(a.launch, a.title); },
    markDone(el) { store.S.plan.done[el.dataset.s] = Date.now(); save(); T.toast('Session marked done.'); U.rerender(); },
  };

  // ---------- home ----------
  const home = {
    render() {
      const S = store.S;
      const d = daysTo(S.settings.examDate);
      const lm = lastMock();
      const unres = T.unresolved().length;
      const est = T.estimate();
      return `<div class="spread" style="margin-bottom:16px"><h1 style="margin:0">Your TAGE MAGE training</h1>
          <span class="muted">${d > 0 ? `${d} days to your test (${new Date(S.settings.examDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })})` : d === 0 ? 'Test day. Good luck!' : 'Test date passed. Update it in Settings.'}</span></div>
        ${!S.attempts.length ? `<div class="panel"><h2>Start here</h2><p>Take <strong>Mock exam 1 cold</strong> as your diagnostic. Don't prepare for it: the point is to see where you stand and let the app find your weak spots. It takes 2 hours. Before that, read the 5-minute exam briefing.</p>
          <div class="row"><a class="btn" href="#/briefing">Read the briefing (5 min)</a><button class="btn primary" data-act="startMock1">Take Mock 1 (diagnostic)</button></div></div>` : ''}
        ${nextCardHTML()}
        <div class="kpis">
          <div class="kpi"><div class="v">${lm ? lm.score : '–'}</div><div class="l">last mock score /600</div></div>
          <div class="kpi"><div class="v">${lm ? (S.settings.target - lm.score > 0 ? S.settings.target - lm.score : 'reached') : '–'}</div><div class="l">points to your ${S.settings.target} target</div></div>
          <div class="kpi"><div class="v">${est != null ? est : '–'}</div><div class="l">estimate from recent answers</div></div>
          <div class="kpi"><div class="v">${unres}</div><div class="l"><a href="#/mistakes">mistakes to redo</a></div></div>
        </div>
        <div class="grid3">
          <a class="panel" style="text-decoration:none;color:inherit" href="#/drill"><h3>Drill</h3><p class="muted small">Pick a sub-test and question type, 5 to 15 questions.</p></a>
          <a class="panel" style="text-decoration:none;color:inherit" href="#/exam"><h3>Mock exam</h3><p class="muted small">Full test, real timing and scoring.</p></a>
          <a class="panel" style="text-decoration:none;color:inherit" href="#/mistakes"><h3>Redo mistakes</h3><p class="muted small">Every wrong or skipped question, saved automatically.</p></a>
        </div>`;
    },
    on: Object.assign({ startMock1() { launch({ mode: 'exam', set: 'mock1' }); } }, commonOn),
  };

  // ---------- progress ----------
  function scoreChart() {
    const ms = store.S.mocks;
    const target = store.S.settings.target;
    if (!ms.length) return '<p class="muted">Take a mock exam to start the chart.</p>';
    const W = 640, H = 240, pl = 40, pr = 16, pt = 16, pb = 30;
    const vals = ms.map((m) => m.score);
    const lo = Math.max(0, Math.floor((Math.min(...vals, target) - 40) / 50) * 50);
    const hi = Math.min(600, Math.ceil((Math.max(...vals, target, 350) + 20) / 50) * 50);
    const x = (i) => (ms.length === 1 ? (pl + W - pr) / 2 : pl + (i * (W - pl - pr)) / (ms.length - 1));
    const y = (v) => pt + ((hi - v) * (H - pt - pb)) / (hi - lo);
    let g = '';
    for (let v = lo; v <= hi; v += 50) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule-soft)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--graphite)">${v}</text>`;
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y(target)}" y2="${y(target)}" stroke="var(--right)" stroke-dasharray="6 4" stroke-width="1.5"/><text x="${W - pr}" y="${y(target) - 6}" text-anchor="end" font-size="11" fill="var(--right)">target ${target}</text>`;
    const pts = ms.map((m, i) => `${x(i)},${y(m.score)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="var(--encre)" stroke-width="2.5"/>`;
    g += ms.map((m, i) => `<circle cx="${x(i)}" cy="${y(m.score)}" r="5" fill="var(--encre)"><title>${T.fmtDate(m.at)}: ${m.score}</title></circle><text x="${x(i)}" y="${y(m.score) - 10}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${m.score}</text><text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--graphite)">${T.fmtDate(m.at)}</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mock scores over time">${g}</svg></div>`;
  }
  function accBar(acc) { return `<div class="bar ${acc >= 0.6 ? 'good' : acc < 0.45 ? 'bad' : ''}"><i style="width:${Math.round(acc * 100)}%"></i></div>`; }

  const progress = {
    render() {
      const S = store.S;
      if (!S.attempts.length) return `<h1>Progress</h1><div class="panel"><p>No answers yet. Your dashboard fills up as you practise.</p><a class="btn primary" href="#/exam">Take Mock 1</a></div>`;
      const bySt = T.bySubtest();
      const byTy = T.byType();
      const weak = T.weakestTypes(3);
      const lm = lastMock();
      const best = S.mocks.length ? Math.max(...S.mocks.map((m) => m.score)) : null;
      const est = T.estimate();
      const all = S.attempts.length;
      const ok = S.attempts.filter((a) => a.ok).length;
      const target = S.settings.target;
      const gapBase = lm ? lm.score : est;
      return `<h1>Progress</h1>
        <div class="kpis">
          <div class="kpi"><div class="v">${lm ? lm.score : '–'}</div><div class="l">last mock${best != null ? ` (best ${best})` : ''}</div></div>
          <div class="kpi"><div class="v">${gapBase != null ? (target - gapBase > 0 ? target - gapBase : 'reached') : '–'}</div><div class="l">points to ${target}${gapBase != null && target - gapBase > 0 ? ` ≈ ${Math.max(0, T.rightFor(target) - Math.round(gapBase * 90 / 600))} more right answers per test` : ''}</div></div>
          <div class="kpi"><div class="v">${est != null ? est : '–'}</div><div class="l">estimate from your last 30 answers per sub-test</div></div>
          <div class="kpi"><div class="v">${pct(ok / all)}</div><div class="l">accuracy over ${all} answers</div></div>
        </div>
        <div class="grid2">
          <div class="panel"><h2>Mock scores</h2>${scoreChart()}</div>
          <div class="panel"><h2>Your 3 weakest question types</h2>
            ${weak.length ? `<ol>${weak.map((w) => `<li style="margin-bottom:8px"><strong>${esc(typeLabel(w.st, w.type))}</strong> <span class="muted">(${esc(SUB[w.st].short)})</span><br><span class="small">${pct(w.acc)} right over ${w.n} · ${Math.round(w.avgS)} s average</span></li>`).join('')}</ol>
              <button class="btn primary" data-act="drillWeak">Drill these now</button>` : '<p class="muted">Answer a few more questions to find them.</p>'}
          </div>
        </div>
        <div class="panel"><h2>By sub-test</h2><div class="scroll-x"><table><thead><tr><th>Sub-test</th><th class="n">Answers</th><th>Accuracy</th><th class="n"></th><th class="n">Avg time</th><th class="n">Skipped</th></tr></thead><tbody>
          ${SUBTESTS.map((s) => { const g = bySt[s.key]; return g ? `<tr><td>${esc(s.name)}</td><td class="n">${g.n}</td><td style="width:30%">${accBar(g.acc)}</td><td class="n">${pct(g.acc)}</td><td class="n" ${g.avgS > 90 ? 'style="color:var(--skip);font-weight:700"' : ''}>${Math.round(g.avgS)} s</td><td class="n">${g.skipped}</td></tr>` : `<tr><td>${esc(s.name)}</td><td class="n">0</td><td colspan="4" class="muted">not practised yet</td></tr>`; }).join('')}
        </tbody></table></div><p class="muted small">Target pace: 80 s per question. Times in orange are too slow for test day.</p></div>
        <div class="panel"><h2>By question type</h2><div class="scroll-x"><table><thead><tr><th>Type</th><th class="n">Answers</th><th>Accuracy</th><th class="n"></th><th class="n">Avg time</th><th></th></tr></thead><tbody>
          ${SUBTESTS.map((s) => Object.keys(T.TYPES[s.key]).map((t) => { const g = byTy[`${s.key}/${t}`]; return g ? `<tr><td>${esc(typeLabel(s.key, t))} <span class="muted small">${esc(s.short)}</span></td><td class="n">${g.n}</td><td style="width:26%">${accBar(g.acc)}</td><td class="n">${pct(g.acc)}</td><td class="n">${Math.round(g.avgS)} s</td><td><button class="btn ghost" data-act="drillType" data-st="${s.key}" data-t="${t}">Drill</button></td></tr>` : ''; }).join('')).join('')}
        </tbody></table></div></div>`;
    },
    on: {
      drillWeak() { launch({ mode: 'weak', count: 12 }); },
      drillType(el) { launch({ mode: 'drill', st: el.dataset.st, type: el.dataset.t, count: 10 }); },
    },
  };

  // ---------- mistakes ----------
  const mistakes = {
    render() {
      const E = store.S.errors;
      const showResolved = mistakes.showResolved;
      const ids = Object.keys(E).filter((id) => (showResolved || !E[id].resolved) && T.getQ(id)).sort((a, b) => E[b].lastAt - E[a].lastAt);
      const unres = T.unresolved().filter((id) => T.getQ(id));
      const bySt = {};
      for (const id of unres) { const st = T.getQ(id).subtest; bySt[st] = (bySt[st] || 0) + 1; }
      return `<h1>Mistakes</h1>
        <p class="muted">Every wrong or skipped question lands here. Get it right in "redo" mode and it's marked as fixed.</p>
        <div class="panel"><div class="spread"><h2 style="margin:0">${unres.length} to redo</h2>
          <div class="row"><button class="btn primary" data-act="redoAll" ${unres.length ? '' : 'disabled'}>Redo my mistakes${unres.length > 15 ? ' (15 most recent)' : ''}</button></div></div>
          <div class="row" style="margin-top:12px">${SUBTESTS.filter((s) => bySt[s.key]).map((s) => `<button class="btn" data-act="redoSt" data-st="${s.key}">${esc(s.short)}: ${bySt[s.key]}</button>`).join('')}</div></div>
        <label class="row" style="margin:8px 0 16px"><input type="checkbox" data-act="toggleResolved" ${showResolved ? 'checked' : ''}> Show fixed mistakes too</label>
        ${ids.length ? ids.slice(0, 60).map((id) => { const q = T.getQ(id); const e = E[id]; return `<details class="panel"><summary><strong>${esc(SUB[q.subtest].short)}</strong> · ${esc(typeLabel(q.subtest, q.type))} · missed ${e.count}× · ${T.fmtDate(e.lastAt)} ${e.resolved ? '<span class="badge">fixed</span>' : ''}<div class="muted small" style="margin-top:4px">${esc(q.stem.slice(0, 110))}${q.stem.length > 110 ? '…' : ''}</div></summary>
          <div style="margin-top:12px">${U.stemHTML(q)}${U.optionsHTML(q, { chosen: e.lastChoice, reveal: true })}${U.feedbackHTML(q, e.lastChoice)}</div></details>`; }).join('') : '<div class="panel flat"><p class="muted">Nothing here yet.</p></div>'}`;
    },
    mount(el) {
      const cb = el.querySelector('[data-act="toggleResolved"]');
      if (cb) cb.addEventListener('change', () => { mistakes.showResolved = cb.checked; U.rerender(); });
    },
    on: {
      redoAll() { launch({ mode: 'redo', count: 15 }); },
      redoSt(el) {
        const ids = T.unresolved().filter((id) => { const q = T.getQ(id); return q && q.subtest === el.dataset.st; }).slice(-15);
        M.startRun({ mode: 'redo', title: `Redo: ${SUB[el.dataset.st].short}`, ids: T.shuffle(ids), timed: false });
      },
      toggleResolved() {},
    },
  };

  // ---------- plan ----------
  function weekStart(ts) { const d = new Date(ts); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return d.getTime(); }
  function weeklyReview() {
    const now = Date.now();
    const ws = weekStart(now);
    // A full mock counts as two sessions.
    const doneThisWeek = Object.entries(store.S.plan.done).filter(([, t]) => t >= ws).reduce((n, [id]) => {
      const s = plan && plan.sessions.find((x) => x.id === id);
      return n + (s && s.kind === 'mock' ? (plan.mockCountsAs || 2) : 1);
    }, 0);
    const recent = store.S.attempts.filter((a) => a.at >= now - 7 * 86400000);
    const before = store.S.attempts.filter((a) => a.at < now - 7 * 86400000);
    const r = T.bySubtest((a) => a.at >= now - 7 * 86400000);
    const b = T.bySubtest((a) => a.at < now - 7 * 86400000);
    const flags = [];
    for (const s of SUBTESTS) {
      const g = r[s.key];
      if (!g || g.n < 5) continue;
      const prev = b[s.key];
      if (prev && prev.n >= 5 && g.acc < prev.acc - 0.1) flags.push(`<strong>${esc(s.short)}</strong> dropped from ${pct(prev.acc)} to ${pct(g.acc)} this week.`);
      else if (g.acc < 0.45) flags.push(`<strong>${esc(s.short)}</strong> is at ${pct(g.acc)} this week, below the ~56% you need for 330.`);
      if (g.avgS > 95) flags.push(`<strong>${esc(s.short)}</strong>: ${Math.round(g.avgS)} s per question. Too slow; on test day you have 80 s. Use the one-minute rule.`);
    }
    const skipped = recent.filter((a) => a.chosen === null).length;
    if (skipped >= 5) flags.push(`You skipped ${skipped} questions this week. With no penalty, always pick something after eliminating what you can.`);
    const unres = T.unresolved().length;
    if (unres > 30) flags.push(`${unres} unresolved mistakes are piling up. Do a mistakes clinic before new material.`);
    const target = plan ? plan.weeklyTarget : 4;
    const min = plan ? plan.weeklyMin : 2;
    const status = doneThisWeek >= target ? `On target: ${doneThisWeek} sessions this week.` : doneThisWeek >= min ? `${doneThisWeek} sessions this week: minimum met, target is ${target}.` : `${doneThisWeek} session${doneThisWeek === 1 ? '' : 's'} so far this week. Minimum is ${min}, target ${target}.`;
    return { status, flags, recentN: recent.length, beforeN: before.length };
  }

  const planView = {
    render() {
      if (!plan) return '<h1>Study plan</h1><div class="panel"><p>The study plan has not been built yet.</p></div>';
      const S = store.S;
      const done = plan.sessions.filter((s) => sessionDone(s.id)).length;
      const left = plan.sessions.length - done;
      const d = daysTo(S.settings.examDate);
      const weeksLeft = Math.max(0, d / 7);
      const capacity = Math.floor(weeksLeft * plan.weeklyTarget);
      const wr = weeklyReview();
      let html = `<h1>Study plan</h1>
        <p class="muted">Sessions, not days. Miss a day and nothing breaks: just do the next session. <strong>Target ${plan.weeklyTarget} sessions a week, minimum ${plan.weeklyMin}</strong> in busy weeks (TOEFL week, uni rush). In a busy week, do the <span class="badge min">busy-week core</span> sessions and skip the rest. A full mock counts as 2 sessions.</p>
        <div class="kpis"><div class="kpi"><div class="v">${done}/${plan.sessions.length}</div><div class="l">sessions done</div></div>
          <div class="kpi"><div class="v">${d > 0 ? d : 0}</div><div class="l">days to test</div></div>
          <div class="kpi"><div class="v">${left}</div><div class="l">sessions left; at target pace you have room for about ${capacity}</div></div></div>
        ${left > capacity && d > 0 ? `<p class="callout">You're behind: ${left} sessions left but room for about ${capacity} at ${plan.weeklyTarget} a week. Skip the sessions marked <span class="badge">optional</span>, and never skip a mock.</p>` : ''}
        ${nextCardHTML()}
        <div class="panel"><h2>This week</h2><p>${wr.status}</p>
          ${wr.flags.length ? `<p><strong>Where you're slipping:</strong></p><ul>${wr.flags.map((f) => `<li>${f}</li>`).join('')}</ul>` : wr.recentN ? '<p class="muted">No warning signs this week.</p>' : '<p class="muted">No practice in the last 7 days yet.</p>'}</div>
        <div class="panel"><h2>Learn before you start (the only upfront theory)</h2><ul>${plan.upfront.map((u) => `<li><strong>${esc(u.title)}</strong>: ${md(u.why)} ${u.href ? `<a href="${u.href}">Open</a>` : ''}</li>`).join('')}</ul></div>`;
      for (const ph of plan.phases) {
        const ss = plan.sessions.filter((s) => s.phase === ph.id);
        const dn = ss.filter((s) => sessionDone(s.id)).length;
        html += `<section class="week"><div class="week-head"><h2 style="margin:0">${esc(ph.title)}</h2><span class="muted small">${dn}/${ss.length} done${ph.when ? ' · ' + esc(ph.when) : ''}</span></div>
          ${ph.note ? `<p class="muted small">${md(ph.note)}</p>` : ''}
          ${ss.map((s) => `<div class="session ${sessionDone(s.id) ? 'done' : ''}">
            <input type="checkbox" data-act="tick" data-s="${s.id}" ${sessionDone(s.id) ? 'checked' : ''} aria-label="Mark ${esc(s.title)} done">
            <div><div class="s-title">${esc(s.title)}</div>${sessionSteps(s)}<div class="row" style="margin-top:8px">${sessionLaunchers(s)}</div></div>
            <div class="row" style="flex-direction:column;align-items:flex-end"><span class="badge ${s.kind === 'mock' ? 'mock' : ''}">${s.minutes} min</span>${s.minimum ? '<span class="badge min" title="Do these first in a busy week">busy-week core</span>' : ''}${s.optional ? '<span class="badge">optional</span>' : ''}</div>
          </div>`).join('')}</section>`;
      }
      return html;
    },
    on: Object.assign({
      tick(el) {
        const id = el.dataset.s;
        if (store.S.plan.done[id]) delete store.S.plan.done[id];
        else store.S.plan.done[id] = Date.now();
        save();
        U.rerender();
      },
    }, commonOn),
  };

  // ---------- briefing ----------
  const briefing = {
    render() { return `<div class="prose">${(window.TM_CONTENT && window.TM_CONTENT.briefing) || '<p>Briefing not available.</p>'}</div>`; },
  };

  // ---------- settings ----------
  const settings = {
    render() {
      const s = store.S.settings;
      return `<div class="narrow"><h1>Settings and backup</h1>
        <div class="panel">
          <label class="field"><span>Target score</span><input type="number" min="200" max="600" step="10" data-k="target" value="${s.target}"></label>
          <label class="field"><span>Test date</span><input type="text" data-k="examDate" value="${esc(s.examDate)}" placeholder="YYYY-MM-DD" pattern="\\d{4}-\\d{2}-\\d{2}"></label>
          <div class="field"><span>Theme</span><div class="seg">${['auto', 'light', 'dark'].map((t) => `<button data-act="theme" data-v="${t}" aria-pressed="${s.theme === t}">${t === 'auto' ? 'Match system' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
          <button class="btn primary" data-act="saveSettings">Save settings</button>
        </div>
        <div class="panel"><h2>Backup</h2>
          <p class="muted">Your progress lives in this browser only. Export a file now and then, and to move to another device.</p>
          <div class="row"><button class="btn primary" data-act="export">Export my progress</button>
          <label class="btn">Import a backup<input type="file" accept=".json,application/json" data-k="import" class="hidden"></label></div>
          <p class="muted small" style="margin-top:8px">Importing replaces the progress in this browser.</p></div>
        <div class="panel"><h2>Reset</h2><p class="muted">Deletes all answers, mocks, mistakes and plan ticks in this browser.</p><button class="btn danger" data-act="reset">Delete all my progress</button></div>
        <p class="muted small">Question bank: ${T.BANK.questions.length} questions, built ${T.BANK.builtAt ? new Date(T.BANK.builtAt).toLocaleDateString('en-GB') : '–'}.</p></div>`;
    },
    mount(el) {
      const f = el.querySelector('input[data-k="import"]');
      f.addEventListener('change', () => {
        const file = f.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => {
          try {
            const obj = JSON.parse(r.result);
            if (!confirm(`Replace the progress in this browser with this backup (${(obj.attempts || []).length} answers, ${(obj.mocks || []).length} mocks)?`)) return;
            T.replaceState(obj);
            applyTheme();
            T.toast('Backup imported.');
            U.rerender();
          } catch (e) { T.toast(`Import failed: ${e.message}`); }
        };
        r.readAsText(file);
      });
    },
    on: {
      saveSettings() {
        const t = Number(document.querySelector('input[data-k="target"]').value);
        const d = document.querySelector('input[data-k="examDate"]').value.trim();
        if (!(t >= 200 && t <= 600)) { T.toast('Target must be between 200 and 600.'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d))) { T.toast('Write the date as YYYY-MM-DD, e.g. 2027-01-15.'); return; }
        store.S.settings.target = t;
        store.S.settings.examDate = d;
        save();
        T.toast('Settings saved.');
      },
      theme(el) { store.S.settings.theme = el.dataset.v; save(); applyTheme(); U.rerender(); },
      export() {
        const blob = new Blob([JSON.stringify(store.S, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `tagemage-progress-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        T.toast('Progress exported.');
      },
      reset() {
        if (!confirm('Delete all your progress in this browser? This cannot be undone. Export a backup first if unsure.')) return;
        store.S = T.blank();
        save();
        T.toast('Progress deleted.');
        U.rerender();
      },
    },
  };

  function applyTheme() {
    const t = store.S.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  U.register('home', home);
  U.register('progress', progress);
  U.register('mistakes', mistakes);
  U.register('plan', planView);
  U.register('briefing', briefing);
  U.register('grammar', { render() { return `<div class="prose">${(window.TM_CONTENT && window.TM_CONTENT.grammar) || ''}</div>`; } });
  U.register('settings', settings);
  window.TMPages = { applyTheme, launch, nextAdvice };
})();
