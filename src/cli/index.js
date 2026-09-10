'use strict';

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../utils/env.js');
const { Logger } = require('../utils/logger.js');
const { CacheManager } = require('../utils/cache.js');
const { formatClock } = require('../utils/paths.js');

const { SmartRouter } = require('../router/smart-router.js');
const { YouTubeSource } = require('../sources/youtube.js');
const { LocalFileSource } = require('../sources/local-file.js');
const { FfmpegProcessor } = require('../media/ffmpeg.js');

const { CaptionsEngine } = require('../engines/captions.js');
const { WhisperLocalEngine } = require('../engines/whisper-local.js');
const { WhisperCloudEngine } = require('../engines/whisper-cloud.js');

const { Transcript } = require('../transcript/model.js');
const { normalizeWordsToSegments, DEFAULTS } = require('../transcript/normalize.js');
const { assignChaptersToSegments } = require('../transcript/chapters.js');

const { TxtExporter } = require('../exporters/txt.js');
const { SrtExporter } = require('../exporters/srt.js');
const { CaptionsJsonExporter } = require('../exporters/captions-json.js');

async function runCli(argv = process.argv.slice(2)) {
  loadEnv();

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    Logger.help();
    return;
  }

  const rawInput = argv[0];
  const isYt = YouTubeSource.isYouTubeInput(rawInput);

  // CLI Arguments
  const getArg = (flag, def = null) => {
    const idx = argv.indexOf(flag);
    return (idx !== -1 && argv[idx + 1]) ? argv[idx + 1] : def;
  };

  const forcedEngine = getArg('--engine', 'auto');
  const formatChoice = (getArg('--format', 'all') || 'all').toLowerCase();
  const langChoice = getArg('--lang', 'auto') || 'auto';
  const casingChoice = getArg('--casing', DEFAULTS.casing);
  const maxCharsChoice = parseInt(getArg('--max-chars', String(DEFAULTS.maxCharsPerPage)), 10) || DEFAULTS.maxCharsPerPage;
  const customOut = getArg('--out', null);
  const bypassCache = argv.includes('--no-cache') || argv.includes('--force');

  const cacheManager = new CacheManager();
  const ffmpeg = new FfmpegProcessor();
  const localWhisper = new WhisperLocalEngine();

  let baseName = '';
  let inputDir = process.cwd();
  let metadata = null;
  let chapters = [];
  let cacheKey = null;

  // 1. Identify Source & Cache Key
  let fileSource = null;
  let ytSource = null;

  if (isYt) {
    ytSource = new YouTubeSource();
    if (!ytSource.isAvailable()) {
      Logger.error('yt-dlp is required to process YouTube links. Please install: pip install yt-dlp');
      process.exit(1);
    }

    const videoId = YouTubeSource.extractVideoId(rawInput);
    cacheKey = cacheManager.getCacheKey({ isYouTube: true, videoId });

    // Check Cache first before expensive network calls if not bypassed
    if (!bypassCache && cacheManager.has(cacheKey)) {
      Logger.info(`⚡ Cache Hit! Loading YouTube transcript for [${videoId}] from cache...`);
      const cached = cacheManager.get(cacheKey);
      if (cached && cached.transcriptData) {
        const transcript = Transcript.fromJSON(cached.transcriptData);
        metadata = cached.metadata || transcript.metadata;
        chapters = transcript.chapters || [];
        baseName = metadata && metadata.title
          ? metadata.title.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80)
          : `youtube_${videoId}`;

        await exportAndFinish(transcript, inputDir, baseName, customOut, formatChoice);
        return;
      }
    }

    Logger.info(`🔍 Inspecting YouTube metadata via yt-dlp...`);
    metadata = ytSource.fetchMetadata(rawInput);
    chapters = metadata.chapters || [];
    baseName = metadata.title.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || `youtube_${metadata.id}`;

    Logger.header('YouTube Video Source', {
      'Title': metadata.title,
      'Channel': metadata.channel,
      'Duration': `${formatClock(metadata.duration)} (${metadata.duration}s)`,
      'Chapters': chapters.length ? `${chapters.length} detected` : 'None',
      'Captions': (metadata.manualSubs.length + metadata.autoSubs.length) > 0 ? 'Available' : 'None',
      'Format': formatChoice.toUpperCase()
    });
  } else {
    try {
      fileSource = LocalFileSource.resolve(rawInput);
    } catch (err) {
      Logger.error(err.message);
      process.exit(1);
    }

    baseName = fileSource.baseName;
    inputDir = fileSource.dir;
    cacheKey = cacheManager.getCacheKey(fileSource);

    // Check Cache for local file
    if (!bypassCache && cacheManager.has(cacheKey)) {
      Logger.info(`⚡ Cache Hit! Loading cached transcript for ${path.basename(fileSource.filePath)}...`);
      const cached = cacheManager.get(cacheKey);
      if (cached && cached.transcriptData) {
        const transcript = Transcript.fromJSON(cached.transcriptData);
        await exportAndFinish(transcript, inputDir, baseName, customOut, formatChoice);
        return;
      }
    }

    Logger.header('Local Media Source', {
      'File': fileSource.filePath,
      'Type': fileSource.isSubtitle ? 'Subtitle' : (fileSource.isVideo ? 'Video' : 'Audio'),
      'Size': `${(fileSource.size / (1024 * 1024)).toFixed(2)} MB`,
      'Format': formatChoice.toUpperCase()
    });
  }

  // 2. Declarative Strategy Resolution
  const hasCaptionsOnYt = isYt && ((metadata.manualSubs && metadata.manualSubs.length > 0) || (metadata.autoSubs && metadata.autoSubs.length > 0));

  const resolution = SmartRouter.resolve({
    source: isYt ? 'youtube' : 'file',
    hasCaptions: hasCaptionsOnYt,
    isSubtitleFile: fileSource ? fileSource.isSubtitle : false,
    engine: forcedEngine,
    hasLocalWhisper: localWhisper.isAvailable(),
    env: process.env
  });

  Logger.info(`🧭 Resolved Strategy: [${resolution.strategy}] via ${resolution.engineName.toUpperCase()} engine (${resolution.reason})`);

  // 3. Execute Strategy to get Raw Timed Words
  let rawWords = [];
  let tempAudioToCleanup = null;
  let tempSubToCleanup = null;

  try {
    if (resolution.strategy === 'youtube-fast-track') {
      const subLangs = (langChoice !== 'auto') ? [langChoice] : ['ru', 'en'];
      const subResult = ytSource.downloadSubtitles(metadata.url, inputDir, metadata, subLangs);
      if (subResult) {
        Logger.info(`⚡ Fast-Track: Extracted subtitles (${subResult.lang}) in ~1 sec (zero video downloaded)!`);
        tempSubToCleanup = subResult.filePath;
        rawWords = CaptionsEngine.parse(subResult.filePath);
      } else {
        Logger.warn('Subtitles could not be downloaded. Falling back to audio stream download...');
        const downloadedAudio = ytSource.downloadAudioStreamFallback(metadata.url, inputDir);
        tempAudioToCleanup = downloadedAudio;
        rawWords = await transcribeAudioFile(downloadedAudio, resolution.engineName, langChoice, localWhisper, ffmpeg, inputDir);
      }
    } else if (resolution.strategy.startsWith('youtube-')) {
      Logger.info(`📥 Downloading audio stream from YouTube for ${resolution.engineName.toUpperCase()} processing...`);
      const downloadedAudio = ytSource.downloadAudioStreamFallback(metadata.url, inputDir);
      tempAudioToCleanup = downloadedAudio;
      rawWords = await transcribeAudioFile(downloadedAudio, resolution.engineName, langChoice, localWhisper, ffmpeg, inputDir);
    } else if (resolution.strategy === 'subtitle-file') {
      rawWords = CaptionsEngine.parse(fileSource.filePath);
    } else {
      // Local media file
      rawWords = await transcribeAudioFile(fileSource.filePath, resolution.engineName, langChoice, localWhisper, ffmpeg, inputDir);
    }
  } finally {
    if (tempSubToCleanup && fs.existsSync(tempSubToCleanup)) {
      try { fs.unlinkSync(tempSubToCleanup); } catch (e) {}
    }
    if (tempAudioToCleanup && fs.existsSync(tempAudioToCleanup)) {
      try { fs.unlinkSync(tempAudioToCleanup); } catch (e) {}
    }
  }

  if (!rawWords || rawWords.length === 0) {
    Logger.error('No speech or subtitles found in the input.');
    process.exit(1);
  }

  Logger.success(`Extracted ${rawWords.length} words with word-level timestamps.`);

  // 4. Normalize Words to Semantic Segments
  Logger.info(`🧠 Normalizing with Semantic Clause Pagination Engine...`);
  const segments = normalizeWordsToSegments(rawWords, {
    casing: casingChoice,
    maxCharsPerPage: maxCharsChoice
  });

  // 5. Phase / Chapter Assignment
  if (chapters.length > 0) {
    assignChaptersToSegments(segments, chapters);
  }

  // 6. Build Transcript Domain Model
  const transcript = new Transcript({
    metadata: {
      title: metadata ? metadata.title : (fileSource ? fileSource.baseName : 'Audio Transcript'),
      id: metadata ? metadata.id : null,
      url: metadata ? metadata.url : null,
      channel: metadata ? metadata.channel : null,
      duration: metadata ? metadata.duration : null,
      source: isYt ? 'youtube' : 'local-file',
      engine: resolution.engineName,
      transcribedAt: new Date().toISOString()
    },
    chapters,
    segments
  });

  // 7. Save to Cache
  if (cacheKey) {
    cacheManager.set(cacheKey, {
      transcriptData: transcript.toJSON(),
      metadata: transcript.metadata
    });
  }

  // 8. Export to requested formats
  await exportAndFinish(transcript, inputDir, baseName, customOut, formatChoice);
}

async function transcribeAudioFile(filePath, engineName, langChoice, localWhisper, ffmpeg, tempDir) {
  if (engineName === 'local') {
    if (!localWhisper.isAvailable()) {
      throw new Error('Local Whisper engine is not available. Check whisper-cli.exe and models.');
    }
    Logger.info(`💻 Transcribing via Local Whisper.cpp (100% Offline)...`);
    return localWhisper.transcribe(filePath, langChoice);
  }

  // Cloud engines: Groq, ElevenLabs, OpenAI
  const ext = path.extname(filePath).toLowerCase();
  let buffer;
  if (ext === '.mp3') {
    buffer = fs.readFileSync(filePath);
  } else {
    Logger.info(`🎞️ Preprocessing audio with FFmpeg for cloud STT...`);
    buffer = ffmpeg.extractMp3Buffer(filePath, tempDir);
  }

  if (engineName === 'groq') {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set in .env');
    Logger.info(`⚡ Transcribing with Groq Whisper API (whisper-large-v3)...`);
    return await WhisperCloudEngine.transcribeWithGroq(buffer, process.env.GROQ_API_KEY);
  } else if (engineName === 'elevenlabs') {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is not set in .env');
    Logger.info(`🎙️ Transcribing with ElevenLabs Scribe STT...`);
    return await WhisperCloudEngine.transcribeWithElevenLabs(buffer, process.env.ELEVENLABS_API_KEY);
  } else if (engineName === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set in .env');
    Logger.info(`🌐 Transcribing with OpenAI Whisper API (whisper-1)...`);
    return await WhisperCloudEngine.transcribeWithOpenAI(buffer, process.env.OPENAI_API_KEY);
  } else {
    throw new Error(`Unsupported engine: ${engineName}`);
  }
}

async function exportAndFinish(transcript, inputDir, baseName, customOut, formatChoice) {
  // Determine output base path
  let outBase = path.join(inputDir, baseName);
  if (customOut) {
    const resolvedOut = path.resolve(customOut);
    if (fs.existsSync(resolvedOut) && fs.statSync(resolvedOut).isDirectory()) {
      outBase = path.join(resolvedOut, baseName);
    } else {
      const outExt = path.extname(resolvedOut);
      if (outExt) {
        outBase = path.join(path.dirname(resolvedOut), path.basename(resolvedOut, outExt));
      } else {
        outBase = resolvedOut;
      }
    }
  }

  const jsonOutputPath = `${outBase}.captions.json`;
  const srtOutputPath = `${outBase}.srt`;
  const txtOutputPath = `${outBase}.txt`;

  const savedFiles = [];
  const shouldSaveJson = ['all', 'json'].includes(formatChoice);
  const shouldSaveSrt = ['all', 'srt'].includes(formatChoice);
  const shouldSaveTxt = ['all', 'txt'].includes(formatChoice);

  if (shouldSaveJson) {
    const jsonContent = CaptionsJsonExporter.export(transcript);
    fs.writeFileSync(jsonOutputPath, jsonContent, 'utf8');
    savedFiles.push({ type: 'After Effects JSON', path: jsonOutputPath, size: fs.statSync(jsonOutputPath).size });
  }

  if (shouldSaveSrt) {
    const srtContent = SrtExporter.export(transcript);
    fs.writeFileSync(srtOutputPath, srtContent, 'utf8');
    savedFiles.push({ type: 'Standard Subtitles (SRT)', path: srtOutputPath, size: fs.statSync(srtOutputPath).size });
  }

  if (shouldSaveTxt) {
    const txtContent = TxtExporter.export(transcript);
    fs.writeFileSync(txtOutputPath, txtContent, 'utf8');
    savedFiles.push({ type: 'Plain Text Transcript (TXT)', path: txtOutputPath, size: fs.statSync(txtOutputPath).size });
  }

  Logger.summary(transcript, savedFiles);
  Logger.preview(transcript);

  if (shouldSaveJson) {
    console.log(`🎬 HOW TO USE IN AFTER EFFECTS:`);
    console.log(`  1. Open After Effects ➔ Window ➔ elevenlabs-after-effects-subtitles.jsx`);
    console.log(`  2. Click "📂 Browse JSON" and select: ${path.basename(jsonOutputPath)}`);
    console.log(`  3. Choose your Kinetic Mode (Mode 1..6) and click "🎬 BUILD SUBTITLES"!\n`);
  }
}

module.exports = { runCli };

