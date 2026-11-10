// Extensión interna "X Profiles Helper": detecta en qué paso del login está la página de X y se lo avisa a la app.
// La app (Kotlin) es quien escribe usuario y contraseña con teclado real: aquí no hay credenciales.
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

  let hello;
  try {
    hello = await send({ type: "hello", url: location.href });
  } catch (e) {
    return; // sin mensajería nativa (p. ej. la página se cerró)
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
