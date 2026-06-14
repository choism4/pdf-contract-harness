"""
pdf-contract-writer 웹앱 백엔드 (FastAPI).

역할: 순수 인터페이스. projects/<subject>/ 파일을 읽고/쓴다.
      Claude는 호출하지 않는다(파일=버스). fields.json mtime 폴링으로
      Claude Code의 터미널 수정이 화면에 live-reload 된다.

실행: .venv/bin/uvicorn app.server:app --reload   # http://127.0.0.1:8000
"""
import os
import json
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
PROJECTS = ROOT / "projects"
STATIC = Path(__file__).resolve().parent / "static"

app = FastAPI(title="pdf-contract-writer")


def project_dir(subject: str) -> Path:
    """subject → projects/<subject>. 경로 traversal 방지."""
    if not subject or "/" in subject or "\\" in subject or subject.startswith("."):
        raise HTTPException(400, "잘못된 subject")
    d = (PROJECTS / subject).resolve()
    if PROJECTS.resolve() not in d.parents or not d.is_dir():
        raise HTTPException(404, f"프로젝트 없음: {subject}")
    return d


# ── 정적 ──────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def index():
    return (STATIC / "index.html").read_text(encoding="utf-8")


# ── 읽기 API ──────────────────────────────────────────
@app.get("/api/projects")
def list_projects():
    out = []
    if PROJECTS.is_dir():
        for d in sorted(PROJECTS.iterdir()):
            if (d / "source.pdf").exists():
                status, n = None, 0
                fp = d / "fields.json"
                if fp.exists():
                    try:
                        doc = json.loads(fp.read_text(encoding="utf-8"))
                        status = doc.get("status", "draft")
                        n = len(doc.get("fields", []))
                    except Exception:
                        pass
                out.append({
                    "subject": d.name,
                    "has_fields": fp.exists(),
                    "has_export": (d / "export.json").exists(),
                    "status": status,
                    "field_count": n,
                })
    return {"projects": out}


@app.get("/api/project/{subject}")
def get_project(subject: str):
    d = project_dir(subject)
    fp = d / "fields.json"
    if not fp.exists():
        raise HTTPException(404, "fields.json 없음 — 먼저 추출 스킬 실행")
    return json.loads(fp.read_text(encoding="utf-8"))


@app.get("/api/project/{subject}/page/{n}")
def get_page(subject: str, n: int):
    d = project_dir(subject)
    img = d / f"page-{n}.png"
    if not img.exists():
        raise HTTPException(404, f"page-{n}.png 없음")
    return FileResponse(img, media_type="image/png")


@app.get("/api/project/{subject}/version")
def get_version(subject: str):
    """fields.json mtime — 프론트 폴링용 live-reload 트리거."""
    d = project_dir(subject)
    fp = d / "fields.json"
    return {"mtime": fp.stat().st_mtime if fp.exists() else 0}


# ── 쓰기 API (Phase 3 교정에서 사용) ─────────────────────
class FieldsPayload(BaseModel):
    data: dict


@app.put("/api/project/{subject}/fields")
def put_fields(subject: str, payload: FieldsPayload):
    """fields.json atomic write (임시파일→rename) — Claude Code 동시읽기 안전."""
    d = project_dir(subject)
    fp = d / "fields.json"
    text = json.dumps(payload.data, ensure_ascii=False, indent=2)
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, fp)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return {"ok": True, "mtime": fp.stat().st_mtime}


@app.post("/api/project/{subject}/export")
def post_export(subject: str, include_all: bool = False):
    """confirmed 필드를 export.json으로 익스포트(파일 기반 export.py 재사용)."""
    from app.export import export_subject
    project_dir(subject)  # 검증
    try:
        exp = export_subject(subject, include_all)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    return {"ok": True, "field_count": exp["field_count"]}


app.mount("/static", StaticFiles(directory=STATIC), name="static")
