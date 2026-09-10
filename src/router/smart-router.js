'use strict';

class SmartRouter {
  /**
   * Declarative strategy resolution based on input, caption availability, and engine flags.
   */
  static resolve({
    source,              // 'youtube' | 'file'
    hasCaptions = false, // boolean
    isSubtitleFile = false,
    engine = 'auto',     // 'auto' | 'local' | 'groq' | 'elevenlabs' | 'openai'
    hasLocalWhisper = false,
    env = process.env
  } = {}) {
    const forcedEngine = (engine && engine !== 'auto') ? engine.toLowerCase() : null;

    // CASE 1: YouTube Source
    if (source === 'youtube') {
      // If user forces an engine other than captions, bypass YouTube fast-track
      if (forcedEngine) {
        return {
          strategy: (forcedEngine === 'local') ? 'youtube-local-whisper' : 'youtube-cloud-whisper',
          engineName: forcedEngine,
          needsAudioDownload: true,
          needsAudioExtraction: forcedEngine === 'local',
          reason: `Engine forced to "${forcedEngine}" via CLI argument`
        };
      }

      // Default auto mode: If captions are available, use fast-track
      if (hasCaptions) {
        return {
          strategy: 'youtube-fast-track',
          engineName: 'captions',
          needsAudioDownload: false,
          needsAudioExtraction: false,
          reason: 'Captions found on YouTube — Fast-Track enabled (~1-2s)'
        };
      }

      // Fallback if no captions on YouTube: determine fallback STT engine
      const fallbackEngine = SmartRouter.selectDefaultSttEngine({ hasLocalWhisper, env });
      return {
        strategy: (fallbackEngine === 'local') ? 'youtube-local-whisper' : 'youtube-cloud-whisper',
        engineName: fallbackEngine,
        needsAudioDownload: true,
        needsAudioExtraction: fallbackEngine === 'local',
        reason: `No captions on YouTube — Fallback to audio stream + ${fallbackEngine}`
      };
    }

    // CASE 2: Local Subtitle File (.srt, .vtt)
    if (isSubtitleFile) {
      return {
        strategy: 'subtitle-file',
        engineName: 'captions',
        needsAudioDownload: false,
        needsAudioExtraction: false,
        reason: 'Input is already a subtitle file (.srt / .vtt)'
      };
    }

    // CASE 3: Local Media File (Audio / Video)
    const chosenEngine = forcedEngine || SmartRouter.selectDefaultSttEngine({ hasLocalWhisper, env });

    return {
      strategy: (chosenEngine === 'local') ? 'local-whisper' : 'cloud-whisper',
      engineName: chosenEngine,
      needsAudioDownload: false,
      needsAudioExtraction: true,
      reason: forcedEngine ? `Engine forced to "${forcedEngine}"` : `Auto-selected ${chosenEngine} engine`
    };
  }

  static selectDefaultSttEngine({ hasLocalWhisper = false, env = process.env } = {}) {
    if (env.GROQ_API_KEY) return 'groq';
    if (env.ELEVENLABS_API_KEY) return 'elevenlabs';
    if (env.OPENAI_API_KEY) return 'openai';
    if (hasLocalWhisper) return 'local';
    return 'local'; // default fallback attempt
  }
}

module.exports = { SmartRouter };

