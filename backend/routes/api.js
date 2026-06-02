/**
 * EmotionDex — API Routes
 *
 * POST /api/scan         → Analyze text emotion (local NLP)
 * POST /api/reply        → Generate support reply (local templates)
 * GET  /api/dashboard    → Live dashboard stats
 * GET  /api/analytics    → Full analytics data
 * POST /api/escalate     → Log an escalation
 * GET  /api/health       → Health check
 */

const express  = require('express');
const router   = express.Router();

const { analyzeSentiment, EMOTION_TYPES } = require('../services/sentiment');
const { enrichReply }        = require('../services/enricher');
const { classifyWithTransformer, getStatus: getTransformerStatus } = require('../services/transformer');
const { classifyIndic, getStatus: getIndicStatus } = require('../services/indicNLP');
const {
  recordScan, recordEscalation, recordReply,
  getDashboardStats, getAnalytics
} = require('../services/store');

// ── Helper: wrap async route handlers ─────────────────────────────────────
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── POST /api/scan ─────────────────────────────────────────────────────────
router.post('/scan', asyncHandler(async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length < 2) {
    return res.status(400).json({ error: 'text field is required (min 2 characters)' });
  }

  if (text.length > 5000) {
    return res.status(400).json({ error: 'text exceeds 5000 character limit' });
  }

  // Layer 1: Local NLP (fast, synchronous)
  const result = analyzeSentiment(text.trim());

  // Layer 2: Transformer NLP (multilingual-e5-small embeddings)
  try {
    const tfResult = await classifyWithTransformer(text.trim());
    const tfWins = tfResult && tfResult.key &&
      tfResult.confidence >= 60 &&
      (tfResult.confidence - result.confidence) >= 8;
    if (tfWins) {
      const override = EMOTION_TYPES[tfResult.key];
      if (override) {
        result.emotion = {
          key: tfResult.key, label: override.label, type: override.type,
          typeClass: override.typeClass, icon: override.icon, color: override.color,
          description: override.description, strategy: override.strategy
        };
        result.priority = {
          level: override.priority, score: override.priorityScore,
          urgency: override.urgency, action: override.action
        };
        result.confidence = tfResult.confidence;
        result.nlp.transformer = { used: true, model: tfResult.model, scores: tfResult.scores };
      }
    } else if (tfResult) {
      result.nlp.transformer = { used: false, model: tfResult.model, topKey: tfResult.key };
    } else {
      result.nlp.transformer = { used: false, reason: 'model-loading' };
    }
  } catch (tfErr) {
    result.nlp.transformer = { used: false, reason: tfErr.message };
  }

  // Layer 3: Dedicated mBERT model for Hindi & Tamil
  // Runs only for Indic locales; wins if it beats current confidence by ≥5 pts
  const locale = result.locale;
  if (locale === 'hi' || locale === 'ta') {
    try {
      const indicResult = await classifyIndic(text.trim(), locale);
      if (indicResult && indicResult.key) {
        // If Layer 1 had zero language signal (AFINN=0, no English keywords),
        // the "calm" default is unreliable — IndicNLP should always take over.
        const layer1HadSignal = result.nlp.afinnScore !== 0 ||
          (result.nlp.positiveWords?.length + result.nlp.negativeWords?.length) > 0;
        const indicWins = indicResult.confidence >= 55 &&
          (!layer1HadSignal || indicResult.confidence > result.confidence + 5);
        if (indicWins) {
          const override = EMOTION_TYPES[indicResult.key];
          if (override) {
            result.emotion = {
              key: indicResult.key, label: override.label, type: override.type,
              typeClass: override.typeClass, icon: override.icon, color: override.color,
              description: override.description, strategy: override.strategy
            };
            result.priority = {
              level: override.priority, score: override.priorityScore,
              urgency: override.urgency, action: override.action
            };
            result.confidence = indicResult.confidence;
            result.nlp.indicNLP = { used: true, model: indicResult.model,
              polarity: indicResult.polarity, scores: indicResult.scores };
          }
        } else {
          result.nlp.indicNLP = { used: false, topKey: indicResult.key,
            confidence: indicResult.confidence, model: indicResult.model };
        }
      }
    } catch (indicErr) {
      result.nlp.indicNLP = { used: false, reason: indicErr.message };
    }
  }

  // Record to analytics store
  recordScan(result, text.trim());

  return res.json({
    success: true,
    text:    text.trim(),
    result,
    enrichment: null
  });
}));

// ── POST /api/reply ────────────────────────────────────────────────────────
router.post('/reply', asyncHandler(async (req, res) => {
  const { text, mode = 'calm' } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length < 2) {
    return res.status(400).json({ error: 'text field is required' });
  }

  const validModes = ['calm', 'premium', 'crisis'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${validModes.join(', ')}` });
  }

  // Always run NLP first to get emotion context
  const sentimentResult = analyzeSentiment(text.trim());
  const locale = sentimentResult.locale || 'en';

  // Try Groq AI first, fall back to templates
  const enriched = await enrichReply(
    text.trim(),
    sentimentResult.emotion.key,
    mode,
    locale
  );

  recordReply();

  return res.json({
    success: true,
    mode,
    locale,
    display: sentimentResult.display || null,
    emotion: sentimentResult.emotion,
    priority: sentimentResult.priority,
    confidence: sentimentResult.confidence,
    reply: enriched.reply,
    enrichmentSource: enriched.source,
    enrichmentModel: enriched.model,
    usingAI: enriched.source === 'groq-ai'
  });
}));

// ── GET /api/dashboard ─────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.json({ success: true, data: getDashboardStats() });
});

// ── GET /api/analytics ─────────────────────────────────────────────────────
router.get('/analytics', (req, res) => {
  res.json({ success: true, data: getAnalytics() });
});

// ── POST /api/escalate ─────────────────────────────────────────────────────
router.post('/escalate', (req, res) => {
  const { emotionKey, message } = req.body;
  recordEscalation(emotionKey || 'angry', message);
  res.json({ success: true, message: 'Escalation logged and agent notified' });
});

// ── GET /api/transformer-status ──────────────────────────────────────────────
router.get('/transformer-status', (req, res) => {
  res.json({
    success: true,
    data: {
      embeddings: getTransformerStatus(),
      indicNLP:   getIndicStatus()
    }
  });
});

// ── POST /api/classify ────────────────────────────────────────────────────────
// Direct transformer classification endpoint
router.post('/classify', asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length < 2) {
    return res.status(400).json({ error: 'text field is required (min 2 characters)' });
  }
  const tfResult = await classifyWithTransformer(text.trim());
  if (!tfResult) {
    const status = getTransformerStatus();
    return res.status(503).json({
      error: status.loading ? 'Transformer model is still loading, try again in a moment' : 'Transformer unavailable',
      status
    });
  }
  const { analyzeSentiment } = require('../services/sentiment');
  const baseResult = analyzeSentiment(text.trim());
  return res.json({
    success:    true,
    text:       text.trim(),
    locale:     baseResult.locale,
    display:    baseResult.display || null,
    classifier: 'transformer',
    model:      tfResult.model,
    emotion:    tfResult.key,
    confidence: tfResult.confidence,
    scores:     tfResult.scores
  });
}));

// ── GET /api/health ───────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  const { isConfigured: groqConfigured } = require('../services/groq');
  res.json({
    status:    'ok',
    uptime:    process.uptime().toFixed(1) + 's',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    integrations: {
      groq: groqConfigured() ? 'configured' : 'not-configured'
    }
  });
});

// ── Local reply templates ─────────────────────────────────────────────────
function localReplyTemplate(emotionKey, mode, locale = 'en') {
  const templatesEn = {
    angry: {
      calm:    'I sincerely apologize for the frustration this has caused — you deserve so much better. I\'m escalating your case to our senior team right now and we\'ll resolve this within 2 hours. Thank you for your patience, and I promise we\'ll make this right. — The EmotionDex Support Team',
      premium: 'I want to personally and sincerely apologize for this unacceptable experience. As a valued member of our community, you deserve excellence — and we have fallen short. Our Priority Resolution Team is being contacted this moment. — The EmotionDex Support Team',
      crisis:  '🚨 I hear you, and I am taking immediate action right now. What happened is completely unacceptable and I am escalating this as CRITICAL. A senior agent will contact you within 15 minutes with a concrete solution. — The EmotionDex Support Team'
    },
    sad: {
      calm:    'I\'m truly sorry to hear you\'re feeling disappointed — your feelings are completely valid. Let me look into this personally and find the best solution for you right away. We value you and want to turn this experience around. — The EmotionDex Support Team',
      premium: 'We are deeply sorry this experience left you feeling this way — we take full responsibility. As a valued customer, our white-glove support team is preparing a comprehensive resolution and a gesture of goodwill. — The EmotionDex Support Team',
      crisis:  'I am so sorry this happened to you and your pain is real. I am dropping everything to personally handle your case right now — you are not alone. — The EmotionDex Support Team'
    },
    happy: {
      calm:    'Thank you so much for your kind words — it truly means the world to our team! We\'re thrilled you\'re enjoying the experience. Is there anything else we can do to make it even better? — The EmotionDex Support Team',
      premium: 'Your gracious words are an absolute honor to our entire team! Your loyalty is the foundation of what we do. I\'d love to personally extend an exclusive invitation to our Elite Customer Advisory Board. — The EmotionDex Support Team',
      crisis:  'This is the most wonderful message we\'ve received today — thank you from the bottom of our hearts! We want to celebrate YOU right now! — The EmotionDex Support Team'
    },
    anxious: {
      calm:    'I completely understand your concern, and I want to assure you we\'re on top of this. Your case is being prioritized and you can expect a full update within 30 minutes. — The EmotionDex Support Team',
      premium: 'I want to personally reassure you that your case is now our absolute top priority. Our dedicated resolution team has been activated and you\'ll receive a guaranteed update within 10 minutes. — The EmotionDex Support Team',
      crisis:  'URGENT: I\'m treating your case as #1 priority RIGHT NOW. I understand the time pressure and I\'m acting immediately on your behalf. — The EmotionDex Support Team'
    },
    calm: {
      calm:    'Thank you for reaching out! I\'d be happy to help you with that. Let me look into this and provide a clear, complete answer right away. — The EmotionDex Support Team',
      premium: 'Thank you for connecting with us. I\'m delighted to assist and will ensure your query is handled with the highest level of care and precision. — The EmotionDex Support Team',
      crisis:  'Thank you for reaching out. I\'m prioritizing your request and will have an answer for you immediately. — The EmotionDex Support Team'
    },
    love: {
      calm:    'Wow, your kind words made our day! Your loyalty means everything to us. We\'d love to offer you a special loyalty reward — just reply to claim it! — The EmotionDex Support Team',
      premium: 'Your extraordinary loyalty is the greatest reward we could ever receive. We would be honored to make you one of our founding Brand Ambassadors with full VIP benefits. — The EmotionDex Support Team',
      crisis:  'Your incredible loyalty literally powers our mission. Expect something extraordinary from us very soon! — The EmotionDex Support Team'
    }
  };

  const templatesTa = {
    angry: {
      calm:    'உங்களுக்கு ஏற்பட்ட தொந்தரவு/மனவருத்தத்திற்கு மனப்பூர்வமாக மன்னிப்பு கோருகிறேன். இதை உடனே எங்கள் மூத்த ஆதரவு அணிக்குப் பரிந்துரைக்கிறேன்; 2 மணி நேரத்திற்குள் தீர்வு வழங்க முயற்சிப்போம். உங்கள் பொறுமைக்கு நன்றி. — EmotionDex ஆதரவு அணி',
      premium: 'இந்த ஏற்றுக்கொள்ள முடியாத அனுபவத்திற்கு நான் தனிப்பட்ட முறையில் மன்னிப்பு கோருகிறேன். உங்கள் வழக்கை உடனே எங்கள் முன்னுரிமை தீர்வு அணிக்கு உயர்த்துகிறோம். — EmotionDex ஆதரவு அணி',
      crisis:  '🚨 உங்கள் கோபத்தை நான் புரிந்துகொள்கிறேன். இது முற்றிலும் ஏற்றுக்கொள்ள முடியாதது; உங்கள் வழக்கை “மிக அவசரம்” என உடனே உயர்த்துகிறேன். 15 நிமிடங்களில் ஒரு மூத்த முகவர் தொடர்பு கொள்வார். — EmotionDex ஆதரவு அணி'
    },
    sad: {
      calm:    'நீங்கள் இப்படி உணர்வது புரிகிறது; உங்கள் உணர்வுகள் முற்றிலும் நியாயமானவை. இதை நான் உடனே பார்க்கிறேன் மற்றும் உங்களுக்கு சிறந்த தீர்வை வழங்க முயற்சிப்பேன். — EmotionDex ஆதரவு அணி',
      premium: 'இந்த அனுபவம் உங்களை இப்படி பாதித்ததற்கு வருந்துகிறோம்; முழுப் பொறுப்பையும் ஏற்கிறோம். எங்கள் சிறப்பு ஆதரவு அணி விரைவில் முழுமையான தீர்வை வழங்கும். — EmotionDex ஆதரவு அணி',
      crisis:  'இது உங்களுக்கு நடந்தது மிகவும் வருத்தமளிக்கிறது. உங்கள் வழக்கை நான் உடனே தனிப்பட்ட முறையில் கையாள்கிறேன்; நீங்கள் தனியாக இல்லை. — EmotionDex ஆதரவு அணி'
    },
    happy: {
      calm:    'உங்கள் நல்ல வார்த்தைகளுக்கு மிக்க நன்றி! உங்களுக்கு நல்ல அனுபவம் கிடைத்ததில் நாங்கள் மகிழ்கிறோம். இன்னும் எதாவது உதவி வேண்டுமா? — EmotionDex ஆதரவு அணி',
      premium: 'உங்கள் பாராட்டுச் சொற்கள் எங்கள் அணிக்கே ஒரு பெருமை! உங்கள் நம்பிக்கைக்கு நன்றி. — EmotionDex ஆதரவு அணி',
      crisis:  'இன்று கிடைத்த மிகச் சிறந்த செய்தி இதுவே — மனமார்ந்த நன்றி! — EmotionDex ஆதரவு அணி'
    },
    anxious: {
      calm:    'உங்கள் கவலை புரிகிறது. இந்த விஷயத்தை முன்னுரிமையாக எடுத்துள்ளோம்; 30 நிமிடங்களில் முழு புதுப்பிப்பை வழங்குகிறோம். — EmotionDex ஆதரவு அணி',
      premium: 'உங்கள் வழக்கு இப்போது எங்களின் மிக உயர்ந்த முன்னுரிமை. 10 நிமிடங்களில் உறுதியான புதுப்பிப்பு வழங்கப்படும். — EmotionDex ஆதரவு அணி',
      crisis:  'அவசரம்: உங்கள் வழக்கை இப்போதே #1 முன்னுரிமையாக கையாள்கிறோம். உடனடியாக நடவடிக்கை எடுக்கிறேன். — EmotionDex ஆதரவு அணி'
    },
    calm: {
      calm:    'தொடர்பு கொண்டதற்கு நன்றி! உங்கள் கேள்விக்கு உதவ மகிழ்ச்சி. இதை உடனே பார்த்து தெளிவான பதிலை வழங்குகிறேன். — EmotionDex ஆதரவு அணி',
      premium: 'தொடர்பு கொண்டதற்கு நன்றி. உங்கள் கேள்வியை மிக கவனமாகவும் துல்லியமாகவும் கையாள்கிறோம். — EmotionDex ஆதரவு அணி',
      crisis:  'தொடர்பு கொண்டதற்கு நன்றி. உங்கள் கோரிக்கையை முன்னுரிமையாக வைத்து உடனடி பதில் அளிக்கிறேன். — EmotionDex ஆதரவு அணி'
    },
    love: {
      calm:    'வாவ்! உங்கள் அன்பான வார்த்தைகள் எங்கள் நாளை மகிழ்ச்சியாக்கின. உங்கள் நம்பிக்கைக்கு நன்றி; உங்களுக்கு ஒரு சிறப்பு பரிசு/நன்மை வழங்க விரும்புகிறோம். — EmotionDex ஆதரவு அணி',
      premium: 'உங்கள் அபூர்வமான நம்பிக்கை எங்களுக்கு மிகப் பெரிய பரிசு. உங்களுக்கு VIP நன்மைகள் வழங்க விரும்புகிறோம். — EmotionDex ஆதரவு அணி',
      crisis:  'உங்கள் நம்பிக்கையே எங்கள் ஊக்கமாகிறது. மிகச் சிறந்த ஒன்றை விரைவில் வழங்குவோம்! — EmotionDex ஆதரவு அணி'
    }
  };

  const templates = (locale === 'ta') ? templatesTa : templatesEn;

  const emotionTemplates = templates[emotionKey] || templates.calm;
  return emotionTemplates[mode] || emotionTemplates.calm;
}

module.exports = router;
