'use strict';

const DEFAULTS = {
  maxCharsPerLine: 24,
  hardMaxCharsPerLine: 28,
  maxLines: 2,
  targetLines: 2,
  maxCharsPerPage: 52,
  gapThreshold: 0.35,
  minPageDur: 0.8,
  maxPageDur: 4.2,
  casing: 'upper', // 'upper' | 'asis'
  stripFinalPeriod: true
};

const NO_LINE_END = new Set([
  'a','an','the','of','to','in','on','at','for','and','or','but','nor','not','no','is','are','was','were','with','by','from','as','vs','into','onto','than','that','this','these','those','your','their','its','his','her','our','my','over','under','per','we','they','he','she','it','you','i','so','if','then','where','when','which','who','whom','whose','how','why',
  'в','во','на','с','со','к','ко','из','изо','за','по','о','об','обо','от','ото','до','у','под','подо','над','надо','про','без','безо','для','при','чрез','через','сквозь','не','ни','и','а','но','да','или','либо','как','что','чтоб','чтобы','где','куда','откуда','когда','пока','едва','лишь','чем','тем','если','ежели','хоть','хотя','пусть','пускай','будто','словно','точно','тот','та','то','те','этот','эта','это','эти','мой','твой','наш','ваш','его','ее','их','свой','чей','кто','свої','його','її','їх','від','під','через','при','без'
]);

const NO_LINE_START = new Set([
  'же','ж','ли','ль','бы','б','то','ка','де','таки','будь','небудь',
  "'s","'re","'ve","'d","'ll","n't","%","percent"
]);

const GLUED_PHRASES = [
  ['один', 'и', 'тот', 'же'],
  ['одна', 'и', 'та', 'же'],
  ['одно', 'и', 'то', 'же'],
  ['одни', 'и', 'те', 'же'],
  ['тот', 'же'],
  ['та', 'же'],
  ['то', 'же'],
  ['те', 'же'],
  ['так', 'же'],
  ['то', 'есть'],
  ['потому', 'что'],
  ['так', 'как'],
  ['как', 'будто'],
  ['вряд', 'ли'],
  ['едва', 'ли'],
  ['не', 'только'],
  ['в', 'том', 'числе'],
  ['и', 'так', 'далее'],
  ['с', 'одной', 'из'],
  ['на', 'этом', 'всё'],
  ['the', 'exact', 'same'],
  ['exact', 'same'],
  ['in', 'a', 'split', 'second'],
  ['split', 'second'],
  ['that', 'is', 'it'],
  ['one', 'of', 'the'],
  ['link', 'in', 'bio']
];

const UNITS = new Set(['day','days','hour','hours','min','mins','minute','minutes','sec','secs','second','seconds','week','weeks','month','months','year','years','percent','x','bps','fee','fees','долларов','доллара','рублей','рубля','гривен','секунды','секунд','минут','минуты','часов','часа','дней','дня']);
const NUM_RE = /^[\$€£₽₴]?[\d][\d,.]*%?$/;

function cleanw(s) {
  return (s || '').toLowerCase().replace(/^[^\wа-яёіїєґ'$€£₽₴%]+|[^\wа-яёіїєґ'$€£₽₴%]+$/gi, '');
}

const wlen = w => w.w.length;
const textOf = ws => ws.map(w => w.w).join(' ');
const isTerm = w => /[.!?…]+["']?$/.test(w.w);
const isSoft = w => /[,;:—–-]+["']?$/.test(w.w) && !/^-+$/.test(w.w);

function badBreak(aWord, bWord) {
  if (!aWord || !bWord) return false;
  const ca = cleanw(aWord.w || aWord);
  const cb = cleanw(bWord.w || bWord);
  if (NO_LINE_END.has(ca)) return true;
  if (NO_LINE_START.has(cb)) return true;
  if (NUM_RE.test(ca) && UNITS.has(cb)) return true;
  if (/^[\$€£₽₴]$/.test(ca) && NUM_RE.test(cb)) return true;
  for (const phrase of GLUED_PHRASES) {
    for (let k = 0; k < phrase.length - 1; k++) {
      if (phrase[k] === ca && phrase[k + 1] === cb) return true;
    }
  }
  return false;
}

function combinations(n, k) {
  if (k === 0) return [[]];
  if (k === n) return [[...Array(n).keys()].map(i => i + 1)];
  const res = [];
  function rec(start, chosen) {
    if (chosen.length === k) { res.push([...chosen]); return; }
    for (let i = start; i <= n; i++) {
      chosen.push(i);
      rec(i + 1, chosen);
      chosen.pop();
    }
  }
  rec(1, []);
  return res;
}

function splitWords(arr, cuts) {
  const res = [];
  let prev = 0;
  for (const c of cuts) {
    res.push(arr.slice(prev, c));
    prev = c;
  }
  res.push(arr.slice(prev));
  return res;
}

function breakIntoLines(ws, cfg) {
  const full = textOf(ws);
  if (full.length <= cfg.maxCharsPerLine || ws.length === 1) {
    return { lines: [ws] };
  }

  let best = null;
  const maxL = Math.min(cfg.maxLines, ws.length);
  for (let k = 2; k <= maxL; k++) {
    const cuts = combinations(ws.length - 1, k - 1);
    for (const cut of cuts) {
      const runs = splitWords(ws, cut);
      const lens = runs.map(r => textOf(r).length);
      if (Math.max(...lens) > cfg.hardMaxCharsPerLine) continue;

      let score = (Math.max(...lens) - Math.min(...lens));
      score += Math.max(0, k - cfg.targetLines) * 16;
      for (const c of cut) {
        if (badBreak(ws[c - 1], ws[c])) score += 50;
      }
      for (const r of runs) {
        if (r.length === 1 && wlen(r[0]) <= 3) score += 20;
      }
      if (!best || score < best.score) best = { score, runs };
    }
  }

  if (!best) {
    const runs = [];
    let cur = [];
    for (const w of ws) {
      const test = cur.concat([w]);
      if (textOf(test).length > cfg.maxCharsPerLine && cur.length > 0) {
        runs.push(cur);
        cur = [w];
      } else {
        cur = test;
      }
    }
    if (cur.length) runs.push(cur);
    best = { runs };
  }

  return { lines: best.runs };
}

function normalizeRawWords(rawWords) {
  const words = [];
  for (let i = 0; i < rawWords.length; i++) {
    const rw = rawWords[i];
    let wText = String(rw.word || rw.w || rw.text || '').trim();
    if (!wText) continue;

    wText = wText.replace(/\[\/?[\w\s-]+\]/g, '').replace(/<\/?[\w\s-]+>/g, '').trim();
    if (!wText) continue;

    const s = Number(rw.start !== undefined ? rw.start : (rw.s !== undefined ? rw.s : 0));
    let e = Number(rw.end !== undefined ? rw.end : (rw.e !== undefined ? rw.e : s + 0.3));
    if (e <= s) e = s + 0.25;

    const em = !!(rw.em || rw.isAccent || rw.emphasis);
    words.push({ w: wText, s, e, em });
  }
  return words;
}

function normalizeWordsToSegments(rawWords, options = {}) {
  const cfg = Object.assign({}, DEFAULTS, options);
  const words = normalizeRawWords(rawWords);

  if (words.length === 0) {
    throw new Error('No valid words found to compile.');
  }

  const gapAfter = idx => (idx + 1 < words.length) ? (words[idx + 1].s - words[idx].e) : Infinity;
  const rawPages = [];
  let buf = [];
  const flush = () => { if (buf.length) { rawPages.push(buf); buf = []; } };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    buf.push(w);

    const curLen = textOf(buf).length;
    const curDur = buf[buf.length - 1].e - buf[0].s;
    const isLast = (i === words.length - 1);
    const nextW = isLast ? null : words[i + 1];

    let shouldFlush = false;

    if (isTerm(w)) {
      shouldFlush = true;
    } else if (gapAfter(i) >= cfg.gapThreshold) {
      if (!isLast && !badBreak(w, nextW)) shouldFlush = true;
    } else if (curLen >= cfg.maxCharsPerPage || curDur >= cfg.maxPageDur) {
      if (!isLast && !badBreak(w, nextW)) shouldFlush = true;
    } else if (isSoft(w) && curLen >= 28) {
      let remainingToTerm = 0;
      for (let k = i + 1; k < words.length; k++) {
        remainingToTerm += words[k].w.length + 1;
        if (isTerm(words[k])) break;
      }
      if (remainingToTerm >= 14 && !isLast && !badBreak(w, nextW)) {
        shouldFlush = true;
      }
    }

    if (shouldFlush || isLast) {
      flush();
    }
  }
  flush();

  // Merge orphan / short pages
  const pagesW = [];
  for (let i = 0; i < rawPages.length; i++) {
    const p = rawPages[i];
    const dur = p[p.length - 1].e - p[0].s;
    const isOrphan = (p.length === 1 && textOf(p).length <= 6) || (p.length <= 2 && dur < 0.45);

    if (isOrphan) {
      let merged = false;
      if (pagesW.length) {
        const prev = pagesW[pagesW.length - 1];
        const mergedLen = textOf(prev).length + 1 + textOf(p).length;
        if (mergedLen <= cfg.maxCharsPerPage + 8) {
          prev.push(...p);
          merged = true;
          continue;
        }
      }
      if (!merged && i + 1 < rawPages.length) {
        const nextP = rawPages[i + 1];
        const mergedLen = textOf(p).length + 1 + textOf(nextP).length;
        if (mergedLen <= cfg.maxCharsPerPage + 8) {
          rawPages[i + 1].unshift(...p);
          merged = true;
          continue;
        }
      }
    }
    pagesW.push(p);
  }

  // Build normalized Segment objects
  const segments = [];
  for (let pi = 0; pi < pagesW.length; pi++) {
    const pWords = pagesW[pi];
    const pStart = pWords[0].s;
    const pEnd = pWords[pWords.length - 1].e;

    const { lines: lineRuns } = breakIntoLines(pWords, cfg);
    const outLines = [];

    for (const run of lineRuns) {
      let lineText = textOf(run);
      if (cfg.casing === 'upper') lineText = lineText.toUpperCase();

      const hasAccent = run.some(w => w.em);
      outLines.push({
        text: lineText,
        style: hasAccent ? 'accent' : 'base',
        words: run.map(w => ({
          w: (cfg.casing === 'upper') ? w.w.toUpperCase() : w.w,
          s: Number(w.s.toFixed(3)),
          e: Number(w.e.toFixed(3))
        }))
      });
    }

    if (cfg.stripFinalPeriod && outLines.length) {
      const lastLine = outLines[outLines.length - 1];
      if (lastLine.text.endsWith('.') && !lastLine.text.endsWith('..') && !lastLine.text.endsWith('...')) {
        lastLine.text = lastLine.text.slice(0, -1);
      }
    }

    const fullText = outLines.map(l => l.text).join(' ');

    segments.push({
      id: pi + 1,
      start: Number(pStart.toFixed(3)),
      end: Number(pEnd.toFixed(3)),
      text: fullText,
      lines: outLines,
      words: pWords.map(w => ({
        word: (cfg.casing === 'upper') ? w.w.toUpperCase() : w.w,
        start: Number(w.s.toFixed(3)),
        end: Number(w.e.toFixed(3))
      }))
    });
  }

  return segments;
}

module.exports = {
  DEFAULTS,
  normalizeRawWords,
  normalizeWordsToSegments,
  breakIntoLines
};

