// Channel adapters - only activate if tokens are set
const axios = require('axios');

async function initChannels(chatFn) {
  const results = { telegram: false, discord: false, signal: false };

  if (process.env.LOBSTER_TELEGRAM_BOT_TOKEN) {
    try {
      // Simple Telegram long-polling
      const token = process.env.LOBSTER_TELEGRAM_BOT_TOKEN;
      let offset = 0;
      const poll = async () => {
        try {
          const res = await axios.get(
            `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=30`,
            { timeout: 35000 }
          );
          for (const update of res.data.result || []) {
            offset = update.update_id + 1;
            const msg = update.message;
            if (msg && msg.text) {
              const reply = await chatFn('telegram-' + msg.chat.id, msg.text).catch(e => 'Error: ' + e.message);
              await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: msg.chat.id, text: reply
              }).catch(() => {});
            }
          }
        } catch (e) {
          // Ignore polling errors, retry
        }
        setTimeout(poll, 1000);
      };
      poll();
      results.telegram = true;
      console.log('[channels] Telegram polling started');
    } catch (e) {
      console.error('[channels] Telegram init error:', e.message);
    }
  }

  // Discord support (requires discord.js package)
  if (process.env.LOBSTER_DISCORD_BOT_TOKEN) {
    try {
      const { Client, GatewayIntentBits } = require('discord.js');
      const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
      });
      client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        const reply = await chatFn('discord-' + message.author.id, message.content).catch(e => 'Error: ' + e.message);
        message.reply(reply).catch(() => {});
      });
      await client.login(process.env.LOBSTER_DISCORD_BOT_TOKEN);
      results.discord = true;
      console.log('[channels] Discord connected');
    } catch (e) {
      console.error('[channels] Discord init error:', e.message);
    }
  }

  // ── Signal (signal-cli-rest-api polling) ──────────────────────────────────
  if (process.env.LOBSTER_SIGNAL_API_URL && process.env.LOBSTER_SIGNAL_NUMBER) {
    try {
      const apiUrl  = process.env.LOBSTER_SIGNAL_API_URL.replace(/\/$/, '');
      const number  = process.env.LOBSTER_SIGNAL_NUMBER;
      const allowed = (process.env.LOBSTER_SIGNAL_ALLOWED_SENDERS || '')
                        .split(',').map(s => s.trim()).filter(Boolean);

      const pollSignal = async () => {
        try {
          const res = await axios.get(
            `${apiUrl}/v1/receive/${encodeURIComponent(number)}`,
            { timeout: 5000 }
          );
          const messages = Array.isArray(res.data) ? res.data : [];
          for (const envelope of messages) {
            const msg    = envelope.envelope?.dataMessage;
            const sender = envelope.envelope?.source;
            const text   = msg?.message;
            if (!text || !sender) continue;
            if (allowed.length && !allowed.includes(sender)) continue;
            const reply = await chatFn(`signal-${sender}`, text).catch(e => 'Error: ' + e.message);
            await axios.post(`${apiUrl}/v2/send`, {
              message: reply, number, recipients: [sender],
            }).catch(() => {});
          }
        } catch (e) {
          if (e.code !== 'ECONNREFUSED' && e.code !== 'ENOTFOUND') {
            console.error('[channels] Signal poll error:', e.message);
          }
        }
      };

      setInterval(pollSignal, 2000);
      results.signal = true;
      console.log(`[channels] Signal polling started (${apiUrl} as ${number})`);
    } catch (e) {
      console.error('[channels] Signal init error:', e.message);
    }
  }

  return results;
}

module.exports = { initChannels };
