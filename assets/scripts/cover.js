document.addEventListener("DOMContentLoaded", () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cover = document.createElement("div");
  cover.id = "cover";
  document.body.appendChild(cover);

  const scrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";

  const canvas = document.createElement("canvas");
  canvas.id = "cover-canvas";
  cover.appendChild(canvas);

  const title = document.createElement("div");
  title.id = "cover-title";
  title.textContent = "Chart";
  cover.appendChild(title);

  const style = document.createElement("style");
  style.textContent = `
    #cover{
      position:fixed;
      inset:0;
      z-index:9999;
      background:#000;
      overflow:hidden;
      opacity:1;
      transition:opacity 900ms ease;
      will-change:opacity;
    }
    #cover.fade{opacity:0}
    #cover-canvas{
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      display:block;
    }
    #cover-title{
      position:absolute;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:2;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
      font-size:clamp(44px,7vw,92px);
      font-weight:700;
      letter-spacing:-0.04em;
      color:#fff;
      user-select:none;
      pointer-events:none;
      opacity:1;
      transform:translateY(0);
      transition:opacity 650ms ease, transform 650ms ease;
    }
    #cover.fade #cover-title{
      opacity:0;
      transform:translateY(-6px);
    }
  `;
  document.head.appendChild(style);

  const ctx = canvas.getContext("2d", { alpha: true });

  let w = 0;
  let h = 0;
  let dpr = 1;
  let bars = [];
  let startedAt = 0;
  let fadeStarted = false;
  let raf = 0;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBars();
  }

  function buildBars() {
    const step = 8;
    const count = Math.ceil(w / step) + 2;
    const center = w / 2;
    bars = [];

    let trend = Math.random() > 0.5 ? 1 : -1;

    for (let i = 0; i < count; i++) {
      if (i % 10 === 0 && Math.random() > 0.35) trend *= -1;

      const x = i * step - 8;
      const dist = Math.abs(x - center) / center;
      const height = h * (0.18 + Math.random() * 0.62);
      const bodyW = 6 + (Math.random() > 0.7 ? 1 : 0);
      const color = trend > 0 ? "#16a34a" : "#dc2626";

      bars.push({
        x,
        bodyW,
        height,
        color,
        delay: i * 6 + Math.random() * 120,
        drift: (Math.random() * 0.5 + 0.5) * (1 - dist) * 1.0,
        wobble: Math.random() * Math.PI * 2,
        wickTop: 4 + Math.random() * 18,
        wickBottom: 2 + Math.random() * 10
      });
    }
  }

  function drawFrame(now) {
    const elapsed = now - startedAt;

    const buildDur = reduceMotion ? 120 : 850;
    const openDelay = reduceMotion ? 140 : 1100;
    const openDur = reduceMotion ? 160 : 900;
    const fadeDelay = reduceMotion ? 320 : 2050;
    const fadeDur = reduceMotion ? 250 : 900;

    const buildP = clamp(elapsed / buildDur, 0, 1);
    const openP = clamp((elapsed - openDelay) / openDur, 0, 1);
    const fadeP = clamp((elapsed - fadeDelay) / fadeDur, 0, 1);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const center = w / 2;
    const maxShift = w * 0.42;
    const titleLift = easeOutCubic(clamp((elapsed - 250) / 500, 0, 1));

    ctx.save();
    for (const bar of bars) {
      const local = clamp((elapsed - bar.delay) / (reduceMotion ? 80 : 520), 0, 1);
      const grow = easeOutCubic(local) * easeOutCubic(buildP);
      const xDist = (bar.x + bar.bodyW / 2 - center) / center;
      const openEase = easeInOutCubic(openP);

      const move = Math.sign(xDist) * Math.pow(Math.abs(xDist), 0.72) * maxShift * openEase;
      const settle = Math.sin(elapsed * 0.004 + bar.wobble) * 0.8 * (1 - openEase) * bar.drift;

      const x = bar.x + move + settle;
      const fullH = bar.height;
      const hNow = Math.max(1, fullH * grow);
      const y = h - hNow;
      const alpha = 0.28 + 0.16 * grow;

      ctx.globalAlpha = alpha * (1 - fadeP * 0.9);
      ctx.fillStyle = bar.color;
      ctx.fillRect(Math.round(x), Math.round(y), bar.bodyW, Math.round(hNow));

      ctx.globalAlpha = alpha * 0.36 * (1 - fadeP * 0.9);
      ctx.fillRect(Math.round(x + bar.bodyW / 2), Math.round(y - bar.wickTop), 1, Math.round(hNow + bar.wickTop + bar.wickBottom));
    }
    ctx.restore();

    title.style.transform = `translateY(${-titleLift * 4}px)`;
    title.style.opacity = `${1 - Math.max(0, (elapsed - 1400) / 550)}`;

    if (elapsed >= fadeDelay && !fadeStarted) {
      fadeStarted = true;
      cover.classList.add("fade");
      title.classList.add("fade");
    }

    if (elapsed < fadeDelay + fadeDur + 200) {
      raf = requestAnimationFrame(drawFrame);
    } else {
      cleanup();
    }
  }

  function cleanup() {
    cancelAnimationFrame(raf);
    cover.remove();
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, scrollY);
    window.removeEventListener("resize", resize);
  }

  window.addEventListener("resize", resize);
  resize();

  startedAt = performance.now();
  raf = requestAnimationFrame(drawFrame);
});