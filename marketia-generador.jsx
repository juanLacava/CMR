import { useState, useEffect, useRef } from "react";

const IG_COLOR = "#E1306C";
const TK_COLOR = "#69C9D0";

const BUSINESS = {
  name: "La Pizzería de Roberto",
  type: "Gastronomía",
  location: "Palermo, CABA",
  tone: "Cercano y amigable",
  audience: "Familias y jóvenes 25-34",
  tagline: "Pizzas de masa madre, sin apuro, con amor",
  seguidores_ig: 1420,
  seguidores_tk: 634,
};

const GOAL_OPTIONS = [
  { id: "promo", emoji: "🔥", label: "Promocionar un producto", desc: "Destacar una pizza o combo especial" },
  { id: "engagement", emoji: "💬", label: "Generar engagement", desc: "Que la gente comente y comparta" },
  { id: "behind", emoji: "👨‍🍳", label: "Detrás de escena", desc: "Mostrar el proceso artesanal" },
  { id: "testimonio", emoji: "⭐", label: "Compartir reseña", desc: "Usar un comentario de cliente" },
  { id: "fecha", emoji: "📅", label: "Fecha especial", desc: "Día del padre, Hot Sale, Navidad..." },
  { id: "educativo", emoji: "📖", label: "Contenido educativo", desc: "Enseñar algo sobre pizzas o ingredientes" },
];

const PRODUCT_SUGGESTIONS = [
  "Pizza napolitana con mozzarella fresca",
  "Fugazzeta rellena con doble queso",
  "Pizza de rúcula y jamón crudo",
  "Empanadas de queso y cebolla",
  "Combo familiar (2 pizzas + bebida)",
];

function useTypewriter(text, speed = 16, active = true) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);
  useEffect(() => {
    if (!active || !text) return;
    setDisplayed("");
    setDone(false);
    idx.current = 0;
    const interval = setInterval(() => {
      if (idx.current < text.length) {
        setDisplayed(text.slice(0, idx.current + 1));
        idx.current++;
      } else {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, active]);
  return { displayed, done };
}

const LOADING_STEPS = [
  { icon: "🧠", text: "Leyendo el contexto de La Pizzería de Roberto..." },
  { icon: "📍", text: "Aplicando tono: cercano y amigable, Palermo CABA..." },
  { icon: "✍️", text: "Redactando el copy para Instagram y TikTok..." },
  { icon: "🎯", text: "Optimizando hashtags para gastronomía argentina..." },
  { icon: "✅", text: "¡Post generado con éxito!" },
];

async function callClaudeAPI(goal, product, extra) {
  const goalLabel = GOAL_OPTIONS.find(g => g.id === goal)?.label || goal;

  const prompt = `Sos el community manager de "${BUSINESS.name}", una pizzería artesanal en ${BUSINESS.location}.

DATOS DEL NEGOCIO:
- Diferencial: "${BUSINESS.tagline}"
- Tono: ${BUSINESS.tone}
- Audiencia: ${BUSINESS.audience}
- Contexto local: Argentina, modismos porteños, referencias locales

OBJETIVO DEL POST: ${goalLabel}
${product ? `PRODUCTO A DESTACAR: ${product}` : ""}
${extra ? `DETALLE EXTRA: ${extra}` : ""}

Generá contenido para DOS canales simultáneamente:

1. Instagram: caption largo con emojis, llamado a la acción, tono cálido y cercano
2. TikTok: caption corto y gancho fuerte para video (máx 3 líneas), con hook que enganche en los primeros 2 segundos

Respondé SOLO con JSON válido (sin markdown, sin backticks):
{
  "ig_caption": "caption completo para instagram con saltos de linea \\n y emojis",
  "ig_hook": "primera línea impactante para instagram",
  "tk_caption": "caption corto para tiktok máx 3 líneas",
  "tk_hook": "hook para los primeros 2 segundos del video",
  "hashtags_ig": ["hash1","hash2","hash3","hash4","hash5"],
  "hashtags_tk": ["hash1","hash2","hash3"],
  "mejor_horario_ig": "ej: Viernes 19:30hs",
  "mejor_horario_tk": "ej: Domingo 20:00hs",
  "tip_ia": "un consejo breve y específico para este post en particular"
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return JSON.parse(data.content[0].text.trim());
}

export default function App() {
  const [phase, setPhase] = useState("config"); // config | loading | result
  const [goal, setGoal] = useState("");
  const [product, setProduct] = useState("");
  const [extra, setExtra] = useState("");
  const [result, setResult] = useState(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [activeTab, setActiveTab] = useState("ig");
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState(null);

  const { displayed: igDisplayed, done: igDone } = useTypewriter(result?.ig_caption || "", 14, phase === "result" && activeTab === "ig");
  const { displayed: tkDisplayed, done: tkDone } = useTypewriter(result?.tk_caption || "", 18, phase === "result" && activeTab === "tk");

  useEffect(() => {
    if (phase !== "loading") return;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setLoadingStep(step);
      if (step >= LOADING_STEPS.length - 1) clearInterval(interval);
    }, 900);
    return () => clearInterval(interval);
  }, [phase]);

  const handleGenerate = async () => {
    if (!goal) return;
    setPhase("loading");
    setLoadingStep(0);
    setError(null);
    try {
      const res = await callClaudeAPI(goal, product, extra);
      setResult(res);
      setTimeout(() => {
        setPhase("result");
        setActiveTab("ig");
      }, 500);
    } catch (e) {
      setError("Error al generar. Intentá de nuevo.");
      setPhase("config");
    }
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080815", fontFamily: "'Syne', system-ui, sans-serif", color: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes stepIn { from { opacity:0; transform: translateX(-10px); } to { opacity:1; transform: translateX(0); } }
        input, textarea { font-family: 'Syne', sans-serif; }
        input::placeholder, textarea::placeholder { color: #252535; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 2px; }
      `}</style>

      {/* NAV */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#080815ee", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1C1C2E", padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#FF5C35", fontSize: 18 }}>⚡</span>
          <span style={{ fontSize: 15, fontWeight: 900 }}>Marketia <span style={{ color: "#FF5C35" }}>IA</span></span>
        </div>
        {/* Business context pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "#111120", border: "1px solid #1C1C2E",
          borderRadius: 100, padding: "6px 14px",
        }}>
          <span style={{ fontSize: 16 }}>🍕</span>
          <div>
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>La Pizzería de Roberto</span>
            <span style={{ color: "#333", fontSize: 11 }}> · Palermo</span>
          </div>
          <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: IG_COLOR }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: TK_COLOR }} />
          </div>
        </div>
        {phase === "result" && (
          <button onClick={() => { setPhase("config"); setResult(null); setGoal(""); setProduct(""); setExtra(""); }} style={{
            background: "transparent", border: "1px solid #1C1C2E", borderRadius: 10,
            padding: "8px 16px", color: "#555", fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "'Syne', sans-serif",
          }}>
            ↩ Nuevo post
          </button>
        )}
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 20px 60px" }}>

        {/* ── PHASE: CONFIG ── */}
        {phase === "config" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ color: "#FF5C35", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                Generador de contenido
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.2, marginBottom: 10 }}>
                ¿Qué publicamos hoy<br />para <span style={{ color: "#FF5C35" }}>La Pizzería de Roberto?</span>
              </h1>
              <p style={{ color: "#444", fontSize: 14 }}>
                La IA ya conoce tu negocio. Solo elegí el objetivo y generamos el post para Instagram y TikTok.
              </p>
            </div>

            {/* Contexto del negocio */}
            <div style={{
              background: "#111120", border: "1px solid #1C1C2E",
              borderRadius: 16, padding: "16px 18px", marginBottom: 28,
              display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: "linear-gradient(135deg, #FF5C35, #FF8050)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              }}>🍕</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>La Pizzería de Roberto</div>
                    <div style={{ color: "#444", fontSize: 12, marginBottom: 8 }}>📍 Palermo · Tono: Cercano · Audiencia: Familias y jóvenes</div>
                  </div>
                  <div style={{ background: "#FF5C3510", border: "1px solid #FF5C3530", borderRadius: 8, padding: "4px 10px" }}>
                    <span style={{ color: "#FF5C35", fontSize: 10, fontWeight: 700 }}>Contexto cargado ✓</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ background: "#E1306C10", border: "1px solid #E1306C20", borderRadius: 8, padding: "4px 10px" }}>
                    <span style={{ color: IG_COLOR, fontSize: 11, fontWeight: 700 }}>📸 1.420 seguidores</span>
                  </div>
                  <div style={{ background: "#69C9D010", border: "1px solid #69C9D020", borderRadius: 8, padding: "4px 10px" }}>
                    <span style={{ color: TK_COLOR, fontSize: 11, fontWeight: 700 }}>🎵 634 seguidores</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Objetivo */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", color: "#444", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
                ¿Cuál es el objetivo del post?
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {GOAL_OPTIONS.map(g => (
                  <div key={g.id} onClick={() => setGoal(g.id)} style={{
                    padding: "14px 16px", borderRadius: 14, cursor: "pointer",
                    background: goal === g.id ? "#FF5C3512" : "#111120",
                    border: `1.5px solid ${goal === g.id ? "#FF5C35" : "#1C1C2E"}`,
                    transition: "all 0.2s",
                    transform: goal === g.id ? "scale(1.02)" : "scale(1)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{g.emoji}</span>
                      <span style={{ color: goal === g.id ? "#FF5C35" : "#aaa", fontWeight: 800, fontSize: 13 }}>{g.label}</span>
                    </div>
                    <div style={{ color: "#333", fontSize: 12 }}>{g.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Producto */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", color: "#444", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
                ¿Qué producto destacar? <span style={{ color: "#252535", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>opcional</span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {PRODUCT_SUGGESTIONS.map(p => (
                  <button key={p} onClick={() => setProduct(product === p ? "" : p)} style={{
                    padding: "7px 14px", borderRadius: 100, border: "none", cursor: "pointer",
                    background: product === p ? "#FF5C35" : "#111120",
                    color: product === p ? "#fff" : "#444",
                    border: `1px solid ${product === p ? "#FF5C35" : "#1C1C2E"}`,
                    fontSize: 12, fontWeight: 700, fontFamily: "'Syne', sans-serif",
                    transition: "all 0.2s",
                  }}>{p}</button>
                ))}
              </div>
              <input
                placeholder="O escribí algo específico..."
                value={PRODUCT_SUGGESTIONS.includes(product) ? "" : product}
                onChange={e => setProduct(e.target.value)}
                style={{
                  width: "100%", padding: "13px 16px", borderRadius: 12,
                  background: "#111120", border: "1.5px solid #1C1C2E",
                  color: "#fff", fontSize: 14, outline: "none", transition: "border-color 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "#FF5C35"}
                onBlur={e => e.target.style.borderColor = "#1C1C2E"}
              />
            </div>

            {/* Extra */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", color: "#444", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
                ¿Algo más que la IA deba saber? <span style={{ color: "#252535", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>opcional</span>
              </label>
              <textarea
                placeholder='Ej: "Hoy es viernes y quiero algo que invite a la gente a venir esta noche"'
                value={extra}
                onChange={e => setExtra(e.target.value)}
                rows={2}
                style={{
                  width: "100%", padding: "13px 16px", borderRadius: 12,
                  background: "#111120", border: "1.5px solid #1C1C2E",
                  color: "#fff", fontSize: 14, outline: "none", resize: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "#FF5C35"}
                onBlur={e => e.target.style.borderColor = "#1C1C2E"}
              />
            </div>

            {error && (
              <div style={{ background: "#2a0a0a", border: "1px solid #FF5C3540", borderRadius: 10, padding: "12px 16px", color: "#FF5C35", fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button onClick={handleGenerate} disabled={!goal} style={{
              width: "100%", padding: "17px", borderRadius: 14, border: "none",
              background: goal ? "linear-gradient(135deg, #FF5C35, #FF8050)" : "#111120",
              color: goal ? "#fff" : "#2a2a3a",
              fontSize: 16, fontWeight: 900, cursor: goal ? "pointer" : "not-allowed",
              fontFamily: "'Syne', sans-serif",
              boxShadow: goal ? "0 10px 30px #FF5C3440" : "none",
              transition: "all 0.3s",
            }}>
              ✨ Generar post para Instagram y TikTok
            </button>
          </div>
        )}

        {/* ── PHASE: LOADING ── */}
        {phase === "loading" && (
          <div style={{ textAlign: "center", padding: "60px 0", animation: "fadeUp 0.4s ease" }}>
            {/* Spinner */}
            <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 32px" }}>
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                border: "3px solid #1C1C2E",
              }} />
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                border: "3px solid transparent",
                borderTopColor: "#FF5C35",
                animation: "spin 0.9s linear infinite",
              }} />
              <div style={{
                position: "absolute", inset: 10, borderRadius: "50%",
                background: "#111120",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
              }}>🤖</div>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Generando tu post...</h2>
            <p style={{ color: "#333", fontSize: 13, marginBottom: 40 }}>La IA está usando todo lo que sabe de La Pizzería de Roberto</p>

            {/* Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left', maxWidth: 380, margin: '0 auto" }}>
              {LOADING_STEPS.map((s, i) => {
                const active = i === loadingStep;
                const done = i < loadingStep;
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 12,
                    background: active ? "#FF5C3510" : done ? "#111120" : "#0D0D1C",
                    border: `1px solid ${active ? "#FF5C3530" : done ? "#1C1C2E" : "#111120"}`,
                    opacity: done ? 0.5 : active ? 1 : 0.3,
                    animation: active ? "stepIn 0.3s ease" : "none",
                    transition: "all 0.3s",
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{done ? "✅" : s.icon}</span>
                    <span style={{ color: active ? "#fff" : done ? "#555" : "#333", fontSize: 13, fontWeight: active ? 700 : 400 }}>
                      {s.text}
                    </span>
                    {active && <span style={{ marginLeft: "auto", color: "#FF5C35", animation: "blink 0.7s infinite" }}>●</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PHASE: RESULT ── */}
        {phase === "result" && result && (
          <div style={{ animation: "fadeUp 0.5s ease" }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: "#FF5C35", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                Post generado ✓
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>
                Listo para publicar en<br />Instagram y TikTok
              </h2>
            </div>

            {/* Tip IA */}
            {result.tip_ia && (
              <div style={{
                display: "flex", gap: 10, background: "#FF5C3508",
                border: "1px solid #FF5C3525", borderRadius: 12, padding: "12px 16px", marginBottom: 20,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                <span style={{ color: "#FF7050", fontSize: 13, lineHeight: 1.5 }}>{result.tip_ia}</span>
              </div>
            )}

            {/* Channel tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { id: "ig", icon: "📸", label: "Instagram", color: IG_COLOR, bg: "#E1306C15" },
                { id: "tk", icon: "🎵", label: "TikTok", color: TK_COLOR, bg: "#69C9D015" },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  flex: 1, padding: "12px", borderRadius: 12, border: "none",
                  background: activeTab === t.id ? t.bg : "#111120",
                  border: `1.5px solid ${activeTab === t.id ? t.color : "#1C1C2E"}`,
                  color: activeTab === t.id ? t.color : "#444",
                  fontSize: 14, fontWeight: 800, cursor: "pointer",
                  fontFamily: "'Syne', sans-serif", transition: "all 0.2s",
                }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Instagram panel */}
            {activeTab === "ig" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                {/* Hook */}
                <div style={{
                  background: "#E1306C10", border: "1px solid #E1306C25",
                  borderRadius: 12, padding: "12px 16px", marginBottom: 14,
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
                }}>
                  <div>
                    <div style={{ color: IG_COLOR, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>🎯 Hook sugerido</div>
                    <div style={{ color: "#ffcfd8", fontSize: 14, fontWeight: 700, fontStyle: "italic" }}>"{result.ig_hook}"</div>
                  </div>
                  <button onClick={() => handleCopy(result.ig_hook, "ig_hook")} style={{
                    padding: "5px 12px", borderRadius: 8, border: "1px solid #E1306C30",
                    background: copied === "ig_hook" ? "#E1306C20" : "transparent",
                    color: copied === "ig_hook" ? IG_COLOR : "#444",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif", flexShrink: 0,
                  }}>{copied === "ig_hook" ? "✓" : "Copiar"}</button>
                </div>

                {/* Caption */}
                <div style={{
                  background: "#111120", border: "1.5px solid #1C1C2E",
                  borderRadius: 16, padding: "18px", marginBottom: 14,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #FF5C35, #FF8050)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🍕</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800 }}>La Pizzería de Roberto</div>
                        <div style={{ color: "#333", fontSize: 10 }}>@pizzeriaroberto</div>
                      </div>
                    </div>
                    <button onClick={() => handleCopy(result.ig_caption + "\n\n" + result.hashtags_ig.join(" "), "ig_caption")} style={{
                      padding: "6px 14px", borderRadius: 8, border: `1px solid ${copied === "ig_caption" ? IG_COLOR : "#1C1C2E"}`,
                      background: copied === "ig_caption" ? "#E1306C15" : "transparent",
                      color: copied === "ig_caption" ? IG_COLOR : "#444",
                      fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif",
                    }}>{copied === "ig_caption" ? "✓ Copiado" : "Copiar todo"}</button>
                  </div>
                  <p style={{ color: "#bbb", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", minHeight: 60 }}>
                    {igDisplayed}
                    {!igDone && <span style={{ animation: "blink 0.7s infinite", color: IG_COLOR }}>|</span>}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                    {result.hashtags_ig?.map((h, i) => (
                      <span key={i} style={{
                        background: "#E1306C10", border: "1px solid #E1306C25",
                        color: IG_COLOR, fontSize: 12, fontWeight: 700,
                        padding: "3px 10px", borderRadius: 100,
                      }}>{h.startsWith("#") ? h : "#" + h}</span>
                    ))}
                  </div>
                </div>

                {/* Best time */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#111120", border: "1px solid #1C1C2E",
                  borderRadius: 12, padding: "12px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>⏰</span>
                    <div>
                      <div style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>Mejor momento para publicar</div>
                      <div style={{ color: "#444", fontSize: 11 }}>Basado en tu audiencia en Instagram</div>
                    </div>
                  </div>
                  <div style={{
                    background: "#E1306C15", border: "1px solid #E1306C30",
                    borderRadius: 8, padding: "6px 12px",
                    color: IG_COLOR, fontWeight: 800, fontSize: 13,
                  }}>{result.mejor_horario_ig}</div>
                </div>
              </div>
            )}

            {/* TikTok panel */}
            {activeTab === "tk" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                {/* Hook video */}
                <div style={{
                  background: "#69C9D010", border: "1px solid #69C9D025",
                  borderRadius: 12, padding: "12px 16px", marginBottom: 14,
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
                }}>
                  <div>
                    <div style={{ color: TK_COLOR, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>🎬 Hook para los primeros 2 segundos</div>
                    <div style={{ color: "#c8f4f4", fontSize: 14, fontWeight: 700, fontStyle: "italic" }}>"{result.tk_hook}"</div>
                  </div>
                  <button onClick={() => handleCopy(result.tk_hook, "tk_hook")} style={{
                    padding: "5px 12px", borderRadius: 8, border: "1px solid #69C9D030",
                    background: copied === "tk_hook" ? "#69C9D020" : "transparent",
                    color: copied === "tk_hook" ? TK_COLOR : "#444",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif", flexShrink: 0,
                  }}>{copied === "tk_hook" ? "✓" : "Copiar"}</button>
                </div>

                {/* TikTok mockup */}
                <div style={{
                  background: "#111120", border: "1.5px solid #1C1C2E",
                  borderRadius: 16, padding: "18px", marginBottom: 14,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #FF5C35, #FF8050)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🍕</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800 }}>@pizzeriaroberto</div>
                        <div style={{ color: "#333", fontSize: 10 }}>Siguiendo</div>
                      </div>
                    </div>
                    <button onClick={() => handleCopy(result.tk_caption + "\n\n" + result.hashtags_tk.join(" "), "tk_caption")} style={{
                      padding: "6px 14px", borderRadius: 8, border: `1px solid ${copied === "tk_caption" ? TK_COLOR : "#1C1C2E"}`,
                      background: copied === "tk_caption" ? "#69C9D015" : "transparent",
                      color: copied === "tk_caption" ? TK_COLOR : "#444",
                      fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif",
                    }}>{copied === "tk_caption" ? "✓ Copiado" : "Copiar todo"}</button>
                  </div>

                  {/* Video placeholder */}
                  <div style={{
                    background: "#0D0D1C", borderRadius: 12, height: 140,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    marginBottom: 14, border: "1px dashed #1C1C2E", gap: 8,
                  }}>
                    <span style={{ fontSize: 36 }}>🎬</span>
                    <div style={{ color: "#333", fontSize: 12 }}>Video de 15-30 segundos</div>
                    <div style={{ color: "#252535", fontSize: 11 }}>Mostrá el proceso de tu pizza</div>
                  </div>

                  <p style={{ color: "#bbb", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", minHeight: 40 }}>
                    {tkDisplayed}
                    {!tkDone && <span style={{ animation: "blink 0.7s infinite", color: TK_COLOR }}>|</span>}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                    {result.hashtags_tk?.map((h, i) => (
                      <span key={i} style={{
                        background: "#69C9D010", border: "1px solid #69C9D025",
                        color: TK_COLOR, fontSize: 12, fontWeight: 700,
                        padding: "3px 10px", borderRadius: 100,
                      }}>{h.startsWith("#") ? h : "#" + h}</span>
                    ))}
                  </div>
                </div>

                {/* Best time TK */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#111120", border: "1px solid #1C1C2E",
                  borderRadius: 12, padding: "12px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>⏰</span>
                    <div>
                      <div style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>Mejor momento para publicar</div>
                      <div style={{ color: "#444", fontSize: 11 }}>Basado en tu audiencia en TikTok</div>
                    </div>
                  </div>
                  <div style={{
                    background: "#69C9D015", border: "1px solid #69C9D030",
                    borderRadius: 8, padding: "6px 12px",
                    color: TK_COLOR, fontWeight: 800, fontSize: 13,
                  }}>{result.mejor_horario_tk}</div>
                </div>
              </div>
            )}

            {/* Publish button */}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button style={{
                flex: 1, padding: "15px", borderRadius: 14, border: "none",
                background: "linear-gradient(135deg, #FF5C35, #FF8050)",
                color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer",
                fontFamily: "'Syne', sans-serif", boxShadow: "0 8px 24px #FF5C3440",
              }}>
                🚀 Publicar ahora en ambos canales
              </button>
              <button style={{
                padding: "15px 18px", borderRadius: 14,
                border: "1px solid #1C1C2E", background: "#111120",
                color: "#555", fontSize: 14, cursor: "pointer",
                fontFamily: "'Syne', sans-serif",
              }}>⏰</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
