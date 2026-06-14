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
export const DURATION = 480;

// ── stage ───────────────────────────────────────────────
const W = 1280;
const H = 720;

// document group (3D, camera-driven). Sits right-of-center.
const DOC = { w: 446, h: 630, left: 540, top: 46 };

// terminal HUD (flat overlay, bottom-left)
const HUD = { x: 44, y: 372, w: 452, h: 300 };

const TYPE_COLOR: Record<string, string> = {
  text: "#0a66d6",
  checkbox: "#16a34a",
  signature: "#a21caf",
};

type F = {
  id: string;
  label: string;
  type: string;
  example?: string;
  bbox_norm: number[];
  page?: number;
};

const FIELDS: F[] = (fieldsDoc.fields as F[]).filter((f) => f.page === 0);

const displayValue = (f: F) =>
  f.type === "signature"
    ? f.label.toLowerCase().includes("employee")
      ? "John Doe"
      : "A. Manager"
    : f.example || "";

const MONO = '"SF Mono","JetBrains Mono","Fira Code",Menlo,Consolas,monospace';
const SANS =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';

// ── timeline ────────────────────────────────────────────
const CMD = `claude "find & label every fillable field, place them precisely"`;
const CMD_START = 8;
const CMD_CPS = 1.9;
const CMD_DONE = CMD_START + Math.ceil(CMD.length / CMD_CPS);

const READ_S = CMD_DONE + 4;   // scan sweep
const READ_E = READ_S + 46;

const TILT_S = READ_E - 8;      // 3D swing in
const TILT_E = TILT_S + 34;

const DROP_S = TILT_E - 6;      // boxes drop on the beat
const BEAT = 8;
const dropAt = (i: number) => DROP_S + i * BEAT;
const DROP_LAST = dropAt(FIELDS.length - 1);

// correction beats (티키타카 — point & fix)
const FIXA = [DROP_LAST + 26, DROP_LAST + 54] as const; // widen "Address"
const FIXB = [FIXA[1] + 12, FIXA[1] + 40] as const;     // nudge "Phone"
const IDX_A = FIELDS.findIndex((f) => /address/i.test(f.label));
const IDX_B = FIELDS.findIndex((f) => /phone/i.test(f.label));

const VAL_S = FIXB[1] + 8;
const VAL_STEP = 3;
const VAL_DUR = 11;

const CONFIRM_AT = VAL_S + FIELDS.length * VAL_STEP + 18;
const CAP_AT = CONFIRM_AT + 14;

// ── helpers ─────────────────────────────────────────────
const kf = (frame: number, ins: number[], outs: number[]) =>
  interpolate(frame, ins, outs, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

// box rect in DOC-local px (before 3D transform), with correction anim
function rect(f: F, i: number, frame: number, fps: number) {
  let [nx0, ny0, nx1, ny1] = f.bbox_norm;
  let x = nx0 * DOC.w;
  let y = ny0 * DOC.h;
  let w = (nx1 - nx0) * DOC.w;
  const h = (ny1 - ny0) * DOC.h;

  if (i === IDX_A) {
    // starts too SHORT, Claude widens it → 착
    const full = w;
    const wrong = w * 0.42;
    const sp = spring({
      frame: frame - FIXA[0],
      fps,
      config: { damping: 13, stiffness: 220, mass: 0.5 },
    });
    w = frame < FIXA[0] ? wrong : interpolate(sp, [0, 1], [wrong, full]);
  }
  if (i === IDX_B) {
    // starts shifted RIGHT + short, Claude snaps it back → 착착
    const goodX = x;
    const goodW = w;
    const wrongX = x + 26;
    const wrongW = w * 0.55;
    const sp = spring({
      frame: frame - FIXB[0],
      fps,
      config: { damping: 12, stiffness: 230, mass: 0.5 },
    });
    if (frame < FIXB[0]) {
      x = wrongX;
      w = wrongW;
    } else {
      x = interpolate(sp, [0, 1], [wrongX, goodX]);
      w = interpolate(sp, [0, 1], [wrongW, goodW]);
    }
  }
  return { x, y, w, h };
}

// approximate on-screen center of a box (camera near-flat by fix time)
function screenPt(f: F, i: number, frame: number, fps: number, cam: Cam) {
  const r = rect(f, i, frame, fps);
  const cx = DOC.left + (r.x + r.w) * cam.s; // toward right edge of field
  const cy = DOC.top + (r.y + r.h / 2) * cam.s;
  // shift for camera translate
  return { x: cx + cam.tx, y: cy + cam.ty };
}

type Cam = { s: number; rx: number; ry: number; tx: number; ty: number };

// piecewise camera with long HOLDS between moves — keeps most frames
// near-identical so only the boxes/values change (tiny GIFs, crisp motion).
const ez = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) } as const;
function camera(frame: number): Cam {
  const s = interpolate(frame, [0, 28, 86, 240, 268, 466, DURATION], [0.84, 1.0, 1.06, 1.06, 1.0, 1.0, 0.97], ez);
  const ry = interpolate(frame, [0, TILT_S, TILT_E, 240, 266, 466, DURATION], [0, 0, -16, -16, -4, -4, 0], ez);
  const rx = interpolate(frame, [0, TILT_S, TILT_E, 240, 266, 466, DURATION], [0, 0, 7, 7, 2, 2, 0], ez);
  const tx = interpolate(frame, [28, 86], [0, -10], ez);
  const ty = interpolate(frame, [28, 86], [0, 6], ez);
  return { s, rx, ry, tx, ty };
}

// ── component ───────────────────────────────────────────
export const HeroAnim: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = camera(frame);

  const cmdChars = Math.max(
    0,
    Math.min(CMD.length, Math.floor((frame - CMD_START) * CMD_CPS)),
  );
  const cmdTyping = frame >= CMD_START && cmdChars < CMD.length;
  const caretOn = Math.floor(frame / 8) % 2 === 0;

  // reading scan sweep (over the clause paragraph band)
  const scanP = kf(frame, [READ_S, READ_E], [0, 1]);
  const scanY = DOC.top + (0.17 + 0.46 * scanP) * DOC.h * cam.s + cam.ty;
  const scanOn = frame >= READ_S && frame <= READ_E + 4;

  // cursor path (screen space)
  const ptA = screenPt(FIELDS[IDX_A], IDX_A, frame, fps, cam);
  const ptB = screenPt(FIELDS[IDX_B], IDX_B, frame, fps, cam);
  const curEnter = FIXA[0] - 24;
  const cursorX = interpolate(
    frame,
    [curEnter, FIXA[0], FIXA[1], FIXB[0], FIXB[1], FIXB[1] + 22],
    [1180, ptA.x + 8, ptA.x + 8, ptB.x + 8, ptB.x + 8, 1220],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) },
  );
  const cursorY = interpolate(
    frame,
    [curEnter, FIXA[0], FIXA[1], FIXB[0], FIXB[1], FIXB[1] + 22],
    [700, ptA.y + 6, ptA.y + 6, ptB.y + 6, ptB.y + 6, 700],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) },
  );
  const cursorShow = frame >= curEnter && frame <= FIXB[1] + 22;
  const clickPulse = (t0: number) => {
    const p = kf(frame, [t0, t0 + 10], [0, 1]);
    return frame >= t0 && frame <= t0 + 12 ? p : -1;
  };

  // callout bubble
  const calloutS = FIXA[0] - 6;
  const calloutE = FIXB[1];
  const callSp = spring({ frame: frame - calloutS, fps, config: { damping: 11, stiffness: 200 } });
  const callOut = kf(frame, [calloutE - 6, calloutE], [1, 0]);
  const calloutVis = frame >= calloutS && frame <= calloutE;

  return (
    <AbsoluteFill
      style={{ background: "#eef0f3", fontFamily: SANS }}
    >
      {/* wordmark */}
      <div style={{ position: "absolute", left: 48, top: 36, fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "#1d1d1f" }}>
        pdf-contract-harness
        <span style={{ color: "#8a8f98", fontWeight: 500, fontSize: 14.5, marginLeft: 12 }}>
          deterministic field extraction
        </span>
      </div>

      {/* ── 3D document stage ── */}
      <div style={{ position: "absolute", inset: 0, perspective: 1500, perspectiveOrigin: "62% 42%" }}>
        <div
          style={{
            position: "absolute",
            left: DOC.left,
            top: DOC.top,
            width: DOC.w,
            height: DOC.h,
            transformStyle: "preserve-3d",
            transform: `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s}) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg)`,
            transformOrigin: "center center",
          }}
        >
          {/* paper card */}
          <div
            style={{
              position: "absolute",
              inset: -10,
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 40px 90px rgba(20,22,28,.28)",
              border: "1px solid #e7e9ee",
            }}
          />
          <Img
            src={staticFile("contract.png")}
            style={{ position: "absolute", inset: 0, width: DOC.w, height: DOC.h, borderRadius: 4 }}
          />

          {/* reading scan highlight (local space) */}
          {scanON_band(frame, scanP, scanOn)}

          {/* boxes (drop on beat, 3D) */}
          {FIELDS.map((f, i) => {
            const s = dropAt(i);
            if (frame < s) return null;
            const r = rect(f, i, frame, fps);
            const sp = spring({
              frame: frame - s,
              fps,
              config: { damping: 11, stiffness: 200, mass: 0.7 },
            });
            const z = interpolate(sp, [0, 1], [220, 0]);
            const ty = interpolate(sp, [0, 1], [-46, 0]);
            const rxb = interpolate(sp, [0, 1], [-32, 0]);
            const op = kf(frame, [s, s + 3], [0, 1]);
            const color = TYPE_COLOR[f.type] || "#0a66d6";

            const val = displayValue(f);
            const vs = VAL_S + i * VAL_STEP;
            const vChars = Math.max(0, Math.min(val.length, Math.floor(((frame - vs) / VAL_DUR) * val.length)));
            const labelPop = kf(sp, [0.2, 1], [0, 1]);
            const labelFade = val ? kf(frame, [vs + VAL_DUR * 0.3, vs + VAL_DUR], [1, 0]) : 1;
            const labelOp = labelPop * labelFade;

            return (
              <div key={f.id} style={{ transformStyle: "preserve-3d" }}>
                <div
                  style={{
                    position: "absolute",
                    left: r.x,
                    top: r.y,
                    width: r.w,
                    height: r.h,
                    border: `1.6px solid ${color}`,
                    background: `${color}16`,
                    borderRadius: 3,
                    opacity: op,
                    transform: `translateZ(${z}px) translateY(${ty}px) rotateX(${rxb}deg)`,
                    boxShadow: `0 ${6 + z / 8}px ${10 + z / 4}px rgba(10,30,80,${0.05 + z / 2600})`,
                  }}
                />
                {/* label tag */}
                <div
                  style={{
                    position: "absolute",
                    left: r.x,
                    top: r.y - 14,
                    fontSize: 8.5,
                    fontWeight: 700,
                    color: "#fff",
                    background: color,
                    padding: "1px 5px",
                    borderRadius: 4,
                    opacity: labelOp,
                    whiteSpace: "nowrap",
                    transform: `translateZ(${z + 1}px)`,
                  }}
                >
                  {f.label}
                </div>
                {/* typed value */}
                {val && frame >= vs && (
                  <div
                    style={{
                      position: "absolute",
                      left: r.x + 3,
                      top: r.y,
                      height: r.h,
                      display: "flex",
                      alignItems: "center",
                      fontFamily: f.type === "signature" ? '"Snell Roundhand",cursive' : SANS,
                      fontSize: f.type === "signature" ? 12 : 8.5,
                      fontStyle: f.type === "signature" ? "italic" : "normal",
                      fontWeight: f.type === "signature" ? 600 : 500,
                      color: "#0b57b2",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {val.slice(0, vChars)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Confirmed pill (rides with the doc) */}
          {frame >= CONFIRM_AT &&
            (() => {
              const sp = spring({ frame: frame - CONFIRM_AT, fps, config: { damping: 12, stiffness: 200 } });
              return (
                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    top: 12,
                    transform: `scale(${interpolate(sp, [0, 1], [0.5, 1])}) translateZ(20px)`,
                    transformOrigin: "left center",
                    background: "#16a34a",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "5px 11px",
                    borderRadius: 999,
                    boxShadow: "0 8px 22px rgba(22,163,74,.45)",
                  }}
                >
                  ✓ Confirmed → export.json
                </div>
              );
            })()}
        </div>
      </div>

      {/* ── cursor + click pulses + callout (screen space) ── */}
      {[FIXA[0] + 2, FIXB[0] + 2].map((t, k) => {
        const p = clickPulse(t);
        if (p < 0) return null;
        const cx = k === 0 ? ptA.x : ptB.x;
        const cy = k === 0 ? ptA.y : ptB.y;
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: cx - 26,
              top: cy - 26,
              width: 52,
              height: 52,
              borderRadius: 999,
              border: "2.5px solid #0a66d6",
              opacity: 1 - p,
              transform: `scale(${0.4 + p * 1.1})`,
            }}
          />
        );
      })}

      {calloutVis && (
        <div
          style={{
            position: "absolute",
            left: cursorX - 188,
            top: cursorY - 70,
            transform: `scale(${interpolate(callSp, [0, 1], [0.4, 1])})`,
            transformOrigin: "right bottom",
            opacity: callOut,
          }}
        >
          <div
            style={{
              background: "#1d1d1f",
              color: "#fff",
              fontSize: 17,
              fontWeight: 700,
              padding: "9px 16px",
              borderRadius: 14,
              boxShadow: "0 12px 30px rgba(0,0,0,.3)",
              whiteSpace: "nowrap",
            }}
          >
            여기 고쳐줘! ✦
          </div>
          <div
            style={{
              position: "absolute",
              right: 22,
              bottom: -7,
              width: 16,
              height: 16,
              background: "#1d1d1f",
              transform: "rotate(45deg)",
              borderRadius: 3,
            }}
          />
        </div>
      )}

      {cursorShow && <Cursor x={cursorX} y={cursorY} />}

      {/* ── terminal HUD ── */}
      <div
        style={{
          position: "absolute",
          left: HUD.x,
          top: HUD.y,
          width: HUD.w,
          height: HUD.h,
          background: "rgba(12,13,16,.96)",
          borderRadius: 14,
          border: "1px solid #20232b",
          boxShadow: "0 24px 60px rgba(20,22,28,.32)",
          overflow: "hidden",
          backdropFilter: "blur(6px)",
        }}
      >
        <div style={{ height: 34, display: "flex", alignItems: "center", paddingLeft: 14, gap: 7, borderBottom: "1px solid #1b1e25" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c }} />
          ))}
          <div style={{ color: "#6b7280", fontSize: 12, fontFamily: MONO, marginLeft: 10 }}>
            claude-code — employment-contract
          </div>
        </div>
        <div style={{ padding: "12px 15px", fontFamily: MONO, fontSize: 12.5, lineHeight: "19px", color: "#e6e8ec" }}>
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <span style={{ color: "#9aa4b2" }}>❯ </span>
            {CMD.slice(0, cmdChars)}
            {cmdTyping && <span style={{ opacity: caretOn ? 1 : 0 }}>▋</span>}
          </div>
          {hudLine("⏺ reading source.pdf · 68 vector paths → 16 fields", READ_S, frame, "#c6cbd4")}
          {hudLine("⏺ placing fields on the page…", DROP_S - 2, frame, "#c6cbd4")}
          {hudLine("✎ Address — widen to fit the line", FIXA[0], frame, "#febc2e")}
          {hudLine("✎ Phone — snap back into the blank", FIXB[0], frame, "#febc2e")}
          {hudLine(`⏺ confirmed · wrote export.json (${FIELDS.length} fields)`, CONFIRM_AT - 4, frame, "#28c840", true)}
        </div>
      </div>

      {/* closing caption */}
      {(() => {
        const op = kf(frame, [CAP_AT, CAP_AT + 12], [0, 1]);
        return (
          <div style={{ position: "absolute", left: HUD.x + 2, top: HUD.y - 40, opacity: op, fontSize: 18, fontWeight: 700, color: "#1d1d1f" }}>
            Pinpoint every field. <span style={{ color: "#0a66d6" }}>Export exact coordinates.</span>
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};

// reading band rendered in DOC-local space
function scanON_band(frame: number, scanP: number, on: boolean) {
  if (!on) return null;
  const yTop = (0.17 + 0.46 * scanP) * DOC.h;
  return (
    <div
      style={{
        position: "absolute",
        left: 8,
        top: yTop - 11,
        width: DOC.w - 16,
        height: 22,
        background: "linear-gradient(90deg, rgba(10,102,214,0) 0%, rgba(10,102,214,.22) 20%, rgba(10,102,214,.28) 50%, rgba(10,102,214,.22) 80%, rgba(10,102,214,0) 100%)",
        borderRadius: 6,
        boxShadow: "0 0 16px rgba(10,102,214,.35)",
      }}
    />
  );
}

const hudLine = (text: string, s: number, frame: number, color: string, bold = false) => {
  if (frame < s) return null;
  const op = kf(frame, [s, s + 6], [0, 1]);
  const ty = kf(frame, [s, s + 6], [6, 0]);
  return (
    <div style={{ marginTop: 6, opacity: op, transform: `translateY(${ty}px)`, color, fontWeight: bold ? 700 : 400 }}>
      {text}
    </div>
  );
};

const Cursor: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <svg width="26" height="30" viewBox="0 0 26 30" style={{ position: "absolute", left: x, top: y, filter: "drop-shadow(0 3px 5px rgba(0,0,0,.35))" }}>
    <path d="M2 2 L2 22 L8 17 L12 26 L16 24 L12 15 L20 15 Z" fill="#fff" stroke="#1d1d1f" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);
