'use strict';

class CaptionsJsonExporter {
  static export(transcript) {
    const data = {
      engine: 'NS-Kinetic-Typography-v2.7',
      transcribedAt: new Date().toISOString(),
      duration: transcript.getDuration(),
      pagesCount: transcript.segments ? transcript.segments.length : 0,
      metadata: transcript.metadata || {},
      chapters: transcript.chapters || [],
      pages: (transcript.segments || []).map(seg => ({
        id: seg.id,
        start: seg.start,
        end: seg.end,
        chapterId: seg.chapterId,
        chapterTitle: seg.chapterTitle,
        chapterRange: seg.chapterRange,
        lines: seg.lines || [
          {
            text: seg.text,
            style: 'base',
            words: (seg.words || []).map(w => ({
              w: w.word || w.w,
              s: w.start !== undefined ? w.start : w.s,
              e: w.end !== undefined ? w.end : w.e
            }))
          }
        ]
      }))
    };

    return JSON.stringify(data, null, 2);
  }
}

module.exports = { CaptionsJsonExporter };

