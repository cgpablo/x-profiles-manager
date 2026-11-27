/**
 * Rellena el compositor de X como un hilo por CDP: primer post en el editor y el botón "+" para cada siguiente.
 * No publica nada: el usuario revisa y pulsa "Post all".
 */

type Send = (method: string, params?: any) => Promise<any>;

const log = (message: string) => console.log(`[Thread] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const humanPause = (min: number, max: number) => sleep(rand(min, max));

/** Margen de tiempo para un hilo. */
const BASE_TIMEOUT_MS = 90000;
const PER_CHAR_TIMEOUT_MS = 100;

/** Lo que tarda en escribirse cada post, más o menos, sea corto o largo. */
const TYPING_TARGET_MS = 1750;

/** Pausa tras escribir un carácter: reparte el tiempo objetivo con ritmo irregular y algo más de calma tras espacios y puntuación. */
function keystrokeDelay(ch: string, perChar: number): number {
  let delay = perChar * rand(0.5, 1.5);
  if (/\s/.test(ch)) delay *= 1.5;
  else if (/[.,;:!?]/.test(ch)) delay *= 2;
  return delay;
}

const graphemes = (text: string): string[] =>
  typeof (Intl as any).Segmenter === 'function'
    ? Array.from(new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s: any) => s.segment as string)
    : Array.from(text);

/** Ejecuta `task` sobre un websocket CDP. Resuelve a null si el socket falla o se agota el tiempo. */
export function runCdp<T>(wsUrl: string, task: (send: Send) => Promise<T>, timeoutMs = 90000): Promise<T | null> {
  const WebSocket = require('ws');
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    let finished = false;
    const pending = new Map<number, (result: any) => void>();

    const finish = (value: T | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(value);
    };
    const timer = setTimeout(() => {
      log('timeout');
      finish(null);
    }, timeoutMs);

    const send: Send = (method, params = {}) =>
      new Promise((res) => {
        const id = msgId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });

    ws.on('error', (error: Error) => {
      log(`websocket error: ${error.message}`);
      finish(null);
    });
    ws.on('close', () => finish(null));
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id && pending.has(msg.id)) {
          const cb = pending.get(msg.id)!;
          pending.delete(msg.id);
          cb(msg.error ? { error: msg.error } : msg.result);
        }
      } catch {}
    });
    ws.on('open', () => {
      task(send).then(finish, (error: any) => {
        log(`task error: ${error?.message}`);
        finish(null);
      });
    });
  });
}

/** Editor `i` del compositor. Si hay un modal abierto se prefiere el suyo (en la página de un tweet también hay uno en línea). */
const EDITOR = (i: number) =>
  `(document.querySelector('[role="dialog"] [data-testid="tweetTextarea_${i}"]') || document.querySelector('[data-testid="tweetTextarea_${i}"]'))`;

/** Sube desde el editor hasta el contenedor que tiene `selector` (el del compositor al que pertenece). */
const CLOSEST_WITH = (index: number, selector: string) => `(() => {
  let node = ${EDITOR(index)};
  while (node && node !== document.body) {
    const found = node.querySelector('${selector}');
    if (found) return found;
    node = node.parentElement;
  }
  return null;
})()`;

const FILE_INPUT = (index: number) => CLOSEST_WITH(index, 'input[data-testid="fileInput"]');
const ATTACHMENTS = (index: number) => CLOSEST_WITH(index, '[data-testid="attachments"]');

const FOCUS_EDITOR = (i: number) => `(() => {
  const root = ${EDITOR(i)};
  if (!root) return false;
  const el = root.isContentEditable ? root : (root.querySelector('[contenteditable="true"]') || root);
  el.focus();
  return document.activeElement === el || el.contains(document.activeElement);
})()`;

const ADD_BUTTON = `(() => {
  return document.querySelector('[data-testid="addButton"]')
    || Array.from(document.querySelectorAll('button[aria-label]')).find((b) => /add (another )?(post|tweet)|añadir (otro )?(post|tweet)|agregar (otro )?(post|tweet)/i.test(b.getAttribute('aria-label') || ''))
    || null;
})()`;

/** Fotografía de la página para saber qué ve el navegador cuando algo falla. */
const PAGE_SNAPSHOT = `(() => {
  const ids = Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid')).slice(0, 25);
  return location.href + ' | testids: ' + ids.join(', ');
})()`;

/** Estado resumido de la página: URL, editores abiertos y botón "+". Va al mensaje de error para poder diagnosticar. */
const PAGE_STATE = `(() => {
  const add = document.querySelector('[data-testid="addButton"]');
  const editors = document.querySelectorAll('[data-testid^="tweetTextarea_"]').length;
  return location.pathname + ' editors=' + editors + ' add=' + (add ? (add.getAttribute('aria-disabled') === 'true' || add.disabled ? 'disabled' : 'enabled') : 'none');
})()`;

/** Centro del botón "+" en coordenadas de la ventana, o null. */
const ADD_BUTTON_CENTER = `(() => {
  const b = ${ADD_BUTTON};
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`;

/** Herramientas comunes para manejar una página de X por CDP con ritmo humano. */
function createDriver(send: Send, trace: string[]) {
  const evaluate = async (expression: string): Promise<any> => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (res?.error || res?.exceptionDetails) log(`evaluate failed: ${JSON.stringify(res.error || res.exceptionDetails)}`);
    return res?.result?.value;
  };

  const waitFor = async (expression: string, timeoutMs = 15000): Promise<boolean> => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await evaluate(expression)) return true;
      await sleep(120);
    }
    return false;
  };

  const mark = async (step: string) => trace.push(`${step}: ${await evaluate(PAGE_STATE)}`);

  /**
   * Clic real (ratón) en el punto que devuelve `centerExpression` ({x, y} o null): algunos controles de X ignoran el
   * click sintético de .click(). El ratón llega en varios pasos, con un pequeño desvío, y se detiene antes de pulsar.
   */
  const humanClick = async (centerExpression: string): Promise<boolean> => {
    const center = await evaluate(centerExpression);
    if (!center) return false;
    const startX = center.x - rand(80, 240);
    const startY = center.y + rand(-120, 120);
    const steps = Math.round(rand(5, 9));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: startX + (center.x - startX) * t + (step < steps ? rand(-6, 6) : 0),
        y: startY + (center.y - startY) * t + (step < steps ? rand(-6, 6) : 0),
      });
      await humanPause(8, 25);
    }
    await humanPause(60, 150);
    const x = center.x + rand(-3, 3);
    const y = center.y + rand(-3, 3);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await humanPause(50, 140);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    return true;
  };

  /** Escribe `text` en el editor `index` del compositor. Devuelve el motivo del fallo, o null si fue bien. */
  const typeInEditor = async (index: number, text: string): Promise<string | null> => {
    if (!(await waitFor(`!!${EDITOR(index)}`))) {
      return `The editor for post ${index + 1} did not appear. Page: ${await evaluate(PAGE_SNAPSHOT)}`;
    }
    if (!(await evaluate(FOCUS_EDITOR(index)))) return `Could not focus the editor for post ${index + 1}`;
    await humanPause(250, 600);

    const lines = text.split(/\r?\n/);
    const perChar = Math.min(70, Math.max(6, TYPING_TARGET_MS / Math.max(1, text.length)));
    for (let l = 0; l < lines.length; l++) {
      if (l > 0) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      }
      // Carácter a carácter con ritmo humano (un grafema entero cada vez, para no partir emojis ni marcas combinadas)
      for (const ch of graphemes(lines[l])) {
        await send('Input.insertText', { text: ch });
        await sleep(keystrokeDelay(ch, perChar));
      }
    }
    await humanPause(250, 600);

    // Si el editor no registró el texto, se reintenta con execCommand
    const typed = `(() => { const r = ${EDITOR(index)}; return !!r && r.innerText.trim().length > 0; })()`;
    if (!(await evaluate(typed))) {
      log(`editor ${index} empty after insertText, retrying with execCommand`);
      await evaluate(FOCUS_EDITOR(index));
      await evaluate(`document.execCommand('insertText', false, ${JSON.stringify(text)})`);
      await sleep(300);
      if (!(await evaluate(typed))) return `The editor for post ${index + 1} stayed empty after typing`;
    }
    return null;
  };

  /** Adjunta imágenes (rutas locales) al compositor del editor `index`. Devuelve el motivo del fallo, o null si fue bien. */
  const attachImages = async (index: number, paths: string[]): Promise<string | null> => {
    if (paths.length === 0) return null;
    await humanPause(300, 700);

    let objectId: string | undefined;
    const end = Date.now() + 10000;
    while (Date.now() < end && !objectId) {
      const res = await send('Runtime.evaluate', { expression: FILE_INPUT(index), returnByValue: false });
      objectId = res?.result?.objectId;
      if (!objectId) await sleep(200);
    }
    if (!objectId) return `The image input was not found in the composer. Page: ${await evaluate(PAGE_SNAPSHOT)}`;

    await send('DOM.enable');
    const set = await send('DOM.setFileInputFiles', { files: paths, objectId });
    if (set?.error) return `Could not attach the images: ${JSON.stringify(set.error)}`;

    if (!(await waitFor(`!!(${ATTACHMENTS(index)})`, 15000))) {
      return `The images did not show up in the composer. Page: ${await evaluate(PAGE_SNAPSHOT)}`;
    }
    // Se deja tiempo a que X termine de procesar las vistas previas
    const previews = `(() => { const a = ${ATTACHMENTS(index)}; return !!a && a.querySelectorAll('img').length >= ${paths.length}; })()`;
    if (!(await waitFor(previews, 15000))) log('image previews not confirmed, continuing');
    await humanPause(400, 900);
    log(`${paths.length} image(s) attached`);
    return null;
  };

  return { evaluate, waitFor, mark, humanClick, typeInEditor, attachImages };
}

/** Ejecuta `task` con un driver y lanza un Error (con traza) si falla. */
async function runDriven(
  wsUrl: string,
  timeoutMs: number,
  task: (driver: ReturnType<typeof createDriver>, fail: (reason: string) => false) => Promise<boolean>
): Promise<void> {
  let failure: string | null = null;
  const trace: string[] = [];
  const result = await runCdp(
    wsUrl,
    async (send) => {
      await send('Page.bringToFront');
      return task(createDriver(send, trace), (reason) => {
        failure = reason;
        return false;
      });
    },
    timeoutMs
  );
  if (result === true) return;
  const reason = `${failure ?? 'Lost the connection to the browser (timeout or socket error)'} [trace: ${trace.join(' ; ')}]`;
  log(`FAILED: ${reason}`);
  throw new Error(reason);
}

/** Rellena el hilo. Lanza un Error con el motivo si no se pudo. */
export async function fillThread(wsUrl: string, posts: string[], imagePaths: string[] = []): Promise<void> {
  const timeoutMs = BASE_TIMEOUT_MS + posts.join('').length * PER_CHAR_TIMEOUT_MS;
  await runDriven(wsUrl, timeoutMs + imagePaths.length * 15000, async ({ evaluate, waitFor, mark, humanClick, typeInEditor, attachImages }, fail) => {
    for (let i = 0; i < posts.length; i++) {
      await mark(`before post ${i + 1}`);
      const problem = await typeInEditor(i, posts[i]);
      if (problem) return fail(problem);
      log(`post ${i + 1}/${posts.length} written`);
      await mark(`typed post ${i + 1}`);
      if (i === 0) {
        const imageProblem = await attachImages(0, imagePaths);
        if (imageProblem) return fail(imageProblem);
      }

      if (i < posts.length - 1) {
        if (!(await waitFor(`(() => { const b = ${ADD_BUTTON}; return !!b && b.getAttribute('aria-disabled') !== 'true' && !b.disabled; })()`))) {
          return fail(`The "+" (add post) button was not available after post ${i + 1}. Page: ${await evaluate(PAGE_SNAPSHOT)}`);
        }
        // Se repasa el texto antes de seguir, como haría una persona
        await humanPause(400, 900);
        if (!(await humanClick(ADD_BUTTON_CENTER))) await evaluate(`${ADD_BUTTON}.click()`);
        await humanPause(350, 700);
        await mark(`clicked + after post ${i + 1}`);
      }
    }
    return true;
  });
}

/** Centro del botón de repostear del tweet `id` (el principal de la página), desplazándolo a la vista. */
const RETWEET_CENTER = (id: string) => `(() => {
  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const article = articles.find((a) => a.querySelector('a[href$="/status/${id}"]')) || articles[0];
  const button = article && article.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
  if (!button) return null;
  button.scrollIntoView({ block: 'center' });
  const r = button.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`;

/** Entrada "Quote" del menú de repostear: por texto y, si no, la que no es la de confirmar el repost. */
const QUOTE_ITEM = `(() => {
  const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
  return items.find((m) => /quote|citar|cita/i.test(m.innerText || ''))
    || items.find((m) => !/confirm/i.test(m.getAttribute('data-testid') || ''))
    || null;
})()`;

const QUOTE_ITEM_CENTER = `(() => {
  const item = ${QUOTE_ITEM};
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`;

/**
 * En la página del tweet: pulsa repostear, elige "Quote" y escribe el texto en el compositor.
 * Lanza un Error con el motivo si no se pudo. No publica.
 */
export async function fillQuote(wsUrl: string, tweetId: string, text: string, imagePaths: string[] = []): Promise<void> {
  const timeoutMs = BASE_TIMEOUT_MS + text.length * PER_CHAR_TIMEOUT_MS;
  await runDriven(wsUrl, timeoutMs + imagePaths.length * 15000, async ({ evaluate, waitFor, mark, humanClick, typeInEditor, attachImages }, fail) => {
    await mark('tweet page');
    if (!(await waitFor(`!!(${RETWEET_CENTER(tweetId)})`, 20000))) {
      return fail(`The repost button was not found on the tweet page. Page: ${await evaluate(PAGE_SNAPSHOT)}`);
    }

    // El tweet aún puede estar acomodándose (imágenes, barras): se espera a que el botón deje de moverse
    let last = JSON.stringify(await evaluate(RETWEET_CENTER(tweetId)));
    for (let i = 0; i < 12; i++) {
      await sleep(150);
      const now = JSON.stringify(await evaluate(RETWEET_CENTER(tweetId)));
      if (now === last) break;
      last = now;
    }
    await humanPause(300, 600);

    // Si el menú no se abre (clic perdido), se reintenta; si ya hay un menú abierto no se vuelve a pulsar para no cerrarlo
    let quoteFound = false;
    for (let attempt = 1; attempt <= 3 && !quoteFound; attempt++) {
      if (!(await evaluate(`!!document.querySelector('[role="menu"]')`))) {
        if (!(await humanClick(RETWEET_CENTER(tweetId)))) return fail('Could not click the repost button');
        await mark(`clicked repost (attempt ${attempt})`);
      }
      quoteFound = await waitFor(`!!(${QUOTE_ITEM})`, 3000);
    }
    if (!quoteFound) {
      const menu = await evaluate(`Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]')).map((m) => (m.innerText || '').trim() + '[' + (m.getAttribute('data-testid') || '') + ']').join(' | ')`);
      return fail(`The repost menu did not show a Quote option. Menu items: ${menu || 'none (menu did not open)'}. Page: ${await evaluate(PAGE_SNAPSHOT)}`);
    }
    await humanPause(150, 350);
    if (!(await humanClick(QUOTE_ITEM_CENTER))) return fail('Could not click the Quote option');
    await humanPause(250, 500);
    await mark('clicked quote');

    const problem = await typeInEditor(0, text);
    if (problem) return fail(problem);
    await mark('typed quote');
    const imageProblem = await attachImages(0, imagePaths);
    if (imageProblem) return fail(imageProblem);
    log('quote written');
    return true;
  });
}

/**
 * En la página del tweet: escribe la respuesta en el cuadro de respuesta en línea y adjunta las imágenes.
 * Lanza un Error con el motivo si no se pudo. No publica.
 */
export async function fillReply(wsUrl: string, text: string, imagePaths: string[] = []): Promise<void> {
  const timeoutMs = BASE_TIMEOUT_MS + text.length * PER_CHAR_TIMEOUT_MS + imagePaths.length * 15000;
  await runDriven(wsUrl, timeoutMs, async ({ evaluate, mark, typeInEditor, attachImages }, fail) => {
    await mark('tweet page');
    // El cuadro de respuesta en línea tarda un poco en aparecer
    await humanPause(500, 900);
    const problem = await typeInEditor(0, text);
    if (problem) return fail(`${problem}. Page: ${await evaluate(PAGE_SNAPSHOT)}`);
    await mark('typed reply');
    const imageProblem = await attachImages(0, imagePaths);
    if (imageProblem) return fail(imageProblem);
    log('reply written');
    return true;
  });
}

/** Espera a que una pestaña esté en el compositor de X y devuelve su websocket CDP. */
export async function waitForComposerTab(
  fetchPages: () => Promise<Array<{ url: string; type: string; webSocketDebuggerUrl?: string }>>,
  timeoutMs = 25000,
  urlPart = '/compose/',
  what = 'The X composer did not open (not logged in?)'
): Promise<string> {
  const end = Date.now() + timeoutMs;
  let lastUrls: string[] = [];
  while (Date.now() < end) {
    try {
      const pages = await fetchPages();
      lastUrls = pages.filter((p) => p.type === 'page').map((p) => p.url);
      const tab = pages.find((p) => p.type === 'page' && p.url.includes(urlPart) && !!p.webSocketDebuggerUrl);
      if (tab) return tab.webSocketDebuggerUrl!;
    } catch {}
    await sleep(200);
  }
  const reason = `${what}. Open tabs: ${lastUrls.join(' | ') || 'none'}`;
  log(reason);
  throw new Error(reason);
}
