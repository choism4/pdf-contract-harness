"""
export.py — fields.json의 confirmed 필드를 export.json으로 익스포트한다.

다운스트림 계약(다른 프로젝트의 Claude가 소비):
  - 좌표계는 좌상단 원점 PDF point(bbox_pt) + normalized 0..1(bbox_norm).
  - 각 필드: label(무엇), fill_hint(무엇을 쓸지), type, page, bbox_pt/norm.
  - 페이지 메타(size_pt, 렌더 size_px/scale)로 임의 해상도 매핑 가능.

파일 기반: projects/<subject>/fields.json → export.json

사용(웹앱 버튼 또는 CLI):
  python -m app.export <subject> [--all]   # --all: draft 포함(기본 confirmed만)
"""
import sys
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECTS = ROOT / "projects"


def build_export(doc: dict, include_all: bool = True) -> dict:
    """fields.json dict → export.json dict. 모든 필드 내보냄(상태는 계약서 단위)."""
    fields = doc.get("fields", [])
    out_fields = []
    for f in fields:
        out_fields.append({
            "id": f["id"],
            "page": f["page"],
            "type": f["type"],
            "label": f.get("label", ""),
            "fill_hint": f.get("fill_hint", ""),
            "example": f.get("example", ""),
            "font_size": f.get("font_size"),
            "value": f.get("value"),
            "bbox_pt": f["bbox_pt"],
            "bbox_norm": f["bbox_norm"],
        })
    return {
        "subject": doc.get("subject"),
        "source": doc.get("source", "source.pdf"),
        "status": doc.get("status", "draft"),
        "coordinate_system": "top-left origin; bbox_pt in PDF points, bbox_norm in 0..1 of page",
        "page_count": doc.get("page_count"),
        "pages": doc.get("pages", []),
        "field_count": len(out_fields),
        "fields": out_fields,
    }


def export_subject(subject: str, include_all: bool = False) -> dict:
    """projects/<subject>/fields.json 읽어 export.json 작성. 반환: export dict."""
    pdir = PROJECTS / subject
    fp = pdir / "fields.json"
    if not fp.exists():
        raise FileNotFoundError(f"fields.json 없음: {fp}")
    doc = json.loads(fp.read_text(encoding="utf-8"))
    exp = build_export(doc, include_all)
    (pdir / "export.json").write_text(
        json.dumps(exp, ensure_ascii=False, indent=2), encoding="utf-8")
    return exp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("subject")
    args = ap.parse_args()
    exp = export_subject(args.subject)
    print(f"[export] {args.subject}: {exp['field_count']} fields "
          f"(status={exp['status']}) → export.json")


if __name__ == "__main__":
    main()
