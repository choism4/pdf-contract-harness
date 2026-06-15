import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Easing,
} from "remotion";
import fieldsDoc from "./fields.json";

export const FPS = 30;
export const DURATION = 640;

// PORTRAIT 4:5 — fills a phone screen; everything reads big on mobile.
export const VW = 1080;
export const VH = 1350;
const DW = 720;
const DH = Math.round((DW * 1684) / 1191); // ≈ 1018

const TYPE_COLOR: Record<string, string> = { text: "#0a66d6", checkbox: "#16a34a", signature: "#a21caf" };
const MONO = '"SF Mono","JetBrains Mono","Fira Code",Menlo,Consolas,monospace';
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';

type F = { id: string; label: string; type: string; example?: string; bbox_norm: number[]; bbox_pt?: number[]; page?: number };
const FIELDS: F[] = (fieldsDoc.fields as F[]).filter((f) => f.page === 0);
const displayValue = (f: F) =>
  f.type === "signature" ? (f.label.toLowerCase().includes("employee") ? "John Doe" : "A. Manager") : f.example || "";

const byY = [...FIELDS].sort((a, b) => a.bbox_norm[1] - b.bbox_norm[1]);
const TOP = byY.filter((f) => f.bbox_norm[1] < 0.3);
const BLOCK = byY.filter((f) => f.bbox_norm[1] >= 0.3);
const TARGET = FIELDS.find((f) => /account/i.test(f.label))!;

// ── beats ───────────────────────────────────────────────
const CMD = `claude "find & label every\nfillable field, then place it"`;
const CMD_PLAIN = CMD.replace("\n", " ");
const CMD_START = 16;
const CMD_CPS = 2.0;
const CMD_DONE = CMD_START + Math.ceil(CMD_PLAIN.length / CMD_CPS);

const HUD_T0 = CMD_DONE + 16;
const HUD_T1 = HUD_T0 + 26;

const READ_S = HUD_T1 + 6;
const READ_E = READ_S + 38;

const TOP_DROP = READ_E + 24;
const TOP_BEAT = 9;
const BLOCK_DROP = TOP_DROP + TOP.length * TOP_BEAT + 28;
const BLOCK_BEAT = 7;
const dropFrame = (f: F) => {
  const ti = TOP.indexOf(f);
  return ti >= 0 ? TOP_DROP + ti * TOP_BEAT : BLOCK_DROP + BLOCK.indexOf(f) * BLOCK_BEAT;
};
const LAST_DROP = BLOCK_DROP + (BLOCK.length - 1) * BLOCK_BEAT;

const POINT_ZOOM = LAST_DROP + 16;
const CUR_ARRIVE = POINT_ZOOM + 18;
const CALLOUT_S = CUR_ARRIVE + 2;
const RCLICK = CALLOUT_S + 18;
const MENU_OPEN = RCLICK + 4;
const COPY_CLICK = MENU_OPEN + 24;
const STREAM_S = COPY_CLICK + 8;
const STREAM_DUR = 30;
const STREAM_E = STREAM_S + STREAM_DUR;

const PASTE_CMD = `claude "this one's off —\nsnap it onto the underline"`;
const PASTE_PLAIN = PASTE_CMD.replace("\n", " ");
const PASTE_S = STREAM_E + 8;
const PASTE_CPS = 2.2;
const PASTE_DONE = PASTE_S + Math.ceil(PASTE_PLAIN.length / PASTE_CPS);
const PASTE_BBOX_AT = PASTE_DONE + 4;

const FIX_S = PASTE_BBOX_AT + 10;
const FIX_E = FIX_S + 26;
const CALLOUT_E = FIX_E;

const VAL_S = FIX_E + 12;
const VAL_STEP = 2;
const VAL_DUR = 10;
const OUT_S = VAL_S + FIELDS.length * VAL_STEP + 16;
const CONFIRM_AT = OUT_S + 18;
const CAP_AT = CONFIRM_AT + 10;

// ── camera ──────────────────────────────────────────────
type Shot = { f: number; cx: number; cy: number; z: number };
const E = Easing.bezier(0.45, 0, 0.12, 1);
const tgtCx = (TARGET.bbox_norm[0] + TARGET.bbox_norm[2]) / 2 * DW;
const tgtCy = (TARGET.bbox_norm[1] + TARGET.bbox_norm[3]) / 2 * DH;
const SHOTS: Shot[] = [
  { f: 0, cx: DW / 2, cy: 0.2 * DH, z: 1.4 },
  { f: HUD_T0, cx: DW / 2, cy: 0.2 * DH, z: 1.4 },
  { f: HUD_T1, cx: DW / 2, cy: 0.28 * DH, z: 1.8 },
  { f: READ_S, cx: DW / 2, cy: 0.28 * DH, z: 2.0 },
  { f: READ_E, cx: DW / 2, cy: 0.28 * DH, z: 2.0 },
  // top fields (Employer/Employee names) span full width → fit width
  { f: TOP_DROP - 4, cx: DW / 2, cy: 0.15 * DH, z: 1.5 },
  { f: TOP_DROP + TOP.length * TOP_BEAT + 6, cx: DW / 2, cy: 0.15 * DH, z: 1.5 },
  // employee block has two columns → keep both visible
  { f: BLOCK_DROP + 6, cx: 0.5 * DW, cy: 0.5 * DH, z: 1.68 },
  { f: (BLOCK_DROP + LAST_DROP) / 2, cx: 0.5 * DW, cy: 0.6 * DH, z: 1.68 },
  { f: LAST_DROP + 6, cx: 0.5 * DW, cy: 0.7 * DH, z: 1.68 },
  // single loose field → can go closer
  { f: POINT_ZOOM, cx: tgtCx, cy: tgtCy, z: 2.5 },
  { f: FIX_E + 6, cx: tgtCx, cy: tgtCy, z: 2.5 },
  { f: OUT_S, cx: DW / 2, cy: 0.42 * DH, z: 1.16 },
  { f: DURATION, cx: DW / 2, cy: 0.42 * DH, z: 1.12 },
];
function camera(frame: number) {
  const fs = SHOTS.map((s) => s.f);
  const o = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: E } as const;
  return {
    cx: interpolate(frame, fs, SHOTS.map((s) => s.cx), o),
    cy: interpolate(frame, fs, SHOTS.map((s) => s.cy), o),
    z: interpolate(frame, fs, SHOTS.map((s) => s.z), o),
  };
}
const kf = (frame: number, a: number[], b: number[]) =>
  interpolate(frame, a, b, { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
// focus the doc in the UPPER region; terminal lives in the lower band → no overlap
const VCY = 372;
const mkProj = (cam: { cx: number; cy: number; z: number }) => (wx: number, wy: number) => ({
  x: (wx - cam.cx) * cam.z + VW / 2,
  y: (wy - cam.cy) * cam.z + VCY,
});

function rectWorld(f: F, frame: number, fps: number) {
  let [nx0, ny0, nx1] = f.bbox_norm;
  const ny1 = f.bbox_norm[3];
  let x = nx0 * DW, y = ny0 * DH, w = (nx1 - nx0) * DW;
  const h = (ny1 - ny0) * DH;
  if (f === TARGET) {
    const goodX = x, goodW = w, goodY = y;
    const wrongX = x + 26, wrongW = w * 0.4, wrongY = y + 11;
    const sp = spring({ frame: frame - FIX_S, fps, config: { damping: 14, stiffness: 220, mass: 0.5 } });
    if (frame < FIX_S) { x = wrongX; w = wrongW; y = wrongY; }
    else { x = interpolate(sp, [0, 1], [wrongX, goodX]); w = interpolate(sp, [0, 1], [wrongW, goodW]); y = interpolate(sp, [0, 1], [wrongY, goodY]); }
  }
  return { x, y, w, h };
}

const COPY_TEXT =
  `📋 copied → clipboard\n{ "${TARGET.label}":\n  bbox_norm [${TARGET.bbox_norm.map((n) => n.toFixed(3)).join(", ")}] }`;
const PASTE_BBOX = `  ⎘ [${TARGET.bbox_norm.map((n) => n.toFixed(3)).join(", ")}]`;

// ── component ───────────────────────────────────────────
export const HeroAnim: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = camera(frame);
  const proj = mkProj(cam);
  const docVisible = frame >= HUD_T0 - 2;

  // intro EXTREME zoom into the prompt → pulls back
  const intro = spring({ frame, fps, config: { damping: 200 } });
  const termZoom = interpolate(intro, [0, 1], [5.5, 1]);

  const t = kf(frame, [HUD_T0, HUD_T1], [0, 1]);
  // hero: big centered terminal · hud: wide panel pinned to the bottom
  const term = {
    x: interpolate(t, [0, 1], [70, 36]),
    y: interpolate(t, [0, 1], [300, 772]),
    w: interpolate(t, [0, 1], [940, 1008]),
    h: interpolate(t, [0, 1], [560, 552]),
  };
  const termFont = interpolate(t, [0, 1], [31, 20]);
  const termLH = termFont * 1.42;
  // pop the terminal larger during the copy → paste beat so the JSON reads
  const focus = frame >= STREAM_S - 8 && frame <= FIX_E + 8
    ? interpolate(spring({ frame: frame - (STREAM_S - 8), fps, config: { damping: 200 } }), [0, 1], [1, 1.16]) *
      (frame > FIX_E ? interpolate(frame, [FIX_E, FIX_E + 8], [1, 1 / 1.16]) : 1)
    : 1;

  const cmdChars = Math.max(0, Math.min(CMD_PLAIN.length, Math.floor((frame - CMD_START) * CMD_CPS)));
  const cmdTyping = frame >= CMD_START && cmdChars < CMD_PLAIN.length;
  const caretOn = Math.floor(frame / 8) % 2 === 0;

  const scanP = kf(frame, [READ_S, READ_E], [0, 1]);
  const scanOn = frame >= READ_S - 2 && frame <= READ_E + 4 && docVisible;

  const tgtR = rectWorld(TARGET, frame, fps);
  const tgtPt = proj(tgtR.x + tgtR.w + 6, tgtR.y + tgtR.h / 2);

  const cursorX = interpolate(
    frame,
    [POINT_ZOOM + 6, CUR_ARRIVE, RCLICK, COPY_CLICK, FIX_E, FIX_E + 18],
    [VW + 60, tgtPt.x + 10, tgtPt.x + 10, tgtPt.x + 96, tgtPt.x + 96, VW + 60],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: E },
  );
  const cursorY = interpolate(
    frame,
    [POINT_ZOOM + 6, CUR_ARRIVE, RCLICK, COPY_CLICK, FIX_E, FIX_E + 18],
    [VH + 60, tgtPt.y, tgtPt.y, tgtPt.y + 78, tgtPt.y + 78, VH + 60],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: E },
  );
  const cursorShow = frame >= POINT_ZOOM + 6 && frame <= FIX_E + 18;

  const menuSp = spring({ frame: frame - MENU_OPEN, fps, config: { damping: 16, stiffness: 200 } });
  const menuVis = frame >= MENU_OPEN && frame < COPY_CLICK + 4;
  const streamChars = Math.max(0, Math.min(COPY_TEXT.length, Math.floor((frame - STREAM_S) * 2.6)));
  const pasteChars = Math.max(0, Math.min(PASTE_PLAIN.length, Math.floor((frame - PASTE_S) * PASTE_CPS)));
  const pasteTyping = frame >= PASTE_S && pasteChars < PASTE_PLAIN.length;

  const calloutSp = spring({ frame: frame - CALLOUT_S, fps, config: { damping: 12, stiffness: 200 } });
  const calloutVis = frame >= CALLOUT_S && frame <= CALLOUT_E + 6;
  const calloutOut = kf(frame, [CALLOUT_E, CALLOUT_E + 6], [1, 0]);

  const slice = (s: string, n: number) => s.length <= n ? s : s.slice(0, n);

  return (
    <AbsoluteFill style={{ background: "#0a0b0d", fontFamily: SANS }}>
      <AbsoluteFill style={{ background: "#eef0f3", opacity: kf(frame, [HUD_T0 - 6, HUD_T1], [0, 1]) }} />

      <div style={{ position: "absolute", left: 36, top: 32, fontSize: 32, fontWeight: 700, letterSpacing: -0.6, color: "#1d1d1f", opacity: kf(frame, [HUD_T0, HUD_T1], [0, 1]) * kf(frame, [OUT_S - 10, OUT_S], [1, 0]), background: "rgba(255,255,255,0.94)", padding: "12px 18px", borderRadius: 16, boxShadow: "0 8px 26px rgba(20,22,28,.16)" }}>
        pdf-contract-harness
        <div style={{ color: "#8a8f98", fontWeight: 500, fontSize: 20, marginTop: 2 }}>deterministic field extraction</div>
      </div>

      {/* document */}
      {docVisible && (() => {
        const o = proj(0, 0);
        const docIn = spring({ frame: frame - (HUD_T0 - 2), fps, config: { damping: 200 } });
        return (
          <>
            <div style={{ position: "absolute", left: o.x - 14, top: o.y - 14, width: DW * cam.z + 28, height: DH * cam.z + 28, background: "#fff", borderRadius: 18, boxShadow: "0 60px 130px rgba(20,22,28,.32)", opacity: docIn }} />
            <Img src={staticFile("contract.png")} style={{ position: "absolute", left: o.x, top: o.y, width: DW * cam.z, height: DH * cam.z, opacity: docIn }} />
            {scanOn && (() => {
              const yb = proj(0, (0.17 + 0.45 * scanP) * DH).y;
              return <div style={{ position: "absolute", left: o.x + 12, top: yb - 18, width: DW * cam.z - 24, height: 36, background: "linear-gradient(90deg,rgba(10,102,214,0),rgba(10,102,214,.26) 30%,rgba(10,102,214,.32) 50%,rgba(10,102,214,.26) 70%,rgba(10,102,214,0))", borderRadius: 9, boxShadow: "0 0 30px rgba(10,102,214,.4)" }} />;
            })()}
          </>
        );
      })()}

      {/* boxes */}
      {docVisible &&
        FIELDS.map((f) => {
          const s = dropFrame(f);
          if (frame < s) return null;
          const r = rectWorld(f, frame, fps);
          const p = proj(r.x, r.y);
          const sw = r.w * cam.z, sh = r.h * cam.z;
          const sp = spring({ frame: frame - s, fps, config: { damping: 11, stiffness: 190, mass: 0.7 } });
          const sc = interpolate(sp, [0, 1], [0.55, 1]);
          const ty = interpolate(sp, [0, 1], [-34, 0]);
          const op = kf(frame, [s, s + 3], [0, 1]);
          const color = TYPE_COLOR[f.type] || "#0a66d6";
          const val = displayValue(f);
          const vs = VAL_S + FIELDS.indexOf(f) * VAL_STEP;
          const vChars = Math.max(0, Math.min(val.length, Math.floor(((frame - vs) / VAL_DUR) * val.length)));
          const labelOp = kf(sp, [0.3, 1], [0, 1]) * (val ? kf(frame, [vs + VAL_DUR * 0.3, vs + VAL_DUR], [1, 0]) : 1);
          return (
            <React.Fragment key={f.id}>
              <div style={{ position: "absolute", left: p.x, top: p.y, width: sw, height: sh, border: `${Math.max(2, cam.z)}px solid ${color}`, background: `${color}18`, borderRadius: 4, opacity: op, transform: `translateY(${ty}px) scale(${sc})`, transformOrigin: "center", boxShadow: `0 ${5 + (1 - sp) * 18}px ${10 + (1 - sp) * 26}px rgba(10,30,80,${0.05 + (1 - sp) * 0.14})` }} />
              <div style={{ position: "absolute", left: p.x, top: p.y - 27, fontSize: 22, fontWeight: 700, color: "#fff", background: color, padding: "2px 10px", borderRadius: 8, opacity: labelOp, whiteSpace: "nowrap" }}>{f.label}</div>
              {val && frame >= vs && (
                <div style={{ position: "absolute", left: p.x + 6, top: p.y, height: sh, display: "flex", alignItems: "center", fontFamily: f.type === "signature" ? '"Snell Roundhand",cursive' : SANS, fontSize: f.type === "signature" ? Math.max(20, sh * 0.85) : Math.max(13, sh * 0.62), fontStyle: f.type === "signature" ? "italic" : "normal", fontWeight: f.type === "signature" ? 600 : 500, color: "#0b57b2", whiteSpace: "nowrap" }}>{val.slice(0, vChars)}</div>
              )}
            </React.Fragment>
          );
        })}

      {/* Confirmed pill */}
      {frame >= CONFIRM_AT && docVisible && (() => {
        const sp = spring({ frame: frame - CONFIRM_AT, fps, config: { damping: 12, stiffness: 200 } });
        const o = proj(8, 12);
        return <div style={{ position: "absolute", left: o.x, top: o.y, transform: `scale(${interpolate(sp, [0, 1], [0.5, 1])})`, transformOrigin: "left top", background: "#16a34a", color: "#fff", fontSize: 21, fontWeight: 700, padding: "8px 18px", borderRadius: 999, boxShadow: "0 12px 30px rgba(22,163,74,.45)" }}>✓ Confirmed → export.json</div>;
      })()}

      {/* context menu */}
      {menuVis && (() => {
        const items = ["Add field here", "Copy location  ⌘C", "Copy field info", "Delete"];
        const hi = frame >= COPY_CLICK - 14 ? 1 : -1;
        return (
          <div style={{ position: "absolute", left: tgtPt.x + 8, top: tgtPt.y + 8, transform: `scale(${interpolate(menuSp, [0, 1], [0.7, 1])})`, transformOrigin: "left top", background: "rgba(255,255,255,.98)", borderRadius: 15, boxShadow: "0 24px 60px rgba(0,0,0,.3)", border: "1px solid #e3e5ea", padding: 8, width: 300, fontSize: 20 }}>
            {items.map((it, i) => (
              <div key={i} style={{ padding: "11px 16px", borderRadius: 10, color: i === hi ? "#fff" : i === 3 ? "#d23" : "#1d1d1f", background: i === hi ? "#0a66d6" : "transparent", fontWeight: i === hi ? 600 : 400 }}>{it}</div>
            ))}
          </div>
        );
      })()}

      {/* click pulses */}
      {[RCLICK, COPY_CLICK].map((tk, k) => {
        const p = kf(frame, [tk, tk + 11], [0, 1]);
        if (frame < tk || frame > tk + 12) return null;
        const cx = k === 0 ? tgtPt.x + 10 : tgtPt.x + 96;
        const cy = k === 0 ? tgtPt.y : tgtPt.y + 78;
        return <div key={k} style={{ position: "absolute", left: cx - 34, top: cy - 34, width: 68, height: 68, borderRadius: 999, border: "3px solid #0a66d6", opacity: 1 - p, transform: `scale(${0.4 + p})` }} />;
      })}

      {/* callout */}
      {calloutVis && (
        <div style={{ position: "absolute", left: tgtPt.x - 330, top: tgtPt.y - 92, transform: `scale(${interpolate(calloutSp, [0, 1], [0.4, 1])})`, transformOrigin: "right bottom", opacity: calloutOut }}>
          <div style={{ background: "#1d1d1f", color: "#fff", fontSize: 26, fontWeight: 700, padding: "13px 24px", borderRadius: 18, boxShadow: "0 16px 40px rgba(0,0,0,.34)", whiteSpace: "nowrap" }}>Fix this one ✦</div>
          <div style={{ position: "absolute", right: 30, bottom: -9, width: 20, height: 20, background: "#1d1d1f", transform: "rotate(45deg)", borderRadius: 4 }} />
        </div>
      )}

      {cursorShow && (
        <svg width="40" height="46" viewBox="0 0 26 30" style={{ position: "absolute", left: cursorX, top: cursorY, filter: "drop-shadow(0 4px 7px rgba(0,0,0,.42))" }}>
          <path d="M2 2 L2 22 L8 17 L12 26 L16 24 L12 15 L20 15 Z" fill="#fff" stroke="#1d1d1f" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )}

      {/* terminal (extreme-zoom intro → hero → hud) */}
      <div style={{ position: "absolute", left: term.x, top: term.y, width: term.w, height: term.h, background: "rgba(12,13,16,.97)", borderRadius: 20, border: "1px solid #20232b", boxShadow: "0 40px 90px rgba(0,0,0,.5)", overflow: "hidden", transform: `scale(${termZoom * focus})`, transformOrigin: t < 0.5 ? "130px 230px" : "center bottom" }}>
        <div style={{ height: 48, display: "flex", alignItems: "center", paddingLeft: 22, gap: 10, borderBottom: "1px solid #1b1e25" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 15, height: 15, borderRadius: 8, background: c }} />)}
          <div style={{ color: "#6b7280", fontSize: 17, fontFamily: MONO, marginLeft: 14 }}>claude-code — employment-contract</div>
        </div>
        <div style={{ position: "relative", fontFamily: MONO, color: "#e6e8ec" }}>
          {/* SPLASH — real Claude Code welcome (hero) */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "22px 28px", opacity: 1 - t, pointerEvents: "none" }}>
            <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
              <pre style={{ margin: 0, color: "#d97757", fontSize: termFont * 0.92, lineHeight: `${termFont * 1.0}px`, fontWeight: 700 }}>{` ▐▛███▜▌\n▝▜█████▛▘\n  ▘▘ ▝▝`}</pre>
              <div style={{ fontSize: termFont * 0.72, lineHeight: `${termFont * 1.0}px`, paddingTop: 2 }}>
                <div><span style={{ fontWeight: 700 }}>Claude Code</span> <span style={{ color: "#7d828c" }}>v2.1.177</span></div>
                <div style={{ color: "#c6cbd4", marginTop: 4 }}>Opus 4.8 (1M context) · Claude Max</div>
                <div style={{ color: "#7d828c", marginTop: 4 }}>~/src/pdf-contract-writer</div>
              </div>
            </div>
            <div style={{ marginTop: 26, border: "1px solid #2c2f38", borderRadius: 14, padding: "16px 18px", fontSize: termFont, lineHeight: `${termLH}px`, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <span style={{ color: "#9aa4b2" }}>❯ </span>{slice(CMD_PLAIN, cmdChars)}{cmdTyping && <span style={{ opacity: caretOn ? 1 : 0 }}>▋</span>}
            </div>
          </div>

          {/* LOG — after the doc appears (hud) */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "18px 24px", opacity: t, fontSize: termFont, lineHeight: `${termLH}px` }}>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <span style={{ color: "#9aa4b2" }}>❯ </span>{CMD_PLAIN}
            </div>
            {hud("⏺ reading source.pdf · text layer", READ_S - 6, frame, "#c6cbd4")}
            {hud("⏺ 68 vector paths → 16 fields", READ_E - 4, frame, "#c6cbd4")}
            {frame >= STREAM_S && <div style={{ marginTop: 9, color: "#8ab4ff", whiteSpace: "pre-wrap" }}>{COPY_TEXT.slice(0, streamChars)}</div>}
            {frame >= PASTE_S && (
              <div style={{ marginTop: 9, whiteSpace: "pre-wrap" }}>
                <span style={{ color: "#9aa4b2" }}>❯ </span>{slice(PASTE_PLAIN, pasteChars)}{pasteTyping && <span style={{ opacity: caretOn ? 1 : 0 }}>▋</span>}
              </div>
            )}
            {frame >= PASTE_BBOX_AT && <div style={{ color: "#6ee7b7" }}>{PASTE_BBOX}</div>}
            {hud(`✎ ${TARGET.label} — snapped ✓`, FIX_S + 4, frame, "#febc2e")}
            {hud(`⏺ confirmed · wrote export.json`, CONFIRM_AT - 4, frame, "#28c840", true)}
          </div>
        </div>
      </div>

      {/* caption */}
      {(() => {
        const op = kf(frame, [CAP_AT, CAP_AT + 12], [0, 1]);
        const sp = spring({ frame: frame - CAP_AT, fps, config: { damping: 16, stiffness: 200 } });
        return <div style={{ position: "absolute", left: "50%", top: 150, transform: `translateX(-50%) scale(${interpolate(sp, [0, 1], [0.9, 1])})`, opacity: op, background: "#1d1d1f", color: "#fff", fontSize: 38, fontWeight: 800, lineHeight: "50px", textAlign: "center", padding: "26px 40px", borderRadius: 24, boxShadow: "0 20px 60px rgba(0,0,0,.4)", whiteSpace: "nowrap" }}>Pinpoint every field.<br /><span style={{ color: "#5aa0ff" }}>Export exact coordinates.</span></div>;
      })()}
    </AbsoluteFill>
  );
};

const hud = (text: string, s: number, frame: number, color: string, bold = false) => {
  if (frame < s) return null;
  const op = interpolate(frame, [s, s + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ty = interpolate(frame, [s, s + 6], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ marginTop: 9, opacity: op, transform: `translateY(${ty}px)`, color, fontWeight: bold ? 700 : 400 }}>{text}</div>;
};
