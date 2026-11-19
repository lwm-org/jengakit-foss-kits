const cron = require('node-cron');
const tasks = new Map();

function initCron(chatFn) {
  // Jobs loaded from DB at startup are handled by server.js
  console.log('[cron] Cron system initialized');
}

function addJob(id, expression, prompt, chatFn) {
  if (tasks.has(id)) tasks.get(id).destroy();
  const task = cron.schedule(expression, () => {
    chatFn('cron-' + id, prompt).catch(e => console.error('[cron] job error:', e.message));
  });
  tasks.set(id, task);
  console.log(`[cron] Job ${id} scheduled: ${expression}`);
}

function removeJob(id) {
  if (tasks.has(id)) {
    tasks.get(id).destroy();
    tasks.delete(id);
    console.log(`[cron] Job ${id} removed`);
  }
}

module.exports = { initCron, addJob, removeJob };
