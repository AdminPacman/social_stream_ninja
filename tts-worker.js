'use strict';

const { parentPort, workerData } = require('worker_threads');
const process = require("process");
const { KokoroTTS } = require("kokoro-js");

if (process.platform === 'win32') {
  try {
    // Set process priority to below normal
    process.resourceUsage = { priority: 'below_normal' };
  } catch (error) {
    console.error('Failed to set process priority:', error);
  }
}

const modelPath = (() => {
  const { appPath } = workerData;
  return appPath;
})();

// Chat text arrives HTML-escaped; decode it so the model doesn't try to
// pronounce entity codes like &#39; — and bound input size so a wall of
// text can't balloon the onnxruntime allocation and abort the process.
const MAX_TTS_INPUT_CHARS = 1000;
const MAX_TTS_CHUNK_CHARS = 300;

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”'
};

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      const code = parseInt(dec, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&([a-z]+);/gi, (match, name) => {
      const lower = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : match;
    });
}

function prepareTtsText(rawText) {
  let text = decodeHtmlEntities(rawText || '');
  // Strip real markup and markup-that-became-text (corrupted upstream HTML):
  // tags, orphaned attribute fragments, and link-stripper placeholders all
  // read as gibberish aloud.
  text = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b(?:src|alt|title|class|href|style)\s*=\s*"[^"]*"/gi, ' ')
    .replace(/\[Link\]/gi, ' ');
  // Emojis explode into huge phoneme sequences and abort onnxruntime on
  // long runs (emoji-wall spam); they're visual-only, so drop them from speech.
  text = text
    .replace(/[\u{FE0F}\u{200D}]/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[\u{1F3FB}-\u{1F3FF}\u{20E3}]/gu, '');
  // Collapse absurd repeated-character runs ("aaaaaaaaah" walls)
  text = text.replace(/(.)\1{3,}/gu, '$1$1$1');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > MAX_TTS_INPUT_CHARS) {
    const cut = text.lastIndexOf(' ', MAX_TTS_INPUT_CHARS);
    text = text.slice(0, cut > MAX_TTS_INPUT_CHARS / 2 ? cut : MAX_TTS_INPUT_CHARS);
  }
  return text;
}

function chunkTtsText(text) {
  if (!text) return [];
  if (text.length <= MAX_TTS_CHUNK_CHARS) return [text];
  const chunks = [];
  let current = '';
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  for (const sentence of sentences) {
    let piece = sentence;
    while (piece.length > MAX_TTS_CHUNK_CHARS) {
      let cut = piece.lastIndexOf(' ', MAX_TTS_CHUNK_CHARS);
      if (cut <= 0) cut = MAX_TTS_CHUNK_CHARS;
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      chunks.push(piece.slice(0, cut).trim());
      piece = piece.slice(cut);
    }
    if ((current + piece).length > MAX_TTS_CHUNK_CHARS) {
      if (current.trim()) chunks.push(current.trim());
      current = piece;
    } else {
      current += piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
let ttsModelPromise = null;
let ttsModelLoadCount = 0;

function getTtsModel() {
  if (!ttsModelPromise) {
    ttsModelLoadCount += 1;
    ttsModelPromise = KokoroTTS.from_pretrained(
      modelPath,
      {
        dtype: "q8",
        execution_provider: ["dml", "cuda", "cpu"]
      }
    ).catch((error) => {
      ttsModelPromise = null;
      throw error;
    });
  }
  return ttsModelPromise;
}

// Function to convert to WAV format
function convertToWav(buffer, options) {
	const { sampleRate = 44100, channels = 1, bitDepth = 16 } = options;

	// WAV header size
	const headerSize = 44;
	const dataSize = buffer.length;
	const wavBuffer = Buffer.alloc(headerSize + dataSize);

	// Write WAV header
	// "RIFF" chunk descriptor
	wavBuffer.write('RIFF', 0);
	wavBuffer.writeUInt32LE(36 + dataSize, 4); // Chunk size
	wavBuffer.write('WAVE', 8);

	// "fmt " sub-chunk
	wavBuffer.write('fmt ', 12);
	wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
	wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
	wavBuffer.writeUInt16LE(channels, 22); // NumChannels
	wavBuffer.writeUInt32LE(sampleRate, 24); // SampleRate
	wavBuffer.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28); // ByteRate
	wavBuffer.writeUInt16LE(channels * (bitDepth / 8), 32); // BlockAlign
	wavBuffer.writeUInt16LE(bitDepth, 34); // BitsPerSample

	// "data" sub-chunk
	wavBuffer.write('data', 36);
	wavBuffer.writeUInt32LE(dataSize, 40); // Subchunk2Size

	// Copy the PCM data
	buffer.copy(wavBuffer, headerSize);

	return wavBuffer;
}

parentPort.on('message', async (message) => {
  const requestId = message && Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : undefined;
  const data = message && message.data ? message.data : message;

  try {
    const tts = await getTtsModel();

    const text = prepareTtsText(data && data.text);
    if (!text) {
      parentPort.postMessage({ id: requestId, error: 'Empty TTS text after sanitizing', modelLoadCount: ttsModelLoadCount });
      return;
    }

    const voice = (data?.settings?.voice || data?.settings?.voiceName || "af_aoede");
    const speed = (data?.settings?.speed || data?.settings?.rate || 1.0);

    // Synthesize in bounded chunks and stitch the audio back together
    const chunks = chunkTtsText(text);
    const pieces = [];
    let samplingRate = 24000;
    let totalSamples = 0;
    for (const chunk of chunks) {
      const audio = await tts.generate(chunk, { voice, speed });
      samplingRate = audio.sampling_rate || samplingRate;
      pieces.push(audio.audio);
      totalSamples += audio.audio.length;
    }
    const audioData = new Float32Array(totalSamples);
    let sampleOffset = 0;
    for (const piece of pieces) {
      audioData.set(piece, sampleOffset);
      sampleOffset += piece.length;
    }

    // Convert Float32Array to Int16Array for WAV format
    const int16Data = new Int16Array(audioData.length);
    
    for (let i = 0; i < audioData.length; i++) {
      int16Data[i] = Math.min(1, Math.max(-1, audioData[i])) * 32767;
    }
    
    // Create a buffer from the Int16Array
    const rawBuffer = Buffer.from(int16Data.buffer);
    
    // Convert to WAV format
    const wavBuffer = convertToWav(rawBuffer, {
      sampleRate: samplingRate,
      channels: 1,
      bitDepth: 16
    });
    
    // Send the result back to the main thread
    parentPort.postMessage({ id: requestId, wavBuffer, modelLoadCount: ttsModelLoadCount });
  } catch (error) {
    console.error("TTS Error in worker:", error);
    parentPort.postMessage({ id: requestId, error: error && error.message ? error.message : String(error), modelLoadCount: ttsModelLoadCount });
  }
});
