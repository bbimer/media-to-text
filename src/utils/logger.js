'use strict';

const { pad, formatClock } = require('./paths.js');

const Logger = {
  banner() {
    console.log(`
========================================================================
  ⚡ MEDIA TO TEXT — Universal Audio, Video & YouTube Transcriber
========================================================================`);
  },

  help() {
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
  --engine <auto|local|groq|elevenlabs|openai> Force STT engine (default: auto)
  --format <all|json|srt|txt>                  Output format (default: all)
  --lang <auto|ru|en|...>                      Language code (default: auto)
  --out <dir_or_file>                          Custom output destination
  --casing <upper|asis>                        Text casing (default: upper)
  --max-chars <number>                         Max characters per page (default: 52)
  --no-cache / --force                         Bypass cache and force re-processing

YouTube Features:
  • Fast-Track: ~1-2 sec subtitle extraction (0 byte video download)
  • Phase Segmenter: Groups transcript by video chapters into readable phases
  • Fallback: If no subs exist, downloads audio stream and routes to Whisper

Examples:
  node transcribe.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  node transcribe.js "podcast.mp3" --engine local
  node transcribe.js "interview.mp4" --format txt
========================================================================
`);
  },

  info(msg) {
    console.log(msg);
  },

  warn(msg) {
    console.log(`⚠️  ${msg}`);
  },

  error(msg) {
    console.error(`❌ ${msg}`);
  },

  success(msg) {
    console.log(`✅ ${msg}`);
  },

  header(title, details = {}) {
    console.log(`\n========================================================================`);
    console.log(`🎬 ${title}`);
    for (const [k, v] of Object.entries(details)) {
      if (v !== undefined && v !== null && v !== '') {
        const label = (k + ':').padEnd(14, ' ');
        console.log(`   ${label} ${v}`);
      }
    }
    console.log(`========================================================================`);
  },

  preview(transcript, maxItems = 8) {
    const pages = transcript.segments || [];
    console.log(`\n📝 Storyboard Preview (${pages.length} pages):`);
    const slice = pages.slice(0, maxItems);
    for (const p of slice) {
      const timeCode = `${p.start.toFixed(2)}s – ${p.end.toFixed(2)}s`;
      const text = p.text || (p.lines ? p.lines.map(l => l.text).join(' / ') : '');
      const ch = p.chapterTitle ? ` [${p.chapterTitle}]` : '';
      console.log(`   [${pad(p.id, 3)}] (${timeCode})${ch}: ${text}`);
    }
    if (pages.length > maxItems) {
      console.log(`   ... and ${pages.length - maxItems} more pages.`);
    }
  },

  summary(transcript, savedFiles = []) {
    console.log(`\n========================================================================`);
    console.log(`🎉 SUCCESS! Processed ${transcript.segments.length} semantic pages (${transcript.getDuration()}s)`);
    if (transcript.chapters && transcript.chapters.length > 0) {
      console.log(`📑 Structured into ${transcript.chapters.length} Video Phases / Chapters!`);
    }
    if (savedFiles.length > 0) {
      console.log(`📦 Saved Artifacts:`);
      for (const sf of savedFiles) {
        console.log(`   • [${sf.type}] (${(sf.size / 1024).toFixed(1)} KB) ➔ ${sf.path}`);
      }
    }
    console.log(`========================================================================\n`);
  }
};

module.exports = { Logger };

