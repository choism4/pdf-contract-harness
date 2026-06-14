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

const VW = 1280;
const VH = 720;
const DW = 620;
const DH = Math.round((DW * 1684) / 1191); // ≈ 877

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

// the loose field we point at, copy, paste & fix — right column
const TARGET = FIELDS.find((f) => /account/i.test(f.label))!;

// ── beats ───────────────────────────────────────────────
const CMD = `claude "find & label every fillable field, then place it precisely"`;
const CMD_START = 16;
const CMD_CPS = 2.0;
const CMD_DONE = CMD_START + Math.ceil(CMD.length / CMD_CPS);

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

// point → callout → right-click → copy → paste+instruction → snap
const POINT_ZOOM = LAST_DROP + 16;
const CUR_ARRIVE = POINT_ZOOM + 18;
const CALLOUT_S = CUR_ARRIVE + 2;
const RCLICK = CALLOUT_S + 18;
const MENU_OPEN = RCLICK + 4;
const COPY_CLICK = MENU_OPEN + 24;
const STREAM_S = COPY_CLICK + 8;
const STREAM_DUR = 30;
const STREAM_E = STREAM_S + STREAM_DUR;

const PASTE_CMD = `claude "this one's off — snap it onto the underline"`;
const PASTE_S = STREAM_E + 8;
const PASTE_CPS = 2.2;
const PASTE_DONE = PASTE_S + Math.ceil(PASTE_CMD.length / PASTE_CPS);
const PASTE_BBOX_AT = PASTE_DONE + 4; // pasted coords pop in

const FIX_S = PASTE_BBOX_AT + 10;
const FIX_E = FIX_S + 26;
const CALLOUT_E = FIX_E;

const VAL_S = FIX_E + 12;
const VAL_STEP = 2;
const VAL_DUR = 10;
const OUT_S = VAL_S + FIELDS.length * VAL_STEP + 16;
const CONFIRM_AT = OUT_S + 18;
const CAP_AT = CONFIRM_AT + 10;

// ── camera shots ────────────────────────────────────────
type Shot = { f: number; cx: number; cy: number; z: number };
const E = Easing.bezier(0.45, 0, 0.12, 1);
const tgtCx = (TARGET.bbox_norm[0] + TARGET.bbox_norm[2]) / 2 * DW;
const tgtCy = (TARGET.bbox_norm[1] + TARGET.bbox_norm[3]) / 2 * DH;
const SHOTS: Shot[] = [
  { f: 0, cx: DW / 2, cy: DH / 2, z: 0.82 },
  { f: HUD_T0, cx: DW / 2, cy: DH / 2, z: 0.82 },
  { f: HUD_T1, cx: DW / 2, cy: 0.34 * DH, z: 1.18 },
  { f: READ_S, cx: DW / 2, cy: 0.3 * DH, z: 1.5 },
  { f: READ_E, cx: DW / 2, cy: 0.3 * DH, z: 1.5 },
  { f: TOP_DROP - 4, cx: DW / 2, cy: 0.155 * DH, z: 1.72 },
  { f: TOP_DROP + TOP.length * TOP_BEAT + 6, cx: DW / 2, cy: 0.155 * DH, z: 1.72 },
  { f: BLOCK_DROP + 8, cx: 0.5 * DW, cy: 0.62 * DH, z: 1.42 },
  { f: LAST_DROP + 6, cx: 0.5 * DW, cy: 0.62 * DH, z: 1.42 },
  { f: POINT_ZOOM, cx: tgtCx, cy: tgtCy, z: 2.0 },
  { f: FIX_E + 6, cx: tgtCx, cy: tgtCy, z: 2.0 },
  { f: OUT_S, cx: DW / 2, cy: DH / 2, z: 0.82 },
  { f: DURATION, cx: DW / 2, cy: DH / 2, z: 0.8 },
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
const mkProj = (cam: { cx: number; cy: number; z: number }) => (wx: number, wy: number) => ({
  x: (wx - cam.cx) * cam.z + VW / 2,
  y: (wy - cam.cy) * cam.z + VH / 2,
});

function rectWorld(f: F, frame: number, fps: number) {
  let [nx0, ny0, nx1] = f.bbox_norm;
  const ny1 = f.bbox_norm[3];
  let x = nx0 * DW, y = ny0 * DH, w = (nx1 - nx0) * DW;
  const h = (ny1 - ny0) * DH;
  if (f === TARGET) {
    const goodX = x, goodW = w, goodY = y;
    const wrongX = x + 22, wrongW = w * 0.4, wrongY = y + 9;
    const sp = spring({ frame: frame - FIX_S, fps, config: { damping: 14, stiffness: 220, mass: 0.5 } });
    if (frame < FIX_S) { x = wrongX; w = wrongW; y = wrongY; }
    else { x = interpolate(sp, [0, 1], [wrongX, goodX]); w = interpolate(sp, [0, 1], [wrongW, goodW]); y = interpolate(sp, [0, 1], [wrongY, goodY]); }
  }
  return { x, y, w, h };
}

const COPY_TEXT =
  `📋 copied → clipboard\n` +
  `{ "${TARGET.label}": bbox_norm [${TARGET.bbox_norm.map((n) => n.toFixed(3)).join(", ")}] }`;
const PASTE_BBOX = `  ⎘ bbox_norm [${TARGET.bbox_norm.map((n) => n.toFixed(3)).join(", ")}]`;

// ── component ───────────────────────────────────────────
export const HeroAnim: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = camera(frame);
  const proj = mkProj(cam);
  const docVisible = frame >= HUD_T0 - 2;

  // intro EXTREME zoom on the terminal prompt → pulls back
  const intro = spring({ frame, fps, config: { damping: 200 } });
  const termZoom = interpolate(intro, [0, 1], [4.2, 1]);

  const t = kf(frame, [HUD_T0, HUD_T1], [0, 1]);
  const term = {
    x: interpolate(t, [0, 1], [276, 40]),
    y: interpolate(t, [0, 1], [150, 360]),
    w: interpolate(t, [0, 1], [728, 478]),
    h: interpolate(t, [0, 1], [420, 332]),
  };

  const cmdChars = Math.max(0, Math.min(CMD.length, Math.floor((frame - CMD_START) * CMD_CPS)));
  const cmdTyping = frame >= CMD_START && cmdChars < CMD.length;
  const caretOn = Math.floor(frame / 8) % 2 === 0;

  const scanP = kf(frame, [READ_S, READ_E], [0, 1]);
  const scanOn = frame >= READ_S - 2 && frame <= READ_E + 4 && docVisible;

  const tgtR = rectWorld(TARGET, frame, fps);
  const tgtPt = proj(tgtR.x + tgtR.w + 6, tgtR.y + tgtR.h / 2);

  const cursorX = interpolate(
    frame,
    [POINT_ZOOM + 6, CUR_ARRIVE, RCLICK, COPY_CLICK, FIX_E, FIX_E + 18],
    [VW + 40, tgtPt.x + 8, tgtPt.x + 8, tgtPt.x + 70, tgtPt.x + 70, VW + 40],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: E },
  );
  const cursorY = interpolate(
    frame,
    [POINT_ZOOM + 6, CUR_ARRIVE, RCLICK, COPY_CLICK, FIX_E, FIX_E + 18],
    [VH + 40, tgtPt.y, tgtPt.y, tgtPt.y + 58, tgtPt.y + 58, VH + 40],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: E },
  );
  const cursorShow = frame >= POINT_ZOOM + 6 && frame <= FIX_E + 18;

  const menuSp = spring({ frame: frame - MENU_OPEN, fps, config: { damping: 16, stiffness: 200 } });
  const menuVis = frame >= MENU_OPEN && frame < COPY_CLICK + 4;
  const streamChars = Math.max(0, Math.min(COPY_TEXT.length, Math.floor((frame - STREAM_S) * 2.6)));
  const pasteChars = Math.max(0, Math.min(PASTE_CMD.length, Math.floor((frame - PASTE_S) * PASTE_CPS)));
  const pasteTyping = frame >= PASTE_S && pasteChars < PASTE_CMD.length;

  const calloutSp = spring({ frame: frame - CALLOUT_S, fps, config: { damping: 12, stiffness: 200 } });
  const calloutVis = frame >= CALLOUT_S && frame <= CALLOUT_E + 6;
  const calloutOut = kf(frame, [CALLOUT_E, CALLOUT_E + 6], [1, 0]);

  return (
    <AbsoluteFill style={{ background: "#0a0b0d", fontFamily: SANS }}>
      <AbsoluteFill style={{ background: "#eef0f3", opacity: kf(frame, [HUD_T0 - 6, HUD_T1], [0, 1]) }} />

      <div style={{ position: "absolute", left: 48, top: 34, fontSize: 21, fontWeight: 700, letterSpacing: -0.4, color: "#1d1d1f", opacity: kf(frame, [HUD_T0, HUD_T1], [0, 1]) }}>
        pdf-contract-harness
        <span style={{ color: "#8a8f98", fontWeight: 500, fontSize: 14, marginLeft: 12 }}>deterministic field extraction</span>
      </div>

      {/* document */}
      {docVisible && (() => {
        const o = proj(0, 0);
        const docIn = spring({ frame: frame - (HUD_T0 - 2), fps, config: { damping: 200 } });
        return (
          <>
            <div style={{ position: "absolute", left: o.x - 12, top: o.y - 12, width: DW * cam.z + 24, height: DH * cam.z + 24, background: "#fff", borderRadius: 16, boxShadow: "0 50px 110px rgba(20,22,28,.30)", opacity: docIn }} />
            <Img src={staticFile("contract.png")} style={{ position: "absolute", left: o.x, top: o.y, width: DW * cam.z, height: DH * cam.z, opacity: docIn }} />
            {scanOn && (() => {
              const yb = proj(0, (0.17 + 0.45 * scanP) * DH).y;
              return <div style={{ position: "absolute", left: o.x + 10, top: yb - 13, width: DW * cam.z - 20, height: 26, background: "linear-gradient(90deg,rgba(10,102,214,0),rgba(10,102,214,.26) 30%,rgba(10,102,214,.32) 50%,rgba(10,102,214,.26) 70%,rgba(10,102,214,0))", borderRadius: 7, boxShadow: "0 0 22px rgba(10,102,214,.4)" }} />;
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
          const ty = interpolate(sp, [0, 1], [-26, 0]);
          const op = kf(frame, [s, s + 3], [0, 1]);
          const color = TYPE_COLOR[f.type] || "#0a66d6";
          const val = displayValue(f);
          const vs = VAL_S + FIELDS.indexOf(f) * VAL_STEP;
          const vChars = Math.max(0, Math.min(val.length, Math.floor(((frame - vs) / VAL_DUR) * val.length)));
          const labelOp = kf(sp, [0.3, 1], [0, 1]) * (val ? kf(frame, [vs + VAL_DUR * 0.3, vs + VAL_DUR], [1, 0]) : 1);
          return (
            <React.Fragment key={f.id}>
              <div style={{ position: "absolute", left: p.x, top: p.y, width: sw, height: sh, border: `${Math.max(1.4, cam.z)}px solid ${color}`, background: `${color}16`, borderRadius: 3, opacity: op, transform: `translateY(${ty}px) scale(${sc})`, transformOrigin: "center", boxShadow: `0 ${4 + (1 - sp) * 14}px ${8 + (1 - sp) * 20}px rgba(10,30,80,${0.04 + (1 - sp) * 0.12})` }} />
              <div style={{ position: "absolute", left: p.x, top: p.y - 15, fontSize: 11, fontWeight: 700, color: "#fff", background: color, padding: "1px 6px", borderRadius: 5, opacity: labelOp, whiteSpace: "nowrap" }}>{f.label}</div>
              {val && frame >= vs && (
                <div style={{ position: "absolute", left: p.x + 4, top: p.y, height: sh, display: "flex", alignItems: "center", fontFamily: f.type === "signature" ? '"Snell Roundhand",cursive' : SANS, fontSize: f.type === "signature" ? Math.max(13, sh * 0.85) : Math.max(8, sh * 0.62), fontStyle: f.type === "signature" ? "italic" : "normal", fontWeight: f.type === "signature" ? 600 : 500, color: "#0b57b2", whiteSpace: "nowrap" }}>{val.slice(0, vChars)}</div>
              )}
            </React.Fragment>
          );
        })}

      {/* Confirmed pill */}
      {frame >= CONFIRM_AT && docVisible && (() => {
        const sp = spring({ frame: frame - CONFIRM_AT, fps, config: { damping: 12, stiffness: 200 } });
        const o = proj(8, 12);
        return <div style={{ position: "absolute", left: o.x, top: o.y, transform: `scale(${interpolate(sp, [0, 1], [0.5, 1])})`, transformOrigin: "left top", background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 700, padding: "5px 12px", borderRadius: 999, boxShadow: "0 8px 22px rgba(22,163,74,.45)" }}>✓ Confirmed → export.json</div>;
      })()}

      {/* context menu */}
      {menuVis && (() => {
        const items = ["Add field here", "Copy location  ⌘C", "Copy field info", "Delete"];
        const hi = frame >= COPY_CLICK - 14 ? 1 : -1;
        return (
          <div style={{ position: "absolute", left: tgtPt.x + 6, top: tgtPt.y + 6, transform: `scale(${interpolate(menuSp, [0, 1], [0.7, 1])})`, transformOrigin: "left top", background: "rgba(255,255,255,.98)", borderRadius: 11, boxShadow: "0 18px 50px rgba(0,0,0,.28)", border: "1px solid #e3e5ea", padding: 6, width: 210, fontSize: 13.5 }}>
            {items.map((it, i) => (
              <div key={i} style={{ padding: "7px 12px", borderRadius: 7, color: i === hi ? "#fff" : i === 3 ? "#d23" : "#1d1d1f", background: i === hi ? "#0a66d6" : "transparent", fontWeight: i === hi ? 600 : 400 }}>{it}</div>
            ))}
          </div>
        );
      })()}

      {/* click pulses */}
      {[RCLICK, COPY_CLICK].map((tk, k) => {
        const p = kf(frame, [tk, tk + 11], [0, 1]);
        if (frame < tk || frame > tk + 12) return null;
        const cx = k === 0 ? tgtPt.x + 8 : tgtPt.x + 70;
        const cy = k === 0 ? tgtPt.y : tgtPt.y + 58;
        return <div key={k} style={{ position: "absolute", left: cx - 24, top: cy - 24, width: 48, height: 48, borderRadius: 999, border: "2.5px solid #0a66d6", opacity: 1 - p, transform: `scale(${0.4 + p})` }} />;
      })}

      {/* callout */}
      {calloutVis && (
        <div style={{ position: "absolute", left: tgtPt.x - 250, top: tgtPt.y - 64, transform: `scale(${interpolate(calloutSp, [0, 1], [0.4, 1])})`, transformOrigin: "right bottom", opacity: calloutOut }}>
          <div style={{ background: "#1d1d1f", color: "#fff", fontSize: 17, fontWeight: 700, padding: "9px 16px", borderRadius: 13, boxShadow: "0 12px 30px rgba(0,0,0,.3)", whiteSpace: "nowrap" }}>Fix this one ✦</div>
          <div style={{ position: "absolute", right: 22, bottom: -7, width: 15, height: 15, background: "#1d1d1f", transform: "rotate(45deg)", borderRadius: 3 }} />
        </div>
      )}

      {cursorShow && (
        <svg width="26" height="30" viewBox="0 0 26 30" style={{ position: "absolute", left: cursorX, top: cursorY, filter: "drop-shadow(0 3px 5px rgba(0,0,0,.4))" }}>
          <path d="M2 2 L2 22 L8 17 L12 26 L16 24 L12 15 L20 15 Z" fill="#fff" stroke="#1d1d1f" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )}

      {/* terminal (extreme-zoom intro → hero → hud) */}
      <div style={{ position: "absolute", left: term.x, top: term.y, width: term.w, height: term.h, background: "rgba(12,13,16,.97)", borderRadius: 15, border: "1px solid #20232b", boxShadow: "0 30px 70px rgba(0,0,0,.45)", overflow: "hidden", transform: `scale(${termZoom})`, transformOrigin: "44px 64px" }}>
        <div style={{ height: 36, display: "flex", alignItems: "center", paddingLeft: 15, gap: 7, borderBottom: "1px solid #1b1e25" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c }} />)}
          <div style={{ color: "#6b7280", fontSize: 12, fontFamily: MONO, marginLeft: 10 }}>claude-code — employment-contract</div>
        </div>
        <div style={{ padding: "13px 16px", fontFamily: MONO, fontSize: 12.5, lineHeight: "18px", color: "#e6e8ec" }}>
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <span style={{ color: "#9aa4b2" }}>❯ </span>{CMD.slice(0, cmdChars)}{cmdTyping && <span style={{ opacity: caretOn ? 1 : 0 }}>▋</span>}
          </div>
          {hud("⏺ reading source.pdf · digital text layer", READ_S - 6, frame, "#c6cbd4")}
          {hud("⏺ 68 vector paths → 16 fields placed", READ_E - 4, frame, "#c6cbd4")}
          {/* copied location */}
          {frame >= STREAM_S && (
            <div style={{ marginTop: 6, color: "#8ab4ff", whiteSpace: "pre-wrap" }}>{COPY_TEXT.slice(0, streamChars)}</div>
          )}
          {/* pasted instruction prompt */}
          {frame >= PASTE_S && (
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
              <span style={{ color: "#9aa4b2" }}>❯ </span>{PASTE_CMD.slice(0, pasteChars)}{pasteTyping && <span style={{ opacity: caretOn ? 1 : 0 }}>▋</span>}
            </div>
          )}
          {frame >= PASTE_BBOX_AT && <div style={{ color: "#6ee7b7" }}>{PASTE_BBOX}</div>}
          {hud(`✎ ${TARGET.label} — snapped onto the underline ✓`, FIX_S + 4, frame, "#febc2e")}
          {hud(`⏺ confirmed · wrote export.json (${FIELDS.length} fields)`, CONFIRM_AT - 4, frame, "#28c840", true)}
        </div>
      </div>

      {/* caption */}
      {(() => {
        const op = kf(frame, [CAP_AT, CAP_AT + 12], [0, 1]);
        return <div style={{ position: "absolute", left: 42, top: 320, opacity: op, fontSize: 18, fontWeight: 700, color: "#1d1d1f" }}>Pinpoint every field. <span style={{ color: "#0a66d6" }}>Export exact coordinates.</span></div>;
      })()}
    </AbsoluteFill>
  );
};

const hud = (text: string, s: number, frame: number, color: string, bold = false) => {
  if (frame < s) return null;
  const op = interpolate(frame, [s, s + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ty = interpolate(frame, [s, s + 6], [6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ marginTop: 6, opacity: op, transform: `translateY(${ty}px)`, color, fontWeight: bold ? 700 : 400 }}>{text}</div>;
};
