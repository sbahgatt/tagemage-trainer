// Shared UI: question rendering, feedback, clipboard, router.
(function () {
  'use strict';
  const { BANK, SUB, LETTERS, esc, md, typeLabel, toast } = window.TM;
  const V = window.TMVisuals;

  function optionInner(o) {
    if (o && typeof o === 'object' && o.visual) return V.render(o.visual);
    return esc(o);
  }

  // state: {chosen, reveal, locked}
  function optionsHTML(q, state) {
    const visual = q.options.every((o) => o && typeof o === 'object' && o.visual);
    return `<ol class="options${visual ? ' visual' : ''}" role="list">${q.options.map((o, i) => {
      const cls = ['opt'];
      if (state.reveal) {
        if (i === q.answer) cls.push('is-right');
        else if (i === state.chosen) cls.push('is-wrong');
      } else if (i === state.chosen) cls.push('chosen');
      const dis = state.reveal || state.locked ? 'disabled' : '';
      return `<li><button class="${cls.join(' ')}" data-act="choose" data-i="${i}" ${dis} aria-pressed="${i === state.chosen}">
        <span class="bubble" aria-hidden="true">${LETTERS[i]}</span><span class="opt-text">${optionInner(o)}</span></button></li>`;
    }).join('')}</ol>`;
  }

  function stemHTML(q) {
    let h = `<div class="stem">${md(q.stem)}`;
    if (q.subtest === 'CM') {
      h += `<div class="stmts"><div class="stmt"><strong>(1)</strong>&nbsp;&nbsp;${md(q.s1)}</div><div class="stmt"><strong>(2)</strong>&nbsp;&nbsp;${md(q.s2)}</div></div>`;
    }
    h += '</div>';
    if (q.visual) h += `<div class="vis-q">${V.render(q.visual)}</div>`;
    return h;
  }

  function passageHTML(pid) {
    const p = BANK.passages[pid];
    if (!p) return '';
    return `<article class="passage" aria-label="Texte">
      <h3>${esc(p.title || 'Texte')}</h3>
      ${p.paragraphs.map((t, i) => `<p><span class="pnum">${i + 1}</span>${esc(t)}</p>`).join('')}
    </article>`;
  }

  function methodHTML(q) {
    const m = BANK.methods[`${q.subtest}/${q.type}`];
    if (!m) return '';
    return `<div class="method"><h4>Method card: ${esc(m.title || typeLabel(q.subtest, q.type))}</h4>
      ${m.steps ? `<ol>${m.steps.map((s) => `<li>${md(s)}</li>`).join('')}</ol>` : ''}
      ${m.trap ? `<p><strong>Classic trap:</strong> ${md(m.trap)}</p>` : ''}
      ${m.speed ? `<p><strong>Speed:</strong> ${md(m.speed)}</p>` : ''}</div>`;
  }

  function feedbackHTML(q, chosen, opts = {}) {
    const skipped = chosen === null || chosen === undefined;
    const ok = chosen === q.answer;
    const cls = ok ? 'ok' : skipped ? 'sk' : 'ko';
    const verdict = ok ? 'Correct' : skipped ? `Skipped. The answer is ${LETTERS[q.answer]}.` : `Not quite. You chose ${LETTERS[chosen]}; the answer is ${LETTERS[q.answer]}.`;
    const traps = q.traps.map((t, i) => (i === q.answer || !t ? '' : `<li${i === chosen ? ' style="font-weight:700"' : ''}><span class="tl">${LETTERS[i]}</span><span>${md(t)}${i === chosen ? ' <span class="muted">(your answer)</span>' : ''}</span></li>`)).join('');
    return `<section class="feedback ${cls}" aria-live="polite">
      <div class="verdict">${verdict}</div>
      <p><strong>Why ${LETTERS[q.answer]} is right:</strong> ${md(q.explanation)}</p>
      ${traps ? `<details ${ok ? '' : 'open'}><summary>The trap behind each wrong option</summary><ul class="traps">${traps}</ul></details>` : ''}
      ${opts.noMethod ? '' : methodHTML(q)}
      <div class="row" style="margin-top:12px"><button class="btn ghost" data-act="copy" data-id="${esc(q.id)}" data-chosen="${skipped ? '' : chosen}">Copy to ask Claude</button></div>
    </section>`;
  }

  function optionPlain(o) {
    if (o && typeof o === 'object' && o.visual) {
      const v = o.visual;
      if (v.kind === 'domino') return `domino [${v.v.join('|')}]`;
      if (v.kind === 'arrow') return `arrow pointing ${v.deg}° clockwise from up`;
      if (v.kind === 'grid') return `${v.size}x${v.size} grid, filled cells ${v.cells.join(',')}`;
      return JSON.stringify(v);
    }
    return String(o);
  }
  function visualPlain(v) {
    if (!v) return '';
    if (v.kind === 'dominoes') return 'Dominoes: ' + v.items.map((d) => (d ? `[${d.join('|')}]` : '[?]')).join(' ');
    if (v.kind === 'arrows') return 'Arrows (degrees clockwise from up): ' + v.items.map((d) => (d === null ? '?' : d)).join(', ');
    if (v.kind === 'grids') return `Grids ${v.size}x${v.size}, filled cells per frame: ` + v.frames.map((f) => (f ? `{${f.join(',')}}` : '?')).join(' ');
    return JSON.stringify(v);
  }

  function copyText(q, chosen) {
    const skipped = chosen === null || chosen === undefined || chosen === '';
    const lines = [];
    lines.push(`I'm preparing the TAGE MAGE. Here's a question I got ${skipped ? 'skipped' : chosen === q.answer ? 'right but want to understand better' : 'wrong'}.`);
    lines.push(`Sub-test: ${SUB[q.subtest].name}, type: ${typeLabel(q.subtest, q.type)}, difficulty ${q.difficulty}/3.`);
    if (q.passage && BANK.passages[q.passage]) {
      const p = BANK.passages[q.passage];
      lines.push('', `Texte : « ${p.title} »`, ...p.paragraphs);
    }
    lines.push('', `Question : ${q.stem}`);
    if (q.subtest === 'CM') lines.push(`(1) ${q.s1}`, `(2) ${q.s2}`);
    if (q.visual) lines.push(visualPlain(q.visual));
    q.options.forEach((o, i) => lines.push(`${LETTERS[i]}) ${optionPlain(o)}`));
    lines.push('', `My answer: ${skipped ? 'skipped' : LETTERS[chosen]}`, `Correct answer: ${LETTERS[q.answer]}`, `Explanation: ${q.explanation}`);
    if (!skipped && chosen !== q.answer && q.traps[chosen]) lines.push(`Why my answer is wrong: ${q.traps[chosen]}`);
    lines.push('', 'Can you explain the method step by step, and give me two similar questions to practise?');
    return lines.join('\n');
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  // ---------- router ----------
  const routes = {};
  let current = null;
  let tickHandle = null;
  function register(name, view) { routes[name] = view; }
  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, ...rest] = h.split('/');
    return { name: name || 'home', args: rest };
  }
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  function render() {
    const { name, args } = parse();
    const view = routes[name] || routes.home;
    if (current && current.leave) current.leave();
    current = view;
    const main = document.getElementById('main');
    main.innerHTML = view.render(args) || '';
    document.querySelectorAll('.nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.route === (routes[name] ? name : 'home') ? 'page' : 'false'));
    if (view.mount) view.mount(main, args);
    if (!view.keepScroll) window.scrollTo(0, 0);
  }
  function rerender() {
    const { args } = parse();
    const main = document.getElementById('main');
    const y = window.scrollY;
    main.innerHTML = current.render(args) || '';
    if (current.mount) current.mount(main, args);
    window.scrollTo(0, y);
  }

  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (act === 'copy') {
      const q = window.TM.getQ(el.dataset.id);
      const chosen = el.dataset.chosen === '' ? null : Number(el.dataset.chosen);
      const ok = await copyToClipboard(copyText(q, chosen));
      toast(ok ? 'Copied. Paste it into a chat with Claude.' : 'Copy failed: your browser blocked clipboard access.');
      return;
    }
    if (current && current.on && current.on[act]) {
      ev.preventDefault();
      current.on[act](el, ev);
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.target && ev.target.closest && ev.target.closest('input, select, textarea')) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (current && current.key) current.key(ev);
  });
  window.addEventListener('hashchange', render);
  tickHandle = setInterval(() => { if (current && current.tick) current.tick(); }, 250);

  window.TMUI = { optionsHTML, stemHTML, passageHTML, feedbackHTML, methodHTML, copyText, register, go, render, rerender, parse };
})();
