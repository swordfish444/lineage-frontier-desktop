// Reads the installed app's game page over its DevTools port: where it is, whether the desktop bridge is present, and
// a screenshot. Usage: node windows-check.mjs <port> <screenshot.png>
import { writeFileSync } from 'node:fs';

const [port, shot] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let page;
for (let i = 0; i < 90 && !page; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    page = targets.find((t) => t.type === 'page' && t.url.startsWith('https://lineage-frontier.com/'));
  } catch {
    // Not listening yet.
  }
  if (!page) await sleep(2000);
}
if (!page) throw new Error('The app never showed a lineage-frontier.com page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let id = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message);
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const value = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
for (let i = 0; i < 60; i++) {
  if (await value("!!document.querySelector('.desktop-google-button, #google-button button, .account-gate, [data-adventure-action]')")) break;
  await sleep(1000);
}
await sleep(2000);
const info = JSON.parse(
  await value(`JSON.stringify({ href: location.href, title: document.title,
    desktop: window.lineageFrontierDesktop ? { version: window.lineageFrontierDesktop.version, platform: window.lineageFrontierDesktop.platform } : null,
    button: document.querySelector('.desktop-google-button')?.innerText ?? null, userAgent: navigator.userAgent })`),
);
console.log(JSON.stringify(info, null, 2));
const png = (await send('Page.captureScreenshot', { format: 'png' })).result.data;
writeFileSync(shot, Buffer.from(png, 'base64'));
ws.close();
if (!info.desktop || info.desktop.platform !== 'win32') throw new Error('The desktop bridge is missing on the game page');
