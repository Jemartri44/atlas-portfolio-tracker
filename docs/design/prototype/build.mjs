// Builds the static prototype pages from small template functions, so the
// shell is written once. No dependencies: `node build.mjs`.
//
// The prototype is the visual reference of docs/design/system.md, frozen as it
// was approved (2026-09-19). The application does not import any of it.
import { writeFileSync } from "node:fs";

const DIR = new URL(".", import.meta.url).pathname;

// ---- Icons: one sprite, 24px grid, 1.75 stroke, round caps ----------------
const ICONS = {
  summary:
    '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="M12 16.5 15.5 11"/><path d="M3.5 20h17"/>',
  movements:
    '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" stroke-width="2.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  portfolio:
    '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M15 3.9a8.5 8.5 0 0 1 5.1 5.1H15z"/>',
  bucket:
    '<path d="M9 3.5h6"/><path d="M10 3.5v6L5 18.2a1.8 1.8 0 0 0 1.6 2.8h10.8a1.8 1.8 0 0 0 1.6-2.8L14 9.5v-6"/><path d="M7.3 14.5h9.4"/>',
  settings:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:
    '<path d="M3.5 3.5l17 17"/><path d="M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7M6.6 6.6A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5c1.8 0 3.4-.6 4.8-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  browser:
    '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18"/><path d="M6.2 6.8h.01M8.7 6.8h.01" stroke-width="2.2"/>',
  laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
  caution:
    '<path d="M10.3 4.3 2.9 17.6A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-2.9L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 16.8h.01" stroke-width="2.2"/>',
  danger:
    '<path d="M8.3 3.5h7.4l4.8 4.8v7.4l-4.8 4.8H8.3l-4.8-4.8V8.3z"/><path d="M12 8v5M12 16.2h.01" stroke-width="2.2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8h.01" stroke-width="2.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevright: '<path d="M9.5 6l6 6-6 6"/>',
  chevdown: '<path d="M6 9.5l6 6 6-6"/>',
  arrow: '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  buy: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 20h14"/>',
  sell: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 20h14"/>',
  dividend:
    '<ellipse cx="12" cy="7" rx="7" ry="2.8"/><path d="M5 7v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V7"/><path d="M5 12v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/>',
  valuation:
    '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8.2" cy="8.2" r="1.4"/>',
  cashin:
    '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M15 14.5h2.5"/>',
  transfer: '<path d="M4 8h13M13.5 4.5 17 8l-3.5 3.5"/><path d="M20 16H7M10.5 12.5 7 16l3.5 3.5"/>',
  export:
    '<path d="M12 14.5V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 14v4.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  import:
    '<path d="M12 4v10.5M7.5 10 12 14.5 16.5 10"/><path d="M4.5 14v4.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  globe:
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z"/>',
  half: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none"/>',
  reversed: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  flask:
    '<path d="M9 3.5h6"/><path d="M10 3.5v6L5 18.2a1.8 1.8 0 0 0 1.6 2.8h10.8a1.8 1.8 0 0 0 1.6-2.8L14 9.5v-6"/>',
};

const sprite = `<svg width="0" height="0" class="sr-only" aria-hidden="true"><defs>${Object.entries(
  ICONS,
)
  .map(
    ([id, body]) =>
      `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`,
  )
  .join("")}</defs></svg>`;

const icon = (id, cls = "icon") =>
  `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// ---- Figures ---------------------------------------------------------------
let PRIVACY = true;
/** An amount or a quantity: the mask (four dots + unit) or the figure. */
const amt = (text, unit = "€", kind = "Importe") =>
  PRIVACY
    ? `<span class="mask" title="${kind} oculto"><span class="dots" aria-hidden="true">••••</span><span class="unit" aria-hidden="true">${unit}</span><span class="sr-only">${kind.toLowerCase()} oculto</span></span>`
    : `<span class="num">${text}${unit ? `<span class="unit">&nbsp;${unit}</span>` : ""}</span>`;

const key = (kind) =>
  `<svg class="key is-${kind}" viewBox="0 0 20 12" aria-hidden="true"><line x1="2" y1="6" x2="18" y2="6"/></svg>`;

// ---- Shell -----------------------------------------------------------------
const NAV = [
  ["resumen", "Resumen", "summary"],
  ["movimientos", "Movimientos", "movements"],
  ["cartera", "Cartera", "portfolio"],
  ["cubo", "Cubo", "bucket"],
];

const header = ({ current, overdue = true, fresh = false }) => `
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="#">${icon("globe", "mark")}<span>Atlas</span></a>
    <nav class="nav" aria-label="Secciones">
      <ul class="nav-list">
        ${NAV.map(
          ([id, label, ic]) =>
            `<li><a class="nav-link" href="#"${id === current ? ' aria-current="page"' : ""}><span class="indicator">${icon(ic)}</span><span class="nav-label">${label}</span></a></li>`,
        ).join("")}
        <li class="nav-action-item"><a class="nav-action" href="#" aria-label="Registrar una operación"><span class="plate">${icon("plus")}</span><span class="nav-label">Registrar</span></a></li>
      </ul>
    </nav>
    <div class="status">
      <a class="source" href="#" title="Tus datos viven en este navegador. Última exportación: 09/09/2026.">${icon("browser", "icon-sm")}<span class="where">Navegador</span>${
        fresh
          ? ""
          : `<span class="age${overdue ? " is-overdue" : ""}">${overdue ? icon("caution", "icon-sm") : ""}<span>hace 9 días</span></span>`
      }</a>
      <button class="privacy" type="button" aria-pressed="${PRIVACY}" aria-label="Ocultar importes y cantidades"><span class="pill">${icon(PRIVACY ? "eyeoff" : "eye", "icon-sm")}<span class="short">${PRIVACY ? "Oculto" : "Visible"}</span><span class="long">${PRIVACY ? "Importes ocultos" : "Importes visibles"}</span></span></button>
      <a class="icon-button" href="#" aria-label="Ajustes">${icon("settings")}</a>
    </div>
  </div>
</header>`;

const page = ({
  title,
  current,
  body,
  overdue,
  fresh,
}) => `<!-- biome-ignore-all lint/a11y: frozen visual reference; its links are placeholders -->
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} · Atlas</title>
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/layout.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/screens.css">
</head>
<body>
${sprite}
<div class="app">
${header({ current, overdue, fresh })}
<main class="page" id="contenido">
${body}
</main>
</div>
</body>
</html>
`;

const pageHead = (h1, sub, actions = "") => `
<div class="page-head">
  <div class="titles"><h1>${h1}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>
  ${actions}
</div>`;

const disclosure = (label, cls = "disclosure") =>
  `<details class="${cls}"><summary><span>${label}</span>${icon("chevdown", "icon-sm chev")}</summary></details>`;

// ---- Resumen (with data) ---------------------------------------------------
const notice = (sev, text, action) => `
<li><a class="notice is-${sev}" href="#">
  ${icon(sev === "caution" ? "caution" : sev === "danger" ? "danger" : "info", "notice-icon")}
  <span class="notice-body"><span class="notice-text">${text}</span><span class="notice-action">${action}${icon("arrow", "icon-sm")}</span></span>
</a></li>`;

const moveRow = (ic, title, sub, fig, figSub) => `
<li><a class="row has-lead" href="#">
  <span class="lead">${icon(ic)}</span>
  <span class="main"><span class="title truncate">${title}</span><span class="sub truncate">${sub}</span></span>
  <span class="figs"><span class="fig">${fig}</span><span class="fig-sub num">${figSub}</span></span>
</a></li>`;

const resumen = () => {
  const body = `
${pageHead("Resumen", "18 de septiembre de 2026")}
<div class="grid">
  <section class="card hero span-12" aria-labelledby="h-worth">
    <div class="hero-main">
      <div class="card-head"><h2 id="h-worth">Patrimonio total</h2></div>
      <p class="hero-figure">${amt("48.250")}</p>
    </div>
    <ul class="parts">
      <li class="part"><span class="part-label">${key("core")}<span class="name">Cartera principal</span></span><span class="part-fig">${amt("42.100")}</span></li>
      <li class="part"><span class="part-label">${key("bucket")}<span class="name">Cubo</span></span><span class="part-fig">${amt("3.150")}</span></li>
      <li class="part"><span class="part-label">${key("cash")}<span class="name">Efectivo</span></span><span class="part-fig">${amt("3.000")}</span></li>
    </ul>
    ${disclosure("Ver desglose por activo y cuenta")}
  </section>

  <section class="card span-7 is-attention" aria-labelledby="h-att">
    <div class="card-head"><h2 id="h-att">Atención</h2><span class="aside">7 avisos</span></div>
    <ul class="notices">
      ${notice("caution", "Tus datos viven en el navegador y hace 9 días que no los exportas: si borras los datos del sitio, se pierden.", "Exportar")}
      ${notice("caution", "El traspaso de World Index Fund a Small Cap Index Fund lleva 19 días abierto (máximo: 15).", "Ver traspaso")}
      ${notice("caution", "<strong>11 recompras</strong> dentro de la ventana de un año · World Index Fund: esas pérdidas no serán computables este ejercicio.", "Ver movimientos")}
      ${notice("info", "<strong>3 precios</strong> con más de 15 días · World Index Fund, Physical Gold ETC y Bitcoin ETP.", "Registrar valoraciones")}
    </ul>
    ${disclosure("Ver 3 avisos más", "disclosure more")}
  </section>

  <section class="card span-5" aria-labelledby="h-recent">
    <div class="card-head"><h2 id="h-recent">Últimos movimientos</h2></div>
    <ul class="rows">
      ${moveRow("buy", "World Index Fund", "Compra · Fondos indexados", amt("600,00"), "12/09/2026")}
      ${moveRow("dividend", "Alpha Robotics", "Dividendo · Cubo especulativo", amt("12,40"), "05/09/2026")}
      ${moveRow("cashin", "Fondos indexados", "Ingreso de efectivo", amt("600,00"), "01/09/2026")}
      ${moveRow("valuation", "Bitcoin ETP", "Valoración · ETC y ETP", amt("1.800,00"), "28/08/2026")}
      ${moveRow("sell", "Beta Biotech", "Venta · Cubo especulativo", amt("410,00"), "15/08/2026")}
    </ul>
    <a class="card-foot" href="#"><span>Ver todos los movimientos</span>${icon("chevright", "icon-sm")}</a>
  </section>

  <section class="card is-chart span-12" aria-labelledby="h-evo">
    <div class="card-head"><h2 id="h-evo">Evolución del patrimonio</h2>
      <div class="segmented" role="group" aria-label="Rango de la gráfica">
        <button type="button" aria-pressed="false" disabled title="No hay ningún punto con datos en el último mes"><span>1M</span></button>
        <button type="button" aria-pressed="true"><span>1A</span></button>
        <button type="button" aria-pressed="false"><span>5A</span></button>
        <button type="button" aria-pressed="false"><span>Todo</span></button>
      </div>
    </div>
    <figure class="chart">
      <div class="chart-plot" role="img" aria-label="Evolución de la cartera principal, el cubo y el efectivo en el último año; sin datos de marzo a mayo de 2026.">
        <svg viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true">
          <rect class="gap-band" x="416.7" y="0" width="250" height="240"/><line class="gap-edge" x1="416.7" y1="0" x2="416.7" y2="240"/><line class="gap-edge" x1="666.7" y1="0" x2="666.7" y2="240"/>
          <line class="grid-line" x1="0" y1="60" x2="1000" y2="60"/>
          <line class="grid-line" x1="0" y1="120" x2="1000" y2="120"/>
          <line class="grid-line" x1="0" y1="180" x2="1000" y2="180"/>
          <line class="base-line" x1="0" y1="240" x2="1000" y2="240"/>
          <path class="series is-cash" d="M0 227.2 L83.3 229.9 L166.7 226.1 L250 223.5 L333.3 228.3 L416.7 226.7 L500 225.1 L583.3 227.7 L666.7 225.6 L750 222.9 L833.3 226.1 L916.7 224.5 L1000 224"/>
          <path class="series is-bucket" d="M0 229.9 L83.3 229.1 L166.7 227.7 L250 228.3 L333.3 226.9 L416.7 226.1 M666.7 225.3 L750 224.5 L833.3 222.4 L916.7 223.7 L1000 223.2"/>
          <path class="series is-core" d="M0 62.9 L83.3 58.1 L166.7 53.3 L250 51.2 L333.3 46.4 L416.7 42.7 M666.7 32.5 L750 27.7 L833.3 23.5 L916.7 19.7 L1000 15.5"/>
        </svg>
        <span class="gap-label proto-gap-pos">sin precios</span>
      </div>
      <div class="chart-x" aria-hidden="true"><span>sep 2025</span><span>dic</span><span>mar 2026</span><span>jun</span><span>sep 2026</span></div>
      <figcaption class="chart-legend"><span>${key("core")}Cartera principal</span><span>${key("bucket")}Cubo</span><span>${key("cash")}Efectivo</span></figcaption>
    </figure>
    <p class="gap-note"><span class="swatch-gap" aria-hidden="true"></span><span>Sin precios de marzo a mayo de 2026: la línea se corta y no se inventa lo que hubo en medio.</span></p>
    ${disclosure("Ver los datos de la gráfica")}
  </section>
</div>`;
  return page({ title: "Resumen", current: "resumen", body });
};

// ---- Resumen (empty ledger, first steps) ----------------------------------
const resumenVacio = () => {
  const body = `
${pageHead("Resumen", "18 de septiembre de 2026")}
<section class="card onboarding" aria-labelledby="h-steps">
  <div class="onboarding-head">
    <div class="card-head"><h2 id="h-steps">Primeros pasos</h2>
      <div class="progress" aria-label="1 de 4 pasos hechos"><span class="meta">1 de 4</span><span class="track" aria-hidden="true"><span class="is-done"></span><span></span><span></span><span></span></span></div>
    </div>
    <p class="muted onboarding-lead">Atlas solo sabe lo que tú le cuentas. Con estos cuatro pasos el resumen empezará a llenarse.</p>
  </div>
  <ol class="steps">
    <li><div class="step is-done">
      <span class="step-mark">${icon("check", "icon-sm")}<span class="sr-only">Hecho</span></span>
      <div class="step-body"><h3 class="step-title">Da de alta la cuenta donde inviertes</h3><p class="step-text">Hecho: Fondos indexados · MyInvestor.</p></div>
    </div></li>
    <li><div class="step is-current">
      <span class="step-mark">2</span>
      <div class="step-body"><h3 class="step-title">Da de alta el primer activo</h3><p class="step-text">El fondo o el ETF que compras cada mes, con su tipo de activo.</p><a class="btn primary" href="#">${icon("plus")}Alta de activo</a></div>
    </div></li>
    <li><a class="step" href="#">
      <span class="step-mark">3</span>
      <div class="step-body"><h3 class="step-title">Fija los pesos objetivo</h3><p class="step-text">Cuánto quieres de renta variable, renta fija, oro y cripto. Suman 100.</p><span class="step-go">Ir a los pesos objetivo${icon("arrow", "icon-sm")}</span></div>
      ${icon("chevright", "icon-sm chev")}
    </a></li>
    <li><a class="step" href="#">
      <span class="step-mark">4</span>
      <div class="step-body"><h3 class="step-title">Registra tu primera compra</h3><p class="step-text">Cuatro datos: cuenta, activo, cantidad e importe.</p><span class="step-go">Registrar una compra${icon("arrow", "icon-sm")}</span></div>
      ${icon("chevright", "icon-sm chev")}
    </a></li>
  </ol>
  <p class="onboarding-foot">${icon("import", "icon-sm")}<span>¿Ya llevas tus datos en un fichero? <a href="#">Importar un fichero</a></span></p>
</section>`;
  return page({ title: "Resumen", current: "resumen", body, fresh: true });
};

// ---- Cartera ------------------------------------------------------------------
const CLASSES = [
  ["equity", "Renta variable", "23.600", "56,1 %", "55 %", "+1,1 pp", 1.1],
  ["fixed-income", "Renta fija", "12.400", "29,5 %", "30 %", "−0,5 pp", -0.5],
  ["gold", "Oro", "4.300", "10,2 %", "10 %", "+0,2 pp", 0.2],
  ["crypto", "Cripto", "1.800", "4,3 %", "5 %", "−0,7 pp", -0.7],
];

const allocBar = (weights) => {
  let x = 0;
  const segs = weights
    .map(([cls, w], i) => {
      const r = `<rect class="seg-${cls}" x="${x.toFixed(1)}" y="0" width="${(w * 10).toFixed(1)}" height="12"/>`;
      x += w * 10;
      return i < weights.length - 1
        ? `${r}<rect class="gap" x="${(x - 1.5).toFixed(1)}" y="0" width="3" height="12"/>`
        : r;
    })
    .join("");
  return `<div class="alloc-bar"><svg viewBox="0 0 1000 12" preserveAspectRatio="none" aria-hidden="true">${segs}</svg></div>`;
};

const gauge = (dev, threshold = 2) => {
  const cx = Math.max(4, Math.min(68, 36 + (dev / threshold) * 24));
  return `<svg class="gauge${Math.abs(dev) > threshold ? " is-off" : ""}" viewBox="0 0 72 12" aria-hidden="true"><rect class="track" x="0" y="4" width="72" height="4" rx="2"/><rect class="band" x="12" y="4" width="48" height="4"/><line class="zero" x1="36" y1="1" x2="36" y2="11"/><circle class="dot" cx="${cx.toFixed(1)}" cy="6" r="4"/></svg>`;
};

const cartera = ({ partial = false } = {}) => {
  const weightsBlock = partial
    ? `
    <div class="alloc">
      <div class="alloc-row"><span class="label">Objetivo</span>${allocBar([
        ["equity", 55],
        ["fixed-income", 30],
        ["gold", 10],
        ["crypto", 5],
      ])}</div>
    </div>
    <div class="pending">${icon("clock")}<div class="pending-body"><p class="pending-text">Faltan 4 precios a 18/09/2026 para calcular los pesos actuales.</p><a class="btn quiet" href="#">Registrar valoraciones${icon("arrow")}</a></div></div>
    <ul class="classes">
      ${CLASSES.map(
        ([cls, name, , , target]) =>
          `<li><div class="class-row"><span class="name"><span class="swatch is-${cls}"></span>${name}</span><span class="target-only muted">objetivo ${target}</span></div></li>`,
      ).join("")}
    </ul>`
    : `
    <div class="alloc">
      <div class="alloc-row"><span class="label">Actual</span>${allocBar([
        ["equity", 56.1],
        ["fixed-income", 29.5],
        ["gold", 10.2],
        ["crypto", 4.2],
      ])}</div>
      <div class="alloc-row"><span class="label">Objetivo</span>${allocBar([
        ["equity", 55],
        ["fixed-income", 30],
        ["gold", 10],
        ["crypto", 5],
      ])}</div>
    </div>
    <ul class="classes only-narrow">
      ${CLASSES.map(
        ([cls, name, , w, target, dev]) => `<li><div class="class-row">
          <span class="name"><span class="swatch is-${cls}"></span>${name}</span><span class="weight num">${w}</span>
          <span class="target">objetivo ${target}</span><span class="dev num">${dev}</span>
        </div></li>`,
      ).join("")}
      <li><div class="class-row is-total"><span class="name">Total de la cartera</span>${amt("42.100")}</div></li>
    </ul>
    <table class="table only-wide">
      <thead><tr><th scope="col">Tipo de activo</th><th scope="col" class="num">Valor</th><th scope="col" class="num">Peso</th><th scope="col" class="num">Objetivo</th><th scope="col" class="num">Desviación</th></tr></thead>
      <tbody>
        ${CLASSES.map(
          ([cls, name, v, w, target, dev, d]) =>
            `<tr><td><span class="class-name"><span class="swatch is-${cls}"></span>${name}</span></td><td class="num">${amt(v)}</td><td class="num strong">${w}</td><td class="num muted">${target}</td><td class="num"><span class="dev-cell">${gauge(d)}<span>${dev}</span></span></td></tr>`,
        ).join("")}
      </tbody>
      <tfoot><tr><td>Total de la cartera</td><td class="num">${amt("42.100")}</td><td class="num">100 %</td><td class="num muted">100 %</td><td></td></tr></tfoot>
    </table>`;

  const contribRow = (name, cls, after, v) => `
<li><div class="row">
  <span class="main"><span class="title truncate">${name}</span><span class="sub">${cls}${after ? ` · peso tras aportar ${after}` : ""}</span></span>
  <span class="figs"><span class="fig">${amt(v)}</span></span>
</div></li>`;

  const contribution = partial
    ? `<div class="pending">${icon("clock")}<div class="pending-body"><p class="pending-text">El reparto se calcula con los pesos actuales: aparecerá en cuanto estén los 4 precios que faltan.</p></div></div>`
    : `
    <dl class="kpis">
      <div class="kpi"><dt>Este mes</dt><dd>${amt("600")}</dd></div>
      <div class="kpi"><dt>Al cubo · 10 %</dt><dd>${amt("60")}</dd></div>
      <div class="kpi"><dt>A la cartera</dt><dd>${amt("540")}</dd></div>
    </dl>
    <h3 class="block-title">Reparto en la cartera</h3>
    <ul class="rows">
      ${contribRow("Global Bond Index Fund", "Renta fija", "24,8 %", "190")}
      ${contribRow("World Index Fund", "Renta variable", "45,1 %", "170")}
      ${contribRow("Bitcoin ETP", "Cripto", "4,6 %", "120")}
      ${contribRow("Physical Gold ETC", "Oro", "10,2 %", "60")}
    </ul>
    <p class="card-note">Small Cap Index Fund y Money Market Fund: nada este mes.</p>`;

  const costRow = (name, ter, fees, annual) => `
<li><div class="row">
  <span class="main"><span class="title truncate">${name}</span><span class="sub">TER ${ter} · comisiones ${amt(fees)}</span></span>
  <span class="figs"><span class="fig">${amt(annual)}</span></span>
</div></li>`;

  const COSTS = [
    ["World Index Fund", "0,12 %", "0,00", "22,70", "Renta variable"],
    ["Small Cap Index Fund", "0,32 %", "0,00", "15,40", "Renta variable"],
    ["Global Bond Index Fund", "0,10 %", "0,00", "9,60", "Renta fija"],
    ["Money Market Fund", "0,08 %", "0,00", "2,30", "Renta fija"],
    ["Physical Gold ETC", "0,12 %", "4,00", "5,20", "Oro"],
    ["Bitcoin ETP", "0,21 %", "4,00", "3,80", "Cripto"],
  ];

  const body = `
${pageHead(
  "Cartera",
  "",
  `<button class="asof" type="button" aria-label="Fecha de consulta: hoy, 18/09/2026">${icon("calendar")}<span class="today">Hoy,</span><span class="num">18/09/2026</span></button>`,
)}
<div class="grid">
  <section class="card span-7" aria-labelledby="h-w">
    <div class="card-head"><h2 id="h-w">Pesos frente al objetivo</h2><span class="aside">umbral ±2 pp</span></div>
    ${weightsBlock}
    ${disclosure("Ver activo por activo")}
    ${disclosure("Simular un traspaso entre fondos")}
  </section>

  <section class="card span-5" aria-labelledby="h-c">
    <div class="card-head"><h2 id="h-c">Aportación de septiembre</h2><span class="tag is-accent">Propuesta</span></div>
    ${contribution}
    <p class="note-line">${icon("info", "icon-sm")}<span>Es una propuesta: las órdenes las das tú en tu banco, y después las registras aquí.</span></p>
  </section>

  <section class="card span-12" aria-labelledby="h-k">
    <div class="card-head"><h2 id="h-k">Costes</h2><span class="aside">coste anual estimado</span></div>
    <div class="costs">
      <div class="costs-main">
        <ul class="rows only-narrow">
          ${COSTS.map((c) => costRow(...c)).join("")}
          <li><div class="row is-total"><span class="main"><span class="title">Total de la cartera</span><span class="sub">TER medio 0,14 %</span></span><span class="figs"><span class="fig">${amt("59,00")}</span></span></div></li>
        </ul>
        <table class="table only-wide">
          <thead><tr><th scope="col">Activo</th><th scope="col">Tipo de activo</th><th scope="col" class="num">Comisiones pagadas</th><th scope="col" class="num">TER</th><th scope="col" class="num">Coste anual</th></tr></thead>
          <tbody>${COSTS.map(([n, ter, f, a, cls]) => `<tr><td>${n}</td><td class="muted">${cls}</td><td class="num">${amt(f)}</td><td class="num">${ter}</td><td class="num">${amt(a)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td>Total de la cartera</td><td></td><td class="num">${amt("8,00")}</td><td class="num">0,14 % <span class="cell-sub">medio</span></td><td class="num">${amt("59,00")}</td></tr></tfoot>
        </table>
      </div>
      <div class="costs-side">
        <h3 class="block-title">Comisiones sueltas</h3>
        <ul class="rows">
          <li><div class="row"><span class="main"><span class="title">Custodia</span><span class="sub">ETC y ETP · anual</span></span><span class="figs"><span class="fig">${amt("12,00")}</span></span></div></li>
        </ul>
        <p class="card-note">Van aparte: no forman parte del coste de adquisición de ningún activo.</p>
      </div>
    </div>
  </section>
</div>`;
  return page({ title: "Cartera", current: "cartera", body });
};

// ---- Component sheet ----------------------------------------------------------
const componentes = () => {
  const body = `
${pageHead("Componentes", "Hoja de referencia del sistema · privacidad activada")}
<div class="grid">
  <section class="card span-6"><div class="card-head"><h2>Botones</h2></div>
    <div class="btn-row">
      <button class="btn primary" type="button">${icon("plus")}Registrar</button>
      <button class="btn" type="button">Exportar</button>
      <button class="btn quiet" type="button">Ver todos</button>
    </div>
    <div class="btn-row spaced">
      <button class="btn danger" type="button">Anular movimiento</button>
      <button class="btn danger solid" type="button">Sí, anularlo</button>
      <button class="btn" type="button" disabled>Guardar</button>
    </div>
    <h3 class="block-title">Etiquetas de estado</h3>
    <div class="btn-row">
      <span class="tag">${icon("half")}parcial</span>
      <span class="tag">${icon("reversed")}anulado</span>
      <span class="tag">corrige a otro</span>
      <span class="tag is-accent">Propuesta</span>
      <span class="tag is-caution">${icon("caution")}fuera de umbral</span>
      <span class="tag is-danger">${icon("danger")}inválido</span>
      <span class="tag is-done">${icon("check")}hecho</span>
    </div>
    <h3 class="block-title">Máscara y figuras</h3>
    <p>Aporte al cubo ${amt("2.400")} de un tope de ${amt("6.000")} · 40 % usado · <span class="nodata">sin dato</span> · <span class="num pos">+12,4 %</span> · <span class="num neg">−8,1 %</span></p>
  </section>

  <section class="card span-6"><div class="card-head"><h2>Avisos</h2><span class="aside">un solo componente</span></div>
    <ul class="notices">
      ${notice("danger", "2 movimientos inválidos en el fichero: se puede consultar, no registrar.", "Ver la verificación")}
      ${notice("caution", "Renta fija está 2,4 puntos por debajo de su objetivo (umbral: 2 puntos).", "Ver cartera")}
      ${notice("info", "Una orden de compra de Small Cap Index Fund lleva 6 días sin ejecutarse.", "Ver la orden")}
    </ul>
  </section>

  <section class="card span-6"><div class="card-head"><h2>No se puede calcular todavía</h2></div>
    <div class="pending">${icon("clock")}<div class="pending-body"><p class="pending-text">Faltan 4 precios a 18/09/2026 para calcular los pesos actuales.</p><a class="btn quiet" href="#">Registrar valoraciones${icon("arrow")}</a></div></div>
    <h3 class="block-title">Estado vacío</h3>
    <div class="empty">
      <span class="glyph">${icon("flask")}</span>
      <p class="what">Todavía no hay ninguna tesis</p>
      <p class="why">El cubo empieza cuando abres la primera: qué compras, por qué, y cuándo sabrás que te equivocaste.</p>
      <a class="btn primary" href="#">${icon("plus")}Abrir una tesis</a>
    </div>
  </section>

  <section class="card span-6"><div class="card-head"><h2>Formulario</h2></div>
    <div class="form-demo">
      <div class="field"><label for="f-acc">Cuenta</label><div class="control is-select"><select class="input" id="f-acc"><option>Fondos indexados · MyInvestor</option></select>${icon("chevdown", "icon-sm chev")}</div></div>
      <div class="field"><label for="f-amt">Importe</label><div class="control has-suffix"><input class="input" id="f-amt" inputmode="decimal" value="600.00" aria-invalid="true" aria-describedby="f-amt-e"><span class="suffix">€</span></div>
        <p class="field-error" id="f-amt-e">${icon("danger")}Usa la coma para los decimales: 600,00</p></div>
      <div class="field"><label for="f-q">Participaciones</label><div class="control"><input class="input num" id="f-q" inputmode="decimal" value="8,4521"></div><p class="hint">Las que dice el extracto, con todos sus decimales.</p></div>
    </div>
    ${disclosure("Más datos: referencia, notas, orden, tesis")}
  </section>

  <section class="card span-6"><div class="card-head"><h2>Controles</h2></div>
    <div class="btn-row">
      <div class="segmented" role="group" aria-label="Rango"><button type="button" aria-pressed="false" disabled><span>1M</span></button><button type="button" aria-pressed="true"><span>1A</span></button><button type="button" aria-pressed="false"><span>5A</span></button><button type="button" aria-pressed="false"><span>Todo</span></button></div>
      <button class="asof" type="button">${icon("calendar")}<span class="today">Hoy</span><span class="num">18/09/2026</span></button>
    </div>
    <div class="btn-row spaced">
      <button class="privacy" type="button" aria-pressed="true"><span class="pill">${icon("eyeoff", "icon-sm")}<span>Importes ocultos</span></span></button>
      <button class="privacy" type="button" aria-pressed="false"><span class="pill">${icon("eye", "icon-sm")}<span>Importes visibles</span></span></button>
    </div>
    <ul class="rows spaced">
      <li><a class="row has-lead is-reversed" href="#"><span class="lead">${icon("buy")}</span><span class="main"><span class="title truncate">Money Market Fund</span><span class="sub truncate">Compra · Fondos indexados · <span class="tag">${icon("reversed")}anulado</span></span></span><span class="figs"><span class="fig">${amt("3.100,00")}</span><span class="fig-sub num">03/09/2026</span></span></a></li>
    </ul>
  </section>

  <section class="card span-6" aria-busy="true"><div class="card-head"><h2>Cargando</h2></div>
    <div class="skel-lines"><span class="skel is-figure"></span><span class="skel w-90"></span><span class="skel w-70"></span><span class="skel w-90"></span><span class="skel w-50"></span></div>
  </section>
</div>`;
  return page({ title: "Componentes", current: "", body });
};

// ---- Write ---------------------------------------------------------------------
PRIVACY = true;
writeFileSync(`${DIR}resumen.html`, resumen());
writeFileSync(`${DIR}resumen-vacio.html`, resumenVacio());
writeFileSync(`${DIR}cartera.html`, cartera());
writeFileSync(`${DIR}cartera-parcial.html`, cartera({ partial: true }));
writeFileSync(`${DIR}componentes.html`, componentes());
PRIVACY = false;
writeFileSync(`${DIR}resumen-visible.html`, resumen());
writeFileSync(`${DIR}cartera-visible.html`, cartera());
console.log("built");
