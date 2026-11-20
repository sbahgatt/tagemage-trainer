// Random question generators for Calcul and Logique. Deterministic from a seed, so a generated
// question can be rebuilt from its id (e.g. in the error log). Works in the browser and in Node (QC).
(function (root) {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const frac = (n, d) => { const g = gcd(n, d); const s = d < 0 ? -1 : 1; return `${(s * n) / g}/${(s * d) / g}`; };
  const fr = (x) => String(x).replace('.', ',');
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Build the final question: shuffle the correct answer among 4 distractors.
  function assemble(R, base, correct, distractors, extra) {
    const keyOf = (t) => (typeof t === 'object' ? JSON.stringify(t) : String(t));
    const seen = new Set([keyOf(correct.text)]);
    const ds = [];
    for (const d of distractors) {
      const k = keyOf(d.text);
      if (!seen.has(k)) { seen.add(k); ds.push(d); }
      if (ds.length === 4) break;
    }
    if (ds.length < 4) return null; // caller retries with another seed
    const pos = Math.floor(R() * 5);
    const opts = ds.slice();
    opts.splice(pos, 0, correct);
    return Object.assign({
      set: 'generated',
      options: opts.map((o) => o.text),
      answer: pos,
      traps: opts.map((o, i) => (i === pos ? '' : o.why)),
    }, base, extra || {});
  }

  const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
  const int = (R, a, b) => a + Math.floor(R() * (b - a + 1));

  // ---------------- CALCUL ----------------
  const CA = {
    pourcentages(R) {
      const a = pick(R, [10, 20, 25, 30, 40, 50]);
      const b = pick(R, [10, 20, 25, 40, 50]);
      const net = Math.round(((1 + a / 100) * (1 - b / 100) - 1) * 10000) / 100;
      const sign = (x) => (x > 0 ? `+${fr(x)} %` : `${fr(x)} %`);
      return {
        stem: `Le prix d'un article augmente de ${a} %, puis baisse de ${b} %. Quelle est la variation totale du prix ?`,
        correct: { text: sign(net) },
        distractors: [
          { text: sign(a - b), why: `Adding the percentages (${a} − ${b}) ignores that the second change applies to a bigger (or smaller) base.` },
          { text: sign(Math.round((a - b + (a * b) / 100) * 100) / 100), why: 'Right idea but the cross term has the wrong sign: (1 + a)(1 − b) gives −a×b, not +a×b.' },
          { text: sign(-Math.round((a * b) / 100 * 100) / 100), why: 'This is only the cross term a×b/100; you forgot a − b.' },
          { text: sign(Math.round((net + 5) * 100) / 100), why: `Arithmetic slip: recompute ${fr(1 + a / 100)} × ${fr(1 - b / 100)} carefully.` },
          { text: sign(Math.round((net - 5) * 100) / 100), why: 'Arithmetic slip in the multiplication of the coefficients.' },
        ],
        explanation: `Successive percentage changes multiply: coefficient = (1 + ${a}/100) × (1 − ${b}/100) = ${fr(1 + a / 100)} × ${fr(1 - b / 100)} = ${fr(Math.round((1 + a / 100) * (1 - b / 100) * 10000) / 10000)}. So the total *variation* is ${sign(net)}. Shortcut: a − b − a×b/100.`,
        expr: `((1+${a}/100)*(1-${b}/100)-1)*100`,
      };
    },
    fractions(R) {
      const [n1, d1] = pick(R, [[1, 3], [1, 4], [2, 5], [1, 5], [3, 8], [1, 6]]);
      const [n2, d2] = pick(R, [[1, 2], [1, 3], [1, 4], [2, 3], [3, 4]]);
      const restN = (d1 - n1) * (d2 - n2);
      const restD = d1 * d2;
      return {
        stem: `Paul dépense ${n1}/${d1} de son salaire pour son loyer, puis ${n2}/${d2} de ce qui lui reste pour ses courses. Quelle fraction de son salaire lui reste-t-il ?`,
        correct: { text: frac(restN, restD) },
        distractors: [
          { text: frac(d1 * d2 - n1 * d2 - n2 * d1, restD), why: `You subtracted ${n2}/${d2} of the whole salary, but it's ${n2}/${d2} of what remains.` },
          { text: frac(n1 * d2 + n2 * (d1 - n1), restD), why: 'This is the fraction spent, not the fraction left.' },
          { text: frac(n2 * (d1 - n1), restD), why: 'This is only what the courses cost.' },
          { text: frac(d1 - n1, d1), why: 'This is what remains after rent only; you forgot the courses.' },
          { text: frac(restN + 1, restD), why: 'Arithmetic slip when multiplying the remaining fractions.' },
        ],
        explanation: `Work with "what remains". After rent: 1 − ${n1}/${d1} = ${frac(d1 - n1, d1)}. The courses take ${n2}/${d2} of that, so ${frac(d2 - n2, d2)} of it is left: ${frac(d1 - n1, d1)} × ${frac(d2 - n2, d2)} = ${frac(restN, restD)}.`,
        expr: `(1-${n1}/${d1})*(1-${n2}/${d2})`,
      };
    },
    ratios(R) {
      const a = int(R, 2, 5);
      let b = int(R, 2, 7);
      if (b === a) b++;
      const k = int(R, 3, 9);
      const N = (a + b) * k;
      return {
        stem: `Dans une classe de ${N} élèves, le rapport entre le nombre de garçons et le nombre de filles est de ${a} pour ${b}. Combien y a-t-il de filles ?`,
        correct: { text: String(b * k) },
        distractors: [
          { text: String(a * k), why: 'That is the number of boys.' },
          { text: String(Math.round(N / b)), why: `You divided the total by ${b}; the total splits into ${a + b} equal parts.` },
          { text: String(N - b), why: 'Subtracting the ratio number from the total has no meaning.' },
          { text: String(b * k + a), why: 'Slip: one part is worth ' + k + '.' },
          { text: String((b - a) * k || k + 1), why: 'That is the difference between girls and boys.' },
        ],
        explanation: `A ratio ${a}:${b} means ${a + b} equal parts. One part = ${N} ÷ ${a + b} = ${k}. Girls = ${b} × ${k} = ${b * k}.`,
        expr: `${N}/(${a}+${b})*${b}`,
      };
    },
    puissances(R) {
      const a = int(R, 2, 9), b = int(R, 1, 5), c = int(R, 1, 4);
      const e = a + 2 * b - 3 * c;
      return {
        stem: `On a 2^${a} × 4^${b} ÷ 8^${c} = 2^n. Que vaut n ?`,
        correct: { text: String(e) },
        distractors: [
          { text: String(a + b - c), why: `You forgot to rewrite 4 = 2² and 8 = 2³ before adding exponents.` },
          { text: String(a + 2 * b + 3 * c), why: 'Dividing subtracts exponents; you added 3c.' },
          { text: String(a * 2 * b - 3 * c), why: 'Multiplying powers adds exponents; it does not multiply them.' },
          { text: String(e + 1), why: 'Arithmetic slip; recount a + 2b − 3c.' },
          { text: String(e - 2), why: 'Arithmetic slip; recount a + 2b − 3c.' },
        ],
        explanation: `Put everything in base 2: 4^${b} = 2^${2 * b} and 8^${c} = 2^${3 * c}. Then n = ${a} + ${2 * b} − ${3 * c} = ${e}.`,
        expr: `${a}+2*${b}-3*${c}`,
      };
    },
    equations(R) {
      const x = int(R, 3, 19), y = int(R, 1, x - 1);
      const S = x + y, D = x - y;
      return {
        stem: `La somme de deux nombres vaut ${S} et leur différence vaut ${D}. Quel est le produit de ces deux nombres ?`,
        correct: { text: String(x * y) },
        distractors: [
          { text: String(S * D), why: 'You multiplied the sum by the difference; that gives x² − y², not x × y.' },
          { text: String(x * x), why: 'That is the square of the larger number.' },
          { text: String((x + 1) * (y - 1)), why: 'You solved the system with a slip; check x = (S + D)/2.' },
          { text: String(x + y + D), why: 'This adds the values instead of multiplying the two numbers.' },
          { text: String(x * y + D), why: 'Slip: the product is x × y only.' },
        ],
        explanation: `x + y = ${S} and x − y = ${D}. Add the equations: 2x = ${S + D}, so x = ${x} and y = ${y}. Product = ${x} × ${y} = ${x * y}.`,
        expr: `((${S}+${D})/2)*((${S}-${D})/2)`,
      };
    },
    geometrie(R) {
      const [p, q, h] = pick(R, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25]]);
      return {
        stem: `Un triangle rectangle a des côtés de l'angle droit mesurant ${p} cm et ${q} cm. Quel est son périmètre ?`,
        correct: { text: `${p + q + h} cm` },
        distractors: [
          { text: `${p + q} cm`, why: 'You forgot the hypotenuse.' },
          { text: `${(p * q) / 2} cm`, why: 'That is the area (in cm²), not the perimeter.' },
          { text: `${p + q + p + q} cm`, why: 'You treated it as a rectangle.' },
          { text: `${p + q + (p + q - 1)} cm`, why: 'The hypotenuse is √(a² + b²), not a + b − 1. Know the triples 3-4-5, 5-12-13, 8-15-17, 7-24-25.' },
          { text: `${p * q} cm`, why: 'p × q is twice the area; not a length.' },
        ],
        explanation: `*Théorème de Pythagore*: hypotenuse = √(${p}² + ${q}²) = √${p * p + q * q} = ${h}. Perimeter = ${p} + ${q} + ${h} = ${p + q + h} cm. Recognise Pythagorean triples to save time.`,
        expr: `${p}+${q}+Math.sqrt(${p * p}+${q * q})`,
      };
    },
    moyennes(R) {
      const n = int(R, 3, 6), m = int(R, 9, 14), t = m + pick(R, [1, 2]);
      const need = t * (n + 1) - m * n;
      if (need > 20) return null;
      return {
        stem: `Un étudiant a une moyenne de ${m}/20 sur ${n} devoirs. Quelle note doit-il obtenir au devoir suivant pour que sa moyenne passe à ${t}/20 ?`,
        correct: { text: String(need) },
        distractors: [
          { text: String(t + (t - m)), why: 'You only added the gap once; the new note must lift all ' + n + ' previous notes too.' },
          { text: String(t), why: 'Getting the target mark only keeps the average below it.' },
          { text: String(t * n - m * n), why: `You forgot that there are now ${n + 1} devoirs.` },
          { text: String(need - 1), why: 'Off by one; recompute total needed − current total.' },
          { text: String(Math.min(20, need + 2)), why: 'Arithmetic slip in the totals.' },
        ],
        explanation: `Think in totals. Current total = ${m} × ${n} = ${m * n}. Target total = ${t} × ${n + 1} = ${t * (n + 1)}. Needed note = ${t * (n + 1)} − ${m * n} = ${need}.`,
        expr: `${t}*${n + 1}-${m}*${n}`,
      };
    },
    vitesses(R) {
      const [v1, v2, vm] = pick(R, [[30, 60, 40], [40, 60, 48], [60, 90, 72], [20, 30, 24], [60, 120, 80], [45, 90, 60], [12, 6, 8]]);
      return {
        stem: `Un cycliste fait un aller à ${v1} km/h et le retour, sur le même trajet, à ${v2} km/h. Quelle est sa vitesse moyenne sur l'aller-retour ?`,
        correct: { text: `${vm} km/h` },
        distractors: [
          { text: `${(v1 + v2) / 2} km/h`, why: 'Classic trap: averaging the speeds. He spends more time at the slower speed, so the average is lower.' },
          { text: `${Math.abs(v2 - v1)} km/h`, why: 'The difference of speeds is meaningless here.' },
          { text: `${vm + 2} km/h`, why: 'Slip in the harmonic mean computation.' },
          { text: `${Math.max(v1, v2) - 5} km/h`, why: 'Guessing near the faster speed; the average is pulled toward the slower one.' },
          { text: `${v1 + v2} km/h`, why: 'Speeds do not add.' },
        ],
        explanation: `Average speed = total distance ÷ total time. For equal distances it's the *moyenne harmonique*: 2 × ${v1} × ${v2} ÷ (${v1} + ${v2}) = ${vm} km/h. Or pick a distance, e.g. the LCM of the speeds, and compute times.`,
        expr: `2*${v1}*${v2}/(${v1}+${v2})`,
      };
    },
    probabilites(R) {
      const r = int(R, 2, 6), b = int(R, 2, 6);
      const n = r + b;
      return {
        stem: `Une urne contient ${r} boules rouges et ${b} boules bleues. On tire successivement deux boules sans remise. Quelle est la probabilité d'obtenir deux boules rouges ?`,
        correct: { text: frac(r * (r - 1), n * (n - 1)) },
        distractors: [
          { text: frac(r * r, n * n), why: 'That is the probability with replacement; without replacement the second draw has one fewer ball.' },
          { text: frac(r, n), why: 'That is the probability for a single red ball.' },
          { text: frac(r * (r - 1), n * n), why: 'The denominator must also lose one ball on the second draw: n × (n − 1).' },
          { text: frac(2 * r, n * (n - 1)), why: 'You added instead of multiplying the successive probabilities.' },
          { text: frac(r * (r - 1) + b * (b - 1), n * (n - 1)), why: 'That is the probability of two balls of the same colour (red or blue).' },
        ],
        explanation: `Successive draws multiply: P = ${r}/${n} × ${r - 1}/${n - 1} = ${frac(r * (r - 1), n * (n - 1))}. *Sans remise*: both numerator and denominator drop by 1 on the second draw.`,
        expr: `${r}/${n}*${r - 1}/${n - 1}`,
      };
    },
    denombrement(R) {
      const n = int(R, 5, 14);
      return {
        stem: `Lors d'une réunion, chacune des ${n} personnes serre la main de toutes les autres une seule fois. Combien de poignées de main sont échangées ?`,
        correct: { text: String((n * (n - 1)) / 2) },
        distractors: [
          { text: String(n * (n - 1)), why: 'Each handshake is counted twice that way; divide by 2.' },
          { text: String(n * n), why: 'Nobody shakes their own hand, and pairs are unordered.' },
          { text: String((n * (n + 1)) / 2), why: 'Off by one: each person shakes n − 1 hands, not n.' },
          { text: String(n - 1), why: 'That is the number of hands one person shakes.' },
          { text: String(((n - 1) * (n - 2)) / 2), why: 'You removed one person too many.' },
        ],
        explanation: `Number of pairs = C(n, 2) = n(n − 1)/2 = ${n} × ${n - 1} / 2 = ${(n * (n - 1)) / 2}.`,
        expr: `${n}*${n - 1}/2`,
      };
    },
  };

  // ---------------- LOGIQUE ----------------
  function seqTerms(f, k) { return Array.from({ length: k }, (_, i) => f(i)); }
  const LO = {
    suite_numerique(R) {
      const kind = int(R, 0, 4);
      let fs, rule;
      if (kind === 0) { const a = int(R, 2, 30), d = int(R, 3, 13); fs = `n => ${a} + ${d}*n`; rule = `add ${d} each time`; }
      else if (kind === 1) { const a = int(R, 1, 5), r = pick(R, [2, 3]); fs = `n => ${a} * ${r}**n`; rule = `multiply by ${r} each time`; }
      else if (kind === 2) { const a = int(R, 1, 10), d = int(R, 1, 4); fs = `n => ${a} + ${d}*n*(n+1)/2`; rule = `the gaps grow: +${d}, +${2 * d}, +${3 * d}…`; }
      else if (kind === 3) { const k = int(R, -3, 5); fs = `n => (n+2)**2 + ${k}`; rule = `squares plus ${k}: (n+2)² + ${k}`; }
      else { const a = int(R, 2, 9), b = int(R, 20, 40), d = int(R, 2, 5); fs = `n => n % 2 === 0 ? ${a} + ${d}*(n/2) : ${b} - ${d}*((n-1)/2)`; rule = `two interleaved sequences: even positions +${d}, odd positions −${d}`; }
      const f = new Function(`return (${fs})`)();
      const shown = seqTerms(f, 5);
      const ans = f(5);
      const last = shown[4];
      const diff = shown[4] - shown[3];
      return {
        type: 'suite_numerique',
        stem: `Quel nombre complète la suite ?\n${shown.join('   ')}   ?`,
        correct: { text: String(ans) },
        distractors: [
          { text: String(last + diff), why: 'You repeated the last gap; the rule is not a constant gap here.' },
          { text: String(ans + 1), why: 'Close, but off by one: check the rule on every term.' },
          { text: String(ans - 2), why: 'Check the rule against every term, not only the last two.' },
          { text: String(last * 2), why: 'Doubling the last term does not fit the earlier terms.' },
          { text: String(ans + diff), why: 'You applied the step one time too many.' },
          { text: String(ans + 3), why: 'Off by a small amount: recompute the step.' },
        ],
        explanation: `Rule: ${rule}. Look at the differences first; if they're not constant, check ratios, squares, or two interleaved sequences.`,
        check: { kind: 'seq', f: fs, shown, start: 0 },
      };
    },
    suite_lettres(R) {
      const start = int(R, 0, 10), step = int(R, 2, 5), grow = R() < 0.5 ? 0 : 1;
      const fs = `n => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[(${start} + ${step}*n + ${grow}*n*(n-1)/2) % 26]`;
      const f = new Function(`return (${fs})`)();
      const shown = seqTerms(f, 5);
      const ans = f(5);
      const idx = LET.indexOf(ans);
      const near = (k) => LET[(idx + k + 26) % 26];
      return {
        type: 'suite_lettres',
        stem: `Quelle lettre complète la suite ?\n${shown.join('   ')}   ?`,
        correct: { text: ans },
        distractors: [
          { text: near(1), why: 'One letter too far: count positions with A = 1 … Z = 26.' },
          { text: near(-1), why: 'One letter short: recount the gap.' },
          { text: near(-step), why: 'You reused the previous letter gap.' },
          { text: near(2), why: 'Two letters too far.' },
          { text: near(-2), why: 'Two letters short.' },
        ],
        explanation: grow
          ? `Convert letters to positions (A = 1 … Z = 26). The gaps grow by 1 each time: +${step}, +${step + 1}, +${step + 2}… After Z, wrap back to A.`
          : `Convert letters to positions (A = 1 … Z = 26). The gap is always +${step}. After Z, wrap back to A.`,
        check: { kind: 'seq', f: fs, shown, start: 0 },
      };
    },
    dominos(R) {
      const t0 = int(R, 0, 6), b0 = int(R, 0, 6), dt = int(R, 1, 3), db = pick(R, [-1, 1, 2, -2]);
      const fs = `n => [((${t0} + ${dt}*n) % 7 + 7) % 7, ((${b0} + ${db}*n) % 7 + 7) % 7]`;
      const f = new Function(`return (${fs})`)();
      const shown = seqTerms(f, 4);
      const ans = f(4);
      const mk = (v) => ({ visual: { kind: 'domino', v } });
      const m7 = (x) => ((x % 7) + 7) % 7;
      return {
        type: 'dominos',
        stem: 'Quel domino complète la série ?',
        visual: { kind: 'dominoes', items: shown.concat([null]) },
        correct: { text: mk(ans) },
        distractors: [
          { text: mk([ans[1], ans[0]]), why: 'Top and bottom swapped: follow each half separately.' },
          { text: mk([ans[0], m7(ans[1] + 1)]), why: 'Bottom half off by one.' },
          { text: mk([m7(ans[0] + 1), ans[1]]), why: 'Top half off by one.' },
          { text: mk([m7(ans[0] - dt), ans[1]]), why: 'You did not advance the top half.' },
          { text: mk([ans[0], m7(ans[1] - db)]), why: 'You did not advance the bottom half.' },
          { text: mk([m7(ans[0] + 2), m7(ans[1] + 2)]), why: 'Both halves advanced too far.' },
        ],
        explanation: `Treat the top and bottom halves as two separate sequences. Top: ${dt > 0 ? '+' : ''}${dt} each time; bottom: ${db > 0 ? '+' : ''}${db}. Dominoes count 0 to 6, so after 6 you wrap to 0 (modulo 7).`,
        check: { kind: 'seq', f: fs, shown, start: 0 },
      };
    },
    spatial(R) {
      const d0 = pick(R, [0, 90, 180, 270, 45, 135]), step = pick(R, [45, 90, 135, -45, -90]);
      const fs = `n => (((${d0} + ${step}*n) % 360) + 360) % 360`;
      const f = new Function(`return (${fs})`)();
      const shown = seqTerms(f, 4);
      const ans = f(4);
      const mk = (deg) => ({ visual: { kind: 'arrow', deg: ((deg % 360) + 360) % 360 } });
      return {
        type: 'spatial',
        stem: 'La flèche tourne selon une règle fixe. Quelle est la figure suivante ?',
        visual: { kind: 'arrows', items: shown.concat([null]) },
        correct: { text: mk(ans) },
        distractors: [
          { text: mk(ans + 180), why: 'Opposite direction: check the sense of rotation (clockwise or anticlockwise).' },
          { text: mk(ans - 2 * step), why: 'You rotated the wrong way.' },
          { text: mk(ans + 45), why: 'One eighth of a turn too far.' },
          { text: mk(ans - 45), why: 'One eighth of a turn short.' },
          { text: mk(ans + 90), why: 'A quarter turn too far.' },
          { text: mk(ans - 90), why: 'A quarter turn short.' },
        ],
        explanation: `The arrow turns ${Math.abs(step)}° ${step > 0 ? 'clockwise (sens horaire)' : 'anticlockwise (sens anti-horaire)'} each step. Track one feature (the tip) and count eighths of a turn.`,
        check: { kind: 'seq', f: fs, shown, start: 0 },
      };
    },
  };

  const TYPES = { CA: Object.keys(CA), LO: Object.keys(LO) };

  function generate(subtest, type, seed) {
    const lib = subtest === 'CA' ? CA : LO;
    for (let attempt = 0; attempt < 20; attempt++) {
      const s = (seed + attempt * 7919) >>> 0;
      const R = rng(s);
      const raw = lib[type](R);
      if (!raw) continue;
      const base = {
        id: `g-${subtest}-${type}-${seed}`,
        subtest,
        type: raw.type || type,
        difficulty: subtest === 'CA' ? 1 : 2,
        stem: raw.stem,
        visual: raw.visual || null,
        explanation: raw.explanation,
        check: raw.check || { kind: 'expr', expr: raw.expr },
        generated: true,
      };
      const q = assemble(R, base, raw.correct, raw.distractors);
      if (q) return q;
    }
    return null;
  }

  // Rebuild from an id like "g-CA-pourcentages-12345".
  function fromId(id) {
    const m = /^g-(CA|LO)-([a-z_]+)-(\d+)$/.exec(id);
    return m ? generate(m[1], m[2], Number(m[3])) : null;
  }

  const api = { generate, fromId, TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TMGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
