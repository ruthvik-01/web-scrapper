const paths = {
  building: '<path d="M4 21V5l8-3v19M12 8h8v13M2 21h20M7 7h2M7 11h2M7 15h2M16 12h1M16 16h1"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  folder: '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  flag: '<path d="M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 17l10 5 10-5"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  "arrow-right": '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  "chevron-right": '<path d="m9 5 7 7-7 7"/>',
  "chevron-left": '<path d="m15 5-7 7 7 7"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  external: '<path d="M14 3h7v7m0-7-11 11M10 3H4v17h17v-6"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.folder}</svg>`;
document.querySelectorAll("[data-icon]").forEach(node => { node.innerHTML = icon(node.dataset.icon); });
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const number = value => Number(value || 0).toLocaleString("en-GB");
const day = value => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : "Not run yet";
const shortDay = value => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : "—";
const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
const tone = company => parseInt(company.id.slice(0, 2), 16) % 6;
const avatar = company => `<span class="avatar tone-${tone(company)}">${esc(initials(company.name))}</span>`;
const labels = { ready: "Ready", completed: "Collected", running: "Running", queued: "Queued", empty: "No jobs", "no-jobs": "No jobs", "needs-review": "Review", failed: "Failed", cancelled: "Skipped", stopped: "Stopped", stopping: "Stopping", interrupted: "Interrupted" };
const terminalLabels = { DISCOVERY: "Discovering job listings", "PAGE FETCH": "Fetching job pages", "JOB EXTRACTION": "Extracting job data", "JOB NORMALIZATION": "Normalising job data", "RESULT STORAGE": "Storing results", COMPLETED: "Finished", FAILED: "Failed" };
const statusTag = status => `<span class="status ${esc(status)}">${esc(labels[status] || status)}</span>`;
const stageLabel = stage => terminalLabels[stage] || stage || "Working";
const duration = ms => {
  const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};
/** Elapsed time keeps ticking in the UI even between structured updates. */
const elapsedOf = item => item?.metrics?.startedAt && ["running", "queued"].includes(item.status)
  ? duration(Date.now() - Date.parse(item.metrics.startedAt))
  : duration(item?.metrics?.elapsedMs);
const metricLine = metrics => !metrics ? "" :
  `${esc(stageLabel(metrics.stage))}${metrics.ats ? ` · ${esc(metrics.ats)}` : ""} · ${number(metrics.pagesProcessed)} pages visited · jobs ${number(metrics.jobsFound)} · ${elapsedOf({ metrics, status: "running" })}`;
const engineLabel = company => ({ auto: "Auto detect", api: "API", static: "Static HTML", dom: "DOM / browser" })[company.mode || "auto"];
const downloadUrl = (id, kind) => `/api/companies/${id}/download?kind=${kind}`;
const state = {
  data: null, selected: new Set(), view: "companies", filter: "all", query: "", page: 0, size: 8,
  online: false, pending: false, revision: -1, detail: null, detailTab: "jobs",
  detailRows: null, jobOffset: 0, jobQuery: "", onlyNotes: false, expanded: null,
  source: "all", importPreview: null, importBusy: false, importMapping: null, importSample: null, importSequence: 0,
  exportQuery: "", exportSort: "newest", deliveries: [], terminal: null,
};
let toastTimer, searchTimer;
function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 6500);
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.method ? { "Content-Type": "application/json", "X-Workspace-Token": state.data?.token || "" } : {}), ...options.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}
async function refresh(force = false) {
  try {
    const data = await api("/api/dashboard");
    const wasOnline = state.online;
    state.online = true;
    $("#connection-error").hidden = true;
    $("#health-dot").className = "health-dot online";
    $("#health-label").textContent = "Local server connected";
    if (force || !wasOnline || data.revision !== state.revision || data.token !== state.data?.token || !state.data) {
      state.data = data; state.revision = data.revision;
      for (const id of state.selected) if (!data.companies.some(company => company.id === id)) state.selected.delete(id);
      render();
    }
  } catch (error) {
    state.online = false;
    $("#connection-error").hidden = false;
    $("#health-dot").className = "health-dot offline";
    $("#health-label").textContent = "Local server offline";
    $("#run-selected").disabled = true;
    if (!state.data) $("#company-rows").innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Couldn’t load the workspace</h3><p>${esc(error.message)} Start the local server and refresh.</p></div></td></tr>`;
  }
}
function render() {
  const data = state.data;
  if (!data) return;
  $("#stat-companies").textContent = number(data.stats.companies);
  $("#stat-completed").textContent = number(data.stats.completed);
  $("#stat-rows").textContent = number(data.stats.rows);
  $("#stat-notes").textContent = number(data.stats.notes);
  $("#stat-ready").textContent = `${number(data.stats.ready)} ready for a first run`;
  $("#stat-outcomes").textContent = `${number(data.stats.failed || 0)} failed · ${number(data.stats.empty || 0)} no jobs · excluded from exports`;
  $("#nav-count").textContent = data.stats.companies;
  const deletable = (data.sources || []).filter(source => source.id !== "default").length;
  $("#source-filter").innerHTML = `<option value="all">All sources</option>${(data.sources || []).map(source => `<option value="${esc(source.id)}">${esc(source.name)} · ${source.inputRows} rows</option>`).join("")}`;
  $("#source-filter").value = state.source;
  if (!$("#source-filter").value) { state.source = "all"; $("#source-filter").value = "all"; }
  // Deleting a source is only meaningful for uploaded (non-default) sources.
  $("#source-delete").hidden = state.source === "all" || state.source === "default";
  $("#source-delete").disabled = !deletable;
  $("#directory-count").textContent = data.companies.length;
  $("#today").textContent = day(data.window.to);
  $("#date-window").textContent = `${shortDay(data.window.from)} – ${day(data.window.to)}`;
  $("#run-indicator").className = data.activeRun ? "attention-dot" : "";
  renderCompanies(); renderBatch(); renderRuns(); renderExports(); renderLive();
  if (state.terminal && $("#terminal-dialog").open) renderTerminal();
}
/** The run item (and its run) that owns a company's live terminal. */
function runItemFor(companyId) {
  const active = state.data?.activeRun;
  const activeItem = active?.items.find(item => item.companyId === companyId);
  if (activeItem) return activeItem;
  for (const run of state.data?.runs || []) {
    const item = run.items.find(candidate => candidate.companyId === companyId);
    if (item && item.logs?.length) return item;
  }
  return active?.items.find(item => item.companyId === companyId) || null;
}
const queuedTerminal = item => Boolean(item && ["failed", "completed", "empty", "needs-review", "interrupted"].includes(item.status) && item.logs?.length);
function terminalMarkup(item, company) {
  const metrics = item.metrics;
  const warned = item.status === "failed";
  return `<div class="terminal-title">${avatar(company)}<div><h2>${esc(item.name)}</h2><p>${esc(new URL(company?.careersUrl || "https://localhost").hostname)} · ${esc(item.status === "running" ? "live run" : labels[item.status] || item.status)}</p></div>${statusTag(item.status)}</div>
    <div class="terminal-grid">
      <div class="terminal-cell"><small>STAGE</small><strong>${esc(stageLabel(metrics?.stage))}</strong></div>
      <div class="terminal-cell"><small>CAREER PLATFORM</small><strong>${esc(metrics?.ats || "Generic / custom")}</strong></div>
      <div class="terminal-cell"><small>PAGES VISITED</small><strong>${number(metrics?.pagesProcessed)}</strong></div>
      <div class="terminal-cell"><small>JOBS FOUND</small><strong>${number(metrics?.jobsFound)}</strong></div>
      <div class="terminal-cell"><small>JOBS SKIPPED</small><strong>${number(metrics?.jobsSkipped)}</strong></div>
      <div class="terminal-cell"><small>ELAPSED</small><strong>${esc(elapsedOf(item))}</strong></div>
    </div>
    <div class="terminal-now ${warned ? "failed" : ""}">
      <span class="terminal-dot" aria-hidden="true"></span>
      <div><small>${warned ? "STOPPED" : "CURRENT OPERATION"}</small><strong>${esc(item.error || metrics?.operation || "Working…")}</strong>
      ${metrics?.currentUrl ? `<span class="terminal-url">${esc(metrics.currentUrl)}</span>` : ""}</div>
    </div>`;
}
/** Isolated per-company terminal: this company's logs and state only. */
function renderTerminal() {
  if (!state.terminal) return;
  const item = runItemFor(state.terminal.companyId);
  const company = state.data?.companies.find(entry => entry.id === state.terminal.companyId);
  const log = $("#terminal-log");
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const source = item || state.terminal.snapshot;
  if (!source) { $("#terminal-log").innerHTML = '<div class="terminal-line muted">Waiting for this company to start…</div>'; return; }
  $("#terminal-identity").innerHTML = terminalMarkup(source, company);
  const lines = source.logs || [];
  $("#terminal-log").innerHTML = lines.length
    ? lines.map(line => {
      const message = esc(line.message);
      const highlighted = /Processing job|Evaluating job|Processing job pages|Still working|FAILED|Discovered|Found \d+ candidate|Detected /i.test(line.message);
      return `<div class="terminal-line${highlighted ? " emphasis" : ""}"><span class="terminal-time">${esc(line.time.slice(11, 19))}</span><span class="terminal-text">${message}</span></div>`;
    }).join("")
    : '<div class="terminal-line muted">No log lines yet — this company is queued.</div>';
  const next = $("#terminal-log");
  if (nearBottom) next.scrollTop = next.scrollHeight;
  $("#terminal-view").disabled = !company?.hasOutput;
}
async function openTerminal(companyId) {
  const item = runItemFor(companyId);
  state.terminal = { companyId, snapshot: item ? null : null };
  const run = (state.data?.runs || []).find(candidate => candidate.items.some(entry => entry.companyId === companyId));
  if (!item?.logs?.length && run) {
    try {
      state.terminal.snapshot = await api(`/api/runs/${run.id}/items/${companyId}/logs`);
    } catch { state.terminal.snapshot = null; }
  }
  if (!$("#terminal-dialog").open) $("#terminal-dialog").showModal();
  renderTerminal();
}
function filteredCompanies() {
  const source = state.data?.sources?.find(source => source.id === state.source);
  return (state.data?.companies || []).filter(company =>
    (state.filter === "all" || company.status === state.filter) &&
    (!source || source.companyIds.includes(company.id)) &&
    (!state.query || `${company.name} ${company.aliases.join(" ")} ${company.careersUrl}`.toLowerCase().includes(state.query)),
  );
}
function renderCompanies() {
  const rows = filteredCompanies();
  const maxPage = Math.max(0, Math.ceil(rows.length / state.size) - 1);
  state.page = Math.min(state.page, maxPage);
  const slice = rows.slice(state.page * state.size, (state.page + 1) * state.size);
  const focusId = document.activeElement?.dataset.select;
  $("#company-rows").innerHTML = slice.length ? slice.map(company => {
    const selected = state.selected.has(company.id);
    const host = new URL(company.careersUrl).hostname.replace(/^www\./, "");
    const disabled = Boolean(state.data?.activeRun) || (!selected && state.selected.size >= 5);
    const item = runItemFor(company.id);
    const running = company.status === "running";
    const live = item && ["running", "queued"].includes(item.status) ? metricLine(item.metrics) : "";
    const fallbacks = Number(company.summary?.postingDateFallbacks || 0);
    const note = !running && fallbacks ? `<span class="company-note" title="UI note — never exported to the CSV">Note: no posted date or deadline was published for ${number(fallbacks)} ${fallbacks === 1 ? "job" : "jobs"}; source dates only are exported.</span>` : "";
    const name = `<span class="company-name" title="${esc(company.name)}">${esc(company.name)}</span>`;
    return `<tr class="${selected ? "selected" : ""} ${running ? "is-running" : ""}">
      <td class="check-cell"><input type="checkbox" data-select="${company.id}" aria-label="Select ${esc(company.name)}" ${selected ? "checked" : ""} ${disabled ? "disabled" : ""}></td>
      <td><div class="company-cell">${avatar(company)}<div class="company-identity">${running ? `<button class="company-name-link" data-terminal="${company.id}" title="Open the live terminal for ${esc(company.name)}">${name}</button>` : name}<span class="company-meta" title="${esc(company.aliases.join(", "))}"><a class="company-site-link" href="${esc(company.careersUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(company.name)} website">${esc(host)}</a>${company.aliases.length ? ` · ${company.aliases.length + 1} names` : ""}</span>${note}${live ? `<span class="company-live">${live}</span>` : ""}</div></div></td>
      <td>${statusTag(company.status)}</td><td class="number-cell">${company.hasOutput ? number(company.summary?.locationRows) : "—"}</td>
      <td class="method-cell">${item?.metrics?.ats ? `<span class="ats-badge" title="Detected career platform">${esc(item.metrics.ats)}</span>` : ""}<button class="method-button" data-settings="${company.id}" title="Configure extraction mode">${esc(engineLabel(company))}</button></td>
      <td>${running || (queuedTerminal(item) && !company.hasOutput) ? `<button class="row-action live" data-terminal="${company.id}" aria-label="Open the live terminal for ${esc(company.name)}" title="Live terminal">${icon("activity")}</button>` : `<button class="row-action" data-open="${company.id}" aria-label="Open ${esc(company.name)}" title="Company details">${icon("chevron-right")}</button>`}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="6"><div class="empty-state">${icon("search")}<h3>${state.data.companies.length ? "No matching companies" : "Start with a company spreadsheet"}</h3><p>${state.data.companies.length ? "Try a different company name or change the status filter." : "Use Upload data to import an Excel or CSV file, then map its website/careers URL column."}</p></div></td></tr>`;
  if (focusId) $(`[data-select="${focusId}"]`)?.focus({ preventScroll: true });
  $("#page-summary").textContent = rows.length ? `Showing ${state.page * state.size + 1}–${Math.min((state.page + 1) * state.size, rows.length)} of ${rows.length} companies` : "0 companies";
  $("#page-number").textContent = `${state.page + 1} / ${maxPage + 1}`;
  $("#page-prev").disabled = state.page === 0;
  $("#page-next").disabled = state.page === maxPage;
}
function select(id) {
  if (state.data?.activeRun) return toast("A batch is already running.", true);
  const company = state.data.companies.find(company => company.id === id);
  if (!company) return;
  if (state.selected.has(id)) state.selected.delete(id);
  else {
    if (state.selected.size >= 5) return toast("Five companies is a full batch. Remove one before adding another.", true);
    state.selected.add(id);
  }
  renderCompanies(); renderBatch();
}
function renderBatch() {
  const selected = [...state.selected].map(id => state.data.companies.find(company => company.id === id)).filter(Boolean);
  $("#selection-count").textContent = `${selected.length}/5`;
  $("#selected-companies").innerHTML = Array.from({ length: 5 }, (_, index) => {
    const company = selected[index];
    return company
      ? `<div class="selection-slot filled"><span class="slot-number">0${index + 1}</span><div class="slot-info"><strong title="${esc(company.name)}">${esc(company.name)}</strong><small>${company.hasOutput ? "Existing export · new run" : "Ready to collect"}</small></div><button class="row-action" data-remove="${company.id}" aria-label="Remove ${esc(company.name)}">${icon("x")}</button></div>`
      : `<div class="selection-slot"><span class="slot-number">0${index + 1}</span><span class="slot-empty">Choose a company</span></div>`;
  }).join("");
  $("#run-selected").disabled = !selected.length || Boolean(state.data?.activeRun) || state.pending || !state.online;
  $("#clear-selection").disabled = !selected.length || Boolean(state.data?.activeRun);
  $("#quick-select").disabled = Boolean(state.data?.activeRun);
}
function setView(view) {
  state.view = view;
  const content = {
    companies: ["Companies", "Select companies to collect jobs from public careers pages."],
    runs: ["Run history", "Review each batch, its results, and any extraction issues."],
    exports: ["Exports", "Download current results and earlier dated deliveries."],
  };
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll("section.view").forEach(section => { section.hidden = section.id !== `${view}-view`; });
  $("#page-title").textContent = content[view][0];
  $("#page-subtitle").textContent = content[view][1];
  $("#breadcrumb-view").textContent = view === "runs" ? "RUN HISTORY" : view.toUpperCase();
  if (view === "exports") void loadDeliveries();
}
async function loadDeliveries() {
  try {
    state.deliveries = (await api("/api/deliveries")).deliveries;
    renderExports();
  } catch (error) { toast(`Could not load previous deliveries: ${error.message}`, true); }
}
function confirmAction({ title, description, names = [], label }) {
  return new Promise(resolveConfirm => {
    const dialog = $("#confirm-dialog");
    $("#confirm-title").textContent = title;
    $("#confirm-description").textContent = description;
    $("#confirm-action").textContent = label;
    $("#confirm-companies").className = names.length ? "confirm-companies" : "";
    $("#confirm-companies").innerHTML = names.map(name => `<div class="confirm-company">${icon("check")}${esc(name)}</div>`).join("");
    dialog.returnValue = "";
    dialog.addEventListener("close", () => resolveConfirm(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
  });
}
async function startBatch() {
  const chosen = [...state.selected].map(id => state.data.companies.find(company => company.id === id));
  if (!chosen.length || state.pending || state.data.activeRun) return;
  const yes = await confirmAction({
    title: `Run ${chosen.length} ${chosen.length === 1 ? "company" : "companies"}?`,
    description: "This will request public careers pages one company at a time. New runs get their own folders; existing exports stay intact.",
    names: chosen.map(company => company.name), label: "Start scraping",
  });
  if (!yes) return;
  state.pending = true; renderBatch();
  try {
    await api("/api/runs", { method: "POST", body: JSON.stringify({ companyIds: chosen.map(company => company.id) }) });
    state.selected.clear();
    toast("Batch started. You can follow the live progress below.");
    await refresh(true);
    $("#live-run").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) { toast(error.message, true); }
  finally { state.pending = false; renderBatch(); }
}
function runMarkup(run, compact = false) {
  const done = run.items.filter(item => !["queued", "running"].includes(item.status)).length;
  const current = run.items.find(item => item.status === "running");
  const fraction = current?.total ? current.progress / current.total : 0;
  const progress = Math.round(((done + fraction) / run.items.length) * 100);
  return `<div class="live-heading"><div><h2>${run.status === "stopping" ? "Finishing the active companies…" : current ? `Collecting ${esc(current.name)}` : labels[run.status] || "Batch progress"}</h2><p>${done} of ${run.items.length} companies finished${current?.metrics ? ` · ${esc(stageLabel(current.metrics.stage))}` : current?.total ? ` · ${current.progress}/${current.total} job pages` : " · Reading public careers sources"}</p></div>${!compact && state.data.activeRun ? `<button id="stop-queue" class="secondary-button" ${run.status === "stopping" ? "disabled" : ""}>Stop queue</button>` : statusTag(run.status)}</div>
    <div class="live-items">${run.items.map(item => `<div class="live-item ${item.status}">${statusTag(item.status)}<div class="live-item-body"><strong>${esc(item.name)}</strong>${item.status === "running" && item.metrics ? `<span class="live-item-metrics">${metricLine(item.metrics)}</span><span class="live-item-op">${esc(item.metrics.operation)}</span>` : item.error ? `<span class="live-item-error">${esc(item.error)}</span>` : ""}</div><button class="row-action live" data-terminal="${item.companyId}" aria-label="Open the live terminal for ${esc(item.name)}" title="Live terminal">${icon("activity")}</button></div>`).join("")}</div>
    <progress class="live-progress" max="100" value="${progress}" aria-label="Batch progress"></progress>
    ${run.logs.length ? `<div class="run-log" tabindex="0" aria-label="Batch log"><div class="run-log-note">Mixed batch log — open a company terminal for its own isolated stream.</div>${run.logs.slice(-25).map(line => `<div><span class="log-time">${esc(line.time.slice(11, 19))}</span>${esc(line.message)}</div>`).join("")}</div>` : ""}`;
}
function renderLive() {
  const active = state.data?.activeRun;
  $("#live-run").hidden = !active;
  if (active) {
    const log = $("#live-run .run-log");
    const nearBottom = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    $("#live-run").innerHTML = runMarkup(active);
    const next = $("#live-run .run-log");
    if (next && nearBottom) next.scrollTop = next.scrollHeight;
  }
}
function renderRuns() {
  const runs = state.data?.runs || [];
  $("#run-list").innerHTML = runs.length ? runs.map(run => `<article class="panel history-card"><div class="history-top"><div class="history-title"><span class="avatar tone-0">${icon("layers")}</span><div><strong>Batch of ${run.items.length} ${run.items.length === 1 ? "company" : "companies"}</strong><small>${day(run.createdAt)} · ${new Date(run.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</small></div></div>${statusTag(run.status)}</div><div class="history-companies">${run.items.map(item => `<button class="history-company" data-history-terminal="${item.companyId}" title="Open this company's log"><span class="history-company-name">${esc(item.name)}</span>${statusTag(item.status)}<span>${item.summary ? `${number(item.summary.locationRows)} rows` : item.metrics?.ats ? esc(item.metrics.ats) : ""}</span></button>`).join("")}</div>${run.items.filter(item => item.error).map(item => `<p class="history-error">${esc(item.name)}: ${esc(item.error)}</p>`).join("")}${run.logs.length ? `<details><summary class="text-button history-companies">View batch log</summary><div class="run-log">${run.logs.map(line => `<div><span class="log-time">${esc(line.time.slice(11, 19))}</span>${esc(line.message)}</div>`).join("")}</div></details>` : ""}</article>`).join("")
    : `<div class="panel empty-state">${icon("clock")}<h3>Your first dashboard run starts here</h3><p>Choose companies and start a batch. Existing command-line exports are already available in the Exports section.</p></div>`;
  document.querySelectorAll("[data-history-terminal]").forEach(button => button.onclick = () => openTerminal(button.dataset.historyTerminal));
}
function renderExports() {
  let companies = (state.data?.companies || []).filter(company => company.hasOutput);
  const query = state.exportQuery.trim().toLowerCase();
  if (query) {
    companies = companies.filter(company =>
      `${company.name} ${company.aliases.join(" ")} ${company.careersUrl} ${company.summary?.process || ""}`.toLowerCase().includes(query));
  }
  const deliveries = state.deliveries.filter(delivery => !query || delivery.name.toLowerCase().includes(query));
  const saved = deliveries.map(delivery => ({ date: Date.parse(`${delivery.name.slice(0, 10)}T00:00:00Z`) || 0, key: delivery.name, html: `<article class="panel export-card">
    <div class="export-top"><span class="avatar tone-0">${icon("folder")}</span><span class="status completed">Saved delivery</span></div>
    <h2>${esc(delivery.name)}</h2><p>Previous dated export</p>
    <div class="export-meta"><div><strong>${number(delivery.rows)}</strong><small>CSV ROWS</small></div></div>
    <div class="export-actions"><a class="primary-button" href="/api/deliveries/${encodeURIComponent(delivery.name)}/companies.csv">${icon("download")}CSV</a>${delivery.hasZip ? `<a class="secondary-button" href="/api/deliveries/${encodeURIComponent(delivery.name)}/final.zip">${icon("folder")}Final ZIP</a>` : ""}</div>
  </article>` }));
  const current = companies.map(company => ({ date: Date.parse(company.summary?.scrapedAt || "") || 0, key: company.name, html: `<article class="panel export-card">
    <div class="export-top">${avatar(company)}${statusTag(company.status)}</div>
    <h2>${esc(company.name)}</h2><p>Collected ${day(company.summary.scrapedAt)} · ${esc(company.summary.process || "Auto")}</p>
    <div class="export-meta"><div><strong>${number(company.summary.locationRows)}</strong><small>CSV ROWS</small></div><div><strong>${number(company.summary.jobs)}</strong><small>JOBS</small></div><div><strong>${number(company.summary.reviewNotes)}</strong><small>LOCATION NOTES</small></div></div>
    <div class="export-actions"><a class="primary-button" href="${downloadUrl(company.id, "csv")}">${icon("download")}CSV</a><a class="secondary-button" href="${downloadUrl(company.id, "code")}">${icon("code")}Code ZIP</a></div>
    <button class="export-review" data-open="${company.id}">Preview data & review report →</button>
  </article>` }));
  const exports = [...saved, ...current].sort((a, b) =>
    (state.exportSort === "oldest" ? a.date - b.date : b.date - a.date) || a.key.localeCompare(b.key));
  $("#export-list").innerHTML = exports.length ? exports.map(item => item.html).join("") : `<div class="panel empty-state">${icon("search")}<h3>${query ? "No matching exports" : "No exports yet"}</h3><p>${query ? "Try a different search term." : "Your CSVs, reusable code, and reports will appear here after a run."}</p></div>`;
}
async function openCompany(id, tab = "jobs") {
  state.detail = state.data.companies.find(company => company.id === id);
  state.detailRows = null;
  state.detailTab = tab; state.jobOffset = 0; state.jobQuery = ""; state.onlyNotes = false; state.expanded = null;
  const company = state.detail;
  $("#detail-identity").innerHTML = `<div class="detail-company">${avatar(company)}<div><h2>${esc(company.name)}</h2><p>${esc(new URL(company.careersUrl).hostname)}${company.aliases.length ? ` · Also listed as ${esc(company.aliases.join(", "))}` : ""}</p></div></div>`;
  const summary = company.summary || {};
  $("#detail-metrics").innerHTML = [
    ["CSV rows", summary.locationRows], ["Jobs", summary.jobs],
    ["Date fallbacks", summary.postingDateFallbacks], ["Location notes", summary.reviewNotes],
  ].map(([label, value]) => `<div class="detail-metric"><small>${label}</small><strong>${company.hasOutput ? esc(String(value ?? "—")) : "—"}</strong></div>`).join("");
  $("#detail-download").href = downloadUrl(id, "csv");
  $("#detail-download").hidden = !company.hasOutput;
  document.querySelectorAll("[data-detail-tab]").forEach(button => button.classList.toggle("active", button.dataset.detailTab === tab));
  if (!$("#detail-dialog").open) $("#detail-dialog").showModal();
  if (tab === "settings") renderSettings();
  else if (company.hasOutput) await loadDetails();
  else renderNoOutput();
}
function renderNoOutput() {
  const company = state.detail;
  const running = ["running", "queued"].includes(company.status);
  $("#detail-body").innerHTML = `<div class="empty-state">${icon("folder")}<h3>${running ? "This company is in your current batch" : "Ready for its first collection"}</h3><p>${running ? "The collection is in progress. Close this panel to follow the live run; reopen it when the company finishes." : "The scraper will check the public source, try its job sitemap or browser extraction, and report anything it cannot collect."}</p><div class="dialog-actions"><button class="primary-button" data-add-detail="${company.id}" ${state.data.activeRun ? "disabled" : ""}>${state.selected.has(company.id) ? "Remove from batch" : "Add to batch"}</button></div><a class="external-link" href="${esc(company.careersUrl)}" target="_blank" rel="noopener noreferrer">Open careers page ${icon("external")}</a></div>`;
}
async function loadDetails() {
  const id = state.detail.id;
  $("#detail-body").innerHTML = '<div class="dialog-loading"><span class="spinner"></span>Reading company output…</div>';
  try {
    const query = new URLSearchParams({ offset: String(state.jobOffset), limit: "10", q: state.jobQuery, notes: state.onlyNotes ? "1" : "0" });
    const data = await api(`/api/companies/${id}/results?${query}`);
    if (state.detail?.id !== id) return;
    state.detailRows = data; renderDetailBody();
  } catch (error) {
    $("#detail-body").innerHTML = `<div class="empty-state"><h3>Couldn’t read this output</h3><p>${esc(error.message)}</p></div>`;
  }
}
function renderDetailBody() {
  if (state.detailTab === "settings") return renderSettings();
  if (!state.detail.hasOutput) return renderNoOutput();
  if (!state.detailRows) return;
  if (state.detailTab === "report") return renderReport();
  if (state.detailTab === "code") return renderCode();
  const data = state.detailRows;
  if (!data) return;
  $("#detail-body").innerHTML = `<div class="job-tools"><label class="search-field">${icon("search")}<input id="job-search" type="search" aria-label="Search job results" placeholder="Search job title, ID, or location…" value="${esc(state.jobQuery)}"></label><label class="notes-toggle"><input id="notes-only" type="checkbox" ${state.onlyNotes ? "checked" : ""}>Only rows with notes</label></div>
    <div class="table-scroll"><table class="jobs-table"><thead><tr><th>JOB TITLE / ID</th><th>LOCATION</th><th>POSTED</th><th>WORKTYPE</th><th>REVIEW</th></tr></thead><tbody>
    ${data.rows.length ? data.rows.map((row, index) => `<tr><td><button class="job-title-button" data-job="${index}">${esc(row.title || "Run diagnostic")}</button><span class="job-id">${esc(row.jobId || "No qualifying job")}</span></td><td>${esc(row.location || "—")}</td><td>${esc(row.postedDate || "—")}</td><td>${esc(row.worktype || "—")}</td><td>${row.reason ? `<span class="note-tag">${icon("flag")}Note</span>` : '<span class="company-meta">—</span>'}</td></tr>${state.expanded === index ? expandedJob(row) : ""}`).join("") : '<tr><td colspan="5"><div class="empty-state"><h3>No matching rows</h3><p>Try another search or turn off the notes filter.</p></div></td></tr>'}
    </tbody></table></div><div class="table-footer"><span>${data.total ? `${state.jobOffset + 1}–${Math.min(state.jobOffset + 10, data.total)} of ${data.total} rows` : "0 rows"}</span><div><button class="icon-button small" id="jobs-prev" aria-label="Previous job page" ${state.jobOffset === 0 ? "disabled" : ""}>${icon("chevron-left")}</button><button class="icon-button small" id="jobs-next" aria-label="Next job page" ${state.jobOffset + 10 >= data.total ? "disabled" : ""}>${icon("chevron-right")}</button></div></div>`;
}
function expandedJob(row) {
  const fields = ["jobId", "company", "salaryRange", "employmentType", "worktype", "postedDate", "jdDeadline", "location", "city", "state", "country", "ats"];
  return `<tr class="job-expanded"><td colspan="5"><div class="job-detail-grid"><div><div class="job-description">${esc(row.description || "No job description was returned.")}</div>${row.jobUrl ? `<a class="external-link" href="${esc(row.jobUrl)}" target="_blank" rel="noopener noreferrer">View source job ${icon("external")}</a>` : ""}</div><dl class="job-fields">${fields.map(field => `<div><dt>${esc(field)}</dt><dd>${esc(row[field] || "Not supplied")}</dd></div>`).join("")}</dl></div>${row.reason ? `<div class="job-reason"><strong>Source / collection note</strong>${esc(row.reason)}</div>` : ""}</td></tr>`;
}
function renderReport() {
  const report = state.detailRows.report;
  const excluded = {};
  for (const item of report.skipped || []) excluded[item.reason] = (excluded[item.reason] || 0) + 1;
  $("#detail-body").innerHTML = `<div class="report-banner"><strong>Collection is not a guarantee of complete source data.</strong><br>Unknown city/state values stay empty. Missing source dates use the run day and are disclosed. Review the notes below before using uncertain details.</div>
    <div class="report-grid">${[["Pages read", report.pagesVisited], ["Exported rows", report.rows], ["Date fallbacks", report.dateFallbacks?.length]].map(([label, count]) => `<div class="report-item"><strong>${number(count)}</strong><span>${label}</span></div>`).join("")}</div>
    <div class="report-section"><h3>Run details</h3><p class="report-note">Method: <strong>${esc(report.process)}</strong> · Window: ${esc(report.window?.from)} – ${esc(report.window?.to)} · Status: ${esc(report.status)}${report.limited ? " · Crawl limit reached" : ""}</p>
    ${report.attempts?.length ? `<h3>Extraction attempts</h3>${report.attempts.map(attempt => `<div class="attempt-row"><strong>${esc(attempt.method)}</strong><span>${esc(attempt.status)}</span><span>${number(attempt.rows)} rows${attempt.reason ? ` · ${esc(attempt.reason)}` : ""}</span></div>`).join("")}` : ""}
    <h3>Excluded records</h3>${Object.keys(excluded).length ? Object.entries(excluded).map(([reason, count]) => `<p class="report-note"><strong>${count}</strong> · ${esc(reason.replaceAll("_", " "))}</p>`).join("") : '<p class="report-note">No filter exclusions were recorded.</p>'}
    <h3>Location notes (${report.dataNotes?.length || 0})</h3>${(report.dataNotes || []).map(note => `<p class="report-note"><code>${esc(note.jobId)}</code>${esc(note.reason)}</p>`).join("") || '<p class="report-note">No location-review notes were recorded.</p>'}
    <h3>Access and extraction issues</h3>${(report.issues || []).map(issue => `<p class="report-note">${esc(issue.message)}<br><a class="external-link" href="${esc(issue.url)}" target="_blank" rel="noopener noreferrer">Source ${icon("external")}</a></p>`).join("") || '<p class="report-note">No access or extraction errors were recorded.</p>'}
    <a class="secondary-button" href="${downloadUrl(state.detail.id, "report")}">${icon("download")}Download full JSON report</a></div>`;
}
function renderCode() {
  const company = state.detail;
  $("#detail-body").innerHTML = `<div class="code-layout"><div class="file-tree">company-folder/
├── jobs.csv
├── export-rows.json
├── scrape-report.json
└── code/
    ├── scrape.ts
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    └── src/</div><div class="code-help"><h3>Take the scraper with you.</h3><p>The code download is a complete TypeScript package for this company. Extract it, open a terminal inside <strong>code</strong>, and run:</p><div class="code-copy">npm ci<br>npm run scrape</div><a class="primary-button" href="${downloadUrl(company.id, "code")}">${icon("code")}Download code ZIP</a><p>Requires Node.js 22+. Static runs need internet access, not a browser installation. Browser-based sources may also require <code>npx playwright install chromium</code>.</p></div></div>
    `;
}

/** Delete an uploaded source after confirmation; the dropdown updates immediately. */
async function deleteSource() {
  const source = state.data?.sources?.find(source => source.id === state.source);
  if (!source || source.id === "default") return;
  const companies = (state.data.companies || []).filter(company => source.companyIds.includes(company.id));
  const yes = await confirmAction({
    title: `Delete the source “${source.name}”?`,
    description: `This removes the uploaded source and its ${companies.length} imported ${companies.length === 1 ? "company" : "companies"} from the directory. Companies shared with other sources, existing exports, and run history are not touched.`,
    names: companies.slice(0, 5).map(company => company.name),
    label: "Delete source",
  });
  if (!yes) return;
  try {
    const result = await api(`/api/sources/${source.id}`, { method: "POST", body: "{}" });
    state.source = "all"; state.page = 0;
    await refresh(true);
    toast(`Deleted source “${result.deleted}” — ${result.removedCompanies} ${result.removedCompanies === 1 ? "company" : "companies"} removed. Showing all sources.`);
  } catch (error) { toast(error.message, true); }
}
function renderSourceDelete() {
  const deletable = (state.data?.sources || []).some(source => source.id !== "default");
  $("#source-delete").hidden = state.source === "all" || state.source === "default";
  $("#source-delete").disabled = !deletable;
}

function renderSettings() {
  const company = state.detail;
  $("#detail-body").innerHTML = `<div class="form-grid">
    <label class="field-label">Extraction mode<select id="site-mode" aria-label="Extraction mode">
      ${[["auto", "Auto — try the available methods"], ["api", "API — supported ATS / JobPosting JSON"], ["static", "Static — HTML and public sitemaps"], ["dom", "DOM — browser-rendered pages"]].map(([value, label]) => `<option value="${value}" ${(company.mode || "auto") === value ? "selected" : ""}>${label}</option>`).join("")}
    </select></label>
    <label class="field-label">Page budget <span>(optional; Auto follows the site's end)</span><input id="site-pages" type="number" min="1" max="10000" value="${company.maxPages ?? ""}" aria-label="Page budget" placeholder="Auto"></label>
    <label class="field-label wide">Public API endpoint <span>(optional)</span><input id="site-api" type="url" placeholder="https://example.com/public-jobs.json" value="${esc(company.apiUrl || "")}" aria-label="Public API endpoint"><small>Public GET JSON only. Do not enter passwords, access tokens, or private API keys.</small></label>
    <label class="field-label wide">Job sitemap URL <span>(optional)</span><input id="site-sitemap" type="url" placeholder="Detected from robots.txt when available" value="${esc(company.sitemapUrl || "")}" aria-label="Job sitemap URL"></label>
    <label class="field-label">DOM render wait (milliseconds)<input id="site-wait" type="number" min="0" max="10000" value="${company.renderWaitMs ?? 1500}" aria-label="DOM render wait"></label>
    <label class="field-label wide">Custom CSS selectors <span>(optional JSON)</span><textarea id="site-selectors" aria-label="Custom CSS selectors" spellcheck="false" placeholder='{"jobLinks": ".job-link", "title": "h1", "description": ".job-description", "location": ".job-location"}'>${esc(Object.keys(company.selectors || {}).length ? JSON.stringify(company.selectors, null, 2) : "")}</textarea><small>Supported keys include jobLinks, jobLinksOnly, next, loadMore, title, description, jobId, jobUrl, postedDate, jdDeadline, company, salaryRange, employmentType, worktype, location, city, state, and country. Use jobLinksOnly to follow only matching vacancy links plus pagination; use repeated location containers for multi-location jobs.</small></label>
    </div><p class="mode-explanation">Auto follows discovered job pages and pagination until the source ends. Set a page budget only when you want an explicit limit. Logins, CAPTCHAs, and access restrictions are reported.</p>
    <div class="settings-footer"><p>These settings apply to this company’s next run.<br>Your existing export files are not changed.</p><button id="save-settings" class="primary-button" ${["running", "queued"].includes(company.status) ? "disabled" : ""}>Save settings</button></div>`;
}
async function saveSettings() {
  const id = state.detail.id;
  try {
    const selectors = $("#site-selectors").value.trim() ? JSON.parse($("#site-selectors").value) : {};
    await api(`/api/companies/${id}/settings`, { method: "POST", body: JSON.stringify({
      mode: $("#site-mode").value, apiUrl: $("#site-api").value.trim(), sitemapUrl: $("#site-sitemap").value.trim(),
      maxPages: $("#site-pages").value, renderWaitMs: Number($("#site-wait").value), selectors,
    }) });
    await refresh(true);
    state.detail = state.data.companies.find(company => company.id === id);
    toast("Extraction settings saved for the next run.");
    renderSettings();
  } catch (error) { toast(error instanceof SyntaxError ? "Custom selectors must be valid JSON." : error.message, true); }
}

function openImport() {
  if (state.importBusy) return;
  state.importMapping = null; state.importSample = null;
  $("#import-error").hidden = true; $("#import-result").hidden = true;
  $("#import-configuration").hidden = true; $("#upload-zone").hidden = false;
  $("#import-progress").textContent = ""; $("#workbook-file").value = "";
  $("#import-commit").textContent = "Add companies"; $("#import-commit").disabled = true;
  $("#import-cancel").textContent = "Cancel";
  $("#import-dialog").showModal();
}
function importBusy(value, message = "") {
  state.importBusy = value;
  $("#import-progress").textContent = message;
  for (const id of ["import-close", "import-cancel", "choose-file", "workbook-file", "import-sheet", "import-header"]) $(`#${id}`).disabled = value;
  $("#import-commit").disabled = value || !state.importMapping || !state.importSample || state.importMapping.urlColumn < 0;
}
async function closeImport() {
  if (state.importBusy) return;
  if (state.importPreview) {
    try { await api(`/api/imports/${state.importPreview.id}/discard`, { method: "POST", body: "{}" }); } catch { /* Server expires abandoned previews too. */ }
  }
  state.importPreview = null; state.importMapping = null; state.importSample = null;
  $("#import-dialog").close();
}
async function uploadFile(file) {
  if (state.importBusy) return;
  $("#import-error").hidden = true;
  if (file.size > 10 * 1024 * 1024) {
    $("#import-error").textContent = "Choose a file no larger than 10 MB."; $("#import-error").hidden = false; return;
  }
  try {
    if (state.importPreview) await api(`/api/imports/${state.importPreview.id}/discard`, { method: "POST", body: "{}" });
    state.importPreview = null; state.importMapping = null;
    importBusy(true, "Reading the workbook safely…");
    const preview = await api("/api/imports/preview", {
      method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Upload-Name": encodeURIComponent(file.name) },
      body: await file.arrayBuffer(),
    });
    state.importPreview = preview;
    $("#import-filename").textContent = preview.name;
    $("#import-sheet").innerHTML = preview.sheets.map(sheet => `<option value="${sheet.index}">${esc(sheet.name)} · ${sheet.rowCount} rows</option>`).join("");
    $("#import-configuration").hidden = false;
    $("#upload-zone").hidden = true;
    importBusy(false);
    await selectImportSheet(preview.sheets.find(sheet => sheet.rowCount > 0 && sheet.mapping.urlColumn >= 0)?.index ??
      preview.sheets.find(sheet => sheet.rowCount > 0)?.index ?? 0);
  } catch (error) {
    $("#import-error").textContent = error.message; $("#import-error").hidden = false;
    importBusy(false);
  }
}
async function selectImportSheet(index) {
  const sheet = state.importPreview.sheets[index];
  state.importMapping = { ...sheet.mapping };
  $("#import-sheet").value = String(index);
  $("#import-header").value = String(state.importMapping.headerRow + 1);
  $("#import-header").max = String(sheet.rowCount);
  await loadImportSample();
}
const columnName = index => {
  let name = "", n = index + 1;
  while (n > 0) { n--; name = String.fromCharCode(65 + n % 26) + name; n = Math.floor(n / 26); }
  return name;
};
async function loadImportSample() {
  const seq = ++state.importSequence;
  const preview = state.importPreview;
  const mapping = state.importMapping;
  if (!preview || !mapping) return;
  importBusy(true, "Preparing the column preview…");
  $("#import-error").hidden = true;
  try {
    const sample = await api(`/api/imports/${preview.id}/sheet`, { method: "POST", body: JSON.stringify({ sheet: mapping.sheet, headerRow: mapping.headerRow }) });
    if (seq !== state.importSequence) return;
    state.importSample = sample;
    const sheet = preview.sheets[mapping.sheet];
    const choices = Array.from({ length: sheet.width }, (_, column) => `<option value="${column}">${columnName(column)} · ${esc(sample.headers[column] || `Column ${columnName(column)}`)}</option>`).join("");
    for (const [id, key, none] of [
      ["map-name", "nameColumn", "Use the website domain"],
      ["map-url", "urlColumn", "Choose the URL column"],
      ["map-website", "websiteColumn", "Not mapped"],
      ["map-api", "apiColumn", "Not mapped"],
      ["map-sitemap", "sitemapColumn", "Not mapped"],
    ]) {
      $(`#${id}`).innerHTML = `<option value="-1">${none}</option>${choices}`;
      $(`#${id}`).value = String(mapping[key] ?? -1);
    }
    $("#import-row-count").textContent = `${Math.max(0, sheet.rowCount - mapping.headerRow - 1)} source rows`;
    renderImportPreview();
  } catch (error) { state.importSample = null; $("#import-error").textContent = error.message; $("#import-error").hidden = false; }
  finally { if (seq === state.importSequence) importBusy(false); }
}
function readMapping() {
  if (!state.importMapping) return;
  for (const [id, key] of [["map-name", "nameColumn"], ["map-url", "urlColumn"], ["map-website", "websiteColumn"], ["map-api", "apiColumn"], ["map-sitemap", "sitemapColumn"]]) {
    state.importMapping[key] = Number($(`#${id}`).value);
  }
  $("#import-commit").disabled = state.importBusy || state.importMapping.urlColumn < 0;
}
function renderImportPreview() {
  const sample = state.importSample, mapping = state.importMapping;
  if (!sample || !mapping) return;
  const width = Math.min(8, state.importPreview.sheets[mapping.sheet].width);
  const urlColumns = [mapping.urlColumn, mapping.websiteColumn, mapping.apiColumn, mapping.sitemapColumn];
  $("#import-preview").innerHTML = `<table class="import-table"><thead><tr><th class="row-index">ROW</th>${Array.from({ length: width }, (_, col) => `<th class="${col === mapping.urlColumn ? "mapped" : ""}">${esc(sample.headers[col] || columnName(col))}</th>`).join("")}</tr></thead><tbody>${sample.sample.map((row, i) => `<tr><td class="row-index">${sample.rowNumbers[i] + 1}</td>${Array.from({ length: width }, (_, col) => {
    const value = urlColumns.includes(col) ? sample.links[`${sample.rowNumbers[i]}:${col}`] || row[col] || "" : row[col] || "";
    return `<td title="${esc(value)}" class="${col === mapping.urlColumn ? "mapped" : ""}">${esc(value)}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table>`;
}
async function commitImport() {
  if (!state.importPreview) { await closeImport(); return; }
  if (state.importBusy) return;
  readMapping();
  importBusy(true, "Adding companies to the directory…");
  try {
    const result = await api(`/api/imports/${state.importPreview.id}/commit`, { method: "POST", body: JSON.stringify({ mapping: state.importMapping }) });
    state.importPreview = null; state.importMapping = null;
    state.source = result.id; state.filter = "all"; state.page = 0; state.query = "";
    $("#company-search").value = "";
    document.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("active", button.dataset.filter === "all"));
    await refresh(true); setView("companies");
    $("#import-configuration").hidden = true;
    $("#import-result").hidden = false;
    $("#import-result").innerHTML = `<div class="import-success"><h3>${result.added} ${result.added === 1 ? "company" : "companies"} added</h3><p>${result.merged} matching rows merged · ${result.rejected} invalid rows skipped · ${result.emptyRows} empty rows ignored.</p><p>Existing exports were preserved. Newly imported companies use Auto extraction until you change their settings.</p></div>${result.rejectedRows.length ? `<div class="import-warnings"><strong>Skipped rows</strong>${result.rejectedRows.map(row => `<div>Row ${row.row}: ${esc(row.reason)}</div>`).join("")}</div>` : ""}`;
    importBusy(false);
    $("#import-commit").disabled = false; $("#import-commit").textContent = "View imported companies";
    $("#import-cancel").textContent = "Close";
    toast(`Import complete: ${result.added} added, ${result.merged} merged.`);
  } catch (error) {
    $("#import-error").textContent = error.message; $("#import-error").hidden = false; importBusy(false);
  }
}

$("#import-dialog").addEventListener("cancel", event => { event.preventDefault(); void closeImport(); });
$("#upload-zone").addEventListener("dragover", event => { event.preventDefault(); $("#upload-zone").classList.add("drag-over"); });
$("#upload-zone").addEventListener("dragleave", () => $("#upload-zone").classList.remove("drag-over"));
$("#upload-zone").addEventListener("drop", event => {
  event.preventDefault(); $("#upload-zone").classList.remove("drag-over");
  if (event.dataTransfer.files[0]) void uploadFile(event.dataTransfer.files[0]);
});

document.addEventListener("click", async event => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.dataset.view) setView(target.dataset.view);
  if (target.dataset.filter) {
    state.filter = target.dataset.filter; state.page = 0;
    document.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("active", button === target));
    renderCompanies();
  }
  if (target.dataset.remove) select(target.dataset.remove);
  if (target.dataset.terminal) await openTerminal(target.dataset.terminal);
  if (target.id === "terminal-close" || target.id === "terminal-back") {
    state.terminal = null;
    if ($("#terminal-dialog").open) $("#terminal-dialog").close();
  }
  if (target.id === "terminal-view") {
    const id = state.terminal?.companyId;
    if (id) { state.terminal = null; if ($("#terminal-dialog").open) $("#terminal-dialog").close(); await openCompany(id); }
  }
  if (target.dataset.open) await openCompany(target.dataset.open);
  if (target.dataset.settings) await openCompany(target.dataset.settings, "settings");
  if (target.dataset.addDetail) { select(target.dataset.addDetail); renderNoOutput(); }
  if (target.id === "source-delete") await deleteSource();
  if (target.dataset.detailTab) {
    state.detailTab = target.dataset.detailTab;
    document.querySelectorAll("[data-detail-tab]").forEach(button => button.classList.toggle("active", button === target));
    if (state.detail.hasOutput && !state.detailRows && state.detailTab !== "settings") await loadDetails();
    else renderDetailBody();
  }
  if (target.dataset.job !== undefined) {
    const index = Number(target.dataset.job); state.expanded = state.expanded === index ? null : index; renderDetailBody();
  }
  if (target.id === "page-prev") { state.page--; renderCompanies(); }
  if (target.id === "page-next") { state.page++; renderCompanies(); }
  if (target.id === "jobs-prev") { state.jobOffset = Math.max(0, state.jobOffset - 10); state.expanded = null; await loadDetails(); }
  if (target.id === "jobs-next") { state.jobOffset += 10; state.expanded = null; await loadDetails(); }
  if (target.id === "clear-selection") { state.selected.clear(); renderCompanies(); renderBatch(); }
  if (target.id === "quick-select") {
    state.selected = new Set(state.data.companies.filter(company => company.status === "ready").slice(0, 5).map(company => company.id));
    renderCompanies(); renderBatch();
    if (!state.selected.size) toast("No ready companies remain. You can select a completed company for a new run.");
  }
  if (target.id === "run-selected") await startBatch();
  if (target.id === "refresh") await refresh(true);
  if (target.id === "upload-open") openImport();
  if (target.id === "choose-file") $("#workbook-file").click();
  if (target.id === "import-close" || target.id === "import-cancel") await closeImport();
  if (target.id === "import-commit") await commitImport();
  if (target.id === "save-settings") await saveSettings();
  if (target.id === "detail-close") $("#detail-dialog").close();
  if (target.id === "stop-queue") {
    try {
      const result = await api("/api/runs/stop", { method: "POST", body: "{}" });
      toast(result.message); await refresh(true);
    } catch (error) { toast(error.message, true); }
  }
});
document.addEventListener("change", async event => {
  if (event.target.dataset.select) select(event.target.dataset.select);
  if (event.target.id === "notes-only") { state.onlyNotes = event.target.checked; state.jobOffset = 0; await loadDetails(); }
  if (event.target.id === "export-sort") { state.exportSort = event.target.value; renderExports(); }
  if (event.target.id === "source-filter") { state.source = event.target.value; state.page = 0; renderCompanies(); renderSourceDelete(); }
  if (event.target.id === "workbook-file" && event.target.files[0]) await uploadFile(event.target.files[0]);
  if (event.target.id === "import-sheet") await selectImportSheet(Number(event.target.value));
  if (event.target.id === "import-header" && state.importMapping) {
    state.importMapping.headerRow = Number(event.target.value) - 1; await loadImportSample();
  }
  if (/^map-/.test(event.target.id)) {
    readMapping(); renderImportPreview();
  }
});
$("#company-search").addEventListener("input", event => {
  state.query = event.target.value.trim().toLowerCase(); state.page = 0; renderCompanies();
});
$("#export-search").addEventListener("input", event => {
  state.exportQuery = event.target.value; renderExports();
});
document.addEventListener("input", event => {
  if (event.target.id === "job-search") {
    state.jobQuery = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      state.jobOffset = 0; await loadDetails();
      const input = $("#job-search");
      if (input) { input.focus(); input.setSelectionRange?.(input.value.length, input.value.length); }
    }, 350);
  }
});
$("#detail-dialog").addEventListener("click", event => {
  if (event.target === $("#detail-dialog")) $("#detail-dialog").close();
});
$("#terminal-dialog").addEventListener("click", event => {
  if (event.target === $("#terminal-dialog")) { state.terminal = null; $("#terminal-dialog").close(); }
});
$("#terminal-dialog").addEventListener("close", () => { state.terminal = null; });
await refresh(true);
await loadDeliveries();
if (!state.data?.companies.length && state.deliveries.length) setView("exports");
setInterval(() => { if (!document.hidden) void refresh(); }, 1500);
