'use strict';
/**
 * EmotionDex — Indic NLP Service
 *
 * Dedicated pre-trained model for Hindi & Tamil emotion classification.
 * Model: Xenova/bert-base-multilingual-uncased-sentiment (mBERT, 104 languages)
 *
 * Architecture:
 *   Layer A: Language-specific keyword lexicon  (fast, always runs)
 *   Layer B: mBERT 5-star sentiment             (async, gives polarity)
 *   Layer C: Combine → disambiguate emotion
 *
 * mBERT gives us: negative vs neutral vs positive
 * Keywords give us: angry vs sad vs anxious (all negative), happy vs love (both positive)
 */

const path = require('path');

let _pipeline  = null;
let _isLoading = false;
let _isReady   = false;
let _loadError = null;

// ── Hindi keyword lexicon ─────────────────────────────────────────────────────
const HINDI_LEX = {
  angry: [
    'गुस्सा','गुस्से','क्रोध','क्रोधित','नाराज','नाराजगी','आक्रोश','रोष',
    'धोखा','धोखेबाज','झूठ','झूठा','बेकार','चिढ़','आग बबूला',
    'बर्दाश्त नहीं','मंजूर नहीं','स्वीकार नहीं','रिफंड चाहिए',
    'बर्बाद','नुकसान','ठगी','ठगा','लूट','धोखेबाजी',
    'बेइज्जती','बेइज्जत','अपमान','बेकाम','घटिया','बदतमीजी'
  ],
  sad: [
    'रोना','रोया','रोई','रो रही','रो रहा','रोते','रो पड़ी','रो पड़ा',
    'सिसकना','सिसकने','सिसकी','सिसकते','सिसक','सिसकियां',
    'आंसू','आँसू','आंसुओं','आँसुओं','आंसू बहाना','रुलाना',
    'नम हो','नम हुई','नम हुआ','आंखें नम','नयन नम','नयन भर','कण्ठ भर','कंठ भर','गला भर',
    'दुख','दुखी','दुखद','दुखभरा','दुखान्त',
    'उदास','उदासी','मायूस','मायूसी','उदासीन',
    'दर्द','दर्दनाक','पीड़ा','पीड़ित','व्यथित','व्यथा',
    'गम','गमगीन','गमज़दा',
    'निराश','निराशा','हताश','हताशा',
    'टूटा','टूटी','टूट गया','टूट गई','बिखर','बिखरा','बिखरी',
    'रुदन','विलाप','क्रंदन','बिलखना','बिलख',
    'तड़प','तड़पना','तड़पते',
    'बेकाबू','बेबस','लाचार','असहाय',
    'अकेला','अकेली','एकाकी','तन्हा',
    'याद आना','याद आई','याद आया','बिछड़','बिछड़ना'
  ],
  happy: [
    'खुश','खुशी','खुशियां','प्रसन्न','प्रसन्नता',
    'हर्ष','हर्षित','आनंद','आनंदित',
    'मुस्कुराना','मुस्कुराई','मुस्कुराया','मुस्कान',
    'हंसना','हंसी','हंसते','हंस पड़ा','हंस पड़ी',
    'मज़ा','मज़ेदार','सुख','सुखी',
    'शानदार','बेहतरीन','अद्भुत','लाजवाब',
    'धन्यवाद','शुक्रिया','संतुष्ट','संतुष्टि',
    'जश्न','उत्सव','प्रफुल्लित','खिलखिलाना'
  ],
  anxious: [
    'चिंता','चिंतित','चिंताजनक','चिंतित हूं',
    'डर','डरा','डरी','डरना','डर लगना','डरावना',
    'भय','भयभीत','भयग्रस्त',
    'घबराहट','घबराना','घबरा',
    'बेचैन','बेचैनी','व्याकुल','व्याकुलता',
    'परेशान','परेशानी','अशांत','तनाव',
    'जल्दी','तुरंत','फौरन',
    'आपात','आपातकाल',
    'घबड़ाना','सहमा','सहमी','कांपना','थर थर'
  ],
  love: [
    'प्यार','प्यारा','प्यारी','प्रेम','प्रेमी',
    'मोहब्बत','इश्क','स्नेह','लगाव',
    'दिलदार','चाहत','चाहना',
    'वफा','वफादार','समर्पण','समर्पित',
    'हमेशा के लिए','ज़िन्दगी भर','सदा',
    'पसंदीदा','बेहद पसंद','दिल से'
  ],
  calm: [
    'शांत','शांति','सुकून','चैन','ठीक',
    'जानकारी','जानना','बताइए','बताएं',
    'सवाल','प्रश्न','कृपया','मदद','सहायता',
    'ऑर्डर','डिलीवरी','रिटर्न','पॉलिसी'
  ]
};

// ── Tamil keyword lexicon (built from CSV dataset + common expressions) ────────
const TAMIL_LEX = {
  angry: [
    // Direct anger words
    'கோபம்','கோபமாக','கோபப்பட','கோபமாக உள்ளது','கோபம் பொங்கு','கடும் சினம்',
    'சீற்றம்','சீற்றமாக','சீற்றம் வந்து','ஆத்திரம்','ஆத்திரமாக','ஆத்திரம் மூண்டு',
    'சினம்','சினமாக','சினம் கொண்டேன்','சினம் கொப்பளிக்கிறது',
    'வெறி','வெறி பிடித்து','கொந்தளிக்கிறது','கொந்தளிப்பு',
    // Disgust/betrayal (mapped to angry bucket in LABEL_MAP)
    'வெறுப்பு','வெறுக்கிறேன்','வெறுப்பு நிரம்பி','அருவருப்பு','அருவருக்கிறது',
    'வஞ்சகம்','வஞ்சகத்தை','துரோகம்','துரோகத்தை','ஏமாற்றி',
    // Intolerance phrases
    'தாங்க முடியவில்லை','தாங்காது','ஏற்றுக்கொள்ள முடியவில்லை','ஏற்க முடியவில்லை',
    'சகிக்க முடியவில்லை','பொறுக்க முடியவில்லை','பொறுமை இழந்தேன்',
    // Revenge / outrage
    'பழிவாங்குவேன்','பழிவாங்க','போராடுவேன்','எதிர்ப்பு',
    // Money wasted / cheated (customer support angry)
    'பணம் வீணானது','பணம் இழந்தேன்','மோசடி','ஏமாற்றினார்கள்','திருடினார்கள்',
    'வீணான','உதவாத','பயனற்ற','தரமற்ற','மோசமான சேவை'
  ],
  sad: [
    // Core sorrow words (from CSV)
    'சோகம்','சோகமாக','சோகத்தில்','துயரம்','துயரத்தில்','துயரமான',
    'துன்பம்','துன்பத்தில்','துன்பமான','வருத்தம்','வருந்துகிறேன்','வருத்தமாக',
    'வேதனை','வேதனையில்','வேதனைப்படுகிறேன்',
    // Tears (from CSV)
    'கண்ணீர்','கண்ணீரில்','கண்ணீரில் மூழ்கிறது','கண்ணீர் வற்றாமல்',
    'கண்ணீர் பெருகுகிறது','அழுகை','அழுகிறேன்','அழுதேன்','அழுகிறது',
    'கண் கலங்கிறது','கண் கலங்கி','கண் கலங்கினேன்',
    // Loss / pain
    'வலி','வலிக்கிறது','வலியில்','இழப்பு','இழந்தேன்','இழப்பின்',
    'மனம் உடைந்தது','மனம் உடைந்து','உள்ளம் உடைந்தது',
    // Disappointment
    'மனவருத்தம்','நிராசை','ஏமாற்றம்','ஏமாற்றப்பட்டேன்','ஏமாற்றமடைந்தேன்',
    'நம்பிக்கை இழந்தேன்','நம்பி ஏமாந்தேன்',
    // Loneliness / helplessness
    'தனிமை','தனிமையில்','தனிமையாக','திக்கற்ற','திக்கற்று',
    'வெறுமை','வெறுமையில்','சோர்வு','சோர்ந்துவிட்டேன்',
    // Longing
    'ஆறாத','ஆறாத வலி','ஏக்கம்','ஏங்குகிறேன்','தவிக்கிறேன்',
    'மனம் கனக்கிறது','இதயம் கனக்கிறது'
  ],
  happy: [
    // Core joy words (from CSV)
    'மகிழ்ச்சி','மகிழ்ச்சியாக','மகிழ்ச்சியுடன்','மகிழ்ச்சி பெருகுது',
    'மகிழ்வு','மகிழ்வு பொங்கி','மகிழ்ந்து','மகிழ்கிறேன்',
    'சந்தோஷம்','சந்தோஷமாக','சந்தோஷமான','சந்தோஷம் நிறைந்த',
    'சந்தோஷம் குதிக்கிறது',
    // Laughter / smile
    'சிரிப்பு','சிரிக்கிறேன்','சிரிப்போம்','சிரிப்பு நிறுத்த முடியவில்லை',
    'பாடுகிறேன்','நடனமாடுவோம்','கொண்டாட்டம்','கொண்டாடுகிறேன்',
    // Praise / gratitude
    'நன்றி','நன்றாக','நன்றாக செய்தீர்கள்','மிக்க நன்றி',
    'அருமை','அற்புதம்','அட்டகாசம்','சிறப்பான','சிறப்பாக',
    'மிகவும் நல்லது','மிக நல்ல சேவை',
    // Contentment (from CSV)
    'திருப்தி','திருப்தியாக','திருப்தி பொங்கு',
    'நிம்மதி','மனநிறைவு','மனம் அமைதியாக','நிறைவு பெற்று'
  ],
  anxious: [
    // Fear / worry (from CSV)
    'கவலை','கவலைப்படுகிறேன்','கவலையாக','கவலை நிறைந்த',
    'பயம்','பயமாக','பயந்து','பயந்திருக்கிறேன்','பயத்தில்',
    'அச்சம்','அச்சமாக','அச்சம் கொண்டேன்','அச்சம் பீடித்து',
    'அச்சுறுத்தல்','அச்சுறுத்தல் உணர்கிறேன்',
    'நடுங்குகிறேன்','நடுங்குகிறது','நடுங்கி நிற்கிறேன்',
    'பயந்து நடுங்குகிறேன்',
    // Urgency
    'அவசரம்','அவசரமாக','உடனடியாக','உடனே','விரைவாக','தாமதமின்றி',
    'உடனடி முடிவு','உடனடி தீர்வு','உடனடியாக வேண்டும்',
    // Warning / danger (from CSV)
    'எச்சரிக்கை','எச்சரிக்கையாக','ஆபத்து','ஆபத்தான',
    // Worry expressions
    'கவலைப்படுகிறேன்','மனம் கலங்குகிறது','தவிக்கிறேன்',
    'என்ன செய்வது என்று தெரியவில்லை'
  ],
  love: [
    // Romance / devotion (from CSV)
    'காதல்','காதலிக்கிறேன்','காதல் என்பது','காதல் தீயாக','காதல் கனவு',
    'காதல் கொண்டேன்','காதலி',
    'ஆசை','ஆசை மனதை','ஆசைப்படுகிறேன்','ஆசை கொண்டேன்',
    'அன்பு','அன்பாக','அன்பான','அன்பு கொண்டேன்',
    // Longing / melting (from CSV)
    'உருகுகிறேன்','கசிகிறேன்','நினைத்து உருகு','நினைவில் உருகு',
    'மறக்க முடியவில்லை','மறவேன்','என் மனதில்',
    // Devotion (from CSV)
    'பக்தி','பக்தி பெருகு','பக்தி மிகுந்து','வணங்குகிறேன்',
    'நம்பிக்கை','விசுவாசம்','அர்ப்பணிப்பு','அர்ப்பணிக்கிறேன்',
    'இறைவனை','துதிக்கிறேன்',
    // Sweetness / joy of love
    'இனிமை','இனிமை நிறைந்த','மேலான உணர்ச்சி','நெஞ்சில் நிறைந்து',
    'உயிரினும் இனிது','உன் நினைவில்','உன் சிரிப்பில்',
    // Loyalty (customer support)
    'விசுவாசமான','எப்போதும் உங்கள்','பசந்தீர்கள்'
  ],
  calm: [
    // Calmness (from CSV)
    'அமைதி','அமைதியாக','அமைதியான','அமைதி நிலவுகிறது',
    'திருப்தி','நிம்மதி','மனநிறைவு','நிறைவு',
    // Questions / information (customer support)
    'தகவல்','தகவல் வேண்டும்','விவரம்','விவரம் கேட்கிறேன்',
    'கேள்வி','கேட்கிறேன்','தெரிவிக்க','கண்டறிய',
    'உதவி','உதவி வேண்டும்','நிலை என்ன','நிலை தெரியவில்லை',
    'சரி','சரியாக','பொருத்தமான','எப்படி','எங்கு','எப்போது',
    // Return / delivery (calm customer support)
    'திரும்ப','திரும்பி தர','டெலிவரி','ஆர்டர்'
  ]
};


// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreKeywords(text, lex) {
  const scores = {};
  for (const [emotion, words] of Object.entries(lex)) {
    scores[emotion] = words.filter(w => text.includes(w)).length;
  }
  return scores;
}

// mBERT label → polarity  (-2 … +2)
function starPolarity(label) {
  return { '1 star': -2, '2 stars': -1, '3 stars': 0, '4 stars': 1, '5 stars': 2 }[label] ?? 0;
}

// ── Load mBERT pipeline ───────────────────────────────────────────────────────
async function loadPipeline() {
  if (_isReady || _isLoading) return;
  _isLoading = true;
  try {
    const { pipeline, env } = require('@xenova/transformers');
    env.cacheDir = path.join(process.cwd(), 'node_modules', '.cache', 'transformers');
    env.allowRemoteModels = true;

    console.log('[IndicNLP] Loading bert-base-multilingual-uncased-sentiment (mBERT)…');
    _pipeline = await pipeline(
      'sentiment-analysis',
      'Xenova/bert-base-multilingual-uncased-sentiment',
      { quantized: true }
    );
    _isReady   = true;
    _isLoading = false;
    console.log('[IndicNLP] ✅ mBERT ready — dedicated Hindi & Tamil NLP active');
  } catch (err) {
    _loadError = err.message;
    _isLoading = false;
    console.error('[IndicNLP] ❌ Failed:', err.message);
  }
}

// ── Public: classify Indic text ───────────────────────────────────────────────
async function classifyIndic(text, locale) {
  const lex = locale === 'hi' ? HINDI_LEX : TAMIL_LEX;

  // Layer A: keyword scores (always)
  const kw = scoreKeywords(text, lex);

  // Layer B: mBERT polarity (if ready)
  let polarity = 0;
  let mbertScore = 0;
  if (_isReady) {
    try {
      const out = await _pipeline(text.slice(0, 512));
      polarity    = starPolarity(out[0].label);
      mbertScore  = out[0].score;
    } catch (e) {
      console.error('[IndicNLP] classify error:', e.message);
    }
  }

  // Layer C: combine — keywords are PRIMARY signal, mBERT is a weak tiebreaker
  // mBERT trained on Amazon reviews (star ratings) is unreliable for emotion text,
  // so we only use its polarity as a ±2pt nudge, not as the main driver.
  const scores = {};
  for (const [emotion, words] of Object.entries(lex)) {
    scores[emotion] = kw[emotion] * 10; // keywords weight 10x
  }

  // mBERT weak nudge: only shifts scores by ±2, never dominates
  if (polarity <= -1) {
    scores.angry   = (scores.angry   || 0) + 2;
    scores.sad     = (scores.sad     || 0) + 2;
    scores.anxious = (scores.anxious || 0) + 1;
  } else if (polarity >= 1) {
    scores.happy   = (scores.happy || 0) + 2;
    scores.love    = (scores.love  || 0) + 1;
  } else {
    scores.calm    = (scores.calm  || 0) + 2;
  }

  // Keyword disambiguates within polarity band:
  // e.g. negative + more sad keywords than angry → sad wins
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = sorted[0];
  const gap = topScore - (sorted[1]?.[1] || 0);

  // If no keywords matched at all, fall back to calm (unknown/neutral)
  if (topScore <= 2 && kw[topKey] === 0) {
    return { key: 'calm', confidence: 55, model: 'mBERT-multilingual-sentiment',
      polarity, kwHits: 0, scores: Object.fromEntries(sorted.map(([k,v])=>[k,+v.toFixed(1)])) };
  }

  // Confidence based on keyword hits + gap
  const kwHits = kw[topKey] || 0;
  const confidence = Math.min(96, Math.max(60,
    55 + kwHits * 12 + Math.min(gap * 3, 20)
  ));

  return {
    key: topKey,
    confidence,
    model: 'mBERT-multilingual-sentiment',
    polarity,
    kwHits,
    scores: Object.fromEntries(sorted.map(([k, v]) => [k, +v.toFixed(1)]))
  };
}

function getStatus() {
  return { ready: _isReady, loading: _isLoading, error: _loadError,
    model: 'Xenova/bert-base-multilingual-uncased-sentiment' };
}

// Auto-load after transformer.js warms up
setTimeout(loadPipeline, 5000);

module.exports = { classifyIndic, getStatus, loadPipeline };
