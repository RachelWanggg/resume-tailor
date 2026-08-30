import http from 'node:http';
import { readFileSync } from 'node:fs';

const port = process.env.CDP_PORT || '9333';

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${path}: ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

async function connect() {
  const tabs = await getJson('/json/list');
  const target =
    tabs.find((tab) => tab.type === 'page' && tab.url.includes('linkedin.com/jobs')) ||
    tabs.find((tab) => tab.type === 'page');
  if (!target) throw new Error('No page target found');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  return { send, close: () => ws.close() };
}

async function evaluate(expression) {
  const { send, close } = await connect();
  try {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
    }
    return result.result?.value ?? null;
  } finally {
    close();
  }
}

async function navigate(url) {
  const { send, close } = await connect();
  try {
    await send('Page.navigate', { url });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    // LinkedIn is an SPA — navigating to a job already open in-session is sometimes handled
    // as a client-side route change with no full reload, so a fixed sleep can resolve while
    // the OLD job's DOM is still showing. If the URL names a specific job id, poll until
    // location.href actually reflects it before returning.
    const targetJobId = url.match(/\/jobs\/view\/(\d+)/)?.[1];
    if (targetJobId) {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const check = await send('Runtime.evaluate', {
          expression: 'location.href',
          awaitPromise: true,
          returnByValue: true,
        });
        if (check.result?.value?.includes(targetJobId)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    const result = await send('Runtime.evaluate', {
      expression: '({ url: location.href, title: document.title })',
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result?.value ?? null;
  } finally {
    close();
  }
}

async function uploadFile(selector, filePath) {
  const { send, close } = await connect();
  try {
    await send('DOM.enable');
    const lookup = await send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: false,
    });
    const objectId = lookup.result?.objectId;
    if (!objectId) throw new Error(`No node found for selector: ${selector}`);
    const { nodeId } = await send('DOM.requestNode', { objectId });
    await send('DOM.setFileInputFiles', {
      nodeId,
      files: [filePath],
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const result = await send('Runtime.evaluate', {
      expression: `document.body.innerText`,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result?.value?.slice(0, 5000) ?? null;
  } finally {
    close();
  }
}

const [command, ...args] = process.argv.slice(2);

if (command === 'eval') {
  console.log(JSON.stringify(await evaluate(args.join(' ')), null, 2));
} else if (command === 'eval-file') {
  console.log(JSON.stringify(await evaluate(readFileSync(args[0], 'utf8')), null, 2));
} else if (command === 'nav') {
  console.log(JSON.stringify(await navigate(args[0]), null, 2));
} else if (command === 'upload-file') {
  console.log(JSON.stringify(await uploadFile(args[0], args[1]), null, 2));
} else {
  throw new Error('Usage: node scripts/linkedin_cdp.mjs eval <js> | eval-file <path> | nav <url> | upload-file <selector> <path>');
}
