/**
 * EmotionDex — Model Evaluation Script
 *
 * Measures Precision, Recall, and F1 Score (macro + per-class)
 * for our dual-layer sentiment model against a labeled test set.
 *
 * Run: node evaluate.js
 */

const { analyzeSentiment } = require('./services/sentiment');

// ── Labeled test set (ground truth) ───────────────────────────────────────
// Format: { text, true: 'emotionKey' }
// Add as many examples as needed for reliable evaluation.
const TEST_SET = [
  // 🔥 ANGRY (Fire Type)
  { text: "I've been waiting 4 days and nobody helped me! This is absolutely unacceptable!", true: 'angry' },
  { text: "I want a refund NOW. Your service is the worst I've ever experienced.", true: 'angry' },
  { text: "This is ridiculous. I've called 3 times and nothing is resolved.", true: 'angry' },
  { text: "SCAM! I paid and received nothing. I will take legal action.", true: 'angry' },
  { text: "Your team is completely useless and incompetent!", true: 'angry' },
  { text: "How dare you charge me twice! This is fraud!", true: 'angry' },

  // 💧 SAD (Water Type)
  { text: "I'm so disappointed. I saved up for months and it arrived broken.", true: 'sad' },
  { text: "This isn't what I expected at all. I feel really let down.", true: 'sad' },
  { text: "I'm heartbroken. I trusted your brand and you failed me.", true: 'sad' },
  { text: "I regret this purchase. It was a complete waste of money.", true: 'sad' },
  { text: "I'm very unhappy with the service I received today.", true: 'sad' },

  // ⚡ HAPPY (Electric Type)
  { text: "Your product is absolutely amazing! Best purchase I've ever made!", true: 'happy' },
  { text: "Thank you so much! The support team was incredibly helpful.", true: 'happy' },
  { text: "I'm so pleased with my order. It arrived early and in perfect condition!", true: 'happy' },
  { text: "Excellent service as always. You guys are fantastic!", true: 'happy' },
  { text: "I'm really satisfied with how this was handled. Great job!", true: 'happy' },

  // 🌿 CALM (Grass Type)
  { text: "Could you please tell me how to track my order?", true: 'calm' },
  { text: "I would like some information about your return policy.", true: 'calm' },
  { text: "How long does delivery usually take to my region?", true: 'calm' },
  { text: "Can you help me update my billing address?", true: 'calm' },
  { text: "I have a question about my subscription plan.", true: 'calm' },

  // 🔮 ANXIOUS (Psychic Type)
  { text: "I'm really worried my package won't arrive before my event.", true: 'anxious' },
  { text: "This is urgent. I need this resolved ASAP, I can't wait.", true: 'anxious' },
  { text: "I'm very concerned about the status of my refund. Please help.", true: 'anxious' },
  { text: "I'm scared my account has been compromised. Please check immediately.", true: 'anxious' },
  { text: "There's an emergency — my order is critical and I need it now.", true: 'anxious' },

  // ✨ LOVE (Fairy Type)
  { text: "I absolutely love your brand. I will never shop anywhere else!", true: 'love' },
  { text: "I adore everything about this product. You have a customer for life!", true: 'love' },
  { text: "I'm obsessed with your service. I recommend you to everyone!", true: 'love' },
  { text: "You are my favorite brand ever. I'm a loyal fan forever!", true: 'love' },
  { text: "Dedicated to your brand since day one. Keep up the amazing work!", true: 'love' },
];

// ── Evaluation logic ──────────────────────────────────────────────────────
const CLASSES = ['angry', 'sad', 'happy', 'calm', 'anxious', 'love'];

// Confusion matrix
const confusion = {};
CLASSES.forEach(a => {
  confusion[a] = {};
  CLASSES.forEach(b => { confusion[a][b] = 0; });
});

let correct = 0;
const results = [];

TEST_SET.forEach(({ text, true: trueLabel }) => {
  const result   = analyzeSentiment(text);
  const predicted = result.emotion.key;
  confusion[trueLabel][predicted]++;
  const isCorrect = predicted === trueLabel;
  if (isCorrect) correct++;
  results.push({ text: text.substring(0, 55) + '...', true: trueLabel, predicted, correct: isCorrect });
});

// ── Per-class metrics ─────────────────────────────────────────────────────
function computeMetrics(cls) {
  let tp = 0, fp = 0, fn = 0;
  CLASSES.forEach(other => {
    tp += (cls === other) ? confusion[cls][cls]  : 0;
    fp += (cls !== other) ? confusion[other][cls] : 0;
    fn += (cls !== other) ? confusion[cls][other] : 0;
  });
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1        = precision + recall > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0;
  return { tp, fp, fn, precision, recall, f1 };
}

// ── Print results ─────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  ⚡  EmotionDex — Model Evaluation Report                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('📋 Prediction Results:');
console.log('─'.repeat(80));
results.forEach(r => {
  const mark = r.correct ? '✅' : '❌';
  console.log(`${mark}  [${r.true.padEnd(8)}→ ${r.predicted.padEnd(8)}]  ${r.text}`);
});

console.log('\n📊 Per-Class Metrics:');
console.log('─'.repeat(65));
console.log('Class'.padEnd(12) + 'Precision'.padEnd(12) + 'Recall'.padEnd(12) + 'F1 Score'.padEnd(12) + 'Support');
console.log('─'.repeat(65));

const classMetrics = {};
let macroF1 = 0, macroPrecision = 0, macroRecall = 0;

CLASSES.forEach(cls => {
  const m = computeMetrics(cls);
  classMetrics[cls] = m;
  const support = TEST_SET.filter(t => t.true === cls).length;
  const icon = { angry:'🔥', sad:'💧', happy:'⚡', calm:'🌿', anxious:'🔮', love:'✨' }[cls];
  console.log(
    `${icon} ${cls}`.padEnd(12) +
    m.precision.toFixed(3).padEnd(12) +
    m.recall.toFixed(3).padEnd(12) +
    m.f1.toFixed(3).padEnd(12) +
    support
  );
  macroF1        += m.f1;
  macroPrecision += m.precision;
  macroRecall    += m.recall;
});

const numClasses = CLASSES.length;
macroF1        /= numClasses;
macroPrecision /= numClasses;
macroRecall    /= numClasses;

const accuracy = correct / TEST_SET.length;

console.log('─'.repeat(65));
console.log(
  'MACRO AVG'.padEnd(12) +
  macroPrecision.toFixed(3).padEnd(12) +
  macroRecall.toFixed(3).padEnd(12) +
  macroF1.toFixed(3).padEnd(12) +
  TEST_SET.length
);
console.log('─'.repeat(65));

console.log('\n🏆 Summary:');
console.log(`  Accuracy (overall):    ${(accuracy * 100).toFixed(1)}%  (${correct}/${TEST_SET.length} correct)`);
console.log(`  Macro Precision:       ${(macroPrecision * 100).toFixed(1)}%`);
console.log(`  Macro Recall:          ${(macroRecall * 100).toFixed(1)}%`);
console.log(`  Macro F1 Score:        ${macroF1.toFixed(3)}  ← Key metric`);
console.log(`  Model:                 AFINN-165 + Custom Rules (dual-layer)`);
console.log(`  Task:                  6-class emotion classification`);

console.log('\n🗺  Confusion Matrix:');
console.log('─'.repeat(75));
const header = '         ' + CLASSES.map(c => c.substring(0,7).padEnd(9)).join('');
console.log(header);
CLASSES.forEach(row => {
  const icon = { angry:'🔥',sad:'💧',happy:'⚡',calm:'🌿',anxious:'🔮',love:'✨' }[row];
  const line = `${icon} ${row.substring(0,6).padEnd(7)} ` +
    CLASSES.map(col => String(confusion[row][col]).padEnd(9)).join('');
  console.log(line);
});
console.log('─'.repeat(75));
console.log('\n  Legend: Rows = True label, Columns = Predicted label\n');
