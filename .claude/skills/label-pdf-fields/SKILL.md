---
name: label-pdf-fields
description: Semantically label the extracted fill-in fields in a contract's fields.json — fill each field's label/fill_hint/example/font_size and fix its type (text/checkbox/signature). Use after extract-pdf-fields has produced fields.json, when the user asks to label/name/refine fields, interpret what each blank is for, or prepare a contract for export. This is the "brain" step; it edits fields.json directly (no script, no web app needed).
---

# label-pdf-fields

추출(`extract-pdf-fields`)이 만든 `fields.json`의 **의미**를 채운다. Claude Code가 파일을 직접 편집하는 "두뇌" 단계 — 스크립트도 웹앱도 불필요.

## 절대 규칙

- **`bbox_pt` / `bbox_norm`은 절대 건드리지 마라.** 추출이 뽑은 ground truth 좌표다. 좌표 교정은 사람이 웹앱에서 드래그로(또는 재추출로) 한다.
- 너가 바꾸는 필드: `label`, `fill_hint`, `example`, `font_size`, `type`. 좌표를 손댔다면 잘못한 것이다.
- `status`는 **계약서 단위**(fields.json 최상위)다. 필드별 status는 없다.
- 추측하지 마라. 근거는 각 필드의 `context`(그 줄의 복원된 텍스트)와 `page-N.png` 렌더다.

## 절차

1. `projects/<subject>/fields.json`을 읽는다. 필요하면 `page-N.png`(또는 `page-N.overlay.png`)을 같이 본다.
2. 각 필드에 대해 `context`를 근거로:
   - **`label`**: 이 빈칸이 무엇인지 (예: `이름`, `주민등록번호`, `계좌번호`). 추출이 채운 라벨이 맞으면 둔다.
   - **`fill_hint`**: 무엇을 써야 하는지 설명 한 줄 (예: `출연자 성명`). 다운스트림 Claude가 이걸 보고 채운다.
   - **`example`**: 들어갈 예시값 한 개 (예: `홍길동`, `900101-1234567`). 웹앱에서 박스 안에 고스트로 미리 보인다.
   - **`font_size`**: 채울 글자 크기(pt). 기본은 박스 높이 기준 자동. 칸에 맞게 조정 가능.
   - **`type`** 교정 (3종): 빈칸/밑줄=`text`, 체크박스=`checkbox`, 서명/날인 자리=`signature`.
3. `context`만으로 라벨이 모호한 빈칸(예: `(이하 "갑")` 앞 빈칸)은 렌더를 보고 판단한다. 그래도 불확실하면 `draft`로 두고 사용자에게 물어본다.
4. `fields.json`을 같은 스키마로 다시 쓴다(다른 키/순서/좌표 보존). 웹앱이 열려 있으면 mtime 폴링으로 화면이 자동 갱신된다.

## 라벨링 팁 (한글 계약서)

- `라벨 :` 패턴은 `label`이 거의 맞다. `context`의 콜론 앞 토큰을 신뢰.
- `(이하 "갑"/"을"이라 함)` 주변 빈칸 → 당사자명. `갑`=보통 제작사/회사, `을`=출연자/근로자. `label`을 `갑(상호)` / `을(성명)` 식으로.
- `(서명)`, `(인)`, `날인`이 줄에 있으면 → `type:"signature"` (추출이 자동 처리, 검증만).
- 한 줄에 여러 라벨(`이름 : 주민등록번호 : 연락처 :`)이면 각 빈칸의 `bbox` x좌표로 어느 라벨에 붙는지 구분(추출이 이미 처리, 검증만).

## 다음 단계

라벨링이 끝나면 계약서 `status`를 `confirmed`로 두고 익스포트(Phase 5): `export.json` 생성 → 다운스트림 프로젝트의 Claude가 소비. 익스포트는 웹앱 "Export" 버튼 또는 `app/export.py` CLI로(모든 필드 내보냄).
