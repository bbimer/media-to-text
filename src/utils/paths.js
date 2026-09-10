'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

function findYtDlp() {
  // 1. Check PATH directly
  try {
    const res = spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' });
    if (res.status === 0) return 'yt-dlp';
  } catch (e) {}

  // 2. Try where.exe yt-dlp
  try {
    const w = spawnSync('where.exe', ['yt-dlp'], { encoding: 'utf8' });
    if (w.status === 0 && w.stdout) {
      const p = w.stdout.split(/\r?\n/)[0].trim();
      if (p && fs.existsSync(p)) return p;
    }
  } catch (e) {}

  // 3. Scan common Python Scripts folders
  const localApp = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(localApp, 'Programs/Python/Python312/Scripts/yt-dlp.exe'),
    path.join(localApp, 'Programs/Python/Python311/Scripts/yt-dlp.exe'),
    path.join(localApp, 'Programs/Python/Python310/Scripts/yt-dlp.exe'),
    path.join(process.env.USERPROFILE || '', 'scoop/shims/yt-dlp.exe'),
    'C:/ProgramData/chocolatey/bin/yt-dlp.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function findLocalWhisper() {
  const rootDir = path.resolve(__dirname, '..', '..');
  const searchDirs = [
    path.join(rootDir, 'bin'),
    'C:/Users/root/Desktop/wisper/bin',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'wisper', 'bin'),
    path.join(rootDir, '..', '..', 'wisper', 'bin')
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
    path.join(rootDir, 'models'),
    'C:/Users/root/Desktop/wisper/models',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'wisper', 'models'),
    path.join(rootDir, '..', '..', 'wisper', 'models')
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

function pad(n, len) {
  let s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

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

module.exports = {
  findFfmpeg,
  findYtDlp,
  findLocalWhisper,
  pad,
  formatClock,
  formatSrtTimestamp
};

