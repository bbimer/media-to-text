# Media to Text (Universal Audio/Video Transcriber) 🎙️➔📝

Universal offline & cloud speech-to-text utility powered by **FFmpeg** and **Whisper**.
Feed ANY audio or video file — get clean readable **Text (.txt)**, standard **Subtitles (.srt)**, or timed **JSON**.

---

## ⚡ Quick Start

### 1. Drag & Drop (Windows)
Just drag and drop one or multiple audio/video files onto `transcribe.bat`!
Generated `.txt`, `.srt`, and `.captions.json` files will appear directly next to the original media.

### 2. Command Line (CLI)
```bash
# 100% Offline via Local Whisper (whisper.cpp + FFmpeg, no keys needed):
node transcribe.js "voiceover.mp3" --engine local

# Only plain text (.txt):
node transcribe.js "audio.mp3" --format txt

# Standard subtitles (.srt):
node transcribe.js "video.mp4" --format srt

# Cloud engines (requires API keys in .env):
node transcribe.js "audio.mp3" --engine groq
node transcribe.js "audio.mp3" --engine elevenlabs
node transcribe.js "audio.mp3" --engine openai
```

---

## 🎧 Supported Input Formats

* **Audio:** `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`
* **Video:** `.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`, `.flv`
* **Subtitles:** `.srt`, `.vtt`

---

## 📦 Engines

| Engine | Description | Requirements |
|---|---|---|
| **Local Whisper** | 100% Offline, CPU/GPU fast, zero data sent to internet | `whisper-cli.exe` + `ggml-base.bin` |
| **Groq Whisper** | Ultra-fast cloud Whisper-large-v3 | `GROQ_API_KEY` in `.env` |
| **ElevenLabs Scribe** | ElevenLabs Speech-to-Text v1 | `ELEVENLABS_API_KEY` in `.env` |
| **OpenAI Whisper** | OpenAI Whisper-1 API | `OPENAI_API_KEY` in `.env` |

---

## 📄 License
MIT © [bbimer](https://github.com/bbimer)
