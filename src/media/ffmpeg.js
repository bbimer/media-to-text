'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { findFfmpeg } = require('../utils/paths.js');

class FfmpegProcessor {
  constructor() {
    this.ffmpegPath = findFfmpeg();
  }

  isAvailable() {
    return !!this.ffmpegPath;
  }

  resampleTo16kMonoWav(inputPath, outputPath) {
    if (!this.ffmpegPath) {
      throw new Error('FFmpeg was not found on this system. Please install FFmpeg or add it to PATH.');
    }
    const cmd = `"${this.ffmpegPath}" -y -i "${inputPath}" -vn -sn -dn -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`;
    execSync(cmd, { stdio: 'ignore' });
    if (!fs.existsSync(outputPath)) {
      throw new Error(`FFmpeg failed to create WAV file at: ${outputPath}`);
    }
    return outputPath;
  }

  extractMp3Buffer(inputPath, tempDir) {
    if (!this.ffmpegPath) {
      throw new Error('FFmpeg was not found on this system.');
    }
    const tempMp3 = path.join(tempDir, `temp_audio_${Date.now()}.mp3`);
    try {
      const cmd = `"${this.ffmpegPath}" -y -i "${inputPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 -q:a 4 "${tempMp3}"`;
      execSync(cmd, { stdio: 'ignore' });
      const buffer = fs.readFileSync(tempMp3);
      return buffer;
    } finally {
      if (fs.existsSync(tempMp3)) {
        try { fs.unlinkSync(tempMp3); } catch (e) {}
      }
    }
  }
}

module.exports = { FfmpegProcessor };

