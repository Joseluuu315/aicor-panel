import { useState, useRef, useCallback, useEffect } from "react";

// ─── Config ────────────────────────────────────────────────────────────────
const N8N_WEBHOOK_URL = "/webhook/scraper-run"; // ← proxy local, sin CORS

// ─── Types ─────────────────────────────────────────────────────────────────
type JobStatus = "idle" | "running" | "done" | "error";

interface UrlResult {
    url: string;
    status: "done" | "error";
    chars?: number;
    error?: string;
}

interface Job {
    id: string;
    urls: string[];
    status: JobStatus;
    startedAt: Date;
    finishedAt?: Date;
    results: UrlResult[];
    logs: LogEntry[];
    progress: number;
}

interface LogEntry {
    ts: Date;
    level: "info" | "warn" | "error" | "success";
    msg: string;
}

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmt(d: Date) {
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function elapsed(start: Date, end?: Date) {
    const ms = ((end ?? new Date()).getTime() - start.getTime());
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function ScraperPage() {
    const [urlInput, setUrlInput] = useState("");
    const [clientId, setClientId] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [jobs, setJobs] = useState<Job[]>([]);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [jobs]);

    const activeJob = jobs.find((j) => j.id === activeJobId) ?? jobs[0] ?? null;

    const addLog = useCallback((jobId: string, level: LogEntry["level"], msg: string) => {
        setJobs((prev) =>
            prev.map((j) =>
                j.id === jobId ? { ...j, logs: [...j.logs, { ts: new Date(), level, msg }] } : j
            )
        );
    }, []);

    const parseUrls = (raw: string): string[] =>
        raw.split(/[\n,]+/)
            .map((u) => u.trim())
            .filter((u) => u.startsWith("http"))
            .filter((u, i, arr) => arr.indexOf(u) === i);

    const validateUrls = (urls: string[]) => {
        if (urls.length === 0) return "Introduce al menos una URL.";
        if (urls.length > 2) return "Solo puedes scrapear 2 URLs por cliente.";

        for (const url of urls) {
            try {
                const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
                if (!/\.(com|es)$/.test(host)) {
                    return "Solo se permiten dominios terminados en .com o .es.";
                }
            } catch {
                return "Hay una URL no valida.";
            }
        }

        return null;
    };

    const runScraper = async () => {
        const urls = parseUrls(urlInput);
        const validationError = validateUrls(urls);
        if (validationError) {
            alert(validationError);
            return;
        }

        const cleanClientId = clientId.trim();
        const cleanCompanyName = companyName.trim();

        if (!cleanClientId || !cleanCompanyName) {
            alert("Indica el ID del cliente y el nombre de la empresa antes de scrapear.");
            return;
        }

        const jobId = uid();
        const job: Job = {
            id: jobId, urls, status: "running",
            startedAt: new Date(), results: [], logs: [], progress: 0,
        };

        setJobs((prev) => [job, ...prev]);
        setActiveJobId(jobId);
        setRunning(true);

        const phases = [
            { pct: 5, msg: `Iniciando scraping de ${urls.length} URL${urls.length > 1 ? "s" : ""}…` },
            { pct: 12, msg: "Enviando solicitud al webhook de n8n…" },
            { pct: 20, msg: "n8n: Parseando URLs recibidas…" },
            { pct: 30, msg: "n8n: Descargando páginas raíz…" },
            { pct: 45, msg: "n8n: Extrayendo enlaces internos…" },
            { pct: 58, msg: "n8n: Filtrando y limpiando URLs…" },
            { pct: 72, msg: "n8n: Visitando subpáginas…" },
            { pct: 83, msg: "n8n: Extrayendo contenido HTML…" },
            { pct: 91, msg: "n8n: Formateando y vectorizando…" },
            { pct: 96, msg: "n8n: Guardando en base de conocimiento…" },
        ];

        phases.forEach(({ pct, msg }, i) => {
            setTimeout(() => {
                addLog(jobId, "info", msg);
                setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, progress: pct } : j)));
            }, i * 600);
        });

        try {
            const res = await fetch(N8N_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: cleanClientId,
                    company_name: cleanCompanyName,
                    urls
                }),
            });

            let data: any = {};
            try { data = await res.json(); } catch (_) { }

            if (!res.ok || data.ok === false) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }

            const results: UrlResult[] = (data.results || []).map((r: any) => ({
                url: r.url,
                status: r.status === "done" ? "done" : "error",
                chars: r.chars,
                error: r.error,
            }));

            const returnedUrls = new Set(results.map((r) => r.url));
            urls.forEach((u) => {
                if (!returnedUrls.has(u)) results.push({ url: u, status: "done", chars: 0 });
            });

            setJobs((prev) =>
                prev.map((j) =>
                    j.id === jobId
                        ? { ...j, status: "done", progress: 100, finishedAt: new Date(), results }
                        : j
                )
            );
            addLog(jobId, "success", `✓ Completado — ${results.length} URLs procesadas (${elapsed(job.startedAt)})`);
        } catch (err: any) {
            setJobs((prev) =>
                prev.map((j) =>
                    j.id === jobId ? { ...j, status: "error", progress: 100, finishedAt: new Date() } : j
                )
            );
            addLog(jobId, "error", `✗ Error: ${err.message}`);
        } finally {
            setRunning(false);
        }
    };

    const statusColor = (s: JobStatus) =>
        ({ idle: "#6b7280", running: "#f59e0b", done: "#22c55e", error: "#ef4444" }[s]);
    const statusLabel = (s: JobStatus) =>
        ({ idle: "IDLE", running: "RUNNING", done: "DONE", error: "ERROR" }[s]);

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0b0d0f; --surface: #111316; --surface2: #161a1e;
          --border: #1f2428; --border2: #2a3038;
          --text: #c9d1d9; --text-dim: #586069; --text-hi: #f0f6fc;
          --green: #22c55e; --yellow: #f59e0b; --red: #ef4444;
          --blue: #58a6ff; --cyan: #39d0d8; --purple: #bc8cff;
          --mono: 'IBM Plex Mono', monospace; --sans: 'IBM Plex Sans', sans-serif; --radius: 6px;
        }
        html, body { height: 100%; }
        body { font-family: var(--sans); background: var(--bg); color: var(--text); min-height: 100vh; }
        body::before {
          content: ''; position: fixed; inset: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,.06) 2px, rgba(0,0,0,.06) 4px);
          pointer-events: none; z-index: 9999;
        }
        .root { display: grid; grid-template-rows: 52px 1fr; grid-template-columns: 300px 1fr 340px; height: 100vh; overflow: hidden; }
        .topbar { grid-column: 1 / -1; display: flex; align-items: center; padding: 0 20px; background: var(--surface); border-bottom: 1px solid var(--border); gap: 16px; }
        .topbar-logo { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--green); letter-spacing: .08em; display: flex; align-items: center; gap: 8px; }
        .topbar-logo::before { content: '▶'; font-size: 9px; }
        .topbar-sep { flex: 1; }
        .topbar-badge { font-family: var(--mono); font-size: 10px; color: var(--text-dim); border: 1px solid var(--border2); padding: 3px 8px; border-radius: 4px; }
        .topbar-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
        .topbar-dot.busy { background: var(--yellow); animation: blink 1s infinite; }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        .sidebar { background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
        .sidebar-title { font-family: var(--mono); font-size: 10px; font-weight: 600; color: var(--text-dim); letter-spacing: .12em; text-transform: uppercase; padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
        .job-list { flex: 1; overflow-y: auto; }
        .job-item { padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .12s; position: relative; }
        .job-item:hover { background: var(--surface2); }
        .job-item.active { background: var(--surface2); }
        .job-item.active::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--cyan); }
        .job-item-id { font-family: var(--mono); font-size: 11px; color: var(--cyan); margin-bottom: 4px; }
        .job-item-urls { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px; }
        .job-item-footer { display: flex; align-items: center; justify-content: space-between; }
        .status-chip { font-family: var(--mono); font-size: 9px; font-weight: 600; letter-spacing: .1em; padding: 2px 7px; border-radius: 3px; border: 1px solid; }
        .job-item-time { font-family: var(--mono); font-size: 10px; color: var(--text-dim); }
        .main { display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); }
        .input-area { padding: 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
        .input-label { font-family: var(--mono); font-size: 10px; color: var(--text-dim); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 8px; }
        .url-textarea { width: 100%; background: var(--bg); border: 1px solid var(--border2); border-radius: var(--radius); color: var(--text-hi); font-family: var(--mono); font-size: 12px; line-height: 1.6; padding: 10px 12px; resize: vertical; min-height: 90px; outline: none; transition: border-color .15s; }
        .url-textarea:focus { border-color: var(--cyan); }
        .url-textarea::placeholder { color: var(--text-dim); }
        .input-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; gap: 12px; }
        .url-count { font-family: var(--mono); font-size: 11px; color: var(--text-dim); }
        .url-count span { color: var(--cyan); }
        .run-btn { display: inline-flex; align-items: center; gap: 8px; background: var(--green); color: #000; font-family: var(--mono); font-size: 12px; font-weight: 600; letter-spacing: .06em; padding: 9px 20px; border-radius: var(--radius); border: none; cursor: pointer; transition: background .15s, transform .1s; }
        .run-btn:hover:not(:disabled) { background: #16a34a; transform: translateY(-1px); }
        .run-btn:disabled { opacity: .45; cursor: not-allowed; }
        .run-btn .spinner { width: 12px; height: 12px; border: 2px solid rgba(0,0,0,.3); border-top-color: #000; border-radius: 50%; animation: spin .7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .progress-bar-wrap { height: 3px; background: var(--border); position: relative; overflow: hidden; }
        .progress-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--cyan); transition: width .5s cubic-bezier(.22,1,.36,1); box-shadow: 0 0 10px var(--cyan); }
        .console-area { flex: 1; overflow-y: auto; padding: 16px 20px; font-family: var(--mono); font-size: 12px; line-height: 1.7; }
        .console-empty { color: var(--text-dim); text-align: center; margin-top: 48px; font-size: 13px; }
        .console-empty-icon { font-size: 32px; margin-bottom: 12px; opacity: .4; }
        .log-line { display: flex; gap: 12px; padding: 2px 0; animation: fadeIn .2s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; } }
        .log-ts { color: var(--text-dim); min-width: 84px; }
        .log-msg { flex: 1; }
        .log-info .log-msg { color: var(--text); }
        .log-success .log-msg { color: var(--green); }
        .log-warn .log-msg { color: var(--yellow); }
        .log-error .log-msg { color: var(--red); }
        .results-panel { background: var(--surface); display: flex; flex-direction: column; overflow: hidden; }
        .results-title { font-family: var(--mono); font-size: 10px; font-weight: 600; color: var(--text-dim); letter-spacing: .12em; text-transform: uppercase; padding: 14px 16px 10px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .results-count { font-family: var(--mono); font-size: 11px; color: var(--cyan); }
        .results-list { flex: 1; overflow-y: auto; }
        .result-row { padding: 10px 16px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; animation: fadeIn .25s ease; }
        .result-row-top { display: flex; align-items: center; gap: 8px; }
        .result-icon { font-size: 12px; }
        .result-url { font-family: var(--mono); font-size: 11px; color: var(--blue); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .result-chars { font-family: var(--mono); font-size: 10px; color: var(--text-dim); white-space: nowrap; }
        .result-error { font-size: 11px; color: var(--red); font-family: var(--mono); }
        .stats-bar { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--border); padding: 12px 16px; gap: 8px; }
        .stat { text-align: center; }
        .stat-val { font-family: var(--mono); font-size: 20px; font-weight: 600; color: var(--text-hi); line-height: 1.1; }
        .stat-lbl { font-family: var(--mono); font-size: 9px; color: var(--text-dim); letter-spacing: .1em; text-transform: uppercase; margin-top: 2px; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }
        @media (max-width: 900px) {
          .root { grid-template-columns: 1fr; grid-template-rows: 52px auto 1fr auto; }
          .sidebar, .results-panel { display: none; }
        }
      `}</style>

            <div className="root">
                <header className="topbar">
                    <div className="topbar-logo">AICOR SCRAPER ADMIN</div>
                    <div className="topbar-sep" />
                    <div className="topbar-badge">n8n webhook</div>
                    <div className="topbar-badge">Supabase vector</div>
                    <div className={`topbar-dot ${running ? "busy" : ""}`} />
                </header>

                <aside className="sidebar">
                    <div className="sidebar-title">Historial de jobs</div>
                    <div className="job-list">
                        {jobs.length === 0 && (
                            <div style={{ padding: "20px 16px", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                                Sin jobs todavía
                            </div>
                        )}
                        {jobs.map((j) => (
                            <div key={j.id} className={`job-item ${j.id === activeJobId ? "active" : ""}`} onClick={() => setActiveJobId(j.id)}>
                                <div className="job-item-id">#{j.id}</div>
                                <div className="job-item-urls">{j.urls[0]}{j.urls.length > 1 ? ` +${j.urls.length - 1}` : ""}</div>
                                <div className="job-item-footer">
                                    <span className="status-chip" style={{ color: statusColor(j.status), borderColor: statusColor(j.status) + "55" }}>
                                        {statusLabel(j.status)}
                                    </span>
                                    <span className="job-item-time">{fmt(j.startedAt)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="main">
                    <div className="input-area">
                        <div className="input-label">// URLs a scrapear</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            <input
                                className="url-textarea"
                                style={{ minHeight: 0, resize: "none" }}
                                placeholder="ID cliente Supabase"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                disabled={running}
                            />
                            <input
                                className="url-textarea"
                                style={{ minHeight: 0, resize: "none" }}
                                placeholder="Nombre empresa"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                disabled={running}
                            />
                        </div>
                        <textarea
                            className="url-textarea"
                            placeholder={"https://aicor.com/\nhttps://blueaicor.com/servicios\nhttps://blueaicor.com/productos"}
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            disabled={running}
                        />
                        <div className="input-footer">
                            <div className="url-count">
                                <span>{parseUrls(urlInput).length}</span>/2 URL{parseUrls(urlInput).length !== 1 ? "s" : ""} detectada{parseUrls(urlInput).length !== 1 ? "s" : ""}{" · solo dominios .com o .es"}
                            </div>
                            <button className="run-btn" disabled={running || parseUrls(urlInput).length === 0 || parseUrls(urlInput).length > 2} onClick={runScraper}>
                                {running ? <><span className="spinner" /> PROCESANDO…</> : <>▶ EJECUTAR SCRAPING</>}
                            </button>
                        </div>
                    </div>

                    <div className="progress-bar-wrap">
                        <div className="progress-bar-fill" style={{ width: `${activeJob?.progress ?? 0}%` }} />
                    </div>

                    <div className="console-area">
                        {!activeJob || activeJob.logs.length === 0 ? (
                            <div className="console-empty">
                                <div className="console-empty-icon">⬛</div>
                                <div>Esperando ejecución…</div>
                                <div style={{ marginTop: 6, fontSize: 11 }}>Añade URLs arriba y pulsa EJECUTAR SCRAPING</div>
                            </div>
                        ) : (
                            activeJob.logs.map((log, i) => (
                                <div key={i} className={`log-line log-${log.level}`}>
                                    <span className="log-ts">[{fmt(log.ts)}]</span>
                                    <span className="log-msg">{log.msg}</span>
                                </div>
                            ))
                        )}
                        <div ref={logsEndRef} />
                    </div>
                </main>

                <aside className="results-panel">
                    <div className="results-title">
                        <span>Resultados</span>
                        {activeJob && activeJob.results.length > 0 && (
                            <span className="results-count">{activeJob.results.length} URLs</span>
                        )}
                    </div>
                    <div className="results-list">
                        {!activeJob || activeJob.results.length === 0 ? (
                            <div style={{ padding: "20px 16px", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                                {activeJob?.status === "running" ? "Procesando…" : "Sin resultados aún"}
                            </div>
                        ) : (
                            activeJob.results.map((r, i) => (
                                <div className="result-row" key={i}>
                                    <div className="result-row-top">
                                        <span className="result-icon">{r.status === "done" ? "✓" : "✗"}</span>
                                        <span className="result-url" title={r.url} style={{ color: r.status === "done" ? "var(--blue)" : "var(--red)" }}>
                                            {r.url}
                                        </span>
                                    </div>
                                    {r.status === "done" && r.chars !== undefined && (
                                        <div className="result-chars">{r.chars.toLocaleString()} chars extraídos</div>
                                    )}
                                    {r.error && <div className="result-error">{r.error}</div>}
                                </div>
                            ))
                        )}
                    </div>
                    {activeJob && (
                        <div className="stats-bar">
                            <div className="stat"><div className="stat-val">{activeJob.urls.length}</div><div className="stat-lbl">URLs</div></div>
                            <div className="stat"><div className="stat-val" style={{ color: "var(--green)" }}>{activeJob.results.filter((r) => r.status === "done").length}</div><div className="stat-lbl">OK</div></div>
                            <div className="stat">
                                <div className="stat-val" style={{ color: "var(--text-dim)" }}>
                                    {activeJob.finishedAt ? elapsed(activeJob.startedAt, activeJob.finishedAt) : elapsed(activeJob.startedAt)}
                                </div>
                                <div className="stat-lbl">Tiempo</div>
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </>
    );
}
