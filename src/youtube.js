"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync, execSync } = require("child_process");

const YT_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i;

function isYouTubeInput(input) {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  if (YT_REGEX.test(trimmed)) return true;
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) && !fs.existsSync(trimmed)) return true;
  return false;
}

function extractVideoId(input) {
  if (!input) return null;
  const m = input.trim().match(YT_REGEX);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  return null;
}

function findYtDlp() {
  // 1. Check PATH directly
  try {
    const res = spawnSync("yt-dlp", ["--version"], { stdio: "ignore" });
    if (res.status === 0) return "yt-dlp";
  } catch (e) {}

  // 2. Try where.exe yt-dlp
  try {
    const w = spawnSync("where.exe", ["yt-dlp"], { encoding: "utf8" });
    if (w.status === 0 && w.stdout) {
      const p = w.stdout.split(/\r?\n/)[0].trim();
      if (p && fs.existsSync(p)) return p;
    }
  } catch (e) {}

  // 3. Scan common Python Scripts folders
  const localApp = process.env.LOCALAPPDATA || "";
  const candidates = [
    path.join(localApp, "Programs/Python/Python312/Scripts/yt-dlp.exe"),
    path.join(localApp, "Programs/Python/Python311/Scripts/yt-dlp.exe"),
    path.join(localApp, "Programs/Python/Python310/Scripts/yt-dlp.exe"),
    path.join(process.env.USERPROFILE || "", "scoop/shims/yt-dlp.exe"),
    "C:/ProgramData/chocolatey/bin/yt-dlp.exe"
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function parseChaptersFromDescription(desc, totalDuration = 0) {
  if (!desc) return [];
  const chapters = [];
  const re = /(?:^|\n)\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:]?\s*([^\r\n]+)/g;
  let match;
  while ((match = re.exec(desc)) !== null) {
    const h = match[1] ? parseInt(match[1], 10) : 0;
    const m = parseInt(match[2], 10);
    const s = parseInt(match[3], 10);
    const start = h * 3600 + m * 60 + s;
    const title = match[4].replace(/^[-–—:]\s*/, "").trim();
    if (title && (chapters.length === 0 || start > chapters[chapters.length - 1].start)) {
      chapters.push({ start, title });
    }
  }

  for (let i = 0; i < chapters.length; i++) {
    chapters[i].id = i + 1;
    if (i + 1 < chapters.length) {
      chapters[i].end = chapters[i + 1].start;
    } else {
      chapters[i].end = totalDuration > chapters[i].start ? totalDuration : chapters[i].start + 120;
    }
  }
  return chapters;
}

function fetchYouTubeMetadata(urlOrId, ytdlpPath) {
  const videoId = extractVideoId(urlOrId);
  const fullUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : urlOrId;

  console.log(`🔍 Inspecting YouTube metadata via yt-dlp...`);
  const res = spawnSync(ytdlpPath, ["--dump-json", "--skip-download", "--no-warnings", fullUrl], {
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024
  });

  if (res.status !== 0 || !res.stdout) {
    throw new Error(`Failed to fetch YouTube metadata: ${res.stderr || "Unknown error"}`);
  }

  let data;
  try {
    data = JSON.parse(res.stdout);
  } catch (err) {
    throw new Error(`Failed to parse yt-dlp JSON: ${err.message}`);
  }

  const duration = data.duration || 0;
  let chapters = [];

  if (Array.isArray(data.chapters) && data.chapters.length > 0) {
    chapters = data.chapters.map((c, idx) => ({
      id: idx + 1,
      title: c.title || `Phase ${idx + 1}`,
      start: c.start_time,
      end: c.end_time
    }));
  } else {
    chapters = parseChaptersFromDescription(data.description, duration);
  }

  // Collect available subtitle language codes
  const manualSubs = Object.keys(data.subtitles || {});
  const autoSubs = Object.keys(data.automatic_captions || {});

  return {
    id: data.id,
    url: fullUrl,
    title: data.title || "YouTube Video",
    channel: data.uploader || data.channel || "Unknown",
    duration,
    chapters,
    manualSubs,
    autoSubs
  };
}

function downloadYouTubeSubtitles(url, targetDir, ytdlpPath, metadata, preferredLangs = ["ru", "en"]) {
  const tempPrefix = path.join(targetDir, `yt_subs_${Date.now()}`);

  // Determine best subtitle language
  let chosenLang = null;
  for (const lang of preferredLangs) {
    if (metadata.manualSubs.includes(lang)) { chosenLang = lang; break; }
  }
  if (!chosenLang) {
    for (const lang of preferredLangs) {
      if (metadata.autoSubs.includes(lang)) { chosenLang = lang; break; }
    }
  }
  if (!chosenLang) {
    if (metadata.manualSubs.length > 0) chosenLang = metadata.manualSubs[0];
    else if (metadata.autoSubs.length > 0) chosenLang = metadata.autoSubs[0];
  }

  if (!chosenLang) {
    return null; // No subtitles available at all
  }

  console.log(`📥 Downloading YouTube subtitles (lang: ${chosenLang}) [Fast-Track: ~1 sec]...`);
  const outTemplate = `${tempPrefix}.%(ext)s`;

  const args = [
    "--skip-download",
    "--write-sub",
    "--write-auto-sub",
    "--sub-lang", chosenLang,
    "--sub-format", "srt/vtt",
    "-o", outTemplate,
    "--no-warnings",
    url
  ];

  spawnSync(ytdlpPath, args, { stdio: "ignore" });

  // Search for the output file
  const files = fs.readdirSync(targetDir);
  const matched = files.find(f => f.startsWith(path.basename(tempPrefix)) && (f.endsWith(".srt") || f.endsWith(".vtt")));
  if (!matched) return null;

  const downloadedPath = path.join(targetDir, matched);
  return {
    filePath: downloadedPath,
    lang: chosenLang
  };
}

function downloadYouTubeAudioFallback(url, targetDir, ytdlpPath) {
  const tempAudioBase = path.join(targetDir, `yt_audio_${Date.now()}`);
  console.log(`⚡ YouTube Fallback: No subtitles found. Downloading audio stream only...`);

  const args = [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "5",
    "-o", `${tempAudioBase}.%(ext)s`,
    "--no-warnings",
    url
  ];

  const res = spawnSync(ytdlpPath, args, { stdio: "inherit" });
  const files = fs.readdirSync(targetDir);
  const matched = files.find(f => f.startsWith(path.basename(tempAudioBase)) && f.endsWith(".mp3"));

  if (!matched) {
    throw new Error("Failed to download YouTube audio stream fallback");
  }
  return path.join(targetDir, matched);
}

module.exports = {
  isYouTubeInput,
  extractVideoId,
  findYtDlp,
  parseChaptersFromDescription,
  fetchYouTubeMetadata,
  downloadYouTubeSubtitles,
  downloadYouTubeAudioFallback
};
