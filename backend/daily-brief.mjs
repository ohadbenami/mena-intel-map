/**
 * Daily Intelligence Brief Generator
 * Uses Claude API to generate a morning intelligence summary
 *
 * Run: npm run brief:generate
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function generateBrief() {
  console.log('🤖 Generating Daily Intelligence Brief...\n');

  // Gather inputs
  let telegramData = null;
  if (existsSync('../telegram-feed.json')) {
    telegramData = JSON.parse(readFileSync('../telegram-feed.json', 'utf8'));
    console.log(`📡 Telegram: ${telegramData.total_events} events loaded`);
  }

  // Fetch latest GDELT data
  let gdeltData = null;
  try {
    const res = await fetch(
      'https://api.gdeltproject.org/api/v2/doc/doc?query=(military OR nuclear OR missile OR strike) (iran OR iraq OR syria OR yemen OR hezbollah)&mode=ArtList&format=json&maxrecords=30&sort=DateDesc'
    );
    if (res.ok) {
      gdeltData = await res.json();
      console.log(`📰 GDELT: ${gdeltData.articles?.length || 0} articles loaded`);
    }
  } catch (e) {
    console.warn('⚠️  GDELT fetch failed:', e.message);
  }

  // Build context for Claude
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  let context = `Date: ${dateStr}\nTime: ${now.toISOString()}\n\n`;

  if (telegramData) {
    const critical = telegramData.events.filter(e => e.severity === 'critical').slice(0, 10);
    const high = telegramData.events.filter(e => e.severity === 'high').slice(0, 5);
    const warnings = telegramData.events.filter(e => e.severity === 'warning').slice(0, 5);

    context += `=== TELEGRAM OSINT FEED (Last 24h) ===\n`;
    context += `Total events: ${telegramData.total_events} | Geo-tagged: ${telegramData.geo_tagged}\n\n`;

    if (critical.length) {
      context += `🔴 CRITICAL:\n`;
      critical.forEach(e => {
        context += `- [${e.channel}] ${e.text.substring(0, 200)} ${e.location ? `📍${e.location}` : ''}\n`;
      });
    }
    if (high.length) {
      context += `\n🟠 HIGH:\n`;
      high.forEach(e => {
        context += `- [${e.channel}] ${e.text.substring(0, 200)} ${e.location ? `📍${e.location}` : ''}\n`;
      });
    }
    if (warnings.length) {
      context += `\n🟡 WARNING:\n`;
      warnings.forEach(e => {
        context += `- [${e.channel}] ${e.text.substring(0, 200)} ${e.location ? `📍${e.location}` : ''}\n`;
      });
    }
  }

  if (gdeltData?.articles) {
    context += `\n=== GDELT NEWS FEED ===\n`;
    gdeltData.articles.slice(0, 15).forEach(a => {
      context += `- ${a.title} [${a.domain}] ${a.seendate || ''}\n`;
    });
  }

  // Generate brief with Claude
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are a military intelligence analyst producing a daily briefing for a senior decision-maker monitoring the Middle East, with emphasis on Iran.

Based on the following OSINT data, produce a structured Daily Intelligence Brief.

FORMAT:
1. **EXECUTIVE SUMMARY** (3-4 sentences, the most important takeaway)
2. **THREAT LEVEL** (CRITICAL / HIGH / ELEVATED / MODERATE / LOW — with one-line justification)
3. **KEY DEVELOPMENTS** (numbered list, 5-8 items, each 1-2 sentences)
4. **IRAN NUCLEAR PROGRAM** (any relevant updates)
5. **REGIONAL MILITARY ACTIVITY** (troop movements, exercises, deployments)
6. **PROXY FORCES UPDATE** (Hezbollah, Houthis, Iraqi militias)
7. **MARITIME & AVIATION** (Strait of Hormuz, Red Sea, notable flights)
8. **WATCH LIST** (3-5 things to monitor in the next 24-48 hours)
9. **ASSESSMENT** (2-3 sentence analytical conclusion)

Write in English. Be concise, factual, and analytical. Distinguish between confirmed reports and unverified claims.

${context}`
    }],
  });

  const brief = message.content[0].text;
  console.log('\n' + '='.repeat(60));
  console.log(brief);
  console.log('='.repeat(60));

  // Save as JSON for the map to consume
  const output = {
    generated: now.toISOString(),
    date: dateStr,
    brief_text: brief,
    sources: {
      telegram_events: telegramData?.total_events || 0,
      gdelt_articles: gdeltData?.articles?.length || 0,
    },
    // Parse threat level from the brief
    threat_level: brief.match(/THREAT LEVEL[:\s]*\*?\*?(CRITICAL|HIGH|ELEVATED|MODERATE|LOW)/i)?.[1] || 'UNKNOWN',
  };

  writeFileSync('../brief.json', JSON.stringify(output, null, 2));
  console.log('\n💾 Saved to brief.json');
  console.log(`📊 Threat Level: ${output.threat_level}`);

  return output;
}

generateBrief().catch(console.error);
