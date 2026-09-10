'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { findYtDlp } = require('../utils/paths.js');
const { parseChaptersFromDescription } = require('../transcript/chapters.js');

const YT_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i;

class YouTubeSource {
  constructor() {
    this.ytdlpPath = findYtDlp();
  }

  isAvailable() {
    return !!this.ytdlpPath;
  }

  static isYouTubeInput(input) {
    if (!input || typeof input !== 'string') return false;
    const trimmed = input.trim();
    if (YT_REGEX.test(trimmed)) return true;
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) && !fs.existsSync(trimmed)) return true;
    return false;
  }

  static extractVideoId(input) {
    if (!input) return null;
    const m = input.trim().match(YT_REGEX);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
    return null;
  }

  fetchMetadata(urlOrId) {
    if (!this.ytdlpPath) {
      throw new Error('yt-dlp is required to inspect YouTube links. Install it via: pip install yt-dlp');
    }

    const videoId = YouTubeSource.extractVideoId(urlOrId);
    const fullUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : urlOrId;

    const res = spawnSync(this.ytdlpPath, ['--dump-json', '--skip-download', '--no-warnings', fullUrl], {
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024
    });

    if (res.status !== 0 || !res.stdout) {
      throw new Error(`Failed to fetch YouTube metadata: ${res.stderr || 'Unknown error'}`);
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

    const manualSubs = Object.keys(data.subtitles || {});
    const autoSubs = Object.keys(data.automatic_captions || {});

    return {
      id: data.id,
      url: fullUrl,
      title: data.title || 'YouTube Video',
      channel: data.uploader || data.channel || 'Unknown',
      duration,
      chapters,
      manualSubs,
      autoSubs
    };
  }

  downloadSubtitles(url, targetDir, metadata, preferredLangs = ['ru', 'en']) {
    if (!this.ytdlpPath) throw new Error('yt-dlp is not available');

    const tempPrefix = path.join(targetDir, `yt_subs_${Date.now()}`);

    let chosenLang = null;
    for (const lang of preferredLangs) {
      if (metadata.manualSubs && metadata.manualSubs.includes(lang)) { chosenLang = lang; break; }
    }
    if (!chosenLang) {
      for (const lang of preferredLangs) {
        if (metadata.autoSubs && metadata.autoSubs.includes(lang)) { chosenLang = lang; break; }
      }
    }
    if (!chosenLang) {
      if (metadata.manualSubs && metadata.manualSubs.length > 0) chosenLang = metadata.manualSubs[0];
      else if (metadata.autoSubs && metadata.autoSubs.length > 0) chosenLang = metadata.autoSubs[0];
    }

    if (!chosenLang) return null;

    const outTemplate = `${tempPrefix}.%(ext)s`;
    const args = [
      '--skip-download',
      '--write-sub',
      '--write-auto-sub',
      '--sub-lang', chosenLang,
      '--sub-format', 'srt/vtt',
      '-o', outTemplate,
      '--no-warnings',
      url
    ];

    spawnSync(this.ytdlpPath, args, { stdio: 'ignore' });

    const files = fs.readdirSync(targetDir);
    const matched = files.find(f => f.startsWith(path.basename(tempPrefix)) && (f.endsWith('.srt') || f.endsWith('.vtt')));
    if (!matched) return null;

    return {
      filePath: path.join(targetDir, matched),
      lang: chosenLang
    };
  }

  downloadAudioStreamFallback(url, targetDir) {
    if (!this.ytdlpPath) throw new Error('yt-dlp is not available');

    const tempAudioBase = path.join(targetDir, `yt_audio_${Date.now()}`);
    const args = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '5',
      '-o', `${tempAudioBase}.%(ext)s`,
      '--no-warnings',
      url
    ];

    spawnSync(this.ytdlpPath, args, { stdio: 'ignore' });

    const files = fs.readdirSync(targetDir);
    const matched = files.find(f => f.startsWith(path.basename(tempAudioBase)) && f.endsWith('.mp3'));
    if (!matched) {
      throw new Error('Failed to download YouTube audio stream fallback');
    }
    return path.join(targetDir, matched);
  }
}

module.exports = { YouTubeSource };

