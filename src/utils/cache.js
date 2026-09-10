'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CacheManager {
  constructor(cacheDir = null) {
    this.cacheDir = cacheDir || path.resolve(__dirname, '..', '..', '.cache');
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (e) {}
    }
  }

  getCacheKey(sourceInfo) {
    if (sourceInfo.isYouTube && sourceInfo.videoId) {
      return sourceInfo.videoId;
    }
    if (sourceInfo.filePath) {
      try {
        const stats = fs.statSync(sourceInfo.filePath);
        const raw = `${sourceInfo.filePath}_${stats.size}_${stats.mtimeMs}`;
        return crypto.createHash('md5').update(raw).digest('hex').slice(0, 16);
      } catch (e) {
        return crypto.createHash('md5').update(sourceInfo.filePath).digest('hex').slice(0, 16);
      }
    }
    return crypto.createHash('md5').update(String(sourceInfo.rawInput)).digest('hex').slice(0, 16);
  }

  getItemDir(key) {
    return path.join(this.cacheDir, key);
  }

  has(key) {
    const itemDir = this.getItemDir(key);
    const transcriptFile = path.join(itemDir, 'transcript.json');
    return fs.existsSync(transcriptFile);
  }

  get(key) {
    const itemDir = this.getItemDir(key);
    const transcriptFile = path.join(itemDir, 'transcript.json');
    const metadataFile = path.join(itemDir, 'metadata.json');

    if (!fs.existsSync(transcriptFile)) return null;

    try {
      const transcriptData = JSON.parse(fs.readFileSync(transcriptFile, 'utf8'));
      let metadata = null;
      if (fs.existsSync(metadataFile)) {
        metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
      }
      return { transcriptData, metadata };
    } catch (e) {
      return null;
    }
  }

  set(key, { transcriptData, metadata = null, rawSubtitles = null }) {
    const itemDir = this.getItemDir(key);
    if (!fs.existsSync(itemDir)) {
      fs.mkdirSync(itemDir, { recursive: true });
    }

    if (transcriptData) {
      fs.writeFileSync(path.join(itemDir, 'transcript.json'), JSON.stringify(transcriptData, null, 2), 'utf8');
    }
    if (metadata) {
      fs.writeFileSync(path.join(itemDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
    }
    if (rawSubtitles) {
      fs.writeFileSync(path.join(itemDir, 'captions.srt'), rawSubtitles, 'utf8');
    }
  }
}

module.exports = { CacheManager };

