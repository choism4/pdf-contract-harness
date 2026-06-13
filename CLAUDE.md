# pdf-contract-writer

PDF 계약서의 **작성 항목**(빈칸·체크박스·표 셀·서명/날인란)을 **정확히** 탐지하고, 사람이 교정하고, 정밀 좌표 JSON으로 익스포트하는 파이썬 웹앱.

익스포트된 JSON은 **다른 프로젝트의 Claude**가 읽어서 계약서를 실제로 채우는 데 쓴다. 이 앱은 그 관문(gateway)이다.

---

## 핵심 원칙 (이것이 전부다)

1. **좌표는 결정론적 추출. AI에게 좌표를 추측시키지 마라.**
   LLM에 PDF를 통째로 주고 "빈칸 위치 알려줘" 하면 좌표가 환각(hallucination)으로 틀린다. 이것이 기존 실패의 원인.

2. **텍스트 추출로 좌표를 뽑지 마라.**
   진단 결과(example PDF): 하단 필드 밑줄은 **벡터 PATH 객체 68개**다. 텍스트 추출 시야 밖. underscore(`_`) 문자는 상단 빈칸 15개뿐. → 밑줄 좌표는 **벡터 path**에서, 라벨은 **char box**에서.

3. **pdfium 텍스트 읽기순서는 한글에서 뒤섞인다.**
   `get_text_range()` 결과 순서 믿지 마라(`( ” ” ) 이하 갑`처럼 깨짐). char box의 (x, y) 좌표로 **직접 재정렬**해서 라벨을 복원한다.

4. **추출은 후보만 만든다. 확정은 사람이 시각으로 한다.**
   렌더 이미지 위에 박스를 얹고, 사람이 드래그/리사이즈/추가/삭제로 교정한다. 추출만으로 100% 확신은 불가능 — 이 루프가 정확도의 핵심.

5. **분업이 정확도를 만든다.**
   - 지오메트리 엔진 = ground-truth 후보 좌표 (결정론적)
   - Claude(`claude -p` CLI) = 의미 라벨링만 (이 빈칸이 "이름"이다, 뭘 채워야 한다)
   - 사람 = 렌더 위 시각 교정

6. **파일시스템이 인터페이스다.**
   웹앱은 `projects/<subject>/`에 파일로 쓴다. Claude Code는 그 폴더를 읽어 맥락을 잡는다. 웹앱=시각층, JSON/PNG=공유 상태, Claude Code=두뇌.

---

## 흐름 (4단계)

```
1. projects/<subject>/source.pdf  배치 (사용자가 직접)
2. 웹앱: 추출 엔진 → 후보 박스 + 렌더 → fields.json
   + Claude 초안(claude -p): 각 박스에 의미 라벨/타입/fill_hint
3. 사람 교정: 렌더 위 오버레이에서 드래그/리사이즈 + 말로 지시
   → fields.json 갱신
4. 익스포트: export.json (확정본) → 다른 프로젝트 Claude가 소비
```

---

## 폴더 규약

```
pdf-contract-writer/
├─ CLAUDE.md                  # 이 파일 (프로젝트 진실의 원천)
├─ requirements.txt
├─ .venv/                     # 파이썬 가상환경 (git 제외)
├─ app/
│   ├─ server.py              # FastAPI: 프로젝트 스캔, 추출, 저장, 익스포트
│   ├─ extract.py             # 지오메트리 엔진: 벡터선/underscore/체크박스/표셀/char box
│   ├─ draft.py               # claude -p shell-out → 의미 라벨링
│   └─ static/index.html      # 렌더 오버레이 + 드래그 교정 UI
└─ projects/
    └─ <target-subject>/      # 계약서 1개 = 작업공간 1개
        ├─ source.pdf         # 입력 (파일명 고정)
        ├─ page-0.png …       # 렌더 (오버레이용)
        ├─ fields.json        # 작업본 (초안→교정 반영, 갱신됨)
        └─ export.json        # 확정 익스포트 (다른 프로젝트 소비)
```

규칙: 입력 파일명은 항상 `source.pdf`. 폴더명(`<subject>`)이 식별자. 코드가 단순해진다.

---

## 좌표계 (반드시 지킬 것)

- **저장 표준: PDF point, 좌상단 원점(y가 아래로 증가).**
- pdfium은 좌하단 원점(y-up)으로 반환 → 변환: `y_top = page_height_pt - y_pdfium_top`.
- 각 필드는 다음을 모두 저장:
  - `bbox_pt`: `[x0, y0, x1, y1]` (좌상단 원점 point)
  - `bbox_norm`: `[x0, y0, x1, y1]` (페이지 대비 0..1)
- 페이지 메타: `size_pt`, 렌더 `scale`, `size_px`. → 다운스트림이 어떤 해상도로든 매핑 가능.

---

## 작성 항목 타입 (`type`)

`underline` · `underscore_blank` · `checkbox` · `table_cell` · `signature_seal`

---

## JSON 스키마

### fields.json (작업본)
```json
{
  "subject": "보조출연자-근로계약",
  "source": "source.pdf",
  "page_count": 1,
  "pages": [
    { "index": 0, "size_pt": [595.0, 841.0],
      "render": { "file": "page-0.png", "scale": 2.0, "size_px": [1190, 1682] } }
  ],
  "fields": [
    {
      "id": "f1",
      "page": 0,
      "type": "underline",
      "label": "이름",
      "fill_hint": "출연자 성명",
      "value": null,
      "bbox_pt":   [88.6, 200.6, 131.8, 214.6],
      "bbox_norm": [0.149, 0.238, 0.221, 0.255],
      "source": "vector",        // vector | underscore | checkbox | manual
      "confidence": 0.9,
      "status": "draft"          // draft | confirmed
    }
  ]
}
```

### export.json (확정본)
`status: "confirmed"`인 필드만. 스키마는 fields.json과 동일(내부 플래그 유지). 다운스트림 Claude가 `label` + `bbox_*` + `fill_hint`로 채운다.

---

## 스택 / 실행

- Python 3.14, `.venv`.
- 의존성(이미 설치됨): `pypdfium2`(렌더·벡터 path·char box), `fastapi`, `uvicorn`, `Pillow`.
- `pdfplumber` **안 씀** — pypdfium2가 path/render/charbox 다 커버.
- OCR(스캔 PDF용, 추후): `pytesseract` + tesseract(`kor`+`eng` 설치됨).

실행:
```bash
source .venv/bin/activate
uvicorn app.server:app --reload   # http://127.0.0.1:8000
```

---

## 로드맵 (phase 순서 — 환경 → 실행)

- **Phase 0 ✅ — 환경 구축:** 폴더 구조, `.venv`, `CLAUDE.md`, `.gitignore`, `requirements.txt`, git init. example PDF 배치.
- **Phase 1 ✅ — 추출 스킬 `extract-pdf-fields`:** 벡터 밑줄 + underscore + char-box 라벨 복원 + 라벨↔빈칸 연결 + 렌더 → `fields.json` 후보. 오버레이로 픽셀 정확 검증됨.
- **Phase 2 ✅ — 웹 뷰어:** `app/server.py` + `app/static/index.html`. 렌더 + 오버레이(bbox_norm %) + 필드목록 + mtime 폴링 live-reload.
- **Phase 3 ✅ — 교정 UI:** 드래그/리사이즈/추가/삭제 + 인라인 편집 → `PUT /fields`(atomic). 편집 중 폴링 멈춤.
- **Phase 4 ✅ — Claude 라벨링 스킬 `label-pdf-fields`:** Claude Code가 `context` 근거로 `label/fill_hint/type/status` 채움. 스크립트 아님, 파일 직접 편집(좌표 불변).
- **Phase 5 ✅ — 익스포트:** `app/export.py`(CLI `python -m app.export <subject>`) + `POST /export` + 웹 버튼. confirmed 필드 → `export.json`. 다운스트림 fill 시뮬레이션으로 좌표 정확 검증됨.
- **Phase 6 — (추후):** 체크박스·표 셀·서명란 자동 탐지 보강(`--checkboxes` 실험), 스캔 PDF OCR(pytesseract kor+eng).

---

## 작업 원칙

- **실행보다 실행 환경 구축이 먼저.** 계획·CLAUDE.md·스캐폴딩·git 없이 기능 코드 쓰지 않는다.
- 각 phase는 example PDF(`보조출연자-근로계약`)로 **시각 검증** 후 다음으로.
- 좌표 정확도는 추측이 아니라 **오버레이 스크린샷으로 증명**한다.
