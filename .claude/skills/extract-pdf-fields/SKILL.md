---
name: extract-pdf-fields
description: Extract fill-in items (작성 항목 — underline blanks, underscore blanks, checkboxes) from a PDF contract into precise-coordinate fields.json. Use when a user puts a source.pdf in projects/<subject>/ and wants the writable fields detected, or asks to (re)extract / re-scan a contract's fillable positions. Works file-based — no web app needed.
---

# extract-pdf-fields

PDF 계약서에서 **작성 항목**(빈칸·체크박스)의 정확한 좌표를 결정론적으로 뽑아 `fields.json` 후보를 만든다. Claude Code가 파일만으로 단독 실행 가능(웹앱 불필요).

## 핵심 원칙 (왜 이렇게 하는가)

1. **좌표를 추측하지 마라.** PDF를 통째로 읽고 빈칸 위치를 LLM에 묻지 마라 — 환각으로 틀린다. 좌표는 항상 스크립트가 벡터/문자에서 뽑는다.
2. **밑줄은 벡터 PATH다, 텍스트가 아니다.** 진단: example 계약서 하단 필드 밑줄은 벡터 PATH 68개, 텍스트 추출엔 안 보였다. `_` 문자는 상단 빈칸뿐. → 스크립트가 PATH(`width>20 & height<3`)와 underscore 런을 둘 다 잡는다.
3. **pdfium 한글 읽기순서는 깨진다.** `get_text_range()` 순서 믿지 마라. 스크립트가 char box를 y행→x로 재정렬해 라벨/문맥을 복원한다.
4. **추출은 후보만.** `bbox`(좌표)는 정확하지만 `label`/`fill_hint`는 best-effort다. 의미 라벨링은 Claude가, 최종 확정은 사람이 오버레이 보고 한다.

## 실행

```bash
cd <repo-root>
.venv/bin/python .claude/skills/extract-pdf-fields/scripts/extract.py <subject> --overlay
```

- `<subject>` = `projects/<subject>/` 폴더명 (예: `보조출연자-근로계약`) 또는 그 경로.
- 입력: `projects/<subject>/source.pdf` (파일명 고정)
- 출력(같은 폴더):
  - `page-N.png` — 페이지 렌더 (오버레이/웹앱용)
  - `page-N.overlay.png` — `--overlay` 시, 검출 박스 얹은 검증 이미지
  - `fields.json` — 작성 항목 후보 (스키마는 `CLAUDE.md` 참조)

## 절차 (Claude Code가 따를 흐름)

1. `.venv` 파이썬으로 위 명령 실행 (`--overlay` 포함).
2. **반드시 `page-N.overlay.png`를 눈으로 검증한다.** 빨간 박스(밑줄/underscore)·파란 박스(체크박스)가 실제 빈칸에 픽셀로 맞는지 확인.
   - 안 맞으면: `scripts/extract.py` 상단 임계값(`UNDERLINE_MIN_W` 등) 조정 후 재실행. 좌표 변환식(`y_top = page_h - y_pdfium`)은 건드리지 마라.
3. `fields.json`의 각 필드에 의미 라벨을 붙인다: `context`(행 전체 텍스트)를 근거로 `label`·`fill_hint`를 채운다. **`bbox_*` 좌표는 절대 손대지 마라** — 스크립트가 뽑은 ground truth다.
4. 결과를 사용자에게 오버레이 이미지로 보여주고 교정을 받는다(말/드래그). 교정은 `fields.json`에 반영.

## 좌표 규약 (절대 규칙)

- 밑줄/underscore 필드의 `bbox`는 **"글 쓰는 공간 사각형"** — 검출한 선을 **박스 바닥**에 두고 위로 `FILL_H`(기본 13pt)만큼 올린 영역. 선 한 줄이 아니라 텍스트가 들어갈 직사각형이다. 다운스트림은 이 사각형 안에 값을 쓴다.
- 저장 좌표 = **좌상단 원점 PDF point**(`bbox_pt`) + **normalized 0..1**(`bbox_norm`).
- pdfium은 좌하단 원점 → 스크립트가 이미 변환함. 다운스트림은 `bbox_norm`으로 임의 해상도에 매핑.
- `label`/`fill_hint`만 사람·Claude가 수정. `bbox_*`는 추출 결과 유지(수동 추가/드래그 시에만 `source:"manual"`로 갱신).

## 한계 (현재)

- 서명/날인란은 줄에 `서명`/`(인)`/`날인` 키워드 있으면 자동 `signature`. 체크박스 자동탐지는 미구현(`--checkboxes` 실험, 글리프 오검출 많음) — 필요시 웹앱에서 `+ Add field`로 수동 추가 후 type=checkbox.
- 표가 많은 문서는 표 가로 격자선이 `text`로 과검출될 수 있다(작성 밑줄과 같은 wide·thin 벡터선). 인접 선분은 병합되지만 노이즈는 남는다.
- 스캔 PDF(텍스트 레이어 없음)는 OCR 미연동(Phase 6). 현재는 디지털 PDF 전제.
