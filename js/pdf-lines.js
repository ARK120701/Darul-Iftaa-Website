/* ============================================================
   Turns the raw text items pdf.js returns for one PDF page into
   reading-order lines — the part pdf.js gets wrong for Arabic/Urdu.

   For right-to-left text, pdf.js hands back one item per glyph in
   presentation-form characters (U+FExx), with no word spaces, so simply
   concatenating the items scrambles every Arabic word and run. Here we
   rebuild each line from the glyphs' on-page positions instead:
     - Arabic runs are ordered right-to-left by x position,
     - word spaces are re-inserted from the gaps between glyphs,
     - presentation forms are folded back to normal letters (NFKC),
     - stray diacritic marks are re-attached to the glyph beneath them,
     - digit runs are kept left-to-right.

   Input items (in pdf.js stream order):
     { str, x, y, w, size, bold, underline, letterhead }
   Output lines: { text, size, runs: [{str, bold, underline}], letterhead }
   ============================================================ */
(function (root) {
  // Every presentation-form letter except U+FDFA (the ﷺ salutation, kept as-is).
  const PRES_RE   = /[ﭐ-ﷹﷻ-﷿ﹰ-﻿]/g;
  const AR_RE     = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  const MARK_RE   = /^[ؐ-ًؚ-ٰٟۖ-ۭ]+$/;
  const DIGITS_RE = /^[0-9٠-٩۰-۹]+$/;
  const LATIN_RE  = /[A-Za-z]/;

  // Letters that only occur in Urdu/Persian-style text. If a line has none, the
  // glyph variants below were really Arabic letters drawn with Urdu-shaped glyphs.
  const URDU_RE = /[ٹڈڑںےۓگچپژہ]/;
  const TO_ARABIC = { 'ی': 'ي', 'ھ': 'ه', 'ک': 'ك' };
  // Brackets are stored as the glyph that *looks* right in a right-to-left run,
  // which is the opposite of the logical character.
  const BRACKET_SWAP = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{' };
  const swapBrackets = s => s.replace(/[()\[\]{}]/g, ch => BRACKET_SWAP[ch]);

  function fold(s) { return s.replace(PRES_RE, ch => ch.normalize('NFKC')); }
  const isMark   = it => { const t = fold(it.str).replace(/\s+/g, ''); return t !== '' && MARK_RE.test(t); };
  const isLatin  = it => LATIN_RE.test(it.str);
  const isBlank  = it => it.str.trim() === '';

  // Reverse each maximal sequence of digit-only items (digits stay left-to-right
  // even inside a right-to-left run).
  function fixDigitRuns(items) {
    const out = [];
    for (let i = 0; i < items.length; ) {
      if (DIGITS_RE.test(items[i].str.trim() || 'x')) {
        let j = i;
        while (j < items.length && DIGITS_RE.test(items[j].str.trim() || 'x')) j++;
        out.push(...items.slice(i, j).reverse());
        i = j;
      } else { out.push(items[i]); i++; }
    }
    return out;
  }

  function orderLine(line) {
    if (!line.some(it => AR_RE.test(it.str))) return line;       // plain Latin line: keep stream order
    const byX = line.slice().sort((a, b) => a.x - b.x);
    // split into runs of Latin vs non-Latin items (blanks join the current run)
    const runs = [];
    for (const it of byX) {
      const latin = isBlank(it) ? null : isLatin(it);
      const last = runs[runs.length - 1];
      if (last && (latin === null || last.latin === latin)) last.items.push(it);
      else runs.push({ latin: latin === null ? false : latin, items: [it] });
    }
    const ordered = [];
    for (const r of runs) {
      if (r.latin) { ordered.push(...r.items); continue; }
      r.items.forEach(it => { it.rtl = true; });
      ordered.push(...fixDigitRuns(r.items.slice().reverse()));
    }
    return ordered;
  }

  function build(items) {
    // 1. diacritic marks are positioned above/below their letter, i.e. on a
    //    different baseline — pull them out so they don't split the line.
    const marks = items.filter(isMark);
    const body = items.filter(it => !isMark(it) && it.str !== '');

    // 2. group into lines by baseline (same rule as before: >2pt = new line)
    const lines = [];
    let cur = [], lastY = null;
    for (const it of body) {
      if (lastY !== null && Math.abs(it.y - lastY) > 2) { lines.push(cur); cur = []; }
      cur.push(it); lastY = it.y;
    }
    if (cur.length) lines.push(cur);

    // 3. attach each mark to the Arabic glyph it sits over
    const arabicItems = body.filter(it => AR_RE.test(it.str));
    for (const m of marks) {
      const cx = m.x + (m.w || 0) / 2;
      let best = null, bestDy = Infinity;
      for (const it of arabicItems) {
        if (cx >= it.x - 0.5 && cx <= it.x + it.w + 0.5) {
          const dy = Math.abs(it.y - m.y);
          if (dy < 20 && dy < bestDy) { best = it; bestDy = dy; }
        }
      }
      if (best) best.marks = (best.marks || '') + fold(m.str).replace(/\s+/g, '');
    }

    // 4. order each line and turn it into runs
    return lines.map(line => {
      const ordered = orderLine(line);
      const runs = [];
      let prev = null;
      for (const it of ordered) {
        let text = fold(it.str);
        // only a bracket standing alone in its own item is stored visually; inside
        // a longer item pdf.js has already put it in logical order
        if (it.rtl && /^\s*[()\[\]{}]\s*$/.test(text)) text = swapBrackets(text);
        text += it.marks || '';
        if (prev) {
          // gap between neighbours, measured in reading direction
          const gap = prev.x >= it.x ? prev.x - (it.x + it.w) : it.x - (prev.x + prev.w);
          const prevEnd = runs.length ? runs[runs.length - 1].str.slice(-1) : '';
          const needSpace = gap > (it.size || 10) * 0.2 && !/\s/.test(prevEnd) && !/^\s/.test(text);
          if (needSpace) runs.push({ str: ' ', bold: !!(prev.bold && it.bold), underline: !!(prev.underline && it.underline) });
        }
        runs.push({ str: text, bold: it.bold, underline: it.underline });
        prev = it;
      }
      const joined = runs.map(r => r.str).join('');
      if (AR_RE.test(joined) && !URDU_RE.test(joined)) {
        runs.forEach(r => { r.str = r.str.replace(/[یھک]/g, ch => TO_ARABIC[ch]); });
      }
      return {
        text: runs.map(r => r.str).join(''),
        size: Math.max(0, ...line.map(it => it.size || 0)),
        y: line[0].y,
        arabic: AR_RE.test(joined),
        runs,
        letterhead: line.some(it => it.letterhead)
      };
    });
  }

  root.DunyPdfLines = { build, fold };
  if (typeof module !== 'undefined') module.exports = root.DunyPdfLines;
})(typeof window !== 'undefined' ? window : globalThis);
