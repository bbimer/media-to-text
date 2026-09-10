'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { findLocalWhisper } = require('../utils/paths.js');
const { FfmpegProcessor } = require('../media/ffmpeg.js');

class WhisperLocalEngine {
  constructor() {
    this.whisperInfo = findLocalWhisper();
    this.ffmpeg = new FfmpegProcessor();
  }

  isAvailable() {
    return !!(this.whisperInfo && this.ffmpeg.isAvailable());
  }

  transcribe(inputAudioPath, language = 'auto') {
    if (!this.whisperInfo) {
      throw new Error('Local Whisper binary (whisper-cli.exe) or GGML model not found.');
    }
    if (!this.ffmpeg.isAvailable()) {
      throw new Error('FFmpeg is required to resample audio for Local Whisper.');
    }

    const tempDir = path.dirname(inputAudioPath);
    const tempWav = path.join(tempDir, `temp_whisper_${Date.now()}.wav`);
    const tempOutPrefix = path.join(tempDir, `temp_whisper_out_${Date.now()}`);

    try {
      // 1. Resample to 16kHz mono WAV
      this.ffmpeg.resampleTo16kMonoWav(inputAudioPath, tempWav);

      // 2. Run whisper-cli with full token JSON output
      const lang = (language && language !== 'auto') ? language : 'auto';
      const cmd = `"${this.whisperInfo.cli}" -m "${this.whisperInfo.model}" -f "${tempWav}" -l ${lang} -ojf -of "${tempOutPrefix}"`;
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
}

module.exports = { WhisperLocalEngine };

