import { useState, useRef, useEffect } from "react";

const CHAT_URL =
  "/webhook/48e4053f-83ac-471e-880e-91f47e39b0ee/chat";

const DEFAULT_CLIENT_ID = import.meta.env.VITE_DEFAULT_CLIENT_ID || "";
const DEFAULT_COMPANY_NAME = import.meta.env.VITE_DEFAULT_COMPANY_NAME || "Aicor";

// ─── tiny hook: staggered mount animation ───────────────────
function useReveal(delay = 0) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return visible;
}

export function ExamplePage() {
  const [chatOpen, setChatOpen] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [clientId, setClientId] = useState(DEFAULT_CLIENT_ID);
  const [companyName, setCompanyName] = useState(DEFAULT_COMPANY_NAME);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hero = useReveal(80);
  const badge = useReveal(200);
  const heading = useReveal(320);
  const sub = useReveal(440);
  const cta = useReveal(560);
  const cards = useReveal(680);

  const chatUrl = `${CHAT_URL}?client_id=${encodeURIComponent(clientId.trim())}&company_name=${encodeURIComponent(companyName.trim())}`;

  // lazy-load iframe src on first open
  const handleToggle = () => {
    setChatOpen((prev) => !prev);
    if (!iframeLoaded && iframeRef.current) {
      iframeRef.current.src = chatUrl;
      setIframeLoaded(true);
    }
  };

  useEffect(() => {
    if (iframeLoaded && iframeRef.current) {
      iframeRef.current.src = chatUrl;
    }
  }, [chatUrl, iframeLoaded]);

  return (
    <>
      {/* ── Global styles injected via <style> tag ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --ink:       #0d0e12;
          --ink-muted: #5a5e72;
          --paper:     #f7f6f1;
          --cream:     #ede9df;
          --blue:      #1a4bdb;
          --blue-lt:   #dce7ff;
          --blue-dk:   #0f2d8a;
          --gold:      #c9a84c;
          --radius:    14px;
          --shadow:    0 2px 24px rgba(13,14,18,.09);
          --shadow-lg: 0 12px 48px rgba(13,14,18,.18);
        }

        body {
          font-family: 'DM Sans', sans-serif;
          background: var(--paper);
          color: var(--ink);
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* ── reveal animation ── */
        .reveal {
          opacity: 0;
          transform: translateY(22px);
          transition: opacity .55s cubic-bezier(.22,1,.36,1),
                      transform .55s cubic-bezier(.22,1,.36,1);
        }
        .reveal.visible { opacity: 1; transform: none; }

        /* ── nav ── */
        .nav {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 48px;
          background: rgba(247,246,241,.88);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--cream);
        }
        .nav-logo {
          font-family: 'DM Serif Display', serif;
          font-size: 22px;
          letter-spacing: -.3px;
          color: var(--ink);
        }
        .nav-logo span { color: var(--blue); }
        .nav-pill {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: .08em;
          text-transform: uppercase;
          padding: 6px 16px;
          border-radius: 99px;
          border: 1.5px solid var(--ink);
          color: var(--ink);
          background: transparent;
          cursor: pointer;
          transition: background .18s, color .18s;
        }
        .nav-pill:hover { background: var(--ink); color: var(--paper); }

        /* ── hero ── */
        .hero {
          position: relative;
          min-height: calc(100vh - 65px);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          overflow: hidden;
        }

        /* left column */
        .hero-left {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 80px 64px 80px 80px;
          position: relative;
          z-index: 2;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--blue-lt);
          color: var(--blue-dk);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: .06em;
          text-transform: uppercase;
          padding: 6px 14px;
          border-radius: 99px;
          width: fit-content;
          margin-bottom: 28px;
        }
        .badge-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--blue);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: .6; transform: scale(1.35); }
        }

        .hero-heading {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(42px, 5vw, 68px);
          line-height: 1.06;
          letter-spacing: -.02em;
          color: var(--ink);
          margin-bottom: 24px;
        }
        .hero-heading em {
          font-style: italic;
          color: var(--blue);
        }

        .hero-sub {
          font-size: 17px;
          font-weight: 300;
          line-height: 1.7;
          color: var(--ink-muted);
          max-width: 460px;
          margin-bottom: 44px;
        }

        .cta-row {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: var(--blue);
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          padding: 14px 28px;
          border-radius: var(--radius);
          border: none;
          cursor: pointer;
          transition: background .18s, transform .15s, box-shadow .18s;
          box-shadow: 0 4px 16px rgba(26,75,219,.35);
        }
        .btn-primary:hover {
          background: var(--blue-dk);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(26,75,219,.45);
        }
        .btn-secondary {
          font-size: 14px;
          font-weight: 500;
          color: var(--ink-muted);
          background: none;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: color .18s;
        }
        .btn-secondary:hover { color: var(--ink); }

        /* right column: preview window */
        .hero-right {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--blue);
          overflow: hidden;
        }
        .hero-right::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 70% 30%, rgba(255,255,255,.08) 0%, transparent 70%),
            radial-gradient(ellipse 50% 80% at 30% 80%, rgba(0,0,0,.2) 0%, transparent 70%);
        }
        .hero-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .chat-mockup {
          position: relative;
          z-index: 2;
          width: 320px;
          background: rgba(255,255,255,.07);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,.15);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,.35);
        }
        .chat-mockup-header {
          padding: 16px 20px;
          background: rgba(255,255,255,.1);
          border-bottom: 1px solid rgba(255,255,255,.1);
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .chat-avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fff, var(--blue-lt));
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
        }
        .chat-mockup-name {
          font-size: 14px; font-weight: 600; color: #fff;
          line-height: 1.2;
        }
        .chat-mockup-status {
          font-size: 11px; color: rgba(255,255,255,.6);
        }
        .status-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #4ade80;
          margin-right: 4px;
          animation: pulse 2s ease-in-out infinite;
        }
        .chat-messages {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .msg {
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.5;
          animation: msgIn .4s cubic-bezier(.22,1,.36,1) both;
        }
        @keyframes msgIn {
          from { opacity: 0; transform: scale(.92) translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
        .msg-bot {
          background: rgba(255,255,255,.12);
          color: rgba(255,255,255,.9);
          border-bottom-left-radius: 4px;
          align-self: flex-start;
        }
        .msg-user {
          background: #fff;
          color: var(--blue-dk);
          font-weight: 500;
          border-bottom-right-radius: 4px;
          align-self: flex-end;
        }
        .chat-input-row {
          padding: 12px 16px;
          border-top: 1px solid rgba(255,255,255,.1);
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .chat-fake-input {
          flex: 1;
          background: rgba(255,255,255,.1);
          border: 1px solid rgba(255,255,255,.15);
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 12px;
          color: rgba(255,255,255,.5);
        }
        .chat-send-btn {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          color: var(--blue);
          font-size: 14px;
        }

        /* ── features strip ── */
        .features {
          padding: 80px 80px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        .feature-card {
          background: #fff;
          border: 1px solid var(--cream);
          border-radius: var(--radius);
          padding: 32px 28px;
          transition: box-shadow .2s, transform .2s;
        }
        .feature-card:hover {
          box-shadow: var(--shadow-lg);
          transform: translateY(-4px);
        }
        .feature-icon {
          width: 44px; height: 44px;
          border-radius: 10px;
          background: var(--blue-lt);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px;
          margin-bottom: 18px;
        }
        .feature-title {
          font-family: 'DM Serif Display', serif;
          font-size: 20px;
          margin-bottom: 10px;
        }
        .feature-desc {
          font-size: 14px;
          color: var(--ink-muted);
          line-height: 1.7;
        }

        /* ── inline demo section ── */
        .demo-section {
          padding: 0 80px 80px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          align-items: center;
        }
        .demo-copy h2 {
          font-family: 'DM Serif Display', serif;
          font-size: 36px;
          line-height: 1.15;
          margin-bottom: 16px;
        }
        .demo-copy p {
          font-size: 15px;
          color: var(--ink-muted);
          line-height: 1.75;
          margin-bottom: 24px;
        }
        .code-tag {
          display: inline-block;
          background: var(--ink);
          color: var(--gold);
          font-family: 'Courier New', monospace;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 6px;
        }
        .client-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          max-width: 520px;
          margin-bottom: 20px;
        }
        .client-fields input {
          width: 100%;
          border: 1px solid var(--cream);
          border-radius: 8px;
          background: #fff;
          color: var(--ink);
          font: inherit;
          font-size: 13px;
          padding: 11px 12px;
        }
        .demo-iframe-wrapper {
          border-radius: 16px;
          overflow: hidden;
          box-shadow: var(--shadow-lg);
          border: 1px solid var(--cream);
          height: 540px;
        }
        .demo-iframe-wrapper iframe {
          width: 100%; height: 100%; border: none; display: block;
        }

        /* ── floating chat button ── */
        .float-btn {
          position: fixed;
          bottom: 28px;
          right: 28px;
          z-index: 1000;
          width: 62px; height: 62px;
          border-radius: 50%;
          background: var(--blue);
          color: #fff;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(26,75,219,.5);
          display: flex; align-items: center; justify-content: center;
          transition: transform .2s, box-shadow .2s, background .18s;
          font-size: 24px;
        }
        .float-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 8px 28px rgba(26,75,219,.6);
          background: var(--blue-dk);
        }
        .float-btn.active { background: var(--ink); }

        .float-panel {
          position: fixed;
          bottom: 104px;
          right: 28px;
          z-index: 999;
          width: 390px;
          height: 580px;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 16px 60px rgba(0,0,0,.22);
          border: 1px solid var(--cream);
          background: #fff;
          transform-origin: bottom right;
          transform: scale(.88) translateY(16px);
          opacity: 0;
          pointer-events: none;
          transition:
            transform .3s cubic-bezier(.22,1,.36,1),
            opacity   .3s ease;
        }
        .float-panel.open {
          transform: none;
          opacity: 1;
          pointer-events: auto;
        }
        .float-panel iframe { width: 100%; height: 100%; border: none; display: block; }

        /* ── footer ── */
        footer {
          padding: 32px 80px;
          border-top: 1px solid var(--cream);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          color: var(--ink-muted);
        }

        /* ── responsive ── */
        @media (max-width: 900px) {
          .hero { grid-template-columns: 1fr; min-height: auto; }
          .hero-right { height: 320px; }
          .hero-left { padding: 48px 28px; }
          .features { grid-template-columns: 1fr; padding: 48px 28px; }
          .demo-section { grid-template-columns: 1fr; padding: 0 28px 48px; }
          .client-fields { grid-template-columns: 1fr; }
          .nav { padding: 14px 24px; }
          footer { padding: 24px; flex-direction: column; gap: 8px; text-align: center; }
          .float-panel { width: calc(100vw - 24px); right: 12px; bottom: 96px; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-logo">
          Aicor<span>.</span>
        </div>
        <button className="nav-pill" onClick={handleToggle}>
          Habla con nosotros
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        {/* Left */}
        <div className="hero-left">
          <div className={`badge reveal ${badge ? "visible" : ""}`}>
            <span className="badge-dot" />
            Asistente disponible 24/7
          </div>

          <h1 className={`hero-heading reveal ${heading ? "visible" : ""}`}>
            Tu próximo cliente<br />
            empieza con una <em>conversación</em>
          </h1>

          <p className={`hero-sub reveal ${sub ? "visible" : ""}`}>
            Nuestro asistente inteligente cualifica leads, responde dudas
            sobre productos y agenda contactos — todo en tiempo real,
            directamente integrado en tu web.
          </p>

          <div className={`cta-row reveal ${cta ? "visible" : ""}`}>
            <button className="btn-primary" onClick={handleToggle}>
              <span>💬</span>
              Probar el chat ahora
            </button>
            <button className="btn-secondary">
              Ver cómo funciona →
            </button>
          </div>
        </div>

        {/* Right: animated mockup */}
        <div className={`hero-right reveal ${hero ? "visible" : ""}`} style={{ transitionDelay: "0ms" }}>
          <div className="hero-grid" />
          <div className="chat-mockup">
            <div className="chat-mockup-header">
              <div className="chat-avatar">🤖</div>
              <div>
                <div className="chat-mockup-name">Aicor Asistente</div>
                <div className="chat-mockup-status">
                  <span className="status-dot" />
                  En línea
                </div>
              </div>
            </div>
            <div className="chat-messages">
              <div className="msg msg-bot" style={{ animationDelay: ".6s" }}>
                ¡Hola! Soy el asistente de Aicor. ¿Cómo te llamas?
              </div>
              <div className="msg msg-user" style={{ animationDelay: ".9s" }}>
                Hola, soy María
              </div>
              <div className="msg msg-bot" style={{ animationDelay: "1.2s" }}>
                ¡Hola, María! ¿En qué te puedo ayudar hoy?
              </div>
              <div className="msg msg-user" style={{ animationDelay: "1.5s" }}>
                Me interesa el ERP para mi empresa
              </div>
              <div className="msg msg-bot" style={{ animationDelay: "1.8s" }}>
                Perfecto, eso lo vemos mucho. ¿Cuántos usuarios lo usarían?
              </div>
            </div>
            <div className="chat-input-row">
              <div className="chat-fake-input">Escribe un mensaje…</div>
              <div className="chat-send-btn">➤</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE CARDS ── */}
      <section className={`features reveal ${cards ? "visible" : ""}`}>
        {[
          {
            icon: "⚡",
            title: "Respuesta inmediata",
            desc: "El asistente responde al instante, cualifica al visitante y guarda la conversación sin intervención humana.",
          },
          {
            icon: "🎯",
            title: "Leads cualificados",
            desc: "Recoge nombre, email y teléfono de forma natural y los envía automáticamente a tu CRM.",
          },
          {
            icon: "🔌",
            title: "Integración con un iframe",
            desc: "Dos líneas de código para embeber el chat en cualquier web. Sin SDK, sin dependencias externas.",
          },
        ].map((f) => (
          <div className="feature-card" key={f.title}>
            <div className="feature-icon">{f.icon}</div>
            <div className="feature-title">{f.title}</div>
            <p className="feature-desc">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ── INLINE DEMO ── */}
      <section className="demo-section">
        <div className="demo-copy">
          <h2>
            Integración directa<br />en tu web
          </h2>
          <p>
            Copia el snippet y pégalo donde quieras. El chat carga de forma
            lazy y no impacta el rendimiento de la página.
          </p>
          <p>
            El iframe apunta a una ruta de esta web —{" "}
            <span className="code-tag">/webhook/.../chat</span> se reenvía
            internamente al flujo de n8n.
          </p>
          <div className="client-fields">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="ID cliente Supabase"
            />
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Nombre empresa"
            />
          </div>
          <button className="btn-primary" onClick={handleToggle} style={{ marginTop: 8 }}>
            <span>💬</span>
            Abrir chat flotante
          </button>
        </div>

        {/* Live inline iframe */}
        <div className="demo-iframe-wrapper">
          <iframe
            src={chatUrl}
            title="Demo Aicor Chat"
            allow="microphone"
          />
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <span>
          © {new Date().getFullYear()} Aicor Consultores Informáticos
        </span>
        <span>Powered by n8n · Supabase · BlueCRM</span>
      </footer>

      {/* ── FLOATING CHAT BUTTON (Opción B) ── */}
      <button
        className={`float-btn ${chatOpen ? "active" : ""}`}
        aria-label="Abrir chat"
        onClick={handleToggle}
      >
        {chatOpen ? "✕" : "💬"}
      </button>

      <div className={`float-panel ${chatOpen ? "open" : ""}`}>
        <iframe
          ref={iframeRef}
          src=""
          title="Aicor Asistente"
          allow="microphone"
        />
      </div>
    </>
  );
}
