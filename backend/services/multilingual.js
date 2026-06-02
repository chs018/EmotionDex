const fs = require('fs');
const path = require('path');

let natural;
try {
  natural = require('natural');
} catch {
  natural = null;
}

let parse;
try {
  ({ parse } = require('csv-parse/sync'));
} catch {
  parse = null;
}

const EMOTION_MAP = {
  // Direct mappings
  Love: 'love',
  Joy: 'happy',
  Sorrow: 'sad',
  Anger: 'angry',

  // Mapped/merged labels
  Fear: 'anxious',
  Caution: 'anxious',
  Disgust: 'angry',
  Betrayal: 'angry',

  Courage: 'happy',
  Pride: 'happy',
  Confidence: 'happy',

  Calmness: 'calm',
  Contentment: 'calm',
  Devotion: 'calm',
  Reverence: 'calm',
  Gratitude: 'calm',
  Clarity: 'calm',
  Wisdom: 'calm',

  Wonder: 'happy'
};

function hasIndicScript(text) {
  if (!text || typeof text !== 'string') return false;
  return /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/.test(text);
}

function isTamilScript(text) {
  if (!text || typeof text !== 'string') return false;
  return /[\u0B80-\u0BFF]/.test(text);
}

function isHindiScript(text) {
  if (!text || typeof text !== 'string') return false;
  return /[\u0900-\u097F]/.test(text);
}

function detectLocale(text) {
  if (isTamilScript(text)) return 'ta';
  if (isHindiScript(text)) return 'hi';
  return 'en';
}

function toTokens(text) {
  const normalized = (text || '').normalize('NFC');
  const cleaned = normalized
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();

  if (!cleaned) return [];

  // Character trigrams work well across scripts without needing language-specific tokenizers.
  // natural.NGrams expects an array (not a string), so we pass Unicode codepoints.
  if (!natural) return [cleaned];

  const chars = Array.from(cleaned);
  if (chars.length < 3) return [cleaned];

  const grams = natural.NGrams.ngrams(chars, 3);
  if (!grams || grams.length === 0) return [cleaned];

  return grams.map(g => g.join(''));
}

function loadCsvRows(csvPath) {
  if (!parse) throw new Error('csv-parse is not available');

  const raw = fs.readFileSync(csvPath, 'utf8');
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true
  });
}

function mapLabelToEmotionKey(label) {
  if (!label) return null;
  const key = EMOTION_MAP[String(label).trim()];
  return key || null;
}

let _classifier = null;
let _trained = false;
let _trainError = null;

function ensureTrained() {
  if (_trained) return;
  _trained = true;

  if (!natural || !parse) {
    _trainError = new Error('Required deps missing (natural and/or csv-parse)');
    return;
  }

  try {
    const classifier = new natural.BayesClassifier();

    // natural's default tokenizer is not Unicode-aware (it can drop Tamil/Indic tokens).
    // We feed pre-tokenized features separated by whitespace; this tokenizer preserves them.
    classifier.tokenizer = {
      tokenize: (t) => String(t || '').split(/\s+/).filter(Boolean)
    };

    const primaryPath = path.join(__dirname, '..', '..', 'data', 'primary_emotions.csv');
    const multitaskPath = path.join(__dirname, '..', '..', 'data', 'multitask_emotions.csv');

    const files = [primaryPath, multitaskPath].filter(p => fs.existsSync(p));
    if (files.length === 0) {
      _trainError = new Error('No dataset CSVs found');
      return;
    }

    for (const f of files) {
      const rows = loadCsvRows(f);
      for (const row of rows) {
        const poem = row.Poem || row.poem || row.text || '';
        const primary = row.Primary || row.primary;
        const secondary = row.Secondary || row.secondary;
        const intensity = String(row.Intensity || row.intensity || '').toLowerCase();

        const primaryKey = mapLabelToEmotionKey(primary);
        if (!poem || !primaryKey) continue;

        const tokens = toTokens(poem);
        if (!tokens.length) continue;

        const repeats = intensity === 'high' ? 2 : 1;
        for (let i = 0; i < repeats; i++) classifier.addDocument(tokens, primaryKey);

        // Optional weak supervision from secondary labels
        if (secondary) {
          const secs = String(secondary).split(',').map(s => s.trim()).filter(Boolean);
          for (const secLabel of secs) {
            const secKey = mapLabelToEmotionKey(secLabel);
            if (secKey) classifier.addDocument(tokens, secKey);
          }
        }
      }
    }

    classifier.train();
    _classifier = classifier;
  } catch (e) {
    _trainError = e;
  }
}

function classificationConfidence(classifications) {
  if (!classifications || classifications.length === 0) return 0;

  // natural returns non-log scores; treat them as relative weights.
  const top = classifications.slice(0, 6);
  const sum = top.reduce((s, c) => s + (c.value || 0), 0) || 1;
  const best = top[0];
  return Math.round(((best.value || 0) / sum) * 100);
}

function classifyDatasetEmotion(text) {
  ensureTrained();
  if (!_classifier) return null;

  const tokens = toTokens(text);
  if (!tokens.length) return null;

  const ranked = _classifier.getClassifications(tokens);
  const best = ranked?.[0];
  if (!best) return null;

  return {
    key: best.label,
    confidence: classificationConfidence(ranked),
    model: 'bayes-char-trigram'
  };
}

module.exports = {
  hasIndicScript,
  isTamilScript,
  isHindiScript,
  detectLocale,
  classifyDatasetEmotion,
  _debug: {
    ensureTrained: () => ensureTrained(),
    get trainError() { return _trainError; }
  }
};
