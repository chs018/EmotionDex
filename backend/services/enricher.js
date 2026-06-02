/**
 * Reply Enricher — Hybrid Strategy
 *
 * Try Groq AI first (faster, high quality), fall back to templates.
 */

const { generateReplyWithGroq, isConfigured: groqConfigured } = require('./groq');

const TEMPLATE_REPLIES_EN = {
  angry: {
    calm:    'I sincerely apologize for the frustration this has caused — you deserve so much better. I\'m escalating your case to our senior team right now and we\'ll resolve this within 2 hours. Thank you for your patience, and I promise we\'ll make this right. — EmotionDex Support Team',
    premium: 'I want to personally and sincerely apologize for this unacceptable experience. As a valued member of our community, you deserve excellence — and we have fallen short. Our Priority Resolution Team is being contacted this moment. — EmotionDex Support Team',
    crisis:  '🚨 I hear you, and I am taking immediate action right now. What happened is completely unacceptable and I am escalating this as CRITICAL. A senior agent will contact you within 15 minutes with a concrete solution. — EmotionDex Support Team'
  },
  sad: {
    calm:    'I\'m truly sorry to hear you\'re feeling disappointed — your feelings are completely valid. Let me look into this personally and find the best solution for you right away. We value you and want to turn this experience around. — EmotionDex Support Team',
    premium: 'We are deeply sorry this experience left you feeling this way — we take full responsibility. As a valued customer, our white-glove support team is preparing a comprehensive resolution and a gesture of goodwill. — EmotionDex Support Team',
    crisis:  'I am so sorry this happened to you and your pain is real. I am dropping everything to personally handle your case right now — you are not alone. — EmotionDex Support Team'
  },
  happy: {
    calm:    'Thank you so much for your kind words — it truly means the world to our team! We\'re thrilled you\'re enjoying the experience. Is there anything else we can do to make it even better? — EmotionDex Support Team',
    premium: 'Your gracious words are an absolute honor to our entire team! Your loyalty is the foundation of what we do. I\'d love to personally extend an exclusive invitation to our Elite Customer Advisory Board. — EmotionDex Support Team',
    crisis:  'This is the most wonderful message we\'ve received today — thank you from the bottom of our hearts! We want to celebrate YOU right now! — EmotionDex Support Team'
  },
  anxious: {
    calm:    'I completely understand your concern, and I want to assure you we\'re on top of this. Your case is being prioritized and you can expect a full update within 30 minutes. — EmotionDex Support Team',
    premium: 'I want to personally reassure you that your case is now our absolute top priority. Our dedicated resolution team has been activated and you\'ll receive a guaranteed update within 10 minutes. — EmotionDex Support Team',
    crisis:  'URGENT: I\'m treating your case as #1 priority RIGHT NOW. I understand the time pressure and I\'m acting immediately on your behalf. — EmotionDex Support Team'
  },
  calm: {
    calm:    'Thank you for reaching out! I\'d be happy to help you with that. Let me look into this and provide a clear, complete answer right away. — EmotionDex Support Team',
    premium: 'Thank you for connecting with us. I\'m delighted to assist and will ensure your query is handled with the highest level of care and precision. — EmotionDex Support Team',
    crisis:  'Thank you for reaching out. I\'m prioritizing your request and will have an answer for you immediately. — EmotionDex Support Team'
  },
  love: {
    calm:    'Wow, your kind words made our day! Your loyalty means everything to us. We\'d love to offer you a special loyalty reward — just reply to claim it! — EmotionDex Support Team',
    premium: 'Your extraordinary loyalty is the greatest reward we could ever receive. We would be honored to make you one of our founding Brand Ambassadors with full VIP benefits. — EmotionDex Support Team',
    crisis:  'Your incredible loyalty literally powers our mission. Expect something extraordinary from us very soon! — EmotionDex Support Team'
  }
};

const TEMPLATE_REPLIES_TA = {
  angry: {
    calm:    'உங்களுக்கு ஏற்பட்ட தொந்தரவு/மனவருத்தத்திற்கு மனப்பூர்வமாக மன்னிப்பு கோருகிறேன். இதை உடனே எங்கள் மூத்த ஆதரவு அணிக்குப் பரிந்துரைக்கிறேன்; 2 மணி நேரத்திற்குள் தீர்வு வழங்க முயற்சிப்போம். உங்கள் பொறுமைக்கு நன்றி. — EmotionDex ஆதரவு அணி',
    premium: 'இந்த ஏற்றுக்கொள்ள முடியாத அனுபவத்திற்கு நான் தனிப்பட்ட முறையில் மன்னிப்பு கோருகிறேன். உங்கள் வழக்கை உடனே எங்கள் முன்னுரிமை தீர்வு அணிக்கு உயர்த்துகிறோம். — EmotionDex ஆதரவு அணி',
    crisis:  '🚨 உங்கள் கோபத்தை நான் புரிந்துகொள்கிறேன். இது முற்றிலும் ஏற்றுக்கொள்ள முடியாதது; உங்கள் வழக்கை மிக அவசரம் என உடனே உயர்த்துகிறேன். 15 நிமிடங்களில் ஒரு மூத்த முகவர் தொடர்பு கொள்வார். — EmotionDex ஆதரவு அணி'
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

const TEMPLATE_REPLIES_HI = {
  angry: {
    calm:    'आपको हुई असुविधा के लिए हम हृदय से क्षमा चाहते हैं — आप इससे बेहतर सेवा के हकदार हैं। हम अभी आपका मामला वरिष्ठ टीम को भेज रहे हैं और 2 घंटे के भीतर समाधान देंगे। आपकी धैर्य के लिए धन्यवाद। — EmotionDex सहायता टीम',
    premium: 'इस अस्वीकार्य अनुभव के लिए मैं व्यक्तिगत रूप से क्षमा चाहता हूं। आपका मामला अभी हमारी प्राथमिकता समाधान टीम को दिया जा रहा है। — EmotionDex सहायता टीम',
    crisis:  '🚨 मैं आपकी बात सुन रहा हूं और अभी तुरंत कार्रवाई कर रहा हूं। यह पूरी तरह अस्वीकार्य है — 15 मिनट में एक वरिष्ठ एजेंट आपसे संपर्क करेगा। — EmotionDex सहायता टीम'
  },
  sad: {
    calm:    'हम सच में खेद व्यक्त करते हैं कि आप निराश महसूस कर रहे हैं — आपकी भावनाएं बिल्कुल सही हैं। हम अभी व्यक्तिगत रूप से इसे देखते हैं और सर्वोत्तम समाधान देंगे। — EmotionDex सहायता टीम',
    premium: 'हम पूरी जिम्मेदारी लेते हैं कि इस अनुभव ने आपको निराश किया। हमारी विशेष सहायता टीम शीघ्र ही पूर्ण समाधान प्रदान करेगी। — EmotionDex सहायता टीम',
    crisis:  'यह आपके साथ हुआ, इसके लिए हम बहुत खेद महसूस करते हैं। हम अभी व्यक्तिगत रूप से आपका मामला संभाल रहे हैं — आप अकेले नहीं हैं। — EmotionDex सहायता टीम'
  },
  happy: {
    calm:    'आपके इन अच्छे शब्दों के लिए बहुत-बहुत धन्यवाद! हम खुश हैं कि आपको अच्छा अनुभव मिला। क्या और कुछ बेहतर कर सकते हैं? — EmotionDex सहायता टीम',
    premium: 'आपकी सराहना हमारी पूरी टीम के लिए सम्मान है! आपकी वफादारी के लिए हम विशेष रूप से आभारी हैं। — EmotionDex सहायता टीम',
    crisis:  'आज का सबसे अच्छा संदेश यही है — दिल से धन्यवाद! — EmotionDex सहायता टीम'
  },
  anxious: {
    calm:    'आपकी चिंता समझ में आती है। हम इसे प्राथमिकता दे रहे हैं और 30 मिनट में पूरी जानकारी देंगे। — EmotionDex सहायता टीम',
    premium: 'आपका मामला अभी हमारी सर्वोच्च प्राथमिकता है। 10 मिनट में गारंटीड अपडेट मिलेगा। — EmotionDex सहायता टीम',
    crisis:  'अत्यावश्यक: हम अभी आपके मामले को #1 प्राथमिकता दे रहे हैं। तुरंत कार्रवाई की जा रही है। — EmotionDex सहायता टीम'
  },
  calm: {
    calm:    'संपर्क करने के लिए धन्यवाद! हम आपकी सहायता करने में प्रसन्न हैं। अभी इसे देखते हैं और स्पष्ट जवाब देते हैं। — EmotionDex सहायता टीम',
    premium: 'संपर्क करने के लिए धन्यवाद। आपके प्रश्न को सर्वोच्च ध्यान और सटीकता से संभाला जाएगा। — EmotionDex सहायता टीम',
    crisis:  'संपर्क के लिए धन्यवाद। आपकी अनुरोध को प्राथमिकता दी जा रही है और तुरंत उत्तर दिया जाएगा। — EmotionDex सहायता टीम'
  },
  love: {
    calm:    'वाह! आपके प्यार भरे शब्दों ने हमारा दिन बना दिया! आपकी वफादारी के लिए हम एक विशेष पुरस्कार देना चाहते हैं। — EmotionDex सहायता टीम',
    premium: 'आपकी असाधारण वफादारी हमारे लिए सबसे बड़ा पुरस्कार है। हम आपको VIP लाभ प्रदान करना चाहते हैं। — EmotionDex सहायता टीम',
    crisis:  'आपकी वफादारी हमारी प्रेरणा है। बहुत जल्द कुछ खास लेकर आएंगे! — EmotionDex सहायता टीम'
  }
};

async function enrichReply(text, emotionKey, mode = 'calm', locale = 'en') {
  // Try Groq if configured
  if (groqConfigured()) {
    const aiReply = await generateReplyWithGroq(text, emotionKey, mode, locale);
    if (aiReply) {
      return {
        reply: aiReply,
        source: 'groq-ai',
        model: 'mixtral-8x7b-32768'
      };
    }
  }

  // Fall back to templates
  const templates = locale === 'ta' ? TEMPLATE_REPLIES_TA
    : locale === 'hi'              ? TEMPLATE_REPLIES_HI
    :                                TEMPLATE_REPLIES_EN;
  const emotionTemplates = templates[emotionKey] || templates.calm;
  const reply = emotionTemplates[mode] || emotionTemplates.calm;

  return {
    reply,
    source: 'template',
    model: null
  };
}

module.exports = { enrichReply };
