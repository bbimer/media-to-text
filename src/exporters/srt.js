'use strict';

const { formatSrtTimestamp } = require('../utils/paths.js');

class SrtExporter {
  static export(transcript) {
    const blocks = [];
    const segments = transcript.segments || [];

    for (let i = 0; i < segments.length; i++) {
      const p = segments[i];
      const range = `${formatSrtTimestamp(p.start)} --> ${formatSrtTimestamp(p.end)}`;
      const text = p.lines ? p.lines.map(l => l.text).join('\n') : (p.text || '');
      blocks.push(`${i + 1}\n${range}\n${text}\n`);
    }

    return blocks.join('\n');
  }
}

module.exports = { SrtExporter };

