'use strict';

class Transcript {
  constructor({
    metadata = {},
    chapters = [],
    segments = []
  } = {}) {
    this.metadata = metadata;
    this.chapters = chapters;
    this.segments = segments;
  }

  // Alias for backward compatibility with AE pagination
  get pages() {
    return this.segments;
  }

  set pages(val) {
    this.segments = val;
  }

  getDuration() {
    if (this.metadata && this.metadata.duration) {
      return Number(this.metadata.duration);
    }
    if (this.segments.length > 0) {
      return Number(this.segments[this.segments.length - 1].end.toFixed(3));
    }
    return 0;
  }

  getWordCount() {
    let count = 0;
    for (const seg of this.segments) {
      if (seg.words && seg.words.length > 0) {
        count += seg.words.length;
      } else if (seg.text) {
        count += seg.text.split(/\s+/).filter(Boolean).length;
      }
    }
    return count;
  }

  findChapter(time) {
    if (!this.chapters || this.chapters.length === 0) return null;
    return this.chapters.find(c => time >= c.start && time < c.end) || this.chapters[this.chapters.length - 1];
  }

  toJSON() {
    return {
      metadata: this.metadata,
      chapters: this.chapters,
      duration: this.getDuration(),
      segmentsCount: this.segments.length,
      segments: this.segments
    };
  }

  static fromJSON(data) {
    if (!data) return new Transcript();
    return new Transcript({
      metadata: data.metadata || {},
      chapters: data.chapters || [],
      segments: data.segments || data.pages || []
    });
  }
}

module.exports = { Transcript };

