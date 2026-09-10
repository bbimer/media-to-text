#!/usr/bin/env node
/**
 * transcribe.js — Universal Video/Audio Subtitle Extractor & Semantic Compiler (v2.7)
 *
 * Extracts word-level timestamps from ANY video or audio file (MP4, MOV, MP3, WAV, MKV, SRT, VTT)
 * and formats them into:
 *   1. Plain Text (.txt) — Clean readable transcript
 *   2. Standard Subtitles (.srt) — Timed subtitles for video players & NLEs
 *   3. After Effects Kinetic Captions (.captions.json) — Formatted for AE ScriptUI Panel
 *
 * Engines Supported:
 *   1. Local Whisper / Whisper.cpp (--engine local) [100% Offline / Free]
 *   2. Groq Whisper API (Uses GROQ_API_KEY — whisper-large-v3, ultra fast)
 *   3. ElevenLabs Scribe STT (Uses ELEVENLABS_API_KEY — scribe_v1)
 *   4. OpenAI Whisper API (Uses OPENAI_API_KEY — whisper-1)
 *   5. Direct SRT / VTT Subtitle Parser (.srt, .vtt)
 *
 * Usage:
 *   node transcribe.js "my_audio.mp3"
 *   node transcribe.js "my_audio.mp3" --engine local
 *   node transcribe.js "C:/path/to/my_video.mp4" --format all
 *   node transcribe.js "subtitles.srt" --out custom.captions.json
 *
 * Drag & Drop:
 *   Drag any video/audio (or multiple files) onto `transcribe.bat` in Windows Explorer!
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const yt = require('./src/youtube.js');

// ----------------------------- CONFIG & DEFAULTS -----------------------------
const DEFAULTS = {
  maxCharsPerLine: 24,
  hardMaxCharsPerLine: 28,
  maxLines: 2,
  targetLines: 2,
  maxCharsPerPage: 52,      // Semantic clause capacity for 2 lines
  gapThreshold: 0.35,       // Silence >= 350ms triggers clause flush
  minPageDur: 0.8,
  maxPageDur: 4.2,
  casing: 'upper',          // 'upper' | 'asis'
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

// ----------------------------- LOAD ENVIRONMENT -----------------------------
function loadEnv() {
  const envPaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env')
  ];
  for (const ep of envPaths) {
    if (fs.existsSync(ep)) {
      try {
        const content = fs.readFileSync(ep, 'utf8');
        for (const line of content.split('\n')) {
          const m = line.trim().match(/^([^#=]+)=(.*)$/);
          if (m) {
            const k = m[1].trim();
            const v = m[2].trim().replace(/^["']|["']$/g, '');
            if (!process.env[k]) process.env[k] = v;
          }
        }
      } catch (e) {}
    }
  }
}
loadEnv();

// ----------------------------- HELPERS -----------------------------
function findFfmpeg() {
  // 1. Check PATH directly
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (res.status === 0) return 'ffmpeg';
  } catch (e) {}

  // 2. Try where.exe ffmpeg
  try {
    const whereRes = spawnSync('where.exe', ['ffmpeg'], { encoding: 'utf8' });
    if (whereRes.status === 0 && whereRes.stdout) {
      const p = whereRes.stdout.split(/\r?\n/)[0].trim();
      if (p && fs.existsSync(p)) return p;
    }
  } catch (e) {}

  // 3. Dynamic scan of WinGet Gyan.FFmpeg folders
  try {
    const wingetBase = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetBase)) {
      const entries = fs.readdirSync(wingetBase);
      for (const ent of entries) {
        if (ent.toLowerCase().includes('gyan.ffmpeg')) {
          const fullEnt = path.join(wingetBase, ent);
          const subdirs = fs.readdirSync(fullEnt);
          for (const sd of subdirs) {
            const cand = path.join(fullEnt, sd, 'bin', 'ffmpeg.exe');
            if (fs.existsSync(cand)) return cand;
          }
        }
      }
    }
  } catch (e) {}

  // 4. Candidate static paths
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Links/ffmpeg.exe'),
    'C:/ffmpeg/bin/ffmpeg.exe',
    'C:/Program Files/ffmpeg/bin/ffmpeg.exe',
    'D:/ffmpeg/bin/ffmpeg.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function findLocalWhisper() {
  const searchDirs = [
    path.join(__dirname, 'bin'),
    'C:/Users/root/Desktop/wisper/bin',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'wisper', 'bin'),
    path.join(__dirname, '..', '..', 'wisper', 'bin')
  ];

  let cliPath = null;
  for (const dir of searchDirs) {
    const p = path.join(dir, 'whisper-cli.exe');
    if (fs.existsSync(p)) {
      cliPath = p;
      break;
    }
    const pMain = path.join(dir, 'main.exe');
    if (fs.existsSync(pMain)) {
      cliPath = pMain;
      break;
    }
  }

  if (!cliPath) {
    try {
      const w = spawnSync('where.exe', ['whisper-cli'], { encoding: 'utf8' });
      if (w.status === 0 && w.stdout) {
        const first = w.stdout.split(/\r?\n/)[0].trim();
        if (first && fs.existsSync(first)) cliPath = first;
      }
    } catch (e) {}
  }

  const modelDirs = [
    path.join(__dirname, 'models'),
    'C:/Users/root/Desktop/wisper/models',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'wisper', 'models'),
    path.join(__dirname, '..', '..', 'wisper', 'models')
  ];

  const modelNames = ['ggml-base.bin', 'ggml-medium.bin', 'ggml-small.bin', 'ggml-large-v3.bin', 'ggml-tiny.bin'];
  let modelPath = null;
  for (const dir of modelDirs) {
    for (const mn of modelNames) {
      const mp = path.join(dir, mn);
      if (fs.existsSync(mp)) {
        modelPath = mp;
        break;
      }
    }
    if (modelPath) break;
  }

  if (cliPath && modelPath) {
    return { cli: cliPath, model: modelPath };
  }
  return null;
}


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

// Combinations helper for line splitting
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

      let score = (Math.max(...lens) - Math.min(...lens)); // balance
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
    // Greedy fallback
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

// ----------------------------- SEMANTIC COMPILER -----------------------------
function compileWordsToCaptions(rawWords, options = {}) {
  const cfg = Object.assign({}, DEFAULTS, options);

  // 1. Clean words & timestamps
  const words = [];
  for (let i = 0; i < rawWords.length; i++) {
    const rw = rawWords[i];
    let wText = String(rw.word || rw.w || rw.text || '').trim();
    if (!wText) continue;

    // Strip any prompt tags like [emphasis], [whisper], <pause>
    wText = wText.replace(/\[\/?[\w\s-]+\]/g, '').replace(/<\/?[\w\s-]+>/g, '').trim();
    if (!wText) continue;

    const s = Number(rw.start !== undefined ? rw.start : (rw.s !== undefined ? rw.s : 0));
    let e = Number(rw.end !== undefined ? rw.end : (rw.e !== undefined ? rw.e : s + 0.3));
    if (e <= s) e = s + 0.25;

    const em = !!(rw.em || rw.isAccent || rw.emphasis);
    words.push({ w: wText, s, e, em });
  }

  if (words.length === 0) {
    throw new Error('No valid words found to compile.');
  }

  // 2. Semantic Clause Pagination
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

  // 3. Merge orphan / too-short pages into neighbors
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

  // 4. Build output pages
  const pages = [];
  let lastEnd = 0;

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

    // Strip trailing period if requested
    if (cfg.stripFinalPeriod && outLines.length) {
      const lastLine = outLines[outLines.length - 1];
      if (lastLine.text.endsWith('.') && !lastLine.text.endsWith('..') && !lastLine.text.endsWith('...')) {
        lastLine.text = lastLine.text.slice(0, -1);
      }
    }

    pages.push({
      id: pi + 1,
      start: Number(pStart.toFixed(3)),
      end: Number(pEnd.toFixed(3)),
      lines: outLines
    });

    lastEnd = Math.max(lastEnd, pEnd);
  }

  return {
    engine: 'NS-Kinetic-Typography-v2.6',
    transcribedAt: new Date().toISOString(),
    duration: Number(lastEnd.toFixed(3)),
    pagesCount: pages.length,
    pages
  };
}

// ----------------------------- TRANSCRIPTION ENGINES -----------------------------

// ENGINE 1: ElevenLabs Scribe STT
async function transcribeWithElevenLabs(audioBuffer, apiKey) {
  console.log('🎙️ Transcribing with ElevenLabs Scribe STT...');
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
  formData.append('file', blob, 'audio.mp3');
  formData.append('model_id', 'scribe_v1');
  formData.append('timestamps_granularity', 'word');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey
    },
    body: formData
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs STT error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const rawWords = (json.words || []).map(w => ({
    word: w.text || w.word,
    start: w.start,
    end: w.end,
    em: false
  }));

  return rawWords;
}

// ENGINE 2: Groq Whisper API (whisper-large-v3)
async function transcribeWithGroq(audioBuffer, apiKey) {
  console.log('⚡ Transcribing with Groq Whisper API (whisper-large-v3)...');
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
  formData.append('file', blob, 'audio.mp3');
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq Whisper error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const rawWords = (json.words || []).map(w => ({
    word: w.word,
    start: w.start,
    end: w.end,
    em: false
  }));

  return rawWords;
}

// ENGINE 3: OpenAI Whisper API
async function transcribeWithOpenAI(audioBuffer, apiKey) {
  console.log('🌐 Transcribing with OpenAI Whisper API (whisper-1)...');
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
  formData.append('file', blob, 'audio.mp3');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Whisper error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const rawWords = (json.words || []).map(w => ({
    word: w.word,
    start: w.start,
    end: w.end,
    em: false
  }));

  return rawWords;
}

// ENGINE 4: SRT / VTT Subtitle File Parser
function parseSubtitleFile(filePath) {
  console.log(`📄 Parsing subtitle file: ${filePath}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const rawWords = [];

  const timeRe = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/;
  const blocks = content.replace(/\r\n/g, '\n').split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
    let timeLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (timeRe.test(lines[i])) {
        timeLineIdx = i;
        break;
      }
    }
    if (timeLineIdx === -1) continue;

    const tm = lines[timeLineIdx].match(timeRe);
    const startSec = parseInt(tm[1], 10) * 3600 + parseInt(tm[2], 10) * 60 + parseInt(tm[3], 10) + parseInt(tm[4], 10) / 1000;
    const endSec = parseInt(tm[5], 10) * 3600 + parseInt(tm[6], 10) * 60 + parseInt(tm[7], 10) + parseInt(tm[8], 10) / 1000;

    const textLines = lines.slice(timeLineIdx + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    const tokenWords = textLines.split(/\s+/).filter(Boolean);

    if (tokenWords.length === 0) continue;

    const blockDur = Math.max(endSec - startSec, 0.3);
    const wordDur = blockDur / tokenWords.length;

    for (let wi = 0; wi < tokenWords.length; wi++) {
      const wStart = startSec + wi * wordDur;
      const wEnd = wStart + wordDur;
      rawWords.push({
        word: tokenWords[wi],
        start: wStart,
        end: wEnd,
        em: false
      });
    }
  }

  return rawWords;
}

// ----------------------------- LOCAL WHISPER ENGINE -----------------------------
function transcribeWithLocalWhisper(inputAudioPath, ffmpegPath, whisperInfo, language = 'auto') {
  console.log(`💻 Transcribing with Local Whisper (${path.basename(whisperInfo.model)})...`);
  const tempDir = path.dirname(inputAudioPath);
  const tempWav = path.join(tempDir, `temp_whisper_${Date.now()}.wav`);
  const tempOutPrefix = path.join(tempDir, `temp_whisper_out_${Date.now()}`);

  try {
    // 1. Convert/resample input audio to 16kHz mono WAV using FFmpeg
    console.log(`🎞️ Resampling audio track with FFmpeg (16kHz 16-bit mono WAV)...`);
    execSync(`"${ffmpegPath}" -y -i "${inputAudioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${tempWav}"`, { stdio: 'ignore' });

    // 2. Run whisper-cli with full token json output
    const lang = (language && language !== 'auto') ? language : 'auto';
    const cmd = `"${whisperInfo.cli}" -m "${whisperInfo.model}" -f "${tempWav}" -l ${lang} -ojf -of "${tempOutPrefix}"`;
    execSync(cmd, { stdio: 'ignore' });

    const jsonPath = `${tempOutPrefix}.json`;
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`whisper-cli failed to produce JSON output at: ${jsonPath}`);
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const rawWords = [];
    const segments = data.transcription || [];

    for (const seg of segments) {
      if (seg.tokens && seg.tokens.length > 0) {
        let curWord = '';
        let wStart = null;
        let wEnd = null;

        for (const tok of seg.tokens) {
          const tText = tok.text || '';
          if (tText.startsWith('[_TT_') || (tText.startsWith('[') && tText.endsWith(']'))) continue;

          const tokStart = (tok.offsets ? tok.offsets.from : 0) / 1000;
          const tokEnd = (tok.offsets ? tok.offsets.to : tokStart + 0.1) / 1000;

          if (tText.startsWith(' ') || tText.startsWith('\n')) {
            if (curWord.trim()) {
              rawWords.push({
                word: curWord.trim(),
                start: Number(wStart.toFixed(3)),
                end: Number(Math.max(wEnd, wStart + 0.08).toFixed(3)),
                em: false
              });
            }
            curWord = tText.trim();
            wStart = tokStart;
            wEnd = tokEnd;
          } else {
            if (curWord === '') {
              wStart = tokStart;
            }
            curWord += tText;
            wEnd = tokEnd;
          }
        }
        if (curWord.trim()) {
          rawWords.push({
            word: curWord.trim(),
            start: Number((wStart !== null ? wStart : (seg.offsets ? seg.offsets.from / 1000 : 0)).toFixed(3)),
            end: Number((wEnd !== null ? wEnd : (seg.offsets ? seg.offsets.to / 1000 : 1)).toFixed(3)),
            em: false
          });
        }
      } else {
        // Fallback: segment text split by words
        const segStart = (seg.offsets ? seg.offsets.from : 0) / 1000;
        const segEnd = (seg.offsets ? seg.offsets.to : segStart + 1) / 1000;
        const tokens = (seg.text || '').trim().split(/\s+/).filter(Boolean);
        if (tokens.length > 0) {
          const dur = Math.max(segEnd - segStart, 0.2);
          const perW = dur / tokens.length;
          for (let wi = 0; wi < tokens.length; wi++) {
            rawWords.push({
              word: tokens[wi],
              start: Number((segStart + wi * perW).toFixed(3)),
              end: Number((segStart + (wi + 1) * perW).toFixed(3)),
              em: false
            });
          }
        }
      }
    }

    return rawWords;
  } finally {
    try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch (e) {}
    try { if (fs.existsSync(`${tempOutPrefix}.json`)) fs.unlinkSync(`${tempOutPrefix}.json`); } catch (e) {}
  }
}

// ----------------------------- EXPORT HELPERS (SRT & TXT) -----------------------------
// ----------------------------- EXPORT HELPERS (SRT & TXT) -----------------------------
function formatClock(sec) {
  const total = Math.floor(Math.max(0, sec || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h > 0) return `${pad(h, 2)}:${pad(remM, 2)}:${pad(s, 2)}`;
  return `${pad(remM, 2)}:${pad(s, 2)}`;
}

function formatSrtTimestamp(sec) {
  const safeSec = Math.max(0, sec || 0);
  const totalMs = Math.round(safeSec * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function assignChaptersToPages(captionData, chapters) {
  if (!chapters || chapters.length === 0) return;
  for (const page of captionData.pages) {
    const ch = chapters.find(c => page.start >= c.start && page.start < c.end) || chapters[chapters.length - 1];
    if (ch) {
      page.chapterId = ch.id;
      page.chapterTitle = ch.title;
      page.chapterRange = `${formatClock(ch.start)} - ${formatClock(ch.end)}`;
    }
  }
}

function generateSrt(captionData) {
  const blocks = [];
  for (let i = 0; i < captionData.pages.length; i++) {
    const p = captionData.pages[i];
    const range = `${formatSrtTimestamp(p.start)} --> ${formatSrtTimestamp(p.end)}`;
    const text = p.lines.map(l => l.text).join('\n');
    blocks.push(`${i + 1}\n${range}\n${text}\n`);
  }
  return blocks.join('\n');
}

function generateCleanTxt(captionData, chapters = [], metadata = null) {
  const sections = [];

  if (metadata && metadata.title) {
    const metaHeader = [
      `========================================================================`,
      `🎬 НАЗВАНИЕ: ${metadata.title}`,
      metadata.url ? `🔗 ИСТОЧНИК: ${metadata.url}` : null,
      metadata.channel ? `📺 АВТОР:    ${metadata.channel}` : null,
      metadata.duration ? `⏱️ ХРОНОМЕТРАЖ: ${formatClock(metadata.duration)} (${metadata.duration} сек)` : null,
      `========================================================================`
    ].filter(Boolean).join('\n');
    sections.push(metaHeader);
  }

  if (!chapters || chapters.length === 0) {
    const pageTexts = captionData.pages.map(p => p.lines.map(l => l.text).join(' '));
    sections.push(pageTexts.join('\n\n'));
    return sections.join('\n\n');
  }

  // Group pages by chapter
  const chapterGroups = {};
  for (const ch of chapters) {
    chapterGroups[ch.id] = { chapter: ch, pages: [] };
  }

  for (const page of captionData.pages) {
    const cid = page.chapterId || 1;
    if (!chapterGroups[cid]) {
      chapterGroups[cid] = {
        chapter: { id: cid, title: page.chapterTitle || `Phase ${cid}`, start: page.start, end: page.end },
        pages: []
      };
    }
    chapterGroups[cid].pages.push(page);
  }

  for (const cid of Object.keys(chapterGroups)) {
    const grp = chapterGroups[cid];
    const ch = grp.chapter;
    const banner = [
      `========================================================================`,
      `📍 ФАЗА ${ch.id}: [${formatClock(ch.start)} - ${formatClock(ch.end)}] ${ch.title.toUpperCase()}`,
      `========================================================================`
    ].join('\n');

    const bodyText = grp.pages.map(p => p.lines.map(l => l.text).join(' ')).join('\n\n');
    sections.push(`${banner}\n\n${bodyText || '—'}`);
  }

  return sections.join('\n\n');
}

// ----------------------------- MAIN CLI ENTRYPOINT -----------------------------
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
========================================================================
  ⚡ MEDIA TO TEXT — Universal Audio, Video & YouTube Transcriber
========================================================================

Usage:
  node transcribe.js <media_path_or_youtube_url> [options]

Supported Inputs:
  • YouTube:  https://www.youtube.com/watch?v=... / youtu.be/... / Shorts / Video ID
  • Audio:    .mp3, .wav, .m4a, .aac, .flac, .ogg
  • Video:    .mp4, .mov, .mkv, .webm, .avi, .flv
  • Captions: .srt, .vtt

Options:
  --engine <local|groq|elevenlabs|openai>  Force STT engine (default: auto-detected)
  --format <all|json|srt|txt>              Output format (default: all — saves .txt, .srt & .json)
  --lang <auto|ru|en|...>                  Spoken language (default: auto)
  --out <filename_or_dir>                  Custom output file or directory
  --casing <upper|asis>                    Text casing (default: upper)
  --max-chars <number>                     Max characters per page (default: 52)

YouTube Features:
  • Fast-Track Subtitle Extraction: ~1-2 sec, zero video/audio download!
  • Smart Phase & Chapter Mapping: Parses video chapters & structures text into phases.
  • Fallback Engine: If no subtitles exist, automatically downloads audio and runs Whisper.

Examples:
  node transcribe.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  node transcribe.js "voiceover.mp3" --engine local
  node transcribe.js "interview.mp4" --format txt
========================================================================
`);
    process.exit(0);
  }

  const rawInput = args[0];
  const isYt = yt.isYouTubeInput(rawInput);

  // Parse CLI flags
  const getArg = (flag, def = null) => {
    const idx = args.indexOf(flag);
    return (idx !== -1 && args[idx + 1]) ? args[idx + 1] : def;
  };

  const formatChoice = (getArg('--format', 'all') || 'all').toLowerCase();
  const langChoice = getArg('--lang', 'auto') || 'auto';
  const casingChoice = getArg('--casing', DEFAULTS.casing);
  const maxCharsChoice = parseInt(getArg('--max-chars', String(DEFAULTS.maxCharsPerPage)), 10) || DEFAULTS.maxCharsPerPage;
  const customOut = getArg('--out', null);

  let inputPath = '';
  let metadata = null;
  let chapters = [];
  let baseName = '';
  let inputDir = process.cwd();
  let tempAudioToCleanup = null;
  let tempSubToCleanup = null;

  if (isYt) {
    const ytdlp = yt.findYtDlp();
    if (!ytdlp) {
      console.error('❌ Error: yt-dlp is required to process YouTube links.');
      console.error('   Please install yt-dlp: pip install yt-dlp');
      process.exit(1);
    }

    metadata = yt.fetchYouTubeMetadata(rawInput, ytdlp);
    chapters = metadata.chapters || [];

    console.log(`\n========================================================================`);
    console.log(`🎬 YouTube Video: ${metadata.title}`);
    console.log(`📺 Channel:       ${metadata.channel}`);
    console.log(`⏱️ Duration:      ${formatClock(metadata.duration)} (${metadata.duration}s)`);
    console.log(`📑 Chapters:      ${chapters.length ? chapters.length + ' detected' : 'None detected'}`);
    console.log(`📋 Formats:       ${formatChoice.toUpperCase()}`);
    console.log(`========================================================================`);

    const safeTitle = metadata.title.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || `youtube_${metadata.id}`;
    baseName = safeTitle;
  } else {
    inputPath = path.resolve(rawInput);
    if (!fs.existsSync(inputPath)) {
      console.error(`❌ Error: File not found: ${inputPath}`);
      process.exit(1);
    }
    const ext = path.extname(inputPath).toLowerCase();
    baseName = path.basename(inputPath, ext);
    inputDir = path.dirname(inputPath);

    console.log(`\n========================================================================`);
    console.log(`🎬 Input File:  ${inputPath}`);
    console.log(`📋 Formats:     ${formatChoice.toUpperCase()}`);
    console.log(`========================================================================`);
  }

  // Setup output paths
  let outBase = path.join(inputDir, baseName);
  if (customOut) {
    const resolvedOut = path.resolve(customOut);
    if (fs.existsSync(resolvedOut) && fs.statSync(resolvedOut).isDirectory()) {
      outBase = path.join(resolvedOut, baseName);
    } else {
      const outExt = path.extname(resolvedOut);
      if (outExt) {
        outBase = path.join(path.dirname(resolvedOut), path.basename(resolvedOut, outExt));
      } else {
        outBase = resolvedOut;
      }
    }
  }

  const jsonOutputPath = `${outBase}.captions.json`;
  const srtOutputPath = `${outBase}.srt`;
  const txtOutputPath = `${outBase}.txt`;

  let rawWords = [];

  if (isYt) {
    const ytdlp = yt.findYtDlp();
    const subLangs = langChoice !== 'auto' ? [langChoice] : ['ru', 'en'];
    const subResult = yt.downloadYouTubeSubtitles(metadata.url, inputDir, ytdlp, metadata, subLangs);

    if (subResult) {
      console.log(`⚡ Fast-Track: Extracted YouTube subtitles (${subResult.lang}) in ~1 sec (zero video downloaded)!`);
      tempSubToCleanup = subResult.filePath;
      rawWords = parseSubtitleFile(subResult.filePath);
    } else {
      console.log(`⚠️ No ready subtitles found on YouTube. Falling back to Audio Stream + Whisper...`);
      const downloadedAudio = yt.downloadYouTubeAudioFallback(metadata.url, inputDir, ytdlp);
      tempAudioToCleanup = downloadedAudio;
      inputPath = downloadedAudio;
    }
  }

  // If not extracted via YouTube subtitles, process inputPath (local file or downloaded fallback audio)
  if (rawWords.length === 0 && inputPath) {
    const ext = path.extname(inputPath).toLowerCase();
    if (ext === '.srt' || ext === '.vtt') {
      rawWords = parseSubtitleFile(inputPath);
    } else {
      // Select Transcription Engine
      let engineChoice = (getArg('--engine', '') || '').toLowerCase();
      const ffmpeg = findFfmpeg();
      const localWhisper = findLocalWhisper();

      if (!engineChoice) {
        if (process.env.GROQ_API_KEY) engineChoice = 'groq';
        else if (process.env.ELEVENLABS_API_KEY) engineChoice = 'elevenlabs';
        else if (process.env.OPENAI_API_KEY) engineChoice = 'openai';
        else if (localWhisper) engineChoice = 'local';
        else {
          console.error('❌ Error: No API keys found in .env and local Whisper was not found.');
          console.error('   Please add GROQ_API_KEY, ELEVENLABS_API_KEY, or OPENAI_API_KEY to .env,');
          console.error('   or place whisper-cli.exe in bin/ and ggml-base.bin in models/.');
          process.exit(1);
        }
      }

      if (engineChoice === 'local') {
        if (!localWhisper) {
          console.error('❌ Error: Local Whisper was not found (whisper-cli.exe or model missing).');
          process.exit(1);
        }
        if (!ffmpeg) {
          console.error('❌ Error: FFmpeg is required for audio resampling with Local Whisper.');
          process.exit(1);
        }
        rawWords = transcribeWithLocalWhisper(inputPath, ffmpeg, localWhisper, langChoice);
      } else {
        // Cloud engines: ElevenLabs, Groq, OpenAI
        let audioBuffer = null;
        const isVideo = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.flv'].includes(ext);

        if (isVideo || ext !== '.mp3') {
          if (!ffmpeg) {
            console.error(`❌ Error: FFmpeg is required to process ${ext} files.`);
            process.exit(1);
          }
          const tempAudioPath = path.join(inputDir, `temp_${Date.now()}.mp3`);
          console.log(`🎞️ Converting audio track via FFmpeg...`);
          try {
            execSync(`"${ffmpeg}" -y -i "${inputPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 -q:a 4 "${tempAudioPath}"`, { stdio: 'ignore' });
            audioBuffer = fs.readFileSync(tempAudioPath);
            fs.unlinkSync(tempAudioPath);
          } catch (errFfmpeg) {
            if (fs.existsSync(tempAudioPath)) try { fs.unlinkSync(tempAudioPath); } catch (e) {}
            console.error('❌ FFmpeg audio extraction failed:', errFfmpeg.message);
            process.exit(1);
          }
        } else {
          audioBuffer = fs.readFileSync(inputPath);
        }

        if (engineChoice === 'groq') {
          if (!process.env.GROQ_API_KEY) {
            console.error('❌ Error: GROQ_API_KEY not found in .env');
            process.exit(1);
          }
          rawWords = await transcribeWithGroq(audioBuffer, process.env.GROQ_API_KEY);
        } else if (engineChoice === 'elevenlabs') {
          if (!process.env.ELEVENLABS_API_KEY) {
            console.error('❌ Error: ELEVENLABS_API_KEY not found in .env');
            process.exit(1);
          }
          rawWords = await transcribeWithElevenLabs(audioBuffer, process.env.ELEVENLABS_API_KEY);
        } else if (engineChoice === 'openai') {
          if (!process.env.OPENAI_API_KEY) {
            console.error('❌ Error: OPENAI_API_KEY not found in .env');
            process.exit(1);
          }
          rawWords = await transcribeWithOpenAI(audioBuffer, process.env.OPENAI_API_KEY);
        } else {
          console.error(`❌ Error: Unknown engine "${engineChoice}". Use local, elevenlabs, groq, or openai.`);
          process.exit(1);
        }
      }
    }
  }

  // Cleanup temp files
  if (tempSubToCleanup && fs.existsSync(tempSubToCleanup)) {
    try { fs.unlinkSync(tempSubToCleanup); } catch (e) {}
  }
  if (tempAudioToCleanup && fs.existsSync(tempAudioToCleanup)) {
    try { fs.unlinkSync(tempAudioToCleanup); } catch (e) {}
  }

  console.log(`✅ Extracted ${rawWords.length} words with word-level timestamps.`);

  // 3. Compile with Semantic Pagination Engine
  console.log(`🧠 Compiling with Semantic Clause Pagination Engine...`);
  const captionData = compileWordsToCaptions(rawWords, {
    casing: casingChoice,
    maxCharsPerPage: maxCharsChoice
  });

  if (metadata) {
    captionData.metadata = {
      title: metadata.title,
      url: metadata.url,
      channel: metadata.channel,
      duration: metadata.duration
    };
  }

  if (chapters.length > 0) {
    captionData.chapters = chapters;
    assignChaptersToPages(captionData, chapters);
  }

  // 4. Save formatted outputs based on formatChoice
  const savedFiles = [];

  const shouldSaveJson = ['all', 'json'].includes(formatChoice);
  const shouldSaveSrt = ['all', 'srt'].includes(formatChoice);
  const shouldSaveTxt = ['all', 'txt'].includes(formatChoice);

  if (shouldSaveJson) {
    fs.writeFileSync(jsonOutputPath, JSON.stringify(captionData, null, 2), 'utf8');
    savedFiles.push({ type: 'After Effects JSON', path: jsonOutputPath, size: fs.statSync(jsonOutputPath).size });
  }

  if (shouldSaveSrt) {
    const srtContent = generateSrt(captionData);
    fs.writeFileSync(srtOutputPath, srtContent, 'utf8');
    savedFiles.push({ type: 'Standard Subtitles (SRT)', path: srtOutputPath, size: fs.statSync(srtOutputPath).size });
  }

  if (shouldSaveTxt) {
    const txtContent = generateCleanTxt(captionData, chapters, metadata);
    fs.writeFileSync(txtOutputPath, txtContent, 'utf8');
    savedFiles.push({ type: 'Plain Text Transcript (TXT)', path: txtOutputPath, size: fs.statSync(txtOutputPath).size });
  }

  console.log(`\n========================================================================`);
  console.log(`🎉 SUCCESS! Compiled ${captionData.pages.length} semantic subtitle pages (${captionData.duration}s)`);
  if (chapters.length > 0) {
    console.log(`📑 Structured into ${chapters.length} Video Phases / Chapters!`);
  }
  console.log(`📦 Saved Artifacts:`);
  for (const sf of savedFiles) {
    console.log(`   • [${sf.type}] (${(sf.size / 1024).toFixed(1)} KB) ➔ ${sf.path}`);
  }
  console.log(`========================================================================\n`);

  console.log(`📝 Storyboard Preview (${captionData.pages.length} pages):`);
  const previewPages = captionData.pages.slice(0, 8);
  for (const page of previewPages) {
    const timeCode = `${page.start.toFixed(2)}s – ${page.end.toFixed(2)}s`;
    const linesStr = page.lines.map(l => l.text).join(' / ');
    const chTag = page.chapterTitle ? ` [${page.chapterTitle}]` : '';
    console.log(`   [${pad(page.id, 3)}] (${timeCode})${chTag}: ${linesStr}`);
  }
  if (captionData.pages.length > 8) {
    console.log(`   ... and ${captionData.pages.length - 8} more pages.`);
  }

  if (shouldSaveJson) {
    console.log(`\n🎬 HOW TO USE IN AFTER EFFECTS:`);
    console.log(`  1. Open After Effects ➔ Window ➔ elevenlabs-after-effects-subtitles.jsx`);
    console.log(`  2. Click "📂 Browse JSON" and select: ${path.basename(jsonOutputPath)}`);
    console.log(`  3. Choose your Kinetic Mode (Mode 1..6) and click "🎬 BUILD SUBTITLES"!\n`);
  }
}

function pad(n, len) {
  let s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

if (require.main === module) {
  main().catch(err => {
    console.error('\n❌ Fatal Error:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  compileWordsToCaptions,
  parseSubtitleFile
};


