/**
 * EmotionDex — Upgraded Sentiment Analysis Service v2
 *
 * Architecture:
 *  Layer 1 → Negation-aware AFINN (fixes "not happy" type errors)
 *  Layer 2 → Intensity-weighted keyword engine (very/extremely boost)
 *  Layer 3 → Regex context patterns (wait times, cancellations, etc.)
 *
 * Target F1: >0.95 on 6-class emotion task
 */

const Sentiment = require('sentiment');
const analyzer  = new Sentiment();

const { hasIndicScript, detectLocale, classifyDatasetEmotion } = require('./multilingual');
const { classifyWithTransformer } = require('./transformer');

// ── Negation window: if a negator appears within N words before a keyword,
//   flip or dampen its score. ───────────────────────────────────────────────
const NEGATORS = new Set([
  'not','no','never','neither','nor','nobody','nothing','nowhere','hardly',
  'scarcely','barely','without','cannot','can\'t','won\'t','don\'t','didn\'t',
  'doesn\'t','wasn\'t','weren\'t','isn\'t','aren\'t','haven\'t','hasn\'t',
  'wouldn\'t','shouldn\'t','couldn\'t','ain\'t'
]);

const NEGATION_WINDOW = 4; // words to look back for a negator

// ── Intensity amplifiers ──────────────────────────────────────────────────
const INTENSIFIERS = {
  'very': 1.5, 'extremely': 2.0, 'absolutely': 2.0, 'completely': 1.8,
  'totally': 1.7, 'utterly': 1.9, 'incredibly': 1.8, 'so': 1.3,
  'really': 1.4, 'deeply': 1.6, 'terribly': 1.7, 'awfully': 1.7,
  'genuinely': 1.3, 'truly': 1.4, 'quite': 1.2, 'highly': 1.4,
  'exceptionally': 1.8, 'outrageously': 2.0, 'ridiculously': 1.9
};

// ── Diminishers (reduce intensity) ────────────────────────────────────────
const DIMINISHERS = {
  'slightly': 0.5, 'a bit': 0.6, 'somewhat': 0.7, 'kind of': 0.6,
  'kinda': 0.6, 'sort of': 0.6, 'a little': 0.6, 'mildly': 0.5,
  'fairly': 0.8, 'rather': 0.8
};

// ── Emotion definitions with expanded keyword sets ─────────────────────────
const EMOTION_TYPES = {
  angry: {
    label: 'Angry', type: 'Fire', typeClass: 'type-fire',
    icon: '🔥', color: '#FF4D4D', priority: 'CRITICAL', priorityScore: 95,
    urgency: 'Immediate', action: 'Escalate to human agent immediately',
    description: 'Customer expressing intense frustration or anger',
    strategy: 'Acknowledge frustration, apologize sincerely, escalate immediately',
    // Scored keywords: [word, score] — higher score = stronger signal
    keywords: [
      ['angry',4],['furious',5],['unacceptable',4],['terrible',3],['awful',3],
      ['horrible',3],['ridiculous',4],['disgusting',4],['hate',4],['worst',4],
      ['useless',4],['incompetent',4],['lawsuit',5],['scam',5],['fraud',5],
      ['outrageous',5],['pathetic',4],['absurd',3],['insane',3],['livid',5],
      ['enraged',5],['infuriated',5],['irate',5],['mad',3],['appalled',4],
      ['disgusted',4],['fed up',5],['sick of',4],['done with',3],['rip-off',5],
      ['rip off',5],['robbed',5],['theft',5],['lied',4],['cheated',5],
      ['wasted my time',5],['waste of time',4],['nothing works',4],
      ['never again',4],['last time',3],['cancel everything',5],
      ['demand a refund',5],['refund now',5],['speak to manager',4],
      ['supervisor',3],['legal action',5],['threaten',4],['report you',4],
      ['useless service',5],['broken promise',4],['false advertising',5],
      ['overcharged',4],['charged twice',5],['unauthorized charge',5],
      ['no resolution',4],['keeps happening',4],['still not fixed',4]
    ],
    patterns: [
      /\d+\s*(day|hour|week)s?\s*(wait|waiting|and nothing|and no)/i,
      /nobody\s*(helped|responded|replied|answered)/i,
      /no\s*(one|response|reply|help|answer)\s*(for|in|after)\s*\d+/i,
      /speak\s*to\s*a?\s*(manager|supervisor|human|person|agent)/i,
      /cancel\s*(my\s*)?(order|account|subscription|membership)/i,
      /take\s*(legal|this to\s*court|action)/i,
      /report\s*(you|this|to)/i,
      /still\s*(waiting|no\s*(response|reply|update|fix))/i,
      /\!\!+|\?\!\?/,   // multiple exclamations = frustration signal
      /all\s*caps\s*word/,
      /this\s+is\s+(completely|totally|absolutely|utterly)\s+(unacceptable|ridiculous|outrageous)/i,
      /i\s+want\s+(my\s+money|a\s+refund)\s+back/i,
      /where\s+is\s+my\s+(order|package|refund|money)/i
    ]
  },

  sad: {
    label: 'Sad', type: 'Water', typeClass: 'type-water',
    icon: '💧', color: '#4D96FF', priority: 'HIGH', priorityScore: 75,
    urgency: 'Within 15 mins', action: 'Provide empathetic support, offer solutions',
    description: 'Customer feeling disappointed or let down',
    strategy: 'Show empathy, offer compensations, follow up proactively',
    keywords: [
      ['sad',3],['disappointed',4],['upset',3],['let down',4],['unhappy',3],
      ['depressed',3],['heartbroken',5],['broken',3],['devastated',5],
      ['crushed',4],['gutted',4],['miserable',4],['regret',3],['regrets',3],
      ['waste of money',4],['waste my money',4],['not what i expected',4],
      ['expected better',4],['expected more',4],['didn\'t expect this',3],
      ['poor quality',4],['low quality',4],['bad quality',4],['defective',4],
      ['damaged',3],['broken item',4],['arrived broken',5],['arrived damaged',5],
      ['fell apart',4],['stopped working',4],['not working',3],
      ['does not work',4],['doesn\'t work',4],['misleading',4],['misled',4],
      ['false hope',4],['let me down',4],['failure',3],['failed me',4],
      ['trusted you',4],['trusted your brand',5],['feel betrayed',5],
      ['not happy',4],['not satisfied',4],['not pleased',3],['sadly',3],
      ['isn\'t what i expected',4],['not as expected',4],['nothing like i expected',4],
      ['really let down',5],['truly let down',5],['so let down',5]
    ],
    patterns: [
      /i('m|\s+am)\s+(so|really|very|deeply|truly|extremely)?\s+(sad|disappointed|upset|unhappy)/i,
      /this\s+(is\s+|isn'?t\s+|was\s+|wasn'?t\s+)?(not|nothing\s+like)\s+what\s+i\s+(expected|wanted|ordered|hoped)/i,
      /(isn'?t|is\s+not|wasn'?t|was\s+not)\s+what\s+i\s+(expected|wanted|ordered|hoped)/i,
      /i\s+(saved|paid)\s+(up\s+)?for\s+(months|years|a\s+long\s+time)/i,
      /i\s+(feel|felt)\s+(let\s+down|betrayed|cheated|disappointed)/i,
      /what\s+a\s+(disappointment|waste|letdown)/i,
      /wish\s+i\s+(had\s+never|didn\'t|could\s+return)/i,
      /feel\s+(really|so|very|truly|deeply)?\s+(let\s+down|disappointed|betrayed)/i
    ]
  },

  happy: {
    label: 'Happy', type: 'Electric', typeClass: 'type-electric',
    icon: '⚡', color: '#FFD93D', priority: 'POSITIVE', priorityScore: 20,
    urgency: 'Standard', action: 'Maintain positive engagement, offer upsell',
    description: 'Customer expressing satisfaction or delight',
    strategy: 'Reinforce positive experience, request review, offer loyalty rewards',
    keywords: [
      ['happy',3],['great',3],['excellent',4],['amazing',4],['wonderful',4],
      ['fantastic',4],['awesome',4],['perfect',4],['brilliant',4],
      ['outstanding',5],['superb',5],['exceptional',5],['incredible',4],
      ['pleased',3],['satisfied',3],['delighted',4],['impressed',4],
      ['thrilled',4],['ecstatic',5],['overjoyed',5],['glad',2],['cheerful',3],
      ['thank you',3],['thanks',2],['appreciate',3],['grateful',3],
      ['highly recommend',4],['will recommend',4],['recommend you',4],
      ['five stars',5],['5 stars',5],['10/10',5],['best purchase',4],
      ['best service',5],['exceeded expectations',5],['beyond expectations',5],
      ['fast delivery',3],['quick delivery',3],['prompt',3],['efficient',3],
      ['helpful',3],['professional',3],['courteous',4],['polite',3],
      ['great job',4],['well done',4],['keep it up',3],['love it',4],
      ['absolutely love',5],['totally love',5]
    ],
    patterns: [
      /i('m|\s+am)\s+(so|really|very|absolutely|totally)?\s+(happy|pleased|satisfied|thrilled|delighted)/i,
      /love\s+(your|the|this)\s+(product|service|team|support|brand)/i,
      /made\s+my\s+day/i,
      /customer\s+for\s+(life|ever|always)/i,
      /will\s+(definitely|certainly|absolutely)\s+(buy|order|use|come\s+back)\s+again/i,
      /(arrived|delivered)\s+(early|on\s+time|quickly|fast)/i,
      /exactly\s+(what|as)\s+i\s+(expected|wanted|ordered)/i,
      /couldn\'t\s+be\s+(more|happier|better)/i
    ]
  },

  calm: {
    label: 'Calm', type: 'Grass', typeClass: 'type-grass',
    icon: '🌿', color: '#6BCB77', priority: 'NORMAL', priorityScore: 40,
    urgency: 'Within 1 hour', action: 'Standard support resolution',
    description: 'Customer in a neutral, composed state',
    strategy: 'Provide clear information, resolve efficiently',
    keywords: [
      ['question',2],['inquiry',2],['information',1],['details',1],
      ['could you',2],['can you',2],['please',1],['wondering',2],
      ['would like to know',3],['need to know',2],['curious',2],
      ['how do i',2],['how can i',2],['what is',1],['when will',2],
      ['where is',2],['clarify',2],['explain',2],['update me',2],
      ['let me know',1],['get back to me',1],['follow up',1],['checking in',2],
      ['quick question',2],['simple question',2],['just wondering',2],
      ['want to confirm',2],['need confirmation',2],['verify',2]
    ],
    patterns: [
      /could\s+you\s+(please\s+)?(help|tell|explain|clarify|update|confirm)/i,
      /i\s+(would|'d)\s+like\s+to\s+(know|understand|confirm|get)/i,
      /just\s+(checking|wanted\s+to\s+ask|a\s+quick\s+question)/i,
      /when\s+(will|can|should|does)/i,
      /how\s+(long|much|do\s+i|can\s+i|should)/i,
      /is\s+it\s+(possible|okay|alright|fine)/i
    ]
  },

  anxious: {
    label: 'Anxious', type: 'Psychic', typeClass: 'type-psychic',
    icon: '🔮', color: '#9B5DE5', priority: 'HIGH', priorityScore: 80,
    urgency: 'Within 10 mins', action: 'Immediate reassurance and clear timeline',
    description: 'Customer feeling worried or fearful',
    strategy: 'Provide clear timelines, reassure with facts, offer escalation path',
    keywords: [
      ['worried',4],['anxious',4],['scared',4],['fear',3],['nervous',3],
      ['concerned',3],['stressed',4],['panic',5],['panicking',5],
      ['urgent',4],['urgently',4],['emergency',5],['asap',4],['immediately',4],
      ['critical',4],['cannot wait',5],["can't wait",5],['time sensitive',5],
      ['deadline',4],['running out of time',5],['need this now',5],
      ['please hurry',4],['help me fast',5],['in a rush',4],['rushed',3],
      ['time is running out',5],['need it today',4],['need it tomorrow',4],
      ['before my event',4],['before the date',4],['what if',3],
      ['i hope',2],['fingers crossed',2],['please tell me',3],
      ['am i going to',3],['will it',3],['is there any chance',3],
      ['not sure if',3],['afraid that',4],['terrified',4],['dread',4]
    ],
    patterns: [
      /i('m|\s+am)\s+(really\s+|so\s+|very\s+|extremely\s+)?(worried|concerned|scared|anxious|nervous|stressed)/i,
      /(urgent|emergency|asap|immediately|right\s+now|right\s+away)/i,
      /will\s+(it|this|my\s+order)\s+(arrive|come|be\s+delivered|be\s+fixed)\s+(in\s+time|before|by)/i,
      /i\s+(can\'t|cannot)\s+(wait|afford\s+to\s+wait)/i,
      /need\s+(this\s+)?(resolved|fixed|sorted|done)\s+(immediately|urgently|asap|today|now)/i,
      /deadline\s+is\s+(today|tomorrow|this\s+week|soon)/i,
      /please\s+(help|respond|reply|answer)\s+(me\s+)?(urgently|immediately|asap|quickly|fast)/i
    ]
  },

  love: {
    label: 'Love', type: 'Fairy', typeClass: 'type-fairy',
    icon: '✨', color: '#FF66C4', priority: 'POSITIVE', priorityScore: 10,
    urgency: 'Scheduled', action: 'Leverage loyalty, request referral',
    description: 'Customer expressing deep brand loyalty and love',
    strategy: 'Nurture relationship, loyalty program, ambassador invite',
    keywords: [
      ['love',4],['adore',5],['obsessed',5],['loyal',4],['loyalty',4],
      ['forever',4],['for life',5],['always',3],['dedicated',5],['committed',4],
      ['fan',3],['biggest fan',5],['lifelong',5],['will always',4],
      ['never leaving',5],['never switching',5],['never going anywhere',5],
      ['recommend to everyone',5],['tell everyone',4],['spread the word',4],
      ['you are the best',5],['you guys are the best',5],['absolutely love',5],
      ['deeply love',5],['truly love',5],['head over heels',5],
      ['cannot imagine',4],['can\'t imagine',4],['wouldn\'t go anywhere else',5],
      ['best brand ever',5],['my favorite brand',5],['go-to brand',4],
      ['my go-to',4],['been with you',4],['been a customer',3],
      ['years of loyalty',5],['long-time customer',4],['long time customer',4],
      ['proud customer',4],['lifelong customer',5],
      ['since day one',5],['day one',4],['dedicated to your',5],
      ['dedicated to this brand',5],['dedicated customer',5],
      ['keep up the amazing',4],['keep up the great',4],
      ['supporter',4],['devoted',5],['brand advocate',5]
    ],
    patterns: [
      /i\s+(love|adore|absolutely\s+love|deeply\s+love|truly\s+love)\s+(you|your|this)/i,
      /customer\s+for\s+(life|ever|always|the\s+rest\s+of\s+my\s+life)/i,
      /will\s+(always|never\s+stop|forever)\s+(use|using|buy|buying|shop|shopping)/i,
      /wouldn\'t\s+(go|shop|buy)\s+(anywhere|elsewhere)\s+else/i,
      /(been|have\s+been)\s+a\s+(loyal\s+)?customer\s+(for|since)\s+\d+/i,
      /recommend\s+(you|your\s+(brand|products?|services?))\s+to\s+(everyone|all)/i,
      /my\s+(absolute\s+)?favorite\s+(brand|company|store|shop)/i,
      /dedicated\s+(to\s+your|customer|supporter|fan)/i,
      /since\s+day\s+one/i,
      /(keep\s+up|continue)\s+the\s+(amazing|great|excellent|fantastic)\s+work/i
    ]
  }
};

// ── Negation-aware tokenizer ───────────────────────────────────────────────
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

function isNegated(tokens, position) {
  const start = Math.max(0, position - NEGATION_WINDOW);
  for (let i = start; i < position; i++) {
    if (NEGATORS.has(tokens[i])) return true;
  }
  return false;
}

function getIntensifier(tokens, position) {
  // Check 1-2 words before
  for (let i = Math.max(0, position - 2); i < position; i++) {
    const word = tokens[i];
    if (INTENSIFIERS[word]) return INTENSIFIERS[word];
    if (DIMINISHERS[word])  return DIMINISHERS[word];
  }
  return 1.0;
}

// ── Score each emotion with negation + intensity awareness ─────────────────
function scoreEmotion(text, emotionDef) {
  const tokens  = tokenize(text);
  const lower   = text.toLowerCase();
  let score     = 0;

  // Keyword scoring with negation + intensity
  emotionDef.keywords.forEach(([kw, weight]) => {
    const kwTokens = kw.split(/\s+/);
    if (kwTokens.length === 1) {
      // Single-word lookup (fast path)
      const idx = tokens.indexOf(kwTokens[0]);
      if (idx !== -1) {
        const negated    = isNegated(tokens, idx);
        const intensity  = getIntensifier(tokens, idx);
        const delta      = weight * intensity;
        score += negated ? -delta * 0.5 : delta;  // negation halves and flips
      }
    } else {
      // Multi-word phrase
      if (lower.includes(kw)) {
        const approxIdx = lower.indexOf(kw) > 20 ? 5 : 1;
        const negated   = isNegated(tokens, approxIdx);
        score += negated ? -weight * 0.5 : weight;
      }
    }
  });

  // Regex pattern scoring (context signals — strong weight)
  if (emotionDef.patterns) {
    emotionDef.patterns.forEach(pat => {
      if (pat.test(text)) score += 6;
    });
  }

  return Math.max(0, score);
}

// ── ALL-CAPS detection (strong anger signal) ───────────────────────────────
function detectAllCaps(text) {
  const words = text.split(/\s+/).filter(w => w.length > 2);
  const capsWords = words.filter(w => w === w.toUpperCase() && /[A-Z]/.test(w));
  return capsWords.length >= 2 ? capsWords.length * 2 : 0;
}

// ── Punctuation signals ────────────────────────────────────────────────────
function getPunctuationSignal(text) {
  const exclamations = (text.match(/!/g) || []).length;
  const questionMarks = (text.match(/\?/g) || []).length;
  const ellipsis = (text.match(/\.\.\./g) || []).length;
  return {
    angerBoost:   Math.min(exclamations * 1.5, 8),  // caps out at 8
    anxietyBoost: Math.min(questionMarks * 1.2, 6),
    sadBoost:     ellipsis * 1.5
  };
}

// ── Main analysis function ─────────────────────────────────────────────────
function analyzeSentiment(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }

  const trimmed = text.trim();

  // ── Layer 1: Negation-aware AFINN ────────────────────────────────────────
  const afinn = analyzer.analyze(trimmed);
  const afinnComparative = afinn.comparative;
  const afinnScore       = afinn.score;
  const positiveWords    = afinn.positive;
  const negativeWords    = afinn.negative;

  // ── Layer 2: Expanded keyword + negation + intensity scoring ─────────────
  const emotionScores = {};
  Object.entries(EMOTION_TYPES).forEach(([key, def]) => {
    emotionScores[key] = scoreEmotion(trimmed, def);
  });

  // ── Layer 3: Punctuation + all-caps signals ───────────────────────────────
  const caps  = detectAllCaps(trimmed);
  const punct = getPunctuationSignal(trimmed);

  emotionScores.angry   = (emotionScores.angry   || 0) + caps + punct.angerBoost;
  emotionScores.anxious = (emotionScores.anxious  || 0) + punct.anxietyBoost;
  emotionScores.sad     = (emotionScores.sad      || 0) + punct.sadBoost;

  // ── Layer 4: AFINN blend (only if strong signal) ─────────────────────────
  if (afinnComparative < -0.4) {
    const boost = Math.abs(afinnComparative) * 6;
    emotionScores.angry = (emotionScores.angry || 0) + boost;
    emotionScores.sad   = (emotionScores.sad   || 0) + boost * 0.5;
  } else if (afinnComparative > 0.4) {
    const boost = afinnComparative * 6;
    emotionScores.happy = (emotionScores.happy || 0) + boost;
    emotionScores.love  = (emotionScores.love  || 0) + boost * 0.4;
  } else if (Math.abs(afinnComparative) < 0.15) {
    emotionScores.calm  = (emotionScores.calm  || 0) + 2;
  }

  // ── Pick winner ────────────────────────────────────────────────────────────
  const sorted = Object.entries(emotionScores).sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = sorted[0];
  const detected = EMOTION_TYPES[topKey];

  // ── Confidence calculation ─────────────────────────────────────────────────
  const totalScore    = sorted.reduce((s, [, v]) => s + v, 0);
  const rawConf       = totalScore > 0 ? (topScore / totalScore) * 100 : 50;
  const gapConfidence = sorted[1] ? ((topScore - sorted[1][1]) / Math.max(topScore, 1)) * 40 : 20;
  const confidence    = Math.min(98, Math.max(50, Math.round(rawConf * 0.55 + gapConfidence + 20)));

  // ── Secondary emotion (runner-up) ──────────────────────────────────────────
  const secondary = (sorted[1]?.[1] > 0)
    ? { label: EMOTION_TYPES[sorted[1][0]].label, icon: EMOTION_TYPES[sorted[1][0]].icon }
    : null;

  let result = {
    emotion: {
      key:       topKey,
      label:     detected.label,
      type:      detected.type,
      typeClass: detected.typeClass,
      icon:      detected.icon,
      color:     detected.color,
      description: detected.description,
      strategy:    detected.strategy
    },
    priority: {
      level:    detected.priority,
      score:    detected.priorityScore,
      urgency:  detected.urgency,
      action:   detected.action
    },
    confidence,
    nlp: {
      afinnScore,
      afinnComparative: parseFloat(afinnComparative.toFixed(4)),
      positiveWords,
      negativeWords,
      capsSignal:   caps,
      punctSignal:  punct,
      wordCount:    trimmed.split(/\s+/).length,
      charCount:    trimmed.length
    },
    secondary,
    allScores: Object.fromEntries(
      Object.entries(emotionScores).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
    )
  };

  // ── Transformer layer (async-safe: used externally; see api.js for merge) ──
  // The transformer result is merged by the /api/scan route asynchronously.
  // We only call the old Naive Bayes here as a fast fallback for Indic script.
  try {
    if (hasIndicScript(trimmed)) {
      const ml = classifyDatasetEmotion(trimmed);
      if (ml?.key && EMOTION_TYPES[ml.key] && ml.confidence >= 30) {
        const override = EMOTION_TYPES[ml.key];
        result.nlp.multilingual = { used: true, ...ml };
        if (ml.key !== result.emotion.key) {
          result.emotion = {
            key: ml.key, label: override.label, type: override.type,
            typeClass: override.typeClass, icon: override.icon,
            color: override.color, description: override.description,
            strategy: override.strategy
          };
          result.priority = {
            level: override.priority, score: override.priorityScore,
            urgency: override.urgency, action: override.action
          };
        }
        result.confidence = Math.max(result.confidence, Math.min(98, ml.confidence));
      } else {
        result.nlp.multilingual = { used: false, reason: 'no-confident-match' };
      }
    }
  } catch { /* never fail sentiment analysis */ }

  // Locale + display strings
  result.locale = detectLocale(trimmed);

  if (result.locale === 'ta') {
    const EMO_TA = { angry:'கோபம்', sad:'சோகம்', happy:'மகிழ்ச்சி', calm:'அமைதி', anxious:'கவலை', love:'காதல்' };
    const TYPE_TA = { Fire:'அக்னி', Water:'நீர்', Electric:'மின்சாரம்', Grass:'புல்', Psychic:'மன சக்தி', Fairy:'மாய' };
    const PRIORITY_TA = { CRITICAL:'மிக அவசரம்', HIGH:'உயர்', NORMAL:'இயல்பு', POSITIVE:'நல்லது' };
    const URGENCY_TA = { Immediate:'உடனடி', 'Within 10 mins':'10 நிமிடங்களில்', 'Within 15 mins':'15 நிமிடங்களில்', 'Within 1 hour':'1 மணி நேரத்தில்', Standard:'சாதாரணம்', Scheduled:'திட்டமிட்டது' };
    const ACTION_TA = {
      'Escalate to human agent immediately':'உடனடியாக மனித உதவியாளரிடம் மாற்றவும்',
      'Provide empathetic support, offer solutions':'இரக்கம் காட்டி உதவி செய்து தீர்வு வழங்கவும்',
      'Maintain positive engagement, offer upsell':'நல்ல உரையாடலைத் தொடர்ந்து உதவி/விருப்பங்களை வழங்கவும்',
      'Standard support resolution':'சாதாரண ஆதரவு தீர்வு',
      'Immediate reassurance and clear timeline':'உடனடி நம்பிக்கை அளித்து தெளிவான நேரக்கட்டத்தை வழங்கவும்',
      'Leverage loyalty, request referral':'நம்பிக்கையை மதித்து பரிந்துரையை கோரவும்'
    };
    const key = result.emotion.key;
    result.display = {
      emotionLabel: EMO_TA[key] || result.emotion.label,
      typeBadge: `${result.emotion.icon} ${(TYPE_TA[result.emotion.type] || result.emotion.type)} வகை`,
      priorityLabel: PRIORITY_TA[result.priority.level] || result.priority.level,
      urgency: URGENCY_TA[result.priority.urgency] || result.priority.urgency,
      action: ACTION_TA[result.priority.action] || result.priority.action,
      description: { angry:'கடுமையான அதிருப்தி அல்லது கோபம் வெளிப்படுகிறது', sad:'நிராசை அல்லது மனவருத்தம் வெளிப்படுகிறது', happy:'திருப்தி அல்லது மகிழ்ச்சி வெளிப்படுகிறது', calm:'நடுநிலை/அமைதியான மனநிலை', anxious:'பயம்/கவலை அல்லது அவசரம்', love:'அன்பு/நம்பிக்கை வெளிப்படுகிறது' }[key] || result.emotion.description,
      strategy: { angry:'கோபத்தை ஏற்றுக்கொண்டு மன்னிப்பு கூறி உடனடியாக உயர்நிலைக்கு மாற்றவும்', sad:'இரக்கம் காட்டி தீர்வை முன்வைத்து தொடர்ந்து தகவல் அளிக்கவும்', happy:'நன்றியை தெரிவித்து நல்ல அனுபவத்தை உறுதிப்படுத்தவும்', calm:'தெளிவான தகவல் கொடுத்து விரைவாக தீர்க்கவும்', anxious:'உறுதியளித்து நேரக்கட்டத்தை தெளிவாக கூறவும்', love:'நம்பிக்கையை மதித்து சிறப்பு நன்மைகள்/பரிசு வழங்கவும்' }[key] || result.emotion.strategy
    };
  }

  if (result.locale === 'hi') {
    const EMO_HI = { angry:'क्रोध', sad:'दुःख', happy:'खुशी', calm:'शांति', anxious:'चिंता', love:'प्यार' };
    const TYPE_HI = { Fire:'अग्नि', Water:'जल', Electric:'विद्युत', Grass:'प्रकृति', Psychic:'मानसिक', Fairy:'जादू' };
    const PRIORITY_HI = { CRITICAL:'अत्यंत जरूरी', HIGH:'उच्च', NORMAL:'सामान्य', POSITIVE:'सकारात्मक' };
    const URGENCY_HI = { Immediate:'तुरंत', 'Within 10 mins':'10 मिनट में', 'Within 15 mins':'15 मिनट में', 'Within 1 hour':'1 घंटे में', Standard:'सामान्य', Scheduled:'निर्धारित' };
    const ACTION_HI = {
      'Escalate to human agent immediately':'तुरंत मानव एजेंट को स्थानांतरित करें',
      'Provide empathetic support, offer solutions':'सहानुभूति के साथ समाधान प्रदान करें',
      'Maintain positive engagement, offer upsell':'सकारात्मक संपर्क बनाए रखें',
      'Standard support resolution':'सामान्य समर्थन समाधान',
      'Immediate reassurance and clear timeline':'तुरंत आश्वासन और स्पष्ट समयसीमा दें',
      'Leverage loyalty, request referral':'वफादारी का सम्मान करें, रेफरल मांगें'
    };
    const key = result.emotion.key;
    result.display = {
      emotionLabel: EMO_HI[key] || result.emotion.label,
      typeBadge: `${result.emotion.icon} ${(TYPE_HI[result.emotion.type] || result.emotion.type)} प्रकार`,
      priorityLabel: PRIORITY_HI[result.priority.level] || result.priority.level,
      urgency: URGENCY_HI[result.priority.urgency] || result.priority.urgency,
      action: ACTION_HI[result.priority.action] || result.priority.action,
      description: { angry:'ग्राहक तीव्र निराशा या क्रोध व्यक्त कर रहा है', sad:'ग्राहक निराश या हताश महसूस कर रहा है', happy:'ग्राहक संतुष्टि या प्रसन्नता व्यक्त कर रहा है', calm:'ग्राहक शांत और तटस्थ अवस्था में है', anxious:'ग्राहक चिंतित या भयभीत है', love:'ग्राहक गहरी ब्रांड वफादारी व्यक्त कर रहा है' }[key] || result.emotion.description,
      strategy: { angry:'क्रोध स्वीकार करें, माफी मांगें, तुरंत एस्केलेट करें', sad:'सहानुभूति दिखाएं, समाधान प्रस्तुत करें', happy:'सकारात्मक अनुभव की पुष्टि करें, धन्यवाद दें', calm:'स्पष्ट जानकारी दें, जल्दी समाधान करें', anxious:'आश्वासन दें, स्पष्ट समयसीमा बताएं', love:'वफादारी का सम्मान करें, विशेष लाभ प्रदान करें' }[key] || result.emotion.strategy
    };
  }

  return result;
}

module.exports = { analyzeSentiment, EMOTION_TYPES };
