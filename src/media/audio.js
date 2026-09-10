'use strict';

const path = require('path');

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.wma', '.opus']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.m4v']);
const SUBTITLE_EXTS = new Set(['.srt', '.vtt']);

function isAudioFile(filePath) {
  return AUDIO_EXTS.has(path.extname(filePath || '').toLowerCase());
}

function isVideoFile(filePath) {
  return VIDEO_EXTS.has(path.extname(filePath || '').toLowerCase());
}

function isSubtitleFile(filePath) {
  return SUBTITLE_EXTS.has(path.extname(filePath || '').toLowerCase());
}

function isMediaFile(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  return AUDIO_EXTS.has(ext) || VIDEO_EXTS.has(ext) || SUBTITLE_EXTS.has(ext);
}

module.exports = {
  AUDIO_EXTS,
  VIDEO_EXTS,
  SUBTITLE_EXTS,
  isAudioFile,
  isVideoFile,
  isSubtitleFile,
  isMediaFile
};

