'use strict';

const fs = require('fs');

class CaptionsEngine {
  static parse(filePathOrContent) {
    let content = filePathOrContent;
    if (fs.existsSync(filePathOrContent)) {
      content = fs.readFileSync(filePathOrContent, 'utf8');
    }

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
}

module.exports = { CaptionsEngine };

