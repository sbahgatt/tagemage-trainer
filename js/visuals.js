// SVG renderers for Logique visuals (dominoes, grids, arrows). See data/SCHEMA.md.
(function () {
  const PIPS = {
    0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };
  function half(v, y0) {
    if (v === null || v === undefined) {
      return `<text x="22" y="${y0 + 27}" text-anchor="middle" font-size="22" font-weight="700" fill="currentColor">?</text>`;
    }
    return (PIPS[v] || []).map((p) => {
      const cx = 10 + (p % 3) * 12;
      const cy = y0 + 8 + Math.floor(p / 3) * 12;
      return `<circle cx="${cx}" cy="${cy}" r="3.6" fill="currentColor"/>`;
    }).join('');
  }
  function domino(v) {
    const top = v ? v[0] : null;
    const bot = v ? v[1] : null;
    return `<svg width="44" height="84" viewBox="0 0 44 84" aria-label="domino ${v ? v.join('/') : '?'}" role="img">
      <rect x="1" y="1" width="42" height="82" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
      ${v ? `<line x1="6" y1="42" x2="38" y2="42" stroke="currentColor" stroke-width="1.5"/>${half(top, 4)}${half(bot, 46)}` : half(null, 15)}
    </svg>`;
  }
  function grid(size, cells) {
    const c = 16;
    const w = size * c + 2;
    if (cells === null) return `<svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" role="img" aria-label="?"><rect x="1" y="1" width="${w - 2}" height="${w - 2}" fill="none" stroke="currentColor" stroke-dasharray="4 3"/><text x="${w / 2}" y="${w / 2 + 7}" text-anchor="middle" font-size="20" font-weight="700" fill="currentColor">?</text></svg>`;
    let s = '';
    for (let i = 0; i < size * size; i++) {
      const x = 1 + (i % size) * c;
      const y = 1 + Math.floor(i / size) * c;
      const on = cells.includes(i);
      s += `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1"/>`;
    }
    return `<svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" role="img" aria-label="grille">${s}</svg>`;
  }
  function arrow(deg) {
    if (deg === null) return `<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" stroke-dasharray="4 3"/><text x="22" y="29" text-anchor="middle" font-size="20" font-weight="700" fill="currentColor">?</text></svg>`;
    return `<svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label="flèche ${deg}°"><circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" stroke-width="1.5"/><g transform="rotate(${deg} 22 22)"><line x1="22" y1="34" x2="22" y2="9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 17 L22 8 L30 17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
  }
  function render(v) {
    if (!v) return '';
    switch (v.kind) {
      case 'domino': return `<span class="vis">${domino(v.v)}</span>`;
      case 'dominoes': return `<span class="vis">${v.items.map(domino).join('')}</span>`;
      case 'grid': return `<span class="vis">${grid(v.size, v.cells)}</span>`;
      case 'grids': return `<span class="vis">${v.frames.map((f) => grid(v.size, f)).join('')}</span>`;
      case 'arrow': return `<span class="vis">${arrow(v.deg)}</span>`;
      case 'arrows': return `<span class="vis">${v.items.map(arrow).join('')}</span>`;
      default: return '';
    }
  }
  window.TMVisuals = { render };
})();
