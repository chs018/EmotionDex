'use strict';
/**
 * EmotionDex — Multilingual Transformer Service
 *
 * Model: Xenova/multilingual-e5-small (~118MB ONNX, 100+ languages)
 * Strategy: Prototype-based cosine similarity
 *   1. Build per-emotion prototype embeddings from CSV datasets (Tamil)
 *      + seed sentences (English + Hindi)
 *   2. Classify new text by cosine similarity to prototypes
 */

const path = require('path');
const fs   = require('fs');

// ── State ────────────────────────────────────────────────────────────────────
let _pipeline  = null;
let _isLoading = false;
let _isReady   = false;
let _loadError = null;
let _prototypes = null;

// ── CSV label → EmotionDex bucket ────────────────────────────────────────────
const LABEL_MAP = {
  Love:'love', Joy:'happy', Sorrow:'sad', Anger:'angry',
  Fear:'anxious', Caution:'anxious', Disgust:'angry', Betrayal:'angry',
  Courage:'happy', Pride:'happy', Confidence:'happy',
  Calmness:'calm', Contentment:'calm', Devotion:'calm',
  Reverence:'calm', Gratitude:'calm', Clarity:'calm', Wisdom:'calm',
  Wonder:'happy'
};

// ── Multilingual seed sentences (English + Hindi per emotion) ─────────────────
const SEEDS = {
  angry: [
    'I am absolutely furious, this is completely unacceptable service',
    'Your team is useless, I want a refund now and will take legal action',
    'I have been waiting for days and nobody helped me, this is outrageous',
    'मैं बहुत गुस्से में हूं, यह बिल्कुल अस्वीकार्य है',
    'यह सेवा बेकार है, मुझे तुरंत रिफंड चाहिए, बहुत नाराज हूं',
    'कई दिनों से कोई जवाब नहीं, मैं कार्रवाई करूंगा',
  ],
  sad: [
    'I am so disappointed and heartbroken, this is not what I expected',
    'I feel let down, I regret this purchase and trusted your brand',
    'I am very unhappy and sad about the service I received',
    'मैं बहुत निराश हूं, यह मेरी उम्मीद के अनुसार नहीं था',
    'मुझे बहुत दुख है, इस खरीद का अफसोस है',
    'बहुत उदासी है, धोखा खाया महसूस हो रहा है',
  ],
  happy: [
    'This product is absolutely amazing, I am so pleased and satisfied',
    'Excellent service, thank you so much, exceeded my expectations',
    'I am thrilled and overjoyed, wonderful experience',
    'यह उत्पाद बहुत अच्छा है, बहुत खुश हूं',
    'बहुत बढ़िया सेवा, धन्यवाद, मैं बहुत संतुष्ट हूं',
    'शानदार अनुभव, उम्मीद से बेहतर निकला',
  ],
  calm: [
    'Could you please help me with my order, I have a question',
    'Can you provide information about delivery and return policy',
    'I would like to know the status of my shipment',
    'कृपया मेरे ऑर्डर के बारे में जानकारी दें',
    'डिलीवरी कब तक होगी, वापसी नीति क्या है',
    'मुझे जानकारी चाहिए, कृपया बताएं',
  ],
  anxious: [
    'I am really worried and stressed, this is extremely urgent',
    'Please respond immediately, I cannot wait, critical situation',
    'I am scared my account has been compromised, need help now',
    'मैं बहुत चिंतित हूं, यह बहुत जरूरी है',
    'कृपया जल्दी जवाब दें, बहुत परेशान हूं, तुरंत मदद चाहिए',
    'मेरा खाता शायद हैक हुआ, डर लग रहा है, अभी मदद चाहिए',
  ],
  love: [
    'I absolutely love your brand, loyal customer for life, will never switch',
    'I recommend you to everyone, you are my favorite company ever',
    'Keep up the amazing work, I am your biggest fan, dedicated to you',
    'मुझे आपका ब्रांड बहुत पसंद है, हमेशा वफादार ग्राहक रहूंगा',
    'मैं सबको आपके बारे में बताता हूं, आप सबसे अच्छे हैं',
    'बहुत प्यार है आपके प्रति, आप मेरे पसंदीदा ब्रांड हैं',
  ],
};

// ── Math helpers ──────────────────────────────────────────────────────────────
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

function avgVectors(arrays) {
  if (!arrays.length) return null;
  const len = arrays[0].length;
  const out = new Array(len).fill(0);
  for (const arr of arrays) for (let i = 0; i < len; i++) out[i] += arr[i];
  return out.map(v => v / arrays.length);
}

// ── Embedding ─────────────────────────────────────────────────────────────────
async function embedText(text) {
  const out = await _pipeline(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

// ── Build prototypes from seeds + CSV data ────────────────────────────────────
async function buildPrototypes() {
  const exemplars = {};
  for (const key of Object.keys(SEEDS)) exemplars[key] = [...SEEDS[key]];

  // Augment with CSV Tamil poems
  const dataDir = path.join(__dirname, '..', '..', 'data');
  let parse;
  try { ({ parse } = require('csv-parse/sync')); } catch { parse = null; }

  if (parse) {
    for (const fname of ['primary_emotions.csv', 'multitask_emotions.csv']) {
      const fpath = path.join(dataDir, fname);
      if (!fs.existsSync(fpath)) continue;
      const rows = parse(fs.readFileSync(fpath, 'utf8'), {
        columns: true, skip_empty_lines: true, trim: true, relax_quotes: true
      });
      for (const row of rows) {
        const poem = row.Poem || row.poem || '';
        const key  = LABEL_MAP[row.Primary || row.primary || ''];
        if (poem && key) {
          exemplars[key] = exemplars[key] || [];
          exemplars[key].push(poem);
        }
      }
    }
  }

  // Embed each set and average
  _prototypes = {};
  for (const [key, texts] of Object.entries(exemplars)) {
    console.log(`[Transformer] Embedding ${texts.length} examples for "${key}"...`);
    const embeddings = await Promise.all(texts.map(t => embedText(t)));
    _prototypes[key] = avgVectors(embeddings);
  }
  console.log('[Transformer] Prototypes built for:', Object.keys(_prototypes).join(', '));
}

// ── Load pipeline (lazy, called once) ────────────────────────────────────────
async function loadPipeline() {
  if (_isReady || _isLoading) return;
  _isLoading = true;
  try {
    const { pipeline, env } = require('@xenova/transformers');
    env.cacheDir = path.join(process.cwd(), 'node_modules', '.cache', 'transformers');
    env.allowRemoteModels = true;

    console.log('[Transformer] Loading Xenova/multilingual-e5-small...');
    _pipeline = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
      quantized: true
    });
    console.log('[Transformer] Model loaded. Building prototypes...');
    await buildPrototypes();
    _isReady   = true;
    _isLoading = false;
    console.log('[Transformer] ✅ Ready — English | Tamil | Hindi | 100+ languages');
  } catch (err) {
    _loadError = err.message;
    _isLoading = false;
    console.error('[Transformer] ❌ Load failed:', err.message);
  }
}

// ── Public: classify text ─────────────────────────────────────────────────────
async function classifyWithTransformer(text) {
  if (!_isReady) {
    if (!_isLoading && !_loadError) loadPipeline();
    return null;
  }
  try {
    const emb = await embedText(text);
    const scores = {};
    for (const [key, proto] of Object.entries(_prototypes)) {
      scores[key] = cosine(emb, proto);
    }
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topKey, topScore] = sorted[0];
    const gap = topScore - (sorted[1]?.[1] || 0);
    const confidence = Math.min(97, Math.max(52, Math.round(
      50 + (topScore - 0.25) * 130 + gap * 55
    )));
    return {
      key: topKey,
      confidence,
      model: 'multilingual-e5-small',
      scores: Object.fromEntries(sorted.map(([k, v]) => [k, +v.toFixed(4)]))
    };
  } catch (err) {
    console.error('[Transformer] classify error:', err.message);
    return null;
  }
}

// ── Public: status ────────────────────────────────────────────────────────────
function getStatus() {
  return {
    ready:      _isReady,
    loading:    _isLoading,
    error:      _loadError,
    model:      'Xenova/multilingual-e5-small',
    languages:  ['en', 'ta', 'hi', '100+ others'],
    prototypes: _prototypes ? Object.keys(_prototypes) : null
  };
}

// Auto-start loading after 200ms so server boots instantly
setTimeout(loadPipeline, 200);

module.exports = { classifyWithTransformer, getStatus, loadPipeline };
