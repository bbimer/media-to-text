#!/usr/bin/env node
/**
 * transcribe.js — Universal Video/Audio Subtitle Extractor & Semantic Compiler (v2.8)
 *
 * Thin facade delegating to modular pipeline in src/cli/index.js.
 */

'use strict';

const { runCli } = require('./src/cli/index.js');
const { Transcript } = require('./src/transcript/model.js');
const { CaptionsEngine } = require('./src/engines/captions.js');
const { normalizeWordsToSegments } = require('./src/transcript/normalize.js');

if (require.main === module) {
  runCli(process.argv.slice(2)).catch(err => {
    console.error('\n❌ Fatal Error:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  runCli,
  Transcript,
  CaptionsEngine,
  normalizeWordsToSegments
};
