'use strict';

const { formatClock } = require('../utils/paths.js');

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
    const title = match[4].replace(/^[-–—:]\s*/, '').trim();
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

function assignChaptersToSegments(segments, chapters) {
  if (!chapters || chapters.length === 0 || !segments) return segments;

  for (const seg of segments) {
    const ch = chapters.find(c => seg.start >= c.start && seg.start < c.end) || chapters[chapters.length - 1];
    if (ch) {
      seg.chapterId = ch.id;
      seg.chapterTitle = ch.title;
      seg.chapterRange = `${formatClock(ch.start)} - ${formatClock(ch.end)}`;
    }
  }
  return segments;
}

module.exports = {
  parseChaptersFromDescription,
  assignChaptersToSegments
};

