'use strict';

const fs = require('fs');
const path = require('path');
const { isAudioFile, isVideoFile, isSubtitleFile } = require('../media/audio.js');

class LocalFileSource {
  static resolve(filePath) {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }

    const ext = path.extname(absPath).toLowerCase();
    const baseName = path.basename(absPath, ext);
    const dir = path.dirname(absPath);
    const stats = fs.statSync(absPath);

    return {
      filePath: absPath,
      ext,
      baseName,
      dir,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      isAudio: isAudioFile(absPath),
      isVideo: isVideoFile(absPath),
      isSubtitle: isSubtitleFile(absPath)
    };
  }
}

module.exports = { LocalFileSource };

