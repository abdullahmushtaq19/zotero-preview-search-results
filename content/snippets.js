var PassageSnippets = (function () {
  const WORD = /[\p{L}\p{N}]+/gu;

  function fold(text, matchCase) {
    let out = String(text).normalize('NFD').replace(/\p{M}+/gu, '');
    out = out.replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u2013\u2014]/g, '-');
    if (!matchCase) out = out.toLowerCase();
    return out;
  }

  function phraseEdges(page, hit) {
    const before = hit.start > 0 ? fold(page.slice(hit.start - 1, hit.start), true) : '';
    const after = fold(page.slice(hit.end, hit.end + 1), true);
    if (before && /[\p{L}\p{N}]/u.test(before)) return false;
    if (after && /[\p{L}\p{N}]/u.test(after)) return false;
    return true;
  }

  function quotedPhrase(query) {
    const match = String(query || '').match(/^\s*["\u201C]([\s\S]+)["\u201D]\s*$/);
    if (!match) return null;
    const phrase = match[1].trim();
    return phrase || null;
  }

  function queryParts(query, matchCase) {
    const folded = fold(query, matchCase).replace(/[\s-]+/g, ' ').trim();
    if (!folded) return null;
    return {
      folded,
      tokens: folded.match(/[\p{L}\p{N}]+/gu) || [],
      literal: /[^\p{L}\p{N}\s-]/u.test(folded),
    };
  }

  function squash(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  function windowAround(page, start, end) {
    const budget = 420;
    let left = Math.max(0, start - Math.floor((budget - (end - start)) / 2));
    let right = Math.min(page.length, left + budget);
    left = Math.max(0, right - budget);
    if (left > 0) {
      const space = page.lastIndexOf(' ', Math.min(start, left + 40));
      if (space > left - 40 && space < start) left = space + 1;
    }
    if (right < page.length) {
      const space = page.indexOf(' ', Math.max(end, right - 40));
      if (space !== -1 && space > end && space < right + 40) right = space;
    }
    const match = squash(page.slice(start, end));
    if (!match) return null;
    return {
      before: squash(page.slice(left, start)),
      match,
      after: squash(page.slice(end, right)),
    };
  }

  function tokenHits(page, qTokens, mode, matchCase) {
    const tokens = [];
    for (const found of page.matchAll(WORD)) {
      tokens.push({
        start: found.index,
        end: found.index + found[0].length,
        folded: fold(found[0], matchCase),
      });
    }
    const hits = [];
    for (let i = 0; i <= tokens.length - qTokens.length; i++) {
      let ok = true;
      for (let j = 0; j < qTokens.length; j++) {
        const got = tokens[i + j].folded;
        const want = qTokens[j];
        const last = j === qTokens.length - 1;
        const pass = mode === 'prefix' && last ? got.startsWith(want) : got === want;
        if (!pass) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      hits.push({
        start: tokens[i].start,
        end: tokens[i + qTokens.length - 1].end,
      });
      i += qTokens.length - 1;
    }
    return hits;
  }

  function foldWithMap(text, matchCase) {
    let out = '';
    const map = [];
    for (let i = 0; i < text.length;) {
      const ch = String.fromCodePoint(text.codePointAt(i));
      const folded = fold(ch, matchCase);
      for (let k = 0; k < folded.length; k++) map.push(i);
      out += folded;
      i += ch.length;
    }
    return { out, map };
  }

  function collapseGaps(mapped) {
    let out = '';
    const map = [];
    let prevGap = false;
    for (let i = 0; i < mapped.out.length; i++) {
      const ch = mapped.out[i];
      const gap = /\s/.test(ch) || ch === '-';
      if (gap && prevGap) continue;
      prevGap = gap;
      out += gap ? ' ' : ch;
      map.push(mapped.map[i]);
    }
    return { out, map };
  }

  function substringHits(page, needle, matchCase) {
    if (!needle) return [];
    const collapsed = collapseGaps(foldWithMap(page, matchCase));
    const hits = [];
    let from = 0;
    while (from <= collapsed.out.length - needle.length) {
      const at = collapsed.out.indexOf(needle, from);
      if (at === -1) break;
      const start = collapsed.map[at];
      const last = collapsed.map[at + needle.length - 1];
      const lastChar = String.fromCodePoint(page.codePointAt(last));
      hits.push({ start, end: last + lastChar.length });
      from = at + needle.length;
    }
    return hits;
  }

  function findInPage(page, query, options) {
    const matchCase = !!options.matchCase;
    const mode = options.mode || 'whole';
    const phrase = quotedPhrase(query);
    let ranges;
    if (phrase) {
      const needle = fold(phrase, matchCase).replace(/[\s-]+/g, ' ').trim();
      ranges = substringHits(page, needle, matchCase).filter((hit) => phraseEdges(page, hit));
    } else {
      const parts = queryParts(query, matchCase);
      if (!parts || !parts.tokens.length && !parts.literal) return [];
      if (parts.literal || mode === 'anywhere') {
        const needle = parts.literal ? parts.folded : parts.tokens.join(' ');
        ranges = substringHits(page, needle, matchCase);
      } else {
        ranges = tokenHits(page, parts.tokens, mode, matchCase);
      }
    }
    const passages = [];
    for (const range of ranges) {
      const piece = windowAround(page, range.start, range.end);
      if (piece) passages.push(piece);
    }
    return passages;
  }

  function findPassages(text, query, options) {
    const source = String(text || '');
    const hasBreaks = source.includes('\f');
    const pages = source.split('\f');
    const found = [];
    pages.forEach((page, pageIndex) => {
      for (const hit of findInPage(page, query, options || {})) {
        found.push({
          before: hit.before,
          match: hit.match,
          after: hit.after,
          pageIndex: hasBreaks ? pageIndex : null,
          pageLabel: hasBreaks ? String(pageIndex + 1) : null,
        });
      }
    });
    return found;
  }

  return { findPassages, quotedPhrase };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PassageSnippets;
}
