'use strict';

const { formatClock } = require('../utils/paths.js');

class TxtExporter {
  static export(transcript) {
    const sections = [];
    const meta = transcript.metadata || {};

    if (meta.title) {
      const metaHeader = [
        `========================================================================`,
        `🎬 НАЗВАНИЕ: ${meta.title}`,
        meta.url ? `🔗 ИСТОЧНИК: ${meta.url}` : null,
        meta.channel ? `📺 АВТОР:    ${meta.channel}` : null,
        meta.duration ? `⏱️ ХРОНОМЕТРАЖ: ${formatClock(meta.duration)} (${meta.duration} сек)` : null,
        `========================================================================`
      ].filter(Boolean).join('\n');
      sections.push(metaHeader);
    }

    const chapters = transcript.chapters || [];
    const segments = transcript.segments || [];

    if (!chapters || chapters.length === 0) {
      const segTexts = segments.map(p => {
        if (p.lines && p.lines.length > 0) {
          return p.lines.map(l => l.text).join(' ');
        }
        return p.text || '';
      });
      sections.push(segTexts.join('\n\n'));
      return sections.join('\n\n');
    }

    // Group segments by chapter
    const chapterGroups = {};
    for (const ch of chapters) {
      chapterGroups[ch.id] = { chapter: ch, segments: [] };
    }

    for (const seg of segments) {
      const cid = seg.chapterId || 1;
      if (!chapterGroups[cid]) {
        chapterGroups[cid] = {
          chapter: { id: cid, title: seg.chapterTitle || `Phase ${cid}`, start: seg.start, end: seg.end },
          segments: []
        };
      }
      chapterGroups[cid].segments.push(seg);
    }

    for (const cid of Object.keys(chapterGroups)) {
      const grp = chapterGroups[cid];
      const ch = grp.chapter;
      const banner = [
        `========================================================================`,
        `📍 ФАЗА ${ch.id}: [${formatClock(ch.start)} - ${formatClock(ch.end)}] ${ch.title.toUpperCase()}`,
        `========================================================================`
      ].join('\n');

      const bodyText = grp.segments.map(p => {
        const text = p.lines ? p.lines.map(l => l.text).join(' ') : (p.text || '');
        const time = `(${formatClock(p.start)} - ${formatClock(p.end)})`;
        return `${time} ${text}`;
      }).join('\n');

      sections.push(`${banner}\n\n${bodyText || '—'}`);
    }

    return sections.join('\n\n');
  }
}

module.exports = { TxtExporter };

