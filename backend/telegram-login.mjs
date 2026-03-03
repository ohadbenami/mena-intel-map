/**
 * Telegram Login — One-time setup
 * Run: npm run telegram:login
 *
 * This creates a session file so the scraper can run without re-authenticating.
 */
import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { createInterface } from 'readline';

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

const stringSession = new StringSession('');
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: async () => await ask('📱 Enter your phone number (with country code, e.g. +972...): '),
  password: async () => await ask('🔑 Enter 2FA password (if enabled, or press Enter): '),
  phoneCode: async () => await ask('📩 Enter the code you received: '),
  onError: (err) => console.error('Error:', err),
});

console.log('\n✅ Login successful!');
console.log('\n📋 Save this session string:\n');

const session = client.session.save();
console.log(session);

// Save to file
import { writeFileSync } from 'fs';
writeFileSync('session.json', JSON.stringify({ session }));
console.log('\n💾 Saved to session.json');

rl.close();
await client.disconnect();
