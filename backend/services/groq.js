/**
 * Groq AI Integration Service
 *
 * Fast AI inference for enhanced reply generation.
 * Models: mixtral-8x7b-32768, llama-2-70b-chat, etc.
 */

const Groq = require('groq-sdk').default || require('groq-sdk');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

let _client = null;
function getClient() {
  if (!_client && GROQ_API_KEY) {
    _client = new Groq({ apiKey: GROQ_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT_EN = `You are EmotionDex, a professional customer support assistant powered by AI. 
Your task is to generate empathetic, professional, and action-oriented replies to customer messages based on their detected emotion.

Guidelines:
- Be warm, professional, and helpful
- Acknowledge the customer's emotions sincerely
- Provide clear next steps (2–4 concrete steps)
- Use 2–4 short paragraphs
- Aim for ~120–220 words (don’t be overly brief)
- Sign off with "— EmotionDex Support Team"`;

const SYSTEM_PROMPT_HI = `आप EmotionDex हैं, एक पेशेवर ग्राहक सहायता सहायक।
ग्राहक की भावनाओं को समझकर सहानुभूतिपूर्ण उत्तर दें।

निर्देश:
- भावनाओं को सच्चाई से स्वीकार करें
- 2-4 स्पष्ट अगले कदम बताएं
- हिंदी में उत्तर दें (~90-150 शब्द)
- 2-4 छोटे पैराग्राफ में लिखें
- "— EmotionDex सहायता टीम" से समाप्त करें`;

const SYSTEM_PROMPT_TA = `நீங்கள் EmotionDex, ஒரு கணக்கைத் தாங்கும் வாடிக்கையாளர் ஆதரவு உதவியாளர்.
வாடிக்கையாளர்களின் உணர்ச்சிகளை புரிந்து கொண்டு இரக்கமுள்ள பதிலளிக்க வேண்டும்.

நிர்देசங்கள்:
- உணர்ச்சிகளை உண்மையாக ஏற்றுக்கொள்ளவும்
- 2–4 தெளிவான அடுத்த படிகளை கூறவும்
- மிகச் சுருக்கமாக இல்லாமல் பதிலளிக்கவும் (சுமார் 90–170 சொற்கள்)
- 2–4 சிறு பத்திகளில் தமிழிலேயே பதிலளிக்கவும்
- "— EmotionDex ஆதரவு அணி" என கையொப்பமிடுங்கள்`;

async function generateReplyWithGroq(text, emotionKey, mode = 'calm', locale = 'en') {
  const client = getClient();
  if (!client) {
    return null; // API key not configured
  }

  try {
    const systemPrompt = locale === 'ta' ? SYSTEM_PROMPT_TA
      : locale === 'hi'              ? SYSTEM_PROMPT_HI
      :                                SYSTEM_PROMPT_EN;

    const userPrompt = locale === 'ta'
      ? `வாடிக்கையாளர் செய்தி: "${text}"\n\nகண்டறிந்த உணர்ச்சி: ${emotionKey}\nமுறை: ${mode}\n\nஇந்த வாடிக்கையாளருக்கு ஒரு உதவிகரமான பதிலை தமிழில் உருவாக்கவும்.`
      : locale === 'hi'
      ? `ग्राहक संदेश: "${text}"\n\nपहचानी गई भावना: ${emotionKey}\nमोड: ${mode}\n\nइस ग्राहक के लिए एक सहायक उत्तर हिंदी में तैयार करें।`
      : `Customer message: "${text}"\n\nDetected emotion: ${emotionKey}\nMode: ${mode}\n\nGenerate a helpful, empathetic response for this customer.`;

    const response = await client.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      model: 'llama-3.1-70b-versatile',
      temperature: 0.7,
      max_tokens: 512,
      top_p: 1.0
    });

    const reply = response.choices?.[0]?.message?.content || null;
    return reply ? reply.trim() : null;
  } catch (err) {
    console.error('Groq API error:', err.message);
    return null;
  }
}

module.exports = {
  generateReplyWithGroq,
  isConfigured: () => !!GROQ_API_KEY
};
