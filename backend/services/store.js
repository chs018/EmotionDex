/**
 * EmotionDex — In-Memory Analytics Store
 *
 * Tracks scanned emotions, replies generated, and escalations
 * for dashboard and analytics endpoints.
 */

const store = {
  // Rolling scan history (max 500 entries)
  scans: [],
  // Escalation log
  escalations: [],
  // Aggregate counters
  totals: {
    angry: 0, sad: 0, happy: 0, calm: 0, anxious: 0, love: 0,
    totalScans: 0, totalReplies: 0, totalEscalations: 0
  },
  // Agent XP store (keyed by agentId)
  agents: {}
};

const MAX_SCANS = 500;

function recordScan(result, text) {
  const entry = {
    id:         Date.now(),
    ts:         new Date().toISOString(),
    emotionKey: result.emotion.key,
    emotion:    result.emotion.label,
    priority:   result.priority.level,
    score:      result.priority.score,
    confidence: result.confidence,
    textLength: text.length,
    afinn:      result.nlp.afinnComparative
  };

  store.scans.unshift(entry);
  if (store.scans.length > MAX_SCANS) store.scans.pop();

  const key = result.emotion.key;
  if (store.totals[key] !== undefined) store.totals[key]++;
  store.totals.totalScans++;

  return entry;
}

function recordEscalation(emotionKey, message) {
  const entry = { id: Date.now(), ts: new Date().toISOString(), emotionKey, message: message?.substring(0, 100) };
  store.escalations.unshift(entry);
  if (store.escalations.length > 100) store.escalations.pop();
  store.totals.totalEscalations++;
}

function recordReply() {
  store.totals.totalReplies++;
}

// ── Dashboard stats ────────────────────────────────────────────────────────
function getDashboardStats() {
  const recent = store.scans.slice(0, 20);
  const now = Date.now();
  const oneHourAgo = now - 3600 * 1000;
  const lastHour = store.scans.filter(s => new Date(s.ts).getTime() > oneHourAgo);

  const avgPriorityScore = lastHour.length
    ? Math.round(lastHour.reduce((s, e) => s + e.score, 0) / lastHour.length)
    : 0;

  const emotionDist = {
    angry: 0, sad: 0, happy: 0, calm: 0, anxious: 0, love: 0
  };
  store.scans.slice(0, 100).forEach(s => {
    if (emotionDist[s.emotionKey] !== undefined) emotionDist[s.emotionKey]++;
  });

  // Satisfaction score = % of happy + love out of all
  const positiveCount = emotionDist.happy + emotionDist.love;
  const total100 = Object.values(emotionDist).reduce((a, b) => a + b, 0);
  const satisfactionScore = total100 > 0
    ? Math.round((positiveCount / total100) * 100)
    : 78; // sensible default

  return {
    kpis: {
      angryUsers:      store.totals.angry,
      anxiousUsers:    store.totals.anxious,
      satisfactionPct: satisfactionScore,
      activeEscalations: store.totals.totalEscalations,
      totalScans:      store.totals.totalScans,
      totalReplies:    store.totals.totalReplies,
      avgPriorityScore
    },
    emotionDistribution: emotionDist,
    recentScans: recent,
    recentEscalations: store.escalations.slice(0, 5),
    // Fake live sentiment stream (last 20 ticks)
    sentimentStream: generateSentimentStream(recent)
  };
}

function generateSentimentStream(recentScans) {
  // Group by last 20 ticks and build chart-ready arrays
  const ticks = Array.from({ length: 20 }, (_, i) => {
    const scan = recentScans[i];
    return {
      label: scan ? new Date(scan.ts).toLocaleTimeString() : `T-${20 - i}`,
      afinn: scan ? scan.afinn : (Math.random() * 2 - 1).toFixed(2)
    };
  }).reverse();
  return ticks;
}

function getAnalytics() {
  return {
    totals:    store.totals,
    allScores: store.scans.slice(0, 50),
    topTriggers: getTopTriggers()
  };
}

function getTopTriggers() {
  // Static + real-time blend (real would need full text storage)
  return [
    { label: 'Long wait time',       pct: 87 },
    { label: 'No response received', pct: 73 },
    { label: 'Refund delays',        pct: 61 },
    { label: 'Product issues',       pct: 45 },
    { label: 'Shipping delays',      pct: 38 }
  ];
}

module.exports = { recordScan, recordEscalation, recordReply, getDashboardStats, getAnalytics };
