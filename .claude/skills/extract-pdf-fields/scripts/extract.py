#!/usr/bin/env python3
"""
extract.py — PDF 계약서의 작성 항목(빈칸) 후보를 결정론적으로 추출한다.

원칙(CLAUDE.md):
  - 좌표는 텍스트가 아니라 벡터 PATH / underscore 문자에서 뽑는다.
  - pdfium 텍스트 읽기순서는 한글에서 뒤섞이므로 char box를 (y행→x) 재정렬한다.
  - 저장 좌표는 좌상단 원점 PDF point + normalized(0..1).
  - 추출은 "후보"만 만든다. label/fill_hint는 best-effort, 확정은 Claude+사람.

파일 기반: projects/<subject>/source.pdf 를 읽어
           page-N.png(렌더) + fields.json(후보) 을 같은 폴더에 쓴다.

사용:
  python extract.py <subject-or-project-dir> [--scale 2.0] [--overlay]

  --overlay : page-N.overlay.png 에 검출 박스를 얹어 좌표를 시각 검증.
"""
import sys, os, json, argparse
import pypdfium2 as pdfium
import pypdfium2.raw as praw

# ── 휴리스틱 임계값 (벡터 밑줄 판정) ─────────────────────────────
UNDERLINE_MIN_W = 20.0   # pt: 이보다 넓어야 밑줄
UNDERLINE_MAX_H = 3.0    # pt: 이보다 얇아야 밑줄(수평선)
FILL_H          = 13.0   # pt: 밑줄 위 "글 쓰는 공간" 높이 → 박스를 선이 아닌 사각형으로
CHECKBOX_MIN    = 5.0    # pt: 정사각 박스 한 변 최소
CHECKBOX_MAX    = 18.0   # pt: 정사각 박스 한 변 최대
CHECKBOX_RATIO  = 0.35   # 정사각 판정(가로세로 비율 차)
ROW_TOL         = 4.0    # pt: 같은 행으로 묶을 y 허용오차


def resolve_dir(arg):
    """subject 이름 또는 프로젝트 디렉토리 경로를 받아 디렉토리 절대경로 반환."""
    if os.path.isdir(arg) and os.path.exists(os.path.join(arg, "source.pdf")):
        return os.path.abspath(arg)
    # subject 이름으로 간주 → projects/<subject>
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, "..", "..", "..", ".."))  # repo root
    cand = os.path.join(root, "projects", arg)
    if os.path.exists(os.path.join(cand, "source.pdf")):
        return cand
    sys.exit(f"source.pdf 못 찾음: {arg} (찾은 경로: {cand})")


def collect_chars(page, page_h):
    """char box 전부 수집. 좌상단 원점 pt 좌표로 변환.
    반환: [{c, x0,y0,x1,y1, cx,cy}] (cy=수직중심)."""
    tp = page.get_textpage()
    n = tp.count_chars()
    chars = []
    for i in range(n):
        c = tp.get_text_range(i, 1)
        try:
            l, b, r, t = tp.get_charbox(i)  # pdfium: 좌하단 원점
        except Exception:
            continue
        x0, x1 = l, r
        y0, y1 = page_h - t, page_h - b   # 좌상단 원점으로 변환
        if x1 < x0:
            x0, x1 = x1, x0
        if y1 < y0:
            y0, y1 = y1, y0
        chars.append({"c": c, "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                      "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2})
    return chars


def group_rows(chars):
    """char를 y행으로 묶고 각 행을 x로 정렬. pdfium 스트림 순서 무시.
    반환: [{cy, chars:[...정렬됨...], text}]"""
    rows = []
    for ch in sorted(chars, key=lambda c: (c["cy"], c["x0"])):
        placed = False
        for row in rows:
            if abs(row["cy"] - ch["cy"]) <= ROW_TOL:
                row["chars"].append(ch)
                row["cy"] = (row["cy"] * row["_n"] + ch["cy"]) / (row["_n"] + 1)
                row["_n"] += 1
                placed = True
                break
        if not placed:
            rows.append({"cy": ch["cy"], "chars": [ch], "_n": 1})
    for row in rows:
        row["chars"].sort(key=lambda c: c["x0"])
        row["text"] = "".join(c["c"] for c in row["chars"]).replace("\r", " ")
        del row["_n"]
    rows.sort(key=lambda r: r["cy"])
    return rows


def label_left_of(rows, x0, cy):
    """빈칸 왼쪽, 같은 행의 텍스트에서 라벨 추출(best-effort).
    'X :' 패턴이면 ':' 앞 토큰을, 아니면 왼쪽 텍스트 꼬리를 준다.
    반환: (label, row_text)"""
    row = min(rows, key=lambda r: abs(r["cy"] - cy)) if rows else None
    if not row or abs(row["cy"] - cy) > 12:
        return "", ""
    left = "".join(c["c"] for c in row["chars"] if c["x1"] <= x0 + 1)
    left = left.strip()
    label = ""
    # ':' 또는 '：' 앞 마지막 토큰
    for sep in (":", "："):
        if sep in left:
            head = left.rsplit(sep, 1)[0].strip()
            label = head.split()[-1] if head.split() else head
            break
    if not label and left:
        label = left.split()[-1] if left.split() else left
    return label, row["text"].strip()


def extract_paths(page, page_h):
    """벡터 PATH → 밑줄/체크박스 후보. 좌상단 원점 pt."""
    underlines, checkboxes = [], []
    for obj in page.get_objects():
        if obj.type != praw.FPDF_PAGEOBJ_PATH:
            continue
        try:
            l, b, r, t = obj.get_bounds()
        except Exception:
            continue
        w, h = r - l, t - b
        x0, x1 = l, r
        y0, y1 = page_h - t, page_h - b
        if w >= UNDERLINE_MIN_W and h <= UNDERLINE_MAX_H:
            underlines.append((x0, y0, x1, y1))
        elif CHECKBOX_MIN <= w <= CHECKBOX_MAX and CHECKBOX_MIN <= h <= CHECKBOX_MAX \
                and abs(w - h) <= CHECKBOX_RATIO * max(w, h):
            checkboxes.append((x0, y0, x1, y1))
    return underlines, checkboxes


def extract_underscore_blanks(rows):
    """char 행에서 '_' 연속 런 → 빈칸 bbox(좌상단 pt)."""
    blanks = []
    for row in rows:
        run = []
        for ch in row["chars"]:
            if ch["c"] == "_":
                run.append(ch)
            else:
                if len(run) >= 3:
                    blanks.append(run)
                run = []
        if len(run) >= 3:
            blanks.append(run)
    out = []
    for run in blanks:
        x0 = min(c["x0"] for c in run); x1 = max(c["x1"] for c in run)
        y0 = min(c["y0"] for c in run); y1 = max(c["y1"] for c in run)
        out.append((x0, y0, x1, y1))
    return out


def fill_box(bbox):
    """밑줄/underscore bbox를 '쓰는 공간' 사각형으로: 선을 바닥에 두고 위로 FILL_H."""
    x0, y0, y1 = bbox[0], bbox[1], bbox[3]
    bottom = max(y0, y1)            # 선의 y(바닥)
    return (bbox[0], bottom - FILL_H, bbox[2], bottom)


def mk_field(fid, page_idx, ftype, bbox, pw, ph, source, label="", row_text=""):
    x0, y0, x1, y1 = bbox
    return {
        "id": fid,
        "page": page_idx,
        "type": ftype,
        "label": label,
        "fill_hint": "",
        "context": row_text,           # Claude가 라벨링할 때 참고할 행 전체 텍스트
        "value": None,
        "bbox_pt": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
        "bbox_norm": [round(x0 / pw, 4), round(y0 / ph, 4),
                      round(x1 / pw, 4), round(y1 / ph, 4)],
        "source": source,             # vector | underscore | checkbox | manual
        "confidence": 0.9 if source != "checkbox" else 0.6,
        "status": "draft",            # draft | confirmed
    }


def draw_overlay(page, scale, fields, out_path, page_h):
    from PIL import ImageDraw
    img = page.render(scale=scale).to_pil().convert("RGB")
    dr = ImageDraw.Draw(img)
    color = {"underline": (255, 0, 0), "underscore_blank": (255, 0, 0),
             "checkbox": (0, 120, 255), "signature_seal": (200, 0, 200)}
    for f in fields:
        x0, y0, x1, y1 = f["bbox_pt"]
        c = color.get(f["type"], (0, 160, 0))
        dr.rectangle([x0 * scale, y0 * scale, x1 * scale, y1 * scale],
                     outline=c, width=3)
        if f["label"]:
            dr.text((x0 * scale, y0 * scale - 14), f["label"], fill=c)
    img.save(out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("subject", help="subject 이름 또는 projects/<subject> 경로")
    ap.add_argument("--scale", type=float, default=2.0)
    ap.add_argument("--overlay", action="store_true")
    ap.add_argument("--checkboxes", action="store_true",
                    help="실험적 체크박스 탐지(Phase 6, 기본 off — 글리프 오검출 많음)")
    args = ap.parse_args()

    pdir = resolve_dir(args.subject)
    subject = os.path.basename(pdir)
    pdf_path = os.path.join(pdir, "source.pdf")
    doc = pdfium.PdfDocument(pdf_path)

    pages_meta, fields = [], []
    fid = 0
    for pi in range(len(doc)):
        page = doc[pi]
        pw, ph = page.get_size()

        # 렌더 저장
        png = f"page-{pi}.png"
        img = page.render(scale=args.scale).to_pil()
        img.save(os.path.join(pdir, png))
        pages_meta.append({
            "index": pi, "size_pt": [round(pw, 2), round(ph, 2)],
            "render": {"file": png, "scale": args.scale,
                       "size_px": [img.size[0], img.size[1]]},
        })

        chars = collect_chars(page, ph)
        rows = group_rows(chars)
        underlines, checkboxes = extract_paths(page, ph)
        us_blanks = extract_underscore_blanks(rows)

        page_fields = []
        for bbox in underlines:
            lbl, rt = label_left_of(rows, bbox[0], (bbox[1] + bbox[3]) / 2)
            fid += 1
            page_fields.append(mk_field(f"f{fid}", pi, "underline", fill_box(bbox),
                                        pw, ph, "vector", lbl, rt))
        for bbox in us_blanks:
            lbl, rt = label_left_of(rows, bbox[0], (bbox[1] + bbox[3]) / 2)
            fid += 1
            page_fields.append(mk_field(f"f{fid}", pi, "underscore_blank", fill_box(bbox),
                                        pw, ph, "underscore", lbl, rt))
        if args.checkboxes:
            for bbox in checkboxes:
                fid += 1
                page_fields.append(mk_field(f"f{fid}", pi, "checkbox", bbox, pw, ph,
                                            "checkbox"))

        if args.overlay:
            draw_overlay(page, args.scale, page_fields,
                         os.path.join(pdir, f"page-{pi}.overlay.png"), ph)
        fields.extend(page_fields)

    out = {
        "subject": subject,
        "source": "source.pdf",
        "page_count": len(doc),
        "pages": pages_meta,
        "fields": fields,
    }
    with open(os.path.join(pdir, "fields.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    by_type = {}
    for f in fields:
        by_type[f["type"]] = by_type.get(f["type"], 0) + 1
    print(f"[extract] {subject}: {len(fields)} fields {by_type} → fields.json")
    if args.overlay:
        print(f"[extract] overlay → page-N.overlay.png")


if __name__ == "__main__":
    main()
