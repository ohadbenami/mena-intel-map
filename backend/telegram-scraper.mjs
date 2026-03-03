/**
 * Telegram OSINT Channel Scraper
 * Reads military/intelligence channels and outputs geo-tagged events as JSON
 *
 * Run: npm run telegram:scrape
 */
import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ================================================================
//  CONFIG
// ================================================================
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Top OSINT channels for Middle East military intelligence
const CHANNELS = [
  'OSINTdefender',        // Major OSINT aggregator
  'inaborni',             // Israel/Iran updates (Hebrew/English)
  'AuroraIntel',          // Global military OSINT
  'sentdefender',         // Defense & security
  'militaborni',          // Military analysis
  'CalibreObscura',       // Weapons identification
  'MiddleEastSpectator',  // ME events
  'MilitaryAviationx',    // Military aviation tracking
  'nuclear_fission',      // Nuclear developments
  'IranIntl_En',          // Iran International English
  'red_siren_IL',         // Israeli rocket alerts
  'AlertsIsraell',        // Israel alerts
];

// Keywords that indicate military/security relevance
const KEYWORDS = [
  // English
  'missile', 'strike', 'attack', 'nuclear', 'drone', 'uav',
  'explosion', 'intercept', 'launch', 'scramble', 'deploy',
  'iran', 'irgc', 'hezbollah', 'houthi', 'hamas', 'idf',
  'f-35', 'f-16', 'b-52', 'b-2', 's-300', 'patriot', 'thaad',
  'aircraft carrier', 'submarine', 'destroyer', 'tanker',
  'enrichment', 'centrifuge', 'natanz', 'fordow', 'bushehr',
  'ballistic', 'cruise missile', 'air defense', 'radar',
  'military', 'airstrike', 'bombing', 'ceasefire', 'escalation',
  // Hebrew
  'טיל', 'מתקפה', 'תקיפה', 'גרעין', 'כטמם', 'יירוט',
  'שיגור', 'פיצוץ', 'חיזבאללה', 'חמאס', 'חותים',
  'צהל', 'חיל האוויר', 'אזעקה', 'צבא',
];

// Known locations and their coordinates for geo-tagging
const GEO_TAGS = {
  'tehran':     [35.69, 51.39],
  'isfahan':    [32.65, 51.66],
  'natanz':     [33.72, 51.73],
  'fordow':     [34.37, 51.22],
  'bushehr':    [28.83, 50.88],
  'tabriz':     [38.08, 46.29],
  'shiraz':     [29.59, 52.58],
  'bandar abbas': [27.18, 56.27],
  'hormuz':     [26.57, 56.25],
  'strait of hormuz': [26.57, 56.25],
  'baghdad':    [33.32, 44.37],
  'erbil':      [36.19, 44.01],
  'beirut':     [33.89, 35.50],
  'dahieh':     [33.85, 35.49],
  'south lebanon': [33.25, 35.35],
  'damascus':   [33.51, 36.29],
  'aleppo':     [36.20, 37.15],
  'sanaa':      [15.37, 44.19],
  'hodeidah':   [14.80, 42.95],
  'tel aviv':   [32.07, 34.77],
  'jerusalem':  [31.77, 35.23],
  'gaza':       [31.42, 34.33],
  'haifa':      [32.79, 34.99],
  'nevatim':    [31.21, 34.95],
  'golan':      [33.12, 35.82],
  'red sea':    [18.00, 40.00],
  'bab el-mandeb': [12.58, 43.33],
  'persian gulf': [26.50, 52.00],
  'al udeid':   [25.12, 51.32],
  'al tanf':    [33.50, 38.70],
  'deir ez-zor': [35.34, 40.14],
  'parchin':    [35.52, 51.78],
  'kharg island': [29.23, 50.31],
  'incirlik':   [37.00, 35.43],
  'riyadh':     [24.71, 46.68],
  'jeddah':     [21.49, 39.19],
  'doha':       [25.29, 51.53],
  'abu dhabi':  [24.45, 54.65],
  'dubai':      [25.20, 55.27],
  'kuwait':     [29.38, 47.99],
  'amman':      [31.95, 35.93],
  // Hebrew
  'טהרן':       [35.69, 51.39],
  'איספהאן':    [32.65, 51.66],
  'נתנז':       [33.72, 51.73],
  'בגדד':       [33.32, 44.37],
  'ביירות':     [33.89, 35.50],
  'דמשק':       [33.51, 36.29],
  'עזה':        [31.42, 34.33],
  'תל אביב':   [32.07, 34.77],
  'ירושלים':    [31.77, 35.23],
  'חיפה':       [32.79, 34.99],
  'ים סוף':     [18.00, 40.00],
  'הרצליה':     [32.16, 34.79],
};

// ================================================================
//  MAIN
// ================================================================
async function main() {
  // Load session
  if (!existsSync('session.json')) {
    console.error('❌ No session found. Run: npm run telegram:login');
    process.exit(1);
  }

  const { session } = JSON.parse(readFileSync('session.json', 'utf8'));
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  console.log('✅ Connected to Telegram');

  const allEvents = [];

  for (const channel of CHANNELS) {
    try {
      console.log(`📡 Scanning: @${channel}...`);
      const messages = await client.getMessages(channel, { limit: 50 });

      for (const msg of messages) {
        if (!msg.message) continue;

        const text = msg.message.toLowerCase();
        const isRelevant = KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
        if (!isRelevant) continue;

        // Try to geo-tag
        let coords = null;
        let location = null;
        for (const [place, [lat, lng]] of Object.entries(GEO_TAGS)) {
          if (text.includes(place.toLowerCase())) {
            coords = [lat, lng];
            location = place;
            break;
          }
        }

        // Determine severity
        let severity = 'info';
        if (/strike|attack|explos|intercept|launch|missile\s?fire/i.test(text)) severity = 'critical';
        else if (/deploy|scramble|move|reinforce|escalat/i.test(text)) severity = 'warning';
        else if (/nuclear|enrich|centrifuge/i.test(text)) severity = 'high';

        allEvents.push({
          id: msg.id,
          channel: `@${channel}`,
          text: msg.message.substring(0, 500),
          date: msg.date ? new Date(msg.date * 1000).toISOString() : null,
          coords,
          location,
          severity,
          views: msg.views || 0,
          forwards: msg.forwards || 0,
        });
      }
    } catch (e) {
      console.warn(`⚠️  Could not access @${channel}: ${e.message}`);
    }
  }

  // Sort by date (newest first)
  allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Output
  const output = {
    generated: new Date().toISOString(),
    source: 'Telegram OSINT',
    channels: CHANNELS.length,
    total_events: allEvents.length,
    geo_tagged: allEvents.filter(e => e.coords).length,
    events: allEvents,
  };

  writeFileSync('../telegram-feed.json', JSON.stringify(output, null, 2));
  console.log(`\n✅ Done! ${allEvents.length} events (${output.geo_tagged} geo-tagged)`);
  console.log('📁 Saved to telegram-feed.json');

  await client.disconnect();
}

main().catch(console.error);
