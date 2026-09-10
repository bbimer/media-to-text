'use strict';

class WhisperCloudEngine {
  static async transcribeWithGroq(audioBuffer, apiKey) {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, 'audio.mp3');
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq Whisper error (${res.status}): ${errText}`);
    }

    const json = await res.json();
    return (json.words || []).map(w => ({
      word: w.word,
      start: w.start,
      end: w.end,
      em: false
    }));
  }

  static async transcribeWithElevenLabs(audioBuffer, apiKey) {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, 'audio.mp3');
    formData.append('model_id', 'scribe_v1');
    formData.append('timestamps_granularity', 'word');

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ElevenLabs STT error (${res.status}): ${errText}`);
    }

    const json = await res.json();
    return (json.words || []).map(w => ({
      word: w.text || w.word,
      start: w.start,
      end: w.end,
      em: false
    }));
  }

  static async transcribeWithOpenAI(audioBuffer, apiKey) {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI Whisper error (${res.status}): ${errText}`);
    }

    const json = await res.json();
    return (json.words || []).map(w => ({
      word: w.word,
      start: w.start,
      end: w.end,
      em: false
    }));
  }
}

module.exports = { WhisperCloudEngine };

