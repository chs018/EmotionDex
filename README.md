# 🎮 EmotionDex

> **A Pokémon-themed AI Sentiment Customer Support Co-pilot**

EmotionDex is an intelligent customer support chatbot that blends real-time sentiment analysis with a fun Pokémon aesthetic. It detects the emotional tone of user messages, adapts its responses accordingly, and delivers a unique support experience powered by Groq AI.

---

## ✨ Features

- **AI-Powered Responses** — Uses the Groq SDK (LLM) to generate context-aware, helpful replies
- **Sentiment Analysis** — Analyses user message tone (positive, negative, neutral) using the `sentiment` and `natural` NLP libraries
- **Pokémon Theme** — Responses and UI are styled with Pokémon-inspired design
- **Rate Limiting & Security** — Built-in protection via `express-rate-limit` and `helmet`
- **CSV Data Support** — Loads and parses structured support data from CSV files
- **Full-Stack** — Express.js backend with an HTML/CSS/JS frontend

---

## 🗂️ Project Structure

```
EmotionDex/
├── backend/          # Express.js server and API logic
├── frontend/         # HTML, CSS, and JavaScript UI
├── data/             # CSV datasets for support responses
├── .env.example      # Environment variable template
├── package.json      # Dependencies and scripts
└── training.log      # Model/training output logs
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Groq API key](https://console.groq.com)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/chs018/EmotionDex.git
   cd EmotionDex
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Then open `.env` and fill in your values:
   ```env
   PORT=3000
   NODE_ENV=development
   GROQ_API_KEY=your-groq-api-key-here
   ```

4. **Start the server**
   ```bash
   # Production
   npm start

   # Development (with hot reload)
   npm run dev
   ```

5. Open your browser at `http://localhost:3000`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| AI / LLM | Groq SDK |
| NLP | `sentiment`, `natural` |
| Transformer Models | `@xenova/transformers` |
| Data Parsing | `csv-parse` |
| Security | `helmet`, `express-rate-limit` |
| Logging | `morgan` |
| Dev Tool | `nodemon` |
| Frontend | HTML, CSS, JavaScript |

---

## ⚙️ Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Port the server runs on (default: `3000`) |
| `NODE_ENV` | Environment mode (`development` / `production`) |
| `GROQ_API_KEY` | Your API key from [console.groq.com](https://console.groq.com) |

---

## 📜 License

This project is licensed under the [MIT License](LICENSE) — © 2026 Harshini Shree C.

---

## 🙏 Acknowledgements

- [Groq](https://groq.com) for fast LLM inference
- [Xenova/transformers](https://github.com/xenova/transformers.js) for browser/Node transformer models
- The Pokémon franchise for the inspiration 🌟
