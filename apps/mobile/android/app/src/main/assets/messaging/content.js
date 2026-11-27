// Extensión interna "X Profiles Helper". Hace dos cosas, según lo que la app (Kotlin) tenga pendiente al cargar la página:
//  - login: detecta en qué paso está la página de X y se lo avisa a la app. La app escribe usuario y contraseña con
//    teclado real: aquí no hay credenciales.
//  - post: Post Helper (hilo, cita o respuesta). Escribe en el compositor de X, pulsa sus controles y adjunta las
//    imágenes, siempre sin publicar: el usuario revisa y pulsa Post.
(async function () {
  const NATIVE = "browser";
  const USER_SEL = 'input[autocomplete="username"], input[name="text"], input[name="username_or_email"], input[type="text"]';
  const PASS_SEL = 'input[type="password"], input[name="password"]';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // La respuesta de la app llega como texto JSON
  const send = async (msg) => {
    const r = await browser.runtime.sendNativeMessage(NATIVE, msg);
    if (typeof r === "string") {
      try { return JSON.parse(r); } catch (e) { return r; }
    }
    return r;
  };
  const log = (text) => send({ type: "log", text }).catch(() => {});


  // ====== Post Helper ======
  // La app (Kotlin) deja la tarea pendiente y la entrega en el "hello" de la página que carga; al terminar avisa con "postDone".

  const rand = (min, max) => min + Math.random() * (max - min);
  const humanPause = (min, max) => sleep(rand(min, max));
  const TYPING_TARGET_MS = 1750; // lo que tarda, más o menos, en escribirse cada post

  const waitFor = async (fn, timeoutMs = 15000, stepMs = 150) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const value = fn();
      if (value) return value;
      await sleep(stepMs);
    }
    return null;
  };

  const graphemes = (text) =>
    typeof Intl !== "undefined" && Intl.Segmenter
      ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment)
      : Array.from(text);

  // Editor `i` del compositor; si hay un modal abierto se prefiere el suyo (en la página de un tweet también hay uno en línea)
  const editorRoot = (i) =>
    document.querySelector('[role="dialog"] [data-testid="tweetTextarea_' + i + '"]') ||
    document.querySelector('[data-testid="tweetTextarea_' + i + '"]');
  const editorEl = (i) => {
    const root = editorRoot(i);
    if (!root) return null;
    return root.isContentEditable ? root : root.querySelector('[contenteditable="true"]') || root;
  };

  // Sube desde el editor hasta el contenedor que tiene `selector` (el del compositor al que pertenece)
  const closestWith = (i, selector) => {
    let node = editorRoot(i);
    while (node) {
      const found = node.querySelector(selector);
      if (found) return found;
      node = node.parentElement;
    }
    return null;
  };

  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // Clic sintético (secuencia completa de punteros) y, si no surte efecto, toque real a través de la app
  const clickAndWait = async (el, verify, label) => {
    el.scrollIntoView({ block: "center" });
    await humanPause(150, 350);
    const { x, y } = center(el);
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      const Ctor = type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, opts));
      await humanPause(20, 60);
    }
    el.click();
    if (await waitFor(verify, 2500)) return true;

    // Plan B: toque real
    const again = el.isConnected ? center(el) : { x, y };
    await send({ type: "tap", x: again.x, y: again.y, dpr: window.devicePixelRatio || 1 });
    if (await waitFor(verify, 4000)) return true;
    throw new Error(label + ": the click had no effect");
  };

  const insertText = (text) => document.execCommand("insertText", false, text);

  // Traza de lo que va ocurriendo: va al motivo del error (y al log de la app) para poder diagnosticar
  const trace = [];
  const mark = (step) => {
    const root = editorRoot(0);
    const line = step + ": " + location.pathname + " editors=" + document.querySelectorAll('[data-testid^="tweetTextarea_"]').length +
      " text0=" + (root ? (root.textContent || "").length : "none");
    trace.push(line);
    log(line);
  };

  // Texto que hay ahora en el editor `i` (textContent: no depende del dibujado, a diferencia de innerText)
  const readText = (i) => {
    const root = editorRoot(i);
    const el = editorEl(i);
    return Math.max(root ? (root.textContent || "").trim().length : 0, el ? (el.textContent || "").trim().length : 0);
  };

  // Vacía el editor (seleccionar todo + borrar): así un reintento nunca duplica el contenido
  const clearEditor = (i) => {
    const el = editorEl(i);
    if (!el) return;
    el.focus();
    document.execCommand("selectAll");
    document.execCommand("delete");
  };

  // Escribe carácter a carácter (un grafema entero cada vez: no se parten emojis ni marcas combinadas)
  const typeInEditor = async (i, text) => {
    if (!(await waitFor(() => editorEl(i), 15000))) {
      throw new Error("The editor for post " + (i + 1) + " did not appear. Page: " + location.href);
    }
    const el = editorEl(i);
    el.focus();
    if (!(document.activeElement === el || el.contains(document.activeElement))) {
      throw new Error("Could not focus the editor for post " + (i + 1));
    }
    await humanPause(250, 600);

    const perChar = Math.min(70, Math.max(6, TYPING_TARGET_MS / Math.max(1, text.length)));
    const lines = text.split(/\r?\n/);
    for (let l = 0; l < lines.length; l++) {
      if (l > 0) document.execCommand("insertParagraph");
      for (const ch of graphemes(lines[l])) {
        insertText(ch);
        let delay = perChar * rand(0.5, 1.5);
        if (/\s/.test(ch)) delay *= 1.5;
        else if (/[.,;:!?]/.test(ch)) delay *= 2;
        await sleep(delay);
      }
    }
    await humanPause(250, 600);

    // El editor tarda un poco en reflejar lo escrito: se espera antes de darlo por vacío
    const expected = text.replace(/\s+/g, "").length;
    const actual = () => (editorRoot(i).textContent || "").replace(/\s+/g, "").length;
    await waitFor(() => actual() > 0, 2500, 100);

    if (actual() === 0) {
      // No registró el texto carácter a carácter: se vacía y se prueba de golpe (nunca encima de lo que hubiera)
      log("editor " + i + " empty after typing, retrying whole text");
      clearEditor(i);
      insertText(text);
      await waitFor(() => actual() > 0, 2000, 100);
      if (actual() === 0) {
        clearEditor(i);
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        await waitFor(() => actual() > 0, 2000, 100);
      }
      if (actual() === 0) throw new Error("The editor for post " + (i + 1) + " stayed empty after typing");
    } else if (actual() > expected * 1.5) {
      // El texto salió duplicado: se vacía y se deja una sola copia
      log("editor " + i + " has duplicated text (" + actual() + " vs " + expected + "), clearing");
      clearEditor(i);
      insertText(text);
      await waitFor(() => actual() > 0, 2000, 100);
    }
    mark("typed post " + (i + 1));
  };

  const bytesFrom = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    return bytes;
  };

  // Imágenes (base64) al input de archivos del compositor, como si el usuario las hubiera elegido
  const attachImages = async (i, images) => {
    if (!images || images.length === 0) return;
    await humanPause(300, 700);
    const input = await waitFor(() => closestWith(i, 'input[data-testid="fileInput"]'), 10000);
    if (!input) throw new Error("The image input was not found in the composer. Page: " + location.href);

    const dt = new DataTransfer();
    for (const image of images) {
      dt.items.add(new File([bytesFrom(image.data)], image.name || "image", { type: image.mime || "image/png" }));
    }
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    if (!(await waitFor(() => closestWith(i, '[data-testid="attachments"]'), 15000))) {
      throw new Error("The images did not show up in the composer. Page: " + location.href);
    }
    // Se deja tiempo a que X procese las vistas previas (si no se confirman, se sigue igualmente)
    await waitFor(() => {
      const box = closestWith(i, '[data-testid="attachments"]');
      return box && box.querySelectorAll("img").length >= images.length;
    }, 15000);
    await humanPause(400, 900);
    mark("images attached");
  };

  const addButton = () =>
    document.querySelector('[data-testid="addButton"]') ||
    Array.from(document.querySelectorAll("button[aria-label]")).find((b) =>
      /add (another )?(post|tweet)|añadir (otro )?(post|tweet)|agregar (otro )?(post|tweet)/i.test(b.getAttribute("aria-label") || "")
    ) ||
    null;

  const threadFlow = async (texts, images) => {
    for (let i = 0; i < texts.length; i++) {
      await typeInEditor(i, texts[i]);
      if (i === 0) await attachImages(0, images);
      if (i < texts.length - 1) {
        const btn = await waitFor(() => {
          const b = addButton();
          return b && b.getAttribute("aria-disabled") !== "true" && !b.disabled ? b : null;
        }, 15000);
        if (!btn) throw new Error('The "+" (add post) button was not available after post ' + (i + 1));
        await humanPause(400, 900);
        mark("before + after post " + (i + 1));
        await clickAndWait(btn, () => !!editorRoot(i + 1), 'The "+" button');
        await humanPause(350, 700);
        mark("after + (post " + (i + 1) + ")");
      }
    }
  };

  const focalArticle = (tweetId) => {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    return articles.find((a) => a.querySelector('a[href$="/status/' + tweetId + '"]')) || articles[0] || null;
  };

  const quoteItem = () => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    return (
      items.find((m) => /quote|citar|cita/i.test(m.innerText || "")) ||
      items.find((m) => !/confirm/i.test(m.getAttribute("data-testid") || "")) ||
      null
    );
  };

  const quoteFlow = async (tweetId, text, images) => {
    const retweet = () => {
      const article = focalArticle(tweetId);
      return article && article.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
    };
    if (!(await waitFor(retweet, 20000))) throw new Error("The repost button was not found on the tweet page. Page: " + location.href);
    await humanPause(300, 600);

    let quote = null;
    for (let attempt = 1; attempt <= 3 && !quote; attempt++) {
      if (!document.querySelector('[role="menu"]')) {
        try {
          await clickAndWait(retweet(), () => !!quoteItem(), "The repost button");
        } catch (e) {
          if (attempt === 3) throw e;
        }
      }
      quote = await waitFor(quoteItem, 3000);
    }
    if (!quote) throw new Error("The repost menu did not show a Quote option. Page: " + location.href);
    await humanPause(150, 350);
    mark("quote option found");
    await clickAndWait(quote, () => !!editorRoot(0), "The Quote option");
    await humanPause(250, 500);
    mark("quote composer open");

    await typeInEditor(0, text);
    await attachImages(0, images);
  };

  const replyFlow = async (tweetId, text, images) => {
    // En pantallas anchas el cuadro de respuesta está en línea; en estrechas hay que pulsar "responder" para abrirlo
    if (!(await waitFor(() => editorEl(0), 4000))) {
      const article = await waitFor(() => focalArticle(tweetId), 15000);
      const reply = article && article.querySelector('[data-testid="reply"]');
      if (!reply) throw new Error("The reply box was not found on the tweet page. Page: " + location.href);
      await humanPause(300, 600);
      await clickAndWait(reply, () => !!editorEl(0), "The reply button");
    }
    await humanPause(500, 900);
    mark("reply composer ready");
    await typeInEditor(0, text);
    await attachImages(0, images);
  };

  async function runPost(task) {
    // Si la página ya está ejecutando la tarea (p. ej. el script se inyectó dos veces), no se duplica el trabajo
    if (window.__xpmPostRunning) return;
    window.__xpmPostRunning = true;
    try {
      const texts = (task && task.texts) || [];
      const images = (task && task.images) || [];
      if (texts.length === 0) throw new Error("There is no text to post");
      // Hay que estar en la página esperada (X puede pasar antes por el login): si no, la tarea sigue pendiente
      const expectedPath = task.mode === "thread" ? "/compose/" : "/status/";
      if (!location.pathname.includes(expectedPath)) {
        await log("post task waiting: now at " + location.pathname);
        return;
      }
      mark("start " + task.mode);
      await humanPause(600, 1200);
      if (task.mode === "thread") await threadFlow(texts, images);
      else if (task.mode === "quote") await quoteFlow(task.tweetId, texts[0], images);
      else if (task.mode === "reply") await replyFlow(task.tweetId, texts[0], images);
      else throw new Error("Unknown post mode: " + task.mode);
      await send({ type: "postDone", ok: true });
    } catch (e) {
      const reason = String((e && e.message) || e) + " [trace: " + trace.join(" ; ") + "]";
      await send({ type: "postDone", ok: false, reason }).catch(() => {});
    }
  }

  let hello;
  try {
    hello = await send({ type: "hello", url: location.href });
  } catch (e) {
    return; // sin mensajería nativa (p. ej. la página se cerró)
  }
  if (hello && hello.task === "post") {
    await runPost(hello.payload);
    return;
  }
  if (!hello || hello.task !== "login") return;

  let userDone = !!hello.userDone;
  const deadline = Date.now() + 90000;

  // X mete un campo de contraseña oculto en el DOM: solo cuentan los campos realmente visibles
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0) || st.visibility === "hidden" || el.disabled) return false;
    if (parseFloat(st.opacity) < 0.05) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || (hit && el.contains(hit)) || (hit && hit.contains(el) && hit.tagName !== "BODY" && hit.tagName !== "HTML");
  };
  const findVisible = (sel) => Array.from(document.querySelectorAll(sel)).find(isVisible);

  while (Date.now() < deadline) {
    const user = findVisible(USER_SEL);
    const pass = findVisible(PASS_SEL);

    if (pass && (userDone || !user)) {
      await sleep(1200);
      pass.focus();
      pass.click();
      await sleep(300);
      await send({ type: "typePassword" });
      return;
    }
    if (user && !userDone) {
      await sleep(500);
      user.focus();
      await sleep(200);
      await send({ type: "typeUsername" });
      userDone = true;
    }
    await sleep(500);
  }
  await log("login flow timed out");
})();
