import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import fieldsDoc from "./fields.json";

export const FPS = 30;
export const DURATION = 340;

// ── layout ──────────────────────────────────────────────
const W = 1280;
const H = 720;

// terminal panel (left)
const TERM = { x: 56, y: 96, w: 548, h: 528 };
// contract card (right)
const CARD = { x: 656, y: 56, w: 568, h: 608 };
// contract image fit inside card
const C_H = 560;
const C_W = Math.round(C_H * (1191 / 1684)); // ≈ 396
const C_X = CARD.x + (CARD.w - C_W) / 2;
const C_Y = CARD.y + (CARD.h - C_H) / 2;

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
};

const FIELDS: F[] = (fieldsDoc.fields as F[]).filter((f) => (f as any).page === 0);

const displayValue = (f: F) => {
  if (f.type === "signature")
    return f.label.toLowerCase().includes("employee") ? "John Doe" : "A. Manager";
  return f.example || "";
};

// ── timeline ────────────────────────────────────────────
const CMD = `claude "label the fillable fields in projects/employment-contract"`;
const CMD_START = 10;
const CMD_CPS = 1.6; // chars per frame
const cmdLen = (frame: number) =>
  Math.max(0, Math.min(CMD.length, Math.floor((frame - CMD_START) * CMD_CPS)));
const CMD_DONE = CMD_START + Math.ceil(CMD.length / CMD_CPS); // ~58

const STREAM_START = CMD_DONE + 8;
const HEAD_LINES = [
  "⏺  Reading source.pdf …",
  "⏺  68 vector paths · 15 underscores → 16 fields",
  "⏺  Labeling from char-box context …",
];
const HEAD_STEP = 9;
const CHECK_START = STREAM_START + HEAD_LINES.length * HEAD_STEP + 6;
const CHECK_STEP = 5; // one field every 5 frames (타다다닥)

const boxStart = (i: number) => CHECK_START + i * CHECK_STEP;
const LAST_BOX = boxStart(FIELDS.length - 1);

const VAL_START = LAST_BOX + 18;
const VAL_STEP = 3;
const VAL_DUR = 12;

const CONFIRM_AT = VAL_START + FIELDS.length * VAL_STEP + 16;

// ── small helpers ───────────────────────────────────────
const Type: React.FC<{ text: string; chars: number; style?: React.CSSProperties }> = ({
  text,
  chars,
  style,
}) => <span style={style}>{text.slice(0, chars)}</span>;

const MONO =
  '"SF Mono", "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace';
const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

// ── component ───────────────────────────────────────────
export const HeroAnim: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cmdChars = cmdLen(frame);
  const cmdTyping = frame >= CMD_START && cmdChars < CMD.length;
  const caretOn = Math.floor(frame / 8) % 2 === 0;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(120% 120% at 20% 0%, #ffffff 0%, #eef0f3 55%, #e7e9ee 100%)",
        fontFamily: SANS,
      }}
    >
      {/* wordmark */}
      <div
        style={{
          position: "absolute",
          left: 56,
          top: 40,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: -0.4,
          color: "#1d1d1f",
        }}
      >
        pdf-contract-harness
        <span style={{ color: "#8a8f98", fontWeight: 500, fontSize: 15, marginLeft: 12 }}>
          deterministic field extraction
        </span>
      </div>

      {/* ── terminal ── */}
      <div
        style={{
          position: "absolute",
          left: TERM.x,
          top: TERM.y,
          width: TERM.w,
          height: TERM.h,
          background: "#0c0d10",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(20,22,28,.28), 0 2px 0 rgba(255,255,255,.04) inset",
          overflow: "hidden",
          border: "1px solid #20232b",
        }}
      >
        {/* titlebar */}
        <div
          style={{
            height: 38,
            display: "flex",
            alignItems: "center",
            paddingLeft: 16,
            gap: 8,
            borderBottom: "1px solid #1b1e25",
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
          ))}
          <div
            style={{
              color: "#6b7280",
              fontSize: 12.5,
              fontFamily: MONO,
              marginLeft: 12,
            }}
          >
            claude-code — projects/employment-contract
          </div>
        </div>

        {/* body */}
        <div
          style={{
            padding: "16px 18px",
            fontFamily: MONO,
            fontSize: 13.5,
            lineHeight: "21px",
            color: "#e6e8ec",
          }}
        >
          {/* prompt line */}
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <span style={{ color: "#9aa4b2" }}>❯ </span>
            <Type text={CMD} chars={cmdChars} />
            {cmdTyping && (
              <span style={{ opacity: caretOn ? 1 : 0, color: "#e6e8ec" }}>▋</span>
            )}
          </div>

          {/* head stream lines */}
          <div style={{ marginTop: 10 }}>
            {HEAD_LINES.map((ln, i) => {
              const s = STREAM_START + i * HEAD_STEP;
              const op = interpolate(frame, [s, s + 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const ty = interpolate(frame, [s, s + 6], [6, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={i}
                  style={{ opacity: op, transform: `translateY(${ty}px)`, color: "#c6cbd4" }}
                >
                  {ln}
                </div>
              );
            })}
          </div>

          {/* field checks (two columns) */}
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              columnGap: 14,
              rowGap: 1,
            }}
          >
            {FIELDS.map((f, i) => {
              const s = boxStart(i);
              const op = interpolate(frame, [s, s + 4], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div key={f.id} style={{ opacity: op, color: "#cdd2db", fontSize: 12.5 }}>
                  <span style={{ color: "#28c840" }}>✓</span>{" "}
                  <span style={{ color: TYPE_COLOR[f.type] || "#8ab4ff" }}>
                    {f.label || "field"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* done line */}
          {(() => {
            const s = CONFIRM_AT - 6;
            const op = interpolate(frame, [s, s + 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div style={{ marginTop: 12, opacity: op, color: "#28c840", fontWeight: 600 }}>
                ⏺ wrote fields.json · {FIELDS.length} fields labeled
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── contract card ── */}
      <div
        style={{
          position: "absolute",
          left: CARD.x,
          top: CARD.y,
          width: CARD.w,
          height: CARD.h,
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 30px 70px rgba(20,22,28,.18)",
          border: "1px solid #e7e9ee",
        }}
      />
      <Img
        src={staticFile("contract.png")}
        style={{
          position: "absolute",
          left: C_X,
          top: C_Y,
          width: C_W,
          height: C_H,
          borderRadius: 4,
        }}
      />

      {/* field boxes + labels + values */}
      {FIELDS.map((f, i) => {
        const [nx0, ny0, nx1, ny1] = f.bbox_norm;
        const bx = C_X + nx0 * C_W;
        const by = C_Y + ny0 * C_H;
        const bw = (nx1 - nx0) * C_W;
        const bh = (ny1 - ny0) * C_H;
        const s = boxStart(i);
        const sp = spring({
          frame: frame - s,
          fps,
          config: { damping: 14, stiffness: 180, mass: 0.6 },
        });
        if (frame < s) return null;
        const color = TYPE_COLOR[f.type] || "#0a66d6";
        const scale = interpolate(sp, [0, 1], [0.7, 1]);
        const op = interpolate(frame, [s, s + 3], [0, 1], { extrapolateRight: "clamp" });

        // value typing
        const vs = VAL_START + i * VAL_STEP;
        const val = displayValue(f);
        const vChars = Math.max(
          0,
          Math.min(val.length, Math.floor(((frame - vs) / VAL_DUR) * val.length)),
        );

        const labelPop = interpolate(sp, [0.2, 1], [0, 1], { extrapolateLeft: "clamp" });
        // label recedes as the value gets typed → clean filled end state
        const labelFade = val
          ? interpolate(frame, [vs + VAL_DUR * 0.3, vs + VAL_DUR], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          : 1;
        const labelOp = labelPop * labelFade;

        return (
          <React.Fragment key={f.id}>
            {/* box */}
            <div
              style={{
                position: "absolute",
                left: bx,
                top: by,
                width: bw,
                height: bh,
                border: `1.5px solid ${color}`,
                background: `${color}14`,
                borderRadius: 3,
                opacity: op,
                transform: `scale(${scale})`,
                transformOrigin: "left center",
                boxShadow: `0 0 0 ${interpolate(sp, [0, 1], [6, 0])}px ${color}22`,
              }}
            />
            {/* label tag */}
            <div
              style={{
                position: "absolute",
                left: bx,
                top: by - 15,
                fontSize: 8.5,
                fontWeight: 700,
                color: "#fff",
                background: color,
                padding: "1px 5px",
                borderRadius: 4,
                opacity: labelOp,
                transform: `translateY(${interpolate(sp, [0, 1], [4, 0])}px)`,
                whiteSpace: "nowrap",
                fontFamily: SANS,
              }}
            >
              {f.label}
            </div>
            {/* typed value */}
            {val && frame >= vs && (
              <div
                style={{
                  position: "absolute",
                  left: bx + 3,
                  top: by,
                  height: bh,
                  display: "flex",
                  alignItems: "center",
                  fontFamily: f.type === "signature" ? '"Snell Roundhand", cursive' : SANS,
                  fontSize: f.type === "signature" ? 12 : 8.5,
                  fontStyle: f.type === "signature" ? "italic" : "normal",
                  color: "#0b57b2",
                  fontWeight: f.type === "signature" ? 600 : 500,
                  whiteSpace: "nowrap",
                }}
              >
                {val.slice(0, vChars)}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Confirmed pill */}
      {(() => {
        const sp = spring({
          frame: frame - CONFIRM_AT,
          fps,
          config: { damping: 12, stiffness: 200 },
        });
        if (frame < CONFIRM_AT) return null;
        return (
          <div
            style={{
              position: "absolute",
              left: CARD.x + 16,
              top: CARD.y + 14,
              transform: `scale(${interpolate(sp, [0, 1], [0.6, 1])})`,
              transformOrigin: "left center",
              background: "#16a34a",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              padding: "5px 12px",
              borderRadius: 999,
              boxShadow: "0 6px 18px rgba(22,163,74,.4)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ✓ Confirmed → export.json
          </div>
        );
      })()}

      {/* closing caption */}
      {(() => {
        const s = CONFIRM_AT + 14;
        const op = interpolate(frame, [s, s + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            style={{
              position: "absolute",
              left: TERM.x,
              top: TERM.y + TERM.h + 22,
              opacity: op,
              fontSize: 17,
              fontWeight: 600,
              color: "#1d1d1f",
            }}
          >
            Pinpoint every field.{" "}
            <span style={{ color: "#0a66d6" }}>Export exact coordinates.</span>
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};
