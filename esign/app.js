/* =============================================================
   가온누리 전자계약 — 원본 계약서 화면 + 원본 동일 PDF 생성
   · 화면: 원본 PDF(관리사님 계약서식) 페이지 위에 필드 오버레이
   · 제출: 원본 PDF의 4쪽을 그대로 복사(벡터)하고 입력 글자·체크·서명만 얹어 저장
     → 글자는 원본과 100% 같은 선명도, 파일은 170KB 내외, 제출 대기 1~2초
   · 공개 저장소에는 개인정보·PIN 없음(테스트는 홍길동)
   · v29: 관리자 자동로그인(localStorage) + [링크만 복사]→[문자로 보내기(sms: URI)]
   ============================================================= */
var API = 'https://script.google.com/macros/s/AKfycbxNkgjaS8ERq4ZYywNroxxsROdofkLe6HEzxQDRnFSraBJGu0yKoXAEE5zc0ZpcI5G8/exec';
var CONTRACT_PDF = 'contract.pdf';
var CLOSE_PDF = 'close.pdf';
/* 문서 종류: 관리사님 계약서식(contract) / 서비스 종료안내문(close) */
var FORM = 'contract';
function isClose() { return FORM === 'close'; }
function docPdf() { return isClose() ? CLOSE_PDF : CONTRACT_PDF; }
var PW = 595, PH = 841;          // A4 (pt)
var OV = 4;                      // 입력 글자 오버레이 해상도(1pt=4px ≈ 288dpi)
var FONT = '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","NanumGothic",sans-serif';
var SIDKEY = 'esign_sid_v3';
/* v29: 관리자 자동로그인 — 오늘현황 앱과 같은 방식으로 PIN을 이 기기에만 저장합니다.
   (localStorage / 가역 인코딩. [나가기]를 누르면 즉시 지웁니다.) */
var PINKEY = 'esign_pin_v1';

/* ---------------- 공통 ---------------- */
function $(s, r) { return (r || document).querySelector(s); }
function el(html) {
  var t = document.createElement('template');
  t.innerHTML = String(html).trim();
  if (t.content.children.length === 1) return t.content.firstElementChild;
  var d = document.createElement('div');
  d.appendChild(t.content);
  return d;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function qs(name) {
  var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
  return m ? decodeURIComponent(m[1]) : '';
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* =============================================================
   입력 자동 하이픈 (전화번호·날짜·주민등록번호)
   · 숫자만 입력·붙여넣기 해도 실시간으로 하이픈이 들어간다
   · 하이픈 뒤에서 백스페이스를 누르면 앞 숫자까지 함께 지운다
   ============================================================= */
var MASK_D = /[0-9]/;
function onlyDigits(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

/* 전화번호: 01012345678 → 010-1234-5678 / 0421234567 → 042-123-4567
   0212345678 → 02-1234-5678 / 021234567 → 02-123-4567 (숫자 최대 11자리) */
function fmtPhone(v) {
  var d = onlyDigits(v).slice(0, 11);
  if (!d) return '';
  if (d.slice(0, 2) === '02') {                                   // 서울 02
    if (d.length <= 2) return d;
    if (d.length <= 5) return d.slice(0, 2) + '-' + d.slice(2);
    if (d.length <= 9) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
    return d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6);
  }
  if (/^050[5-8]/.test(d)) {                                      // 0505·0506·0507·0508 (4자리 국번)
    if (d.length <= 4) return d;
    if (d.length <= 7) return d.slice(0, 4) + '-' + d.slice(4);
    return d.slice(0, 4) + '-' + d.slice(4, 7) + '-' + d.slice(7);
  }
  if (d.length <= 3) return d;
  if (/^01[0-9]/.test(d) || /^07[0-9]/.test(d) || /^06[0-9]/.test(d)) {   // 휴대폰·인터넷전화 3-4-4
    if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  if (d.length <= 6) return d.slice(0, 3) + '-' + d.slice(3);     // 지역번호 3-3-4 (042-123-4567)
  if (d.length <= 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
}

/* 날짜: 20200202 → 2020-02-02 (숫자 최대 8자리) */
function fmtDate(v) {
  var d = onlyDigits(v).slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return d.slice(0, 4) + '-' + d.slice(4);
  return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
}

/* 주민등록번호: 8503301080016 → 850330-1080016 (숫자 최대 13자리) */
function fmtJumin(v) {
  var d = onlyDigits(v).slice(0, 13);
  if (d.length <= 6) return d;
  return d.slice(0, 6) + '-' + d.slice(6);
}

function maskCaret(str, digitCount) {          // digitCount번째 숫자 바로 뒤 위치
  if (digitCount <= 0) return 0;
  var n = 0;
  for (var i = 0; i < str.length; i++) {
    if (MASK_D.test(str.charAt(i))) {
      n++;
      if (n >= digitCount) return i + 1;
    }
  }
  return str.length;
}

/* 입력칸에 자동 포맷 연결 */
function attachAutoFormat(input, fmt) {
  if (!input) return;
  var last = input.value || '';
  input.addEventListener('input', function (e) {
    var raw = input.value || '';
    var it = (e && e.inputType) || '';
    var sel = input.selectionStart;
    var cut = -1;
    if (it.indexOf('delete') === 0 && last.length === raw.length + 1) {
      for (var i = 0; i < last.length; i++) {
        if (last.charAt(i) !== (raw.charAt(i) || '')) { cut = i; break; }
      }
    }
    if (cut > 0 && last.charAt(cut) === '-') {   // 하이픈만 지워진 경우 → 앞 숫자까지 함께 지움
      raw = last.slice(0, cut - 1) + last.slice(cut + 1);
      sel = cut - 1;
    }
    var out = fmt(raw);
    input.value = out;
    if (sel != null) {
      var before = 0;
      for (var j = 0; j < sel && j < raw.length; j++) if (MASK_D.test(raw.charAt(j))) before++;
      var pos = maskCaret(out, before);
      try { input.setSelectionRange(pos, pos); } catch (err) { }
    }
    last = out;
  });
  input.addEventListener('blur', function () {   // 붙여넣기·자동완성 뒤 한 번 더 정리
    var out = fmt(input.value);
    if (out !== input.value) input.value = out;
    last = out;
  });
}
function todayParts() {
  var d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}
function api(payload) {
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  }).then(function (r) {
    return r.text().then(function (t) {
      try { return JSON.parse(t); }
      catch (e) {
        var msg = String(t || '').replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
        throw new Error('HTTP ' + r.status + (msg ? ' · ' + msg : '응답을 읽지 못했습니다'));
      }
    });
  });
}
function toast(msg) {
  var t = el('<div style="position:fixed;left:50%;bottom:calc(var(--bar) + 22px);transform:translateX(-50%);' +
    'background:rgba(23,24,26,.9);color:#fff;font-size:13.5px;padding:9px 14px;border-radius:20px;z-index:90;' +
    'max-width:84vw;text-align:center">' + esc(msg) + '</div>');
  document.body.appendChild(t);
  setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, 1600);
  setTimeout(function () { t.remove(); }, 2000);
}
function dataUrlToBytes(u) {
  var b64 = u.split(',')[1], bin = atob(b64), n = bin.length, arr = new Uint8Array(n);
  for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/* ---------------- PDF(원본) ---------------- */
var _pdfDoc = null, _pageImg = {};
var _bytes = null, _bytesJob = null;   // 원본 PDF 바이트(화면·저장 공용, 1회만 내려받음)
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
function contractBytes() {
  if (_bytes) return Promise.resolve(_bytes);
  if (_bytesJob) return _bytesJob;
  _bytesJob = fetch(docPdf()).then(function (r) {
    if (!r.ok) throw new Error('doc_fetch');
    return r.arrayBuffer();
  }).then(function (b) { _bytes = new Uint8Array(b); return _bytes; })
    .catch(function (e) { _bytesJob = null; throw e; });
  return _bytesJob;
}
function getPdf() {
  if (_pdfDoc) return Promise.resolve(_pdfDoc);
  return contractBytes().then(function (bytes) {
    return pdfjsLib.getDocument({
      data: bytes.slice(0),
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/', cMapPacked: true
    }).promise;
  }).then(function (d) { _pdfDoc = d; return d; });
}
function renderPageCanvas(pno, pxWidth) {
  return getPdf().then(function (pdf) {
    return pdf.getPage(pno);
  }).then(function (page) {
    var scale = pxWidth / PW;
    var vp = page.getViewport({ scale: scale });
    var cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () { return cv; });
  });
}
function pageImage(pno) {   // 화면용 이미지 캐시(~170dpi)
  if (_pageImg[pno]) return Promise.resolve(_pageImg[pno]);
  return renderPageCanvas(pno, 1400).then(function (cv) {
    _pageImg[pno] = cv.toDataURL('image/jpeg', 0.9);
    return _pageImg[pno];
  });
}

/* ---------------- 필드/값 ---------------- */
var S = { checks: {}, signs: {}, opts: {}, texts: {}, filledFirst: false };
var PAGES = [];
var fieldEls = {}, pageEls = {}, pageW = 360;

function branchPages(branch) { return branch === '논산' ? [1, 3, 6, 7] : [1, 2, 4, 5]; }
function reqFields() {
  return FIELDS.filter(function (f) { return f.req && PAGES.indexOf(f.p) >= 0; });
}
function isDone(f) {
  if (f.t === 'check') return !!S.checks[f.id];
  if (f.t === 'radio') return S.opts[f.id] != null;
  if (f.t === 'sign') return !!S.signs[f.id];
  return false;
}
function doneCount() {
  var n = 0; reqFields().forEach(function (f) { if (isDone(f)) n++; }); return n;
}
function valOf(f, c) {
  var t = todayParts();
  var pf = (c && c.prefill) || {};
  if (f.src && f.src.indexOf('p:') === 0) {
    var k0 = f.src.slice(2);
    return pf[k0] == null ? '' : String(pf[k0]);
  }
  switch (f.src) {
    case 'name': return c.name || '';
    case 'jumin': return c.jumin || '';
    case 'address': return c.address || '';
    case 'phone': return c.phone || '';
    case 'yyyy': return String(t.y);
    case 'yy': return String(t.y).slice(2);
    case 'mm': return pad2(t.m);
    case 'dd': return pad2(t.d);
    case 'startY': return c.start ? c.start.slice(0, 4) : '';
    case 'startM': return c.start ? c.start.slice(5, 7) : '';
    case 'startD': return c.start ? c.start.slice(8, 10) : '';
    case 'endY': return c.end ? c.end.slice(0, 4) : '';
    case 'endM': return c.end ? c.end.slice(5, 7) : '';
    case 'endD': return c.end ? c.end.slice(8, 10) : '';
  }
  return '';
}
var _mc = document.createElement('canvas').getContext('2d');
function fitFont(text, wPt, hPt) {
  var size = Math.min(hPt * 0.64, 11.5);
  _mc.font = '500 100px ' + FONT;
  var w100 = _mc.measureText(text || '').width;
  if (!w100) return size;
  var fit = (wPt * 0.98) / (w100 / 100);
  return Math.max(4.2, Math.min(size, fit));
}

/* ---------------- 수신자 화면 ---------------- */
var app = null, CT = null, CO = null;
var DUO = null, SIG_ONE = '', STEP = 1, STEPN = 1, _stepA = null;
function fieldsOfDoc(ct) {
  var c = /종료/.test((ct && ct.type) || '');
  var fl = c ? CLOSE_FIELDS : CONTRACT_FIELDS;
  var pages = c ? CLOSE_PAGES.slice(0) : branchPages(ct.branch);
  return fl.filter(function (f) { return pages.indexOf(f.p) >= 0; });
}
function pickState(ct, st) {          // 문서 1건 몫만 골라내기
  var ids = {};
  fieldsOfDoc(ct).forEach(function (f) { ids[f.id] = 1; });
  var out = { checks: {}, signs: {}, opts: {}, texts: {} };
  ['checks', 'signs', 'opts', 'texts'].forEach(function (k) {
    Object.keys((st && st[k]) || {}).forEach(function (id) { if (ids[id]) out[k][id] = st[k][id]; });
  });
  return out;
}
function applyDoc(d) {                 // 현재 문서를 CT/CO/FIELDS/PAGES에 물림
  CT = d.ct; CO = d.co || {};
  FORM = /종료/.test(CT.type || '') ? 'close' : 'contract';
  FIELDS = isClose() ? CLOSE_FIELDS : CONTRACT_FIELDS;
  PAGES = isClose() ? CLOSE_PAGES.slice(0) : branchPages(CT.branch);
  _outDoc = null; _outJob = null;
}
function showRecipient(token) {
  var t2 = qs('t2');
  app.innerHTML = '<div class="notice">계약서를 불러오는 중입니다…</div>';
  var jobs = [api({ action: 'get', token: token })];
  if (t2) jobs.push(api({ action: 'get', token: t2 }).catch(function () { return { ok: false }; }));
  Promise.all(jobs).then(function (res) {
    var r = res[0];
    if (!r || !r.ok) {
      app.innerHTML = '<div class="notice err">' +
        (r && r.error === 'not_found' ? '계약 링크를 찾을 수 없습니다. 담당자에게 다시 받아 주세요.' : '계약서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.') +
        '</div>';
      return;
    }
    DUO = null; SIG_ONE = ''; STEP = 1; STEPN = 1; _stepA = null;
    S = { checks: {}, signs: {}, opts: {}, texts: {}, filledFirst: false };
    CONSENT_OK = false; CONSENT_AT = '';
    var a = { ct: r.contract, co: r.company || {} };
    var r2 = res[1];
    var b = (r2 && r2.ok && r2.contract && !/종료/.test(r2.contract.type || ''))
      ? { ct: r2.contract, co: r2.company || {} } : null;
    if (b) {                             // 계룡 + 논산 동시 발송: 한 링크로 두 문서
      var both = [a, b];
      var todo = both.filter(function (d) { return d.ct.status !== '완료'; });
      if (!todo.length) { applyDoc(a); showDoneBoth(both); return; }
      if (todo.length === 1) { applyDoc(todo[0]); showIntro(); return; }
      DUO = { docs: both }; STEPN = 2;
      applyDoc(both[0]); showIntro(); return;
    }
    applyDoc(a);
    if (CT.status === '완료') { showAlreadyDone(); return; }
    showIntro();
  }).catch(function () {
    app.innerHTML = '<div class="notice err">네트워크 오류로 계약서를 불러오지 못했습니다. 새로고침해 주세요.</div>';
  });
}
function showDoneBoth(docs) {            // 두 지사 모두 완료
  var rows = docs.map(function (d) {
    return '<div class="kv"><span class="k">' + esc(d.ct.branch) + '지사</span><span class="v">서명 완료' +
      (d.ct.done ? ' · ' + esc(d.ct.done) : '') + '</span></div>';
  }).join('');
  app.innerHTML = '';
  app.appendChild(el('<div>' +
    '<header class="top"><div class="tinfo"><div class="t1">' + esc(CT.type || '관리사님 계약서식') + ' (계룡·논산지사)</div>' +
    '<div class="t2">' + esc(CT.name) + '</div></div></header>' +
    '<div class="wrap">' +
    '<div class="card" style="text-align:center;padding:26px 16px">' +
    '<div style="font-size:38px;line-height:1">✅</div>' +
    '<h2 style="margin-top:10px">이미 서명이 완료된 문서입니다</h2>' +
    '<p class="muted" style="margin:6px 0 0">계룡·논산 계약서 모두 서명이 끝났습니다.</p>' +
    '</div>' +
    '<div class="card"><h2>계약 내용</h2>' + rows +
    '<div class="kv"><span class="k">성명</span><span class="v">' + esc(CT.name) + '</span></div>' +
    '<div class="kv"><span class="k">계약기간</span><span class="v">' + esc(CT.start) + ' ~ ' + esc(CT.end) + '</span></div></div>' +
    '<p class="muted small" style="text-align:center">문의: 가온누리 산후도우미 담당자</p></div></div>'));
}
function showAlreadyDone() {
  var parts = String(CT.done || '').split(' ');
  app.innerHTML = '';
  app.appendChild(el(
    '<div>' +
    '<header class="top"><div class="tinfo"><div class="t1">' + esc(docTitle()) + '</div>' +
    '<div class="t2">' + esc(CO.branch || CT.branch) + '지사 · ' + esc(CT.name) + '</div></div></header>' +
    '<div class="wrap">' +
    '<div class="card" style="text-align:center;padding:26px 16px">' +
    '<div style="font-size:38px;line-height:1">✅</div>' +
    '<h2 style="margin-top:10px">이미 서명이 완료된 문서입니다</h2>' +
    '<p class="muted" style="margin:6px 0 0">' + esc(parts[0] || '') + ' ' + esc(parts[1] || '') + ' 완료</p>' +
    '</div>' +
    summaryCard() +
    '<p class="muted small" style="text-align:center">문의: 가온누리 산후도우미 담당자</p></div></div>'));
}
function summaryCard() {
  return '<div class="card"><h2>계약 내용</h2>' +
    '<div class="kv"><span class="k">지사</span><span class="v">' + esc(CO.branch || CT.branch) + '지사</span></div>' +
    '<div class="kv"><span class="k">성명</span><span class="v">' + esc(CT.name) + '</span></div>' +
    '<div class="kv"><span class="k">' + periodLabel() + '</span><span class="v">' + esc(CT.start) + ' ~ ' + esc(CT.end) + '</span></div>' +
    '</div>';
}

/* =============================================================
   문서 도착 안내(랜딩) → 전자서명 동의 → 계약서 작성
   이폼사인 서명 전 단계 화면을 그대로 옮긴 흐름
   ============================================================= */
var CONSENT_OK = false, CONSENT_AT = '';

function docTitle() {
  if (isClose()) return CT.type || '서비스 종료안내문';
  return (CT.type || '관리사님 계약서식') + ' (' + (CT.branch || CO.branch || '계룡') + '지사)';
}
function docTitleDuo() { return (CT.type || '관리사님 계약서식') + ' (계룡·논산지사)'; }
function periodLabel() { return isClose() ? '서비스기간' : '계약기간'; }
function fmtYMD(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function deadlineOf() {   // 문서 제출 기한: 생성일 + 7일
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(CT.created || ''));
  var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

function showIntro() {
  var dl = deadlineOf(), late = fmtYMD(dl) < fmtYMD(new Date());
  app.innerHTML = '';
  app.appendChild(el('<div class="intro">' +
    '<div class="brandbar"><span class="mark">가</span><span class="bn">가온누리산후도우미</span></div>' +
    '<div class="pad">' +
    '<h1>검토할 문서가 도착하였습니다.</h1>' +
    '<p class="lead">' + esc(CT.type || '관리사님 계약서식') + ' 내용을 검토하시고, 작성 후 전송해 주세요.</p>' +
    (DUO ? '<p class="hint" style="color:var(--brand);font-weight:700;line-height:1.6">' +
      '계룡지사·논산지사 계약서 <b>2건</b>을 한 번에 작성합니다.<br>' +
      '1단계 계룡 → 2단계 논산 순서로 진행되고, 서명은 <b>한 번만</b> 하시면 두 문서에 모두 적용됩니다.</p>' : '') +
    '<p class="hint">아래 <b>문서 검토 및 작성</b> 버튼을 눌러 문서를 검토하세요.</p>' +
    '<p class="deadline' + (late ? ' late' : '') + '">문서 제출 기한은 <b>' + fmtYMD(dl) + '</b>까지입니다.' +
    (late ? '<br>기한이 지났습니다. 담당자에게 문의해 주세요.' : '') + '</p>' +
    '<button class="bigbtn" id="startBtn">문서 검토 및 작성</button>' +
    '<div class="summary">' +
    '<div class="row"><span class="k">문서 제목 :</span><span class="v">' + esc(DUO ? docTitleDuo() : docTitle()) + '</span></div>' +
    '<div class="row"><span class="k">보낸 사람 :</span><span class="v">가온누리산후도우미</span></div>' +
    '<div class="row"><span class="k">수신인 :</span><span class="v">' + esc(CT.name) + '님</span></div>' +
    (isClose() && (CT.prefill || {}).voucher ? '<div class="row"><span class="k">이용유형 :</span><span class="v">' + esc(CT.prefill.voucher) + ((CT.prefill || {}).term ? ' · ' + esc(CT.prefill.term) : '') + '</span></div>' : '') +
    '<div class="row"><span class="k">' + periodLabel() + ' :</span><span class="v">' + esc(CT.start) + ' ~ ' + esc(CT.end) + '</span></div>' +
    '</div>' +
    '<div class="policy">' +
    '<h3>개인정보처리방침</h3>' +
    '<h4>* 링크를 다른 사람에게 공유하지 마십시오.</h4>' +
    '<p>이 링크는 ' + esc(CT.name) + '님에게 보낸 문서 링크입니다. 수신인 외 다른 사람이 열람하여 발생하는 문제에 대해서는 가온누리산후도우미가 책임지지 않습니다.</p>' +
    '<h4>* 어떻게 작성해야 하나요?</h4>' +
    '<p>위 <b>문서 검토 및 작성</b> 버튼을 클릭하면 문서 작성 화면으로 이동합니다. 표시된 입력 항목에 동의 및 서명을 진행해 주세요.</p>' +
    '<h4>* 버튼을 눌러도 문서가 보이지 않습니다.</h4>' +
    '<p>문서 작성 유효기간이 만료되었거나 문서가 수정 중일 수 있습니다. 문서를 보낸 사람에게 문의하십시오.</p>' +
    '</div>' +
    '<div class="foot">가온누리산후도우미 · 전자계약</div>' +
    '</div></div>'));
  $('#startBtn').addEventListener('click', function () {
    buildRecipientUi();     // 실제 계약서 화면(하단 바는 동의 전 비활성)
    showConsent();          // 서명 전 전자문서·전자서명 동의
  });
  window.scrollTo(0, 0);
}

/* 전자문서 및 전자서명 사용 동의 패널 (문서 화면 위 상단 오버레이) */
function showConsent() {
  var old = $('#consent'); if (old) old.remove();
  var ov = el('<div class="consent" id="consent">' +
    '<div class="cbox">' +
    '<div class="chead">' + esc(DUO ? docTitleDuo() : docTitle()) + '</div>' +
    '<div class="cbody">' +
    '<p class="cq">전자문서 및 전자서명 사용 동의서를 확인하시고 동의 여부를 체크해 주세요.</p>' +
    '<label class="ck" id="ck"><input type="checkbox" id="ckin"><span class="bx"></span>' +
    '<span class="ct">전자문서 및 전자서명 사용에 동의합니다.</span></label>' +
    '<button class="more" id="cmore">[자세히 보기]</button>' +
    '<div class="crow"><button class="btn gray" id="cgo" disabled>계속</button></div>' +
    '</div></div>' +
    '</div>');
  document.body.appendChild(ov);
  var ck = $('#ckin', ov), go = $('#cgo', ov);
  ck.addEventListener('change', function () {
    $('#ck', ov).classList.toggle('on', ck.checked);
    go.disabled = !ck.checked;
    go.className = 'btn' + (ck.checked ? '' : ' gray');
  });
  $('#cmore', ov).addEventListener('click', showConsentDetails);
  go.addEventListener('click', function () {
    if (!ck.checked) return;
    CONSENT_OK = true; CONSENT_AT = todayParts().y + '-' + pad2(todayParts().m) + '-' + pad2(todayParts().d) +
      ' ' + pad2(new Date().getHours()) + ':' + pad2(new Date().getMinutes()) + ':' + pad2(new Date().getSeconds());
    ov.remove();
    updateBar();
    api({ action: 'consent', token: CT.token, at: CONSENT_AT, ua: navigator.userAgent }).catch(function () { });
    var wrap = $('#docwrap'); if (wrap) wrap.scrollTop = 0;
    window.scrollTo(0, 0);
  });
}

function showConsentDetails() {
  var s = el('<div class="sheet" id="lawsheet"><div class="panel lawpanel">' +
    '<h3>전자문서 및 전자서명 안내</h3>' +
    '<div class="law">' +
    '<h4>전자문서 및 전자서명의 효력</h4>' +
    '<p>· 「전자문서 및 전자거래 기본법」 제4조에 따라 전자문서는 다른 법령에 특별한 규정이 있는 경우를 제외하고 문서로서의 효력이 인정됩니다.</p>' +
    '<p>· 같은 법 제7조에 따라 전자문서는 작성자 등의 명의로 작성된 것임이 표시되고 그 내용을 확인할 수 있는 상태로 송신·수신된 경우 작성자 등의 의사표시가 기재된 것으로 봅니다.</p>' +
    '<p>· 「전자서명법」 제3조에 따라 전자서명은 다른 법령에 특별한 규정이 있는 경우를 제외하고 서명 또는 서명날인과 같은 효력을 가집니다.</p>' +
    '<p>· 이 계약의 전자서명은 수신인 본인이 직접 작성하며, 동의·작성·제출 일시와 접속 환경이 기록·보관됩니다.</p>' +
    '<h4>이용 안내</h4>' +
    '<p>· 링크는 수신인 본인만 열람해 주세요. 다른 사람과 공유하지 마십시오.</p>' +
    '<p>· 서명을 제출한 뒤에는 수정이 어려우니 입력 내용을 다시 한 번 확인해 주세요.</p>' +
    '<p>· 문의: 가온누리산후도우미 담당자</p>' +
    '</div>' +
    '<div style="margin-top:14px"><button class="btn" id="lawok">확인</button></div>' +
    '</div></div>');
  document.body.appendChild(s);
  s.querySelector('#lawok').addEventListener('click', function () { s.remove(); });
  s.addEventListener('click', function (e) { if (e.target === s) s.remove(); });
}

function buildRecipientUi() {
  PAGES = isClose() ? CLOSE_PAGES.slice(0) : branchPages(CT.branch);
  fieldEls = {}; pageEls = {};
  app.innerHTML = '';
  var top = el(
    '<header class="top">' +
    '<div class="tinfo"><div class="t1">' + (DUO ? '<span style="color:var(--brand)">' + STEP + '/' + STEPN + '</span> ' : '') + esc(docTitle()) + '</div>' +
    '<div class="t2">' + esc(CT.branch || CO.branch) + '지사 · ' + esc(CT.name) + ' · ' + esc(CT.start) + '~' + esc(CT.end) + '</div></div>' +
    '<div class="zoom"><button data-z="1" class="on">맞춤</button><button data-z="1.5">확대</button><button data-z="2.1">크게</button></div>' +
    '</header>');
  app.appendChild(top);
  if (DUO) {
    app.appendChild(el('<div class="duonote">' +
      (STEP === 1
        ? '<b>계룡·논산 지사 계약서가 함께 작성됩니다.</b> 공통 1쪽(개인정보 동의·서명)은 한 번만 작성하면 두 계약서에 똑같이 반영됩니다. 서명은 1회만 해 주세요.'
        : '<b>논산지사 계약서(2단계)</b>입니다. 1쪽은 1단계에서 작성한 내용이 그대로 반영되었습니다. 논산에서 다른 부분만 확인·체크해 주세요.') +
      '</div>'));
  }

  var wrap = el('<div class="docwrap" id="docwrap"><div class="pages" id="pages"></div></div>');
  app.appendChild(wrap);

  var bar = el(
    '<div class="bottombar" id="bar">' +
    '<div class="prog"><div class="pl" id="pl">필수 입력 항목 <span>(0/' + reqFields().length + ')</span></div><div class="pips" id="pips"></div></div>' +
    '<button id="nextBtn">입력 시작</button>' +
    '</div>');
  app.appendChild(bar);
  app.appendChild(el('<div class="loading" id="load"><div class="spin"></div><div>원본 계약서를 불러오는 중입니다…</div></div>'));

  Promise.all(PAGES.map(function (p) { return pageImage(p); })).then(function (imgs) {
    var pv = $('#pages'); pv.innerHTML = '';
    var wrapEl = pv;
    PAGES.forEach(function (pno, i) {
      var page = el('<div class="page" data-p="' + pno + '"><img class="pgimg" alt="계약서 ' + (i + 1) + '쪽">' +
        '<div class="ovl"></div><div class="pglabel">' + (i + 1) + ' / ' + PAGES.length + '</div></div>');
      page.querySelector('img').src = imgs[i];
      wrapEl.appendChild(page);
      pageEls[pno] = page;
      var ovl = page.querySelector('.ovl');
      FIELDS.filter(function (f) { return f.p === pno; }).forEach(function (f) { ovl.appendChild(buildField(f)); });
    });
    var l = $('#load'); if (l) l.remove();
    layoutDoc();
    updateBar();
    bindUi();
    if (SIG_ONE) {          // 2단계 문서에는 1단계 서명을 그대로 적용
      signFieldIds().forEach(function (id) { S.signs[id] = SIG_ONE; paintSignNode(id, SIG_ONE); });
      updateBar();
    }
    // 관리사가 문서를 읽고 서명하는 동안 최종 PDF 베이스를 미리 만들어 둔다(제출 대기 최소화)
    var warm = function () { prepareOut().catch(function () { }); };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 2500 });
    else setTimeout(warm, 800);
  }).catch(function () {
    var l = $('#load');
    if (l) l.innerHTML = '<div class="notice err">원본 계약서를 불러오지 못했습니다. 새로고침해 주세요.</div>';
  });
}

function buildField(f) {
  var styles = 'left:' + (f.x / PW * 100).toFixed(4) + '%;top:' + (f.y / PH * 100).toFixed(4) + '%;' +
    'width:' + (f.w / PW * 100).toFixed(4) + '%;height:' + (f.h / PH * 100).toFixed(4) + '%;';
  var node;
  if (f.t === 'text') {
    node = el('<div class="f txt' + (f.padr ? ' ta-r' : '') + '" style="' + styles + '"><span class="val"></span></div>');
    var v = valOf(f, CT);
    node.querySelector('.val').textContent = v;
    node.title = v;
  } else if (f.t === 'radio') {
    node = el('<div class="f radio" style="' + styles + '"></div>');
    f.rows.forEach(function (ry, i) {
      var o = el('<div class="opt"><span class="box"></span></div>');
      o.addEventListener('click', function () { pickOpt(f, i); });
      node.appendChild(o);
    });
  } else if (f.t === 'area') {
    node = el('<div class="f area" style="' + styles + '">' +
      '<span class="ph">눌러서 의견을 입력해 주세요 (선택)</span><span class="val"></span></div>');
    node.addEventListener('click', function () { openArea(f); });
  } else if (f.t === 'check') {
    node = el('<div class="f chk" style="' + styles + '" role="checkbox" aria-checked="' + (S.checks[f.id] ? 'true' : 'false') + '">' +
      '<span class="box"></span>' +
      '<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12.6 L9.6 18 L19.6 5.6" stroke="#0f5fa8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span class="hit"></span></div>');
    if (S.checks[f.id]) node.classList.add('on');
    node.addEventListener('click', function () {
      S.checks[f.id] = !S.checks[f.id];
      node.classList.toggle('on', !!S.checks[f.id]);
      node.setAttribute('aria-checked', S.checks[f.id] ? 'true' : 'false');
      updateBar();
    });
  } else {
    node = el('<div class="f sign" style="' + styles + '" role="button" tabindex="0">' +
      '<span class="box"></span><span class="lbl">서명</span><img alt=""></div>');
    node.addEventListener('click', function () { openSignPad(f); });
    node.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSignPad(f); } });
  }
  node.setAttribute('data-f', f.id);
  fieldEls[f.id] = node;
  return node;
}

/* 모니터링 문항: 한 문항(그룹) 안에서 하나만 선택 */
function pickOpt(f, i) {
  S.opts[f.id] = i;
  var n = fieldEls[f.id];
  if (n) {
    Array.prototype.forEach.call(n.children, function (o, j) { o.classList.toggle('on', j === i); });
  }
  updateBar();
}
function openArea(f) {
  var sheet = el('<div class="sheet"><div class="panel">' +
    '<h3>이용자 의견</h3>' +
    '<div class="muted small">만족하셨던 점, 불편하셨던 점을 자유롭게 적어 주세요. (선택)</div>' +
    '<textarea class="areainput" id="areaIn" rows="6" placeholder="예: 관리사님이 친절하셨고 신생아 돌봄에 큰 도움이 되었습니다."></textarea>' +
    '<div class="row2" style="margin-top:10px"><button class="btn gray" id="cancel">취소</button><button class="btn" id="ok">입력 완료</button></div>' +
    '</div></div>');
  document.body.appendChild(sheet);
  var ta = sheet.querySelector('#areaIn');
  ta.value = S.texts[f.id] || '';
  setTimeout(function () { try { ta.focus(); } catch (e) { } }, 80);
  sheet.querySelector('#cancel').addEventListener('click', function () { sheet.remove(); });
  sheet.querySelector('#ok').addEventListener('click', function () {
    S.texts[f.id] = ta.value.trim();
    paintArea(f);
    sheet.remove();
    updateBar();
  });
}
function paintArea(f) {
  var n = fieldEls[f.id]; if (!n) return;
  var v = S.texts[f.id] || '';
  n.querySelector('.val').textContent = v;
  n.classList.toggle('on', !!v);
  layoutArea(f, n);
}

function layoutDoc() {
  var wrap = $('#docwrap'); if (!wrap) return;
  var avail = Math.min(wrap.clientWidth - 20, 660);
  var zb = document.querySelector('.zoom button.on');
  var zoom = zb ? (parseFloat(zb.getAttribute('data-z')) || 1) : 1;
  pageW = Math.max(240, Math.round(avail * zoom));
  var k = pageW / PW;
  Object.keys(pageEls).forEach(function (p) { pageEls[p].style.setProperty('--pw', pageW + 'px'); pageEls[p].style.setProperty('--k', k); });
  FIELDS.forEach(function (f) {
    var n = fieldEls[f.id]; if (!n) return;
    if (f.t === 'text') {
      var v = valOf(f, CT);
      var size = fitFont(v, f.w, f.h);
      var sp = n.querySelector('.val');
      sp.style.fontSize = (size * k).toFixed(2) + 'px';
      if (f.padr) n.style.paddingRight = (f.padr * k).toFixed(2) + 'px';
    } else if (f.t === 'radio') {
      layoutRadio(f, n, k);
    } else if (f.t === 'area') {
      layoutArea(f, n);
    }
  });
}
function layoutRadio(f, n, k) {
  /* f.bx/bw/bh = 원본 PDF의 □ 네모 칸, f.rows[i] = 그 칸의 세로 중심 */
  var wpx = f.bw * k, hpx = f.bh * k;
  var left = (f.bx - f.x) * k;
  var pitch = 1e9;
  for (var i = 1; i < f.rows.length; i++) {
    var d = Math.abs(f.rows[i] - f.rows[i - 1]);
    if (d > 0 && d < pitch) pitch = d;
  }
  if (!isFinite(pitch) || pitch === 1e9) pitch = f.gap || 16;
  // 한 줄 높이가 옆 줄 간격을 넘으면 위 줄 선택을 가로채므로 간격 안으로 제한
  var rowH = pitch * k * 0.96;
  Array.prototype.forEach.call(n.children, function (o, i) {
    var cy = (f.rows[i] - f.y) * k;
    o.style.top = (cy - rowH / 2).toFixed(2) + 'px';
    o.style.height = rowH.toFixed(2) + 'px';
    var box = o.querySelector('.box');
    box.style.width = wpx.toFixed(2) + 'px';
    box.style.height = hpx.toFixed(2) + 'px';
    box.style.left = left.toFixed(2) + 'px';
  });
}
function layoutArea(f, n) {
  var wrapEl = $('#docwrap');
  var k = wrapEl ? (pageW / PW) : 0.6;
  var sp = n.querySelector('.val'), ph = n.querySelector('.ph');
  if (sp) { sp.style.fontSize = (10.5 * k).toFixed(2) + 'px'; sp.style.lineHeight = '1.5'; }
  if (ph) { ph.style.fontSize = (10 * k).toFixed(2) + 'px'; }
  n.classList.toggle('on', !!S.texts[f.id]);
}

function bindUi() {
  var btn = $('#nextBtn');
  btn.addEventListener('click', function () {
    if (doneCount() === reqFields().length) {
      if (DUO && STEP === 1) { goStep2(); return; }
      openSubmitSheet(); return;
    }
    goNext();
  });
  document.querySelectorAll('.zoom button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.zoom button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      layoutDoc();
    });
  });
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layoutDoc, 120); });
}

function updateBar() {
  var req = reqFields(), done = 0;
  req.forEach(function (f) { if (isDone(f)) done++; });
  var pl = $('#pl'), pips = $('#pips'), btn = $('#nextBtn');
  if (!pl) return;
  pl.innerHTML = '필수 입력 항목 <span>(' + done + '/' + req.length + ')</span>';
  var html = '';
  for (var i = 0; i < req.length; i++) html += '<i class="' + (i < done ? 'on' : '') + '"></i>';
  pips.innerHTML = html;
  var all = done === req.length;
  btn.textContent = all
    ? (DUO ? (STEP === 1 ? '다음 · 논산 계약서' : '작성 완료 · 2건 제출하기') : '작성 완료 · 제출하기')
    : (done === 0 ? '입력 시작' : '다음 항목');
  btn.disabled = !CONSENT_OK;      // 전자서명 동의 전에는 시작할 수 없음
}

function nextUnfilled() {
  var req = reqFields().slice().sort(function (a, b) {
    if (a.p !== b.p) return PAGES.indexOf(a.p) - PAGES.indexOf(b.p);
    if (Math.abs(a.y - b.y) > 6) return a.y - b.y;
    return a.x - b.x;
  });
  for (var i = 0; i < req.length; i++) if (!isDone(req[i])) return req[i];
  return null;
}
function goNext() {
  var f = nextUnfilled();
  if (!f) { openSubmitSheet(); return; }
  var n = fieldEls[f.id];
  n.scrollIntoView({ behavior: 'smooth', block: 'center' });
  n.classList.add('flash');
  setTimeout(function () { n.classList.remove('flash'); }, 2400);
  if (f.t === 'sign') setTimeout(function () { openSignPad(f); }, 420);
}

/* 1단계(계룡) 완료 → 2단계(논산)로 이어서 */
function goStep2() {
  if (_submitting) return;
  _submitting = true;
  showLoading('1단계 계룡 계약서를 준비하고 있어요', '이어서 논산 계약서가 열립니다. 창을 닫지 말아 주세요');
  var aState = pickState(CT, S), aConsent = CONSENT_AT, aCT = CT, aPages = PAGES.slice(0);
  var t0 = Date.now();
  buildFirstDuoPdf().then(function (outA) {
    _stepA = {
      token: aCT.token, st: aState, consentAt: aConsent, branch: aCT.branch,
      doc: outA, pages: aPages, ms: Date.now() - t0, pdf: ''
    };
    var d = DUO.docs[1];
    STEP = 2;
    applyDoc(d);
    hideLoading(); _submitting = false;
    buildRecipientUi();
    window.scrollTo(0, 0);
    toast('계룡 계약서 완료 · 논산은 다른 부분만 확인하고 서명 없이 제출하면 됩니다');
  }).catch(function (e) {
    hideLoading(); _submitting = false;
    toast('1단계 계약서를 준비하지 못했습니다. 다시 시도해 주세요');
    console.error(e);
  });
}

/* ---------------- 서명: 한 번 서명하면 서명란 전체에 적용 ---------------- */
function signFieldIds() {
  return reqFields().filter(function (f) { return f.t === 'sign'; }).map(function (f) { return f.id; });
}
function paintSignNode(id, data) {
  var n = fieldEls[id]; if (!n) return;
  var im = n.querySelector('img'); if (im) im.src = data;
  n.classList.add('on');
  n.classList.remove('flash');
}
function applySignAll(data, fromId) {
  SIG_ONE = data;                  // 두 지사 문서에 같이 심을 서명
  var ids = signFieldIds();
  if (!ids.length && fromId) ids = [fromId];
  ids.forEach(function (id) { S.signs[id] = data; paintSignNode(id, data); });
  return ids.length;
}
function afterSignApply() {
  updateBar();
  var ids = signFieldIds();
  var left = reqFields().filter(function (f) { return !isDone(f); });
  if (!left.length) {
    toast(DUO && STEP === 1
      ? '1단계 서명 완료 · [다음 · 논산 계약서]를 누르면 논산 서명란에도 자동 적용됩니다'
      : '필수 항목을 모두 채웠습니다. 제출해 주세요.');
    return;
  }
  toast(DUO && STEP === 1
    ? '서명을 서명란 ' + ids.length + '곳에 적용했습니다 (논산 계약서에도 자동 적용)'
    : '서명을 서명란 ' + ids.length + '곳에 모두 적용했습니다');
  var nf = nextUnfilled();
  if (nf && nf.t === 'check') {
    var n = fieldEls[nf.id];
    if (n) setTimeout(function () {
      n.scrollIntoView({ behavior: 'smooth', block: 'center' });
      n.classList.add('flash');
      setTimeout(function () { n.classList.remove('flash'); }, 2400);
    }, 380);
  }
}

/* ---------------- 서명 패드 ---------------- */
function openSignPad(f) {
  var title = isClose() ? '산모 확인 서명' : (f.p === 1 ? '개인정보 동의 서명' : (f.p === 2 || f.p === 3 ? '보안각서 서명' : '계약서 서명'));
  var signN = signFieldIds().length || 1;
  var sheet = el('<div class="sheet"><div class="panel">' +
    '<h3>' + title + '</h3>' +
    '<div class="muted small">아래 칸에 손글씨로 서명해 주세요.' +
    (signN > 1 ? ' 한 번만 서명하면 서명란 <b>' + signN + '곳</b>에 모두 적용됩니다.' : '') + '</div>' +
    '<div class="padwrap"><canvas></canvas><div class="ph">여기에 서명</div></div>' +
    '<div class="hintline"><button class="linkbtn" id="clr">다시 쓰기</button>' +
    (Object.keys(S.signs).length ? '<button class="linkbtn" id="reuse" style="color:var(--brand)">최근 서명 그대로</button>' : '') +
    '<span class="muted small">' + esc(CT.name) + ' 님</span></div>' +
    '<div class="row2" style="margin-top:10px"><button class="btn gray" id="cancel">취소</button><button class="btn" id="ok">서명 완료</button></div>' +
    '</div></div>');
  document.body.appendChild(sheet);

  var cv = sheet.querySelector('canvas'), wrap = sheet.querySelector('.padwrap'), ph = sheet.querySelector('.ph');
  var ctx = cv.getContext('2d'), dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  var drawn = false, drawing = false, last = null, prevMid = null;
  var LW = 3.4;
  function resize() {
    var r = wrap.getBoundingClientRect();
    var w = Math.max(200, r.width), h = 230;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111'; ctx.fillStyle = '#111';
    ctx.lineWidth = LW; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawing = false; last = null; prevMid = null;
  }
  setTimeout(resize, 30);
  function pos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left), y: (e.clientY - r.top) };
  }
  cv.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button > 0) return;
    e.preventDefault();
    drawing = true; drawn = true; ph.style.display = 'none';
    try { cv.setPointerCapture(e.pointerId); } catch (_) { }
    last = pos(e); prevMid = { x: last.x, y: last.y };
    // 살짝 눌렀다 떼도 점이 찍히도록 시작점에 둥근 점
    ctx.beginPath(); ctx.arc(last.x, last.y, Math.max(1.7, LW / 2), 0, Math.PI * 2); ctx.fill();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drawing || !last) return;
    e.preventDefault();
    var p = pos(e);
    var dx = p.x - last.x, dy = p.y - last.y;
    if ((dx * dx + dy * dy) < 0.04) return;   // 같은 자리 반복 이벤트 무시
    var mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    // 이전 중간점 → 현재 점(제어점) → 새 중간점 : 빈틈 없는 연속 곡선
    ctx.beginPath();
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.stroke();
    prevMid = mid; last = p;
  });
  function endStroke(e) {
    if (!drawing) return;
    drawing = false;
    if (last && prevMid) {
      // 마지막 중간점에서 실제 마지막 점까지 마저 이어 붙임
      ctx.beginPath(); ctx.moveTo(prevMid.x, prevMid.y); ctx.lineTo(last.x, last.y); ctx.stroke();
    }
    last = null; prevMid = null;
  }
  cv.addEventListener('pointerup', endStroke);
  cv.addEventListener('pointercancel', endStroke);
  cv.addEventListener('pointerleave', endStroke);
  cv.addEventListener('lostpointercapture', endStroke);

  sheet.querySelector('#clr').addEventListener('click', function () { resize(); drawn = false; ph.style.display = ''; });
  sheet.querySelector('#cancel').addEventListener('click', function () { sheet.remove(); });
  var reuseBtn = sheet.querySelector('#reuse');
  if (reuseBtn) reuseBtn.addEventListener('click', function () {
    var key = Object.keys(S.signs)[0];
    if (!key) return;
    sheet.remove();
    applySignAll(S.signs[key], f.id);
    afterSignApply();
  });
  sheet.querySelector('#ok').addEventListener('click', function () {
    if (!drawn) { toast('서명을 먼저 해 주세요'); return; }
    var data = trimCanvas(cv);
    if (!data) { toast('서명을 먼저 해 주세요'); return; }
    sheet.remove();
    applySignAll(data, f.id);
    afterSignApply();
  });
  sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.remove(); });
}
function trimCanvas(cv) {
  var w = cv.width, h = cv.height;
  var ctx = cv.getContext('2d');
  var d = ctx.getImageData(0, 0, w, h).data;
  var minX = w, minY = h, maxX = -1, maxY = -1;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4;
      if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  var padX = Math.max(6, Math.round((maxX - minX) * 0.06));
  var padY = Math.max(6, Math.round((maxY - minY) * 0.12));
  minX = Math.max(0, minX - padX); minY = Math.max(0, minY - padY);
  maxX = Math.min(w - 1, maxX + padX); maxY = Math.min(h - 1, maxY + padY);
  var cw = maxX - minX + 1, ch = maxY - minY + 1;
  var out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  var octx = out.getContext('2d');
  octx.drawImage(cv, minX, minY, cw, ch, 0, 0, cw, ch);
  // 흰 배경을 투명하게 (문서 위에 잉크만 얹히도록)
  var im = octx.getImageData(0, 0, cw, ch), d = im.data;
  for (var p = 0; p < d.length; p += 4) {
    var a = 255 - Math.min(d[p], d[p + 1], d[p + 2]);
    if (a < 14) { d[p + 3] = 0; continue; }
    d[p] = 18; d[p + 1] = 18; d[p + 2] = 22;
    d[p + 3] = Math.min(255, Math.round(a * 1.35));
  }
  octx.putImageData(im, 0, 0);
  return out.toDataURL('image/png');
}

/* ---------------- 제출 ---------------- */
function openSubmitSheet() {
  var req = reqFields(), miss = req.filter(function (f) { return !isDone(f); });
  if (miss.length) {
    toast('아직 ' + miss.length + '개 항목이 남았습니다');
    var f = miss[0];
    var n = fieldEls[f.id];
    if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.classList.add('flash'); setTimeout(function () { n.classList.remove('flash'); }, 2400); }
    return;
  }
  var sheet = el('<div class="sheet"><div class="panel">' +
    '<h3>서명을 제출할까요?</h3>' +
    '<div class="muted small">제출하면 계약서 원본에 입력한 내용과 서명이 그대로 합성되어 저장됩니다.</div>' +
    '<div class="card" style="margin:14px 0 0;padding:12px">' +
    '<div class="kv"><span class="k">문서</span><span class="v">' + esc(CT.type || '관리사님 계약서식') + (DUO ? ' (계룡 · 논산 2건)' : '') + '</span></div>' +
    '<div class="kv"><span class="k">지사</span><span class="v">' + esc(DUO ? '계룡 · 논산' : (CT.branch || CO.branch) + '지사') + '</span></div>' +
    '<div class="kv"><span class="k">성명</span><span class="v">' + esc(CT.name) + '</span></div>' +
    '<div class="kv"><span class="k">' + periodLabel() + '</span><span class="v">' + esc(CT.start) + ' ~ ' + esc(CT.end) + '</span></div>' +
    '<div class="kv"><span class="k">서명</span><span class="v">' + (DUO ? '두 문서 서명란에 동시 적용' : req.length + '개 항목 완료') + '</span></div>' +
    '</div>' +
    '<div class="row2" style="margin-top:14px"><button class="btn gray" id="cancel">취소</button>' +
    '<button class="btn" id="ok">서명 제출</button></div>' +
    '</div></div>');
  document.body.appendChild(sheet);
  sheet.querySelector('#cancel').addEventListener('click', function () { sheet.remove(); });
  sheet.querySelector('#ok').addEventListener('click', function () { sheet.remove(); doSubmit(); });
}

function showLoading(text, sub) {
  var l = $('#load');
  if (!l) { l = el('<div class="loading" id="load"></div>'); document.body.appendChild(l); }
  l.innerHTML = '<div class="spin"></div><div>' + esc(text) + '</div>' + (sub ? '<div class="muted small">' + esc(sub) + '</div>' : '');
}
function hideLoading() { var l = $('#load'); if (l) l.remove(); }

function doSubmit() {
  if (_submitting) return;
  _submitting = true;
  var curCT = CT, curState = pickState(CT, S), curConsent = CONSENT_AT;
  showLoading(DUO ? '계룡·논산 문서를 저장하고 있어요' : '문서를 저장하고 있어요',
    DUO ? '서명 1장으로 2건을 서버에 저장합니다. 5~10초 걸립니다. 창을 닫지 말아 주세요' : '3~5초면 끝납니다. 창을 닫지 말아 주세요');
  var tStart = Date.now(), tBuild = 0;
  var builder = (DUO && _stepA && _stepA.doc) ? buildSecondPdf(_stepA) : buildFinalPdf();
  builder.then(function (b64) {
    tBuild = Date.now() - tStart;
    // 1단계 문서는 2단계 PDF가 1쪽을 복사해 간 뒤에 직렬화한다(pdf-lib: 저장 후 복사 불가)
    var sealA = (DUO && _stepA && _stepA.doc && !_stepA.pdf)
      ? _stepA.doc.saveAsBase64().then(function (a64) { _stepA.pdf = a64; })
      : Promise.resolve();
    return sealA.then(function () {
    var jobs = [];
    if (DUO && _stepA) jobs.push({ token: _stepA.token, pdf: _stepA.pdf, st: _stepA.st, consentAt: _stepA.consentAt, branch: _stepA.branch });
    jobs.push({ token: curCT.token, pdf: b64, st: curState, consentAt: curConsent, branch: curCT.branch });
    // 두 건은 서로 다른 문서이므로 동시에 올린다(순서대로 하면 대기 시간이 2배)
    return Promise.all(jobs.map(function (j) {
      var t1 = Date.now();
      return api({
        action: 'submit', token: j.token,
        checks: j.st.checks, signs: j.st.signs, opts: j.st.opts, texts: j.st.texts,
        consentAt: j.consentAt, pdf: j.pdf, ua: navigator.userAgent
      }).then(function (r) {
        return { branch: j.branch, ok: !!(r && r.ok), doneAt: (r && r.doneAt) || '', error: (r && r.error) || '', ms: Date.now() - t1 };
      }).catch(function (e) {
        return { branch: j.branch, ok: false, doneAt: '', error: String((e && (e.message || e)) || 'network'), ms: Date.now() - t1 };
      });
    }));
    });
  }).then(function (results) {
    hideLoading(); _submitting = false;
    try {
      window.__duoTiming = {
        aBuild: (_stepA && _stepA.ms) || 0, bBuild: tBuild,
        uploads: results.map(function (x) { return { branch: x.branch, ms: x.ms, ok: x.ok }; }),
        total: Date.now() - tStart, duo: !!DUO
      };
      console.log('[esign] 저장 시간', window.__duoTiming);
    } catch (e) { }
    var bad = results.filter(function (x) { return !x.ok; });
    if (!bad.length) {
      CT.status = '완료'; CT.done = results[results.length - 1].doneAt || '';
      showDone(results);
      return;
    }
    if (results.length === 1) {
      toast(bad[0].error === 'already_done' ? '이미 저장된 계약서입니다' : '제출에 실패했습니다. 다시 시도해 주세요');
      return;
    }
    showSubmitPartial(results);
  }).catch(function (e) {
    hideLoading(); _submitting = false;
    toast('제출 중 오류가 발생했습니다. 다시 시도해 주세요.');
    console.error(e);
  });
}

function showSubmitPartial(results) {      // 두 건 중 한 건만 저장된 경우
  var rows = results.map(function (x) {
    return '<div class="kv"><span class="k">' + esc(x.branch) + '지사</span><span class="v">' +
      (x.ok ? '저장 완료' : '저장 실패' + (x.error ? ' (' + esc(x.error) + ')' : '')) + '</span></div>';
  }).join('');
  app.innerHTML = '';
  app.appendChild(el('<div>' +
    '<header class="top"><div class="tinfo"><div class="t1">' + esc(docTitle()) + '</div>' +
    '<div class="t2">' + esc(CT.name) + '</div></div></header>' +
    '<div class="wrap"><div class="card"><h2>일부 문서만 저장되었습니다</h2>' + rows +
    '<p class="muted small" style="margin:10px 0 0">저장에 실패한 문서가 있습니다. [다시 시도]를 누르면 남은 문서부터 이어서 진행합니다.</p>' +
    '<div style="margin-top:14px"><button class="btn" id="retry">다시 시도</button></div></div></div></div>'));
  $('#retry').addEventListener('click', function () { location.reload(); });
}

function showDone(results) {
  var duo = !!(results && results.length > 1);
  var when = (results && results.length ? results[results.length - 1].doneAt : '') || '';
  var rows = duo
    ? results.map(function (x) {
        return '<div class="kv"><span class="k">' + esc(x.branch) + '지사</span><span class="v">서명 완료' +
          (x.doneAt ? ' · ' + esc(x.doneAt) : '') + '</span></div>';
      }).join('')
    : '<div class="kv"><span class="k">지사</span><span class="v">' + esc(CT.branch || CO.branch) + '지사</span></div>';
  var title = duo ? (CT.type || '관리사님 계약서식') + ' (계룡·논산지사)' : docTitle();
  app.innerHTML = '';
  app.appendChild(el('<div>' +
    '<header class="top"><div class="tinfo"><div class="t1">' + esc(title) + '</div>' +
    '<div class="t2">' + esc(CT.name) + '</div></div></header>' +
    '<div class="wrap">' +
    '<div class="card" style="text-align:center;padding:28px 16px">' +
    '<div style="font-size:40px;line-height:1">✅</div>' +
    '<h2 style="margin-top:10px">서명이 완료되었습니다</h2>' +
    '<p class="muted" style="margin:6px 0 0">' + esc(when) + ' (KST)' + (duo ? ' · 계룡·논산 2건 저장' : '') + '</p>' +
    '</div>' +
    '<div class="card"><h2>계약 내용</h2>' + rows +
    '<div class="kv"><span class="k">성명</span><span class="v">' + esc(CT.name) + '</span></div>' +
    '<div class="kv"><span class="k">' + periodLabel() + '</span><span class="v">' + esc(CT.start) + ' ~ ' + esc(CT.end) + '</span></div></div>' +
    '<div class="card"><h2>안내</h2><p class="muted small" style="margin:0">' +
    '서명하신 ' + (isClose() ? '종료안내문은' : '계약서는') + ' 가온누리 산후도우미에 자동 보관되었습니다. 따로 보내실 서류는 없습니다.<br>' +
    '문의: 가온누리 산후도우미 담당자</p></div></div></div>'));
}

/* ---------------- 최종 PDF: 원본 페이지(벡터) 복사 + 입력·체크·서명만 얹기 --------------
   · contract.pdf의 4쪽을 pdf-lib copyPages로 그대로 복사 → 본문 글자는 100% 벡터(원본과 동일)
   · 입력 글자는 칸 크기만큼만 작은 투명 PNG(1pt=4px)로, 체크는 벡터선, 서명은 서명 PNG로 얹음
   · 문서를 읽는 동안 4쪽 베이스 + 입력 글자까지 미리 만들어 두어 제출 클릭 후 대기가 거의 없음
   ------------------------------------------------------------------------------------ */
var _outDoc = null, _outJob = null, _submitting = false;

function textOverlayCanvas(f, v) {
  var k = OV;
  var cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.round(f.w * k));
  cv.height = Math.max(2, Math.round(f.h * k));
  var ctx = cv.getContext('2d');
  var size = fitFont(v, f.w, f.h) * k;
  ctx.font = '500 ' + size.toFixed(2) + 'px ' + FONT;
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'middle';
  var right = f.padr != null;
  ctx.textAlign = right ? 'right' : 'left';
  ctx.fillText(v, (right ? (f.w - f.padr) : f.w * 0.02) * k, f.h * 0.53 * k, f.w * 0.97 * k);
  return cv;
}
function prepareOut() {                      // 서명 전에 미리 만들어 두는 기본 문서
  if (_outDoc) return Promise.resolve(_outDoc);
  if (_outJob) return _outJob;
  _outJob = contractBytes().then(function (bytes) {
    return PDFLib.PDFDocument.load(bytes.slice(0));
  }).then(function (src) {
    return PDFLib.PDFDocument.create().then(function (out) {
      return out.copyPages(src, PAGES.map(function (p) { return p - 1; })).then(function (copied) {
        copied.forEach(function (p) { out.addPage(p); });
        var chain = Promise.resolve();
        copied.forEach(function (page, i) {
          FIELDS.filter(function (f) { return f.p === PAGES[i]; }).forEach(function (f) {
            if (f.t !== 'text') return;
            var v = valOf(f, CT);
            if (!v) return;
            var cv = textOverlayCanvas(f, v);
            chain = chain.then(function () {
              return out.embedPng(cv.toDataURL('image/png')).then(function (emb) {
                page.drawImage(emb, { x: f.x, y: PH - f.y - f.h, width: f.w, height: f.h });
              });
            });
          });
        });
        return chain.then(function () { _outDoc = out; _outJob = null; return out; });
      });
    });
  }).catch(function (e) { _outJob = null; throw e; });
  return _outJob;
}
function drawCheckVector(page, f) {
  var x = f.x + f.w * 0.02, y = f.y + f.h * 0.20, w = f.w * 0.56, h = f.h * 0.62;
  var lw = Math.max(1.4, w * 0.13);
  var color = PDFLib.rgb(15 / 255, 95 / 255, 168 / 255);
  var pts = [
    { x: x + w * 0.20, y: y + h * 0.50 },
    { x: x + w * 0.43, y: y + h * 0.75 },
    { x: x + w * 0.84, y: y + h * 0.24 }
  ];
  for (var i = 0; i < 2; i++) {
    page.drawLine({
      start: { x: pts[i].x, y: PH - pts[i].y },
      end: { x: pts[i + 1].x, y: PH - pts[i + 1].y },
      thickness: lw, color: color, lineCap: PDFLib.LineCapStyle.Round
    });
  }
}
function drawSignImage(page, img, f) {
  var pad = Math.min(f.w, f.h) * 0.02;
  var bw = f.w - pad * 2, bh = f.h - pad * 2;
  var ar = (img.width || 1) / (img.height || 1);
  var dw = bw, dh = bw / ar;
  if (dh > bh) { dh = bh; dw = bh * ar; }
  var dx = f.x + pad + (bw - dw) / 2;
  var dy = f.y + pad + (bh - dh) / 2;
  page.drawImage(img, { x: dx, y: PH - (dy + dh), width: dw, height: dh });
}
function drawGlyphCheck(page, f, rowY) {   // rowY = 네모 칸의 세로 중심
  var x = f.bx, y = rowY - f.bh / 2, w = f.bw, h = f.bh;
  var lw = Math.max(1.1, w * 0.16);
  var color = PDFLib.rgb(15 / 255, 95 / 255, 168 / 255);
  var pts = [
    { x: x + w * 0.14, y: y + h * 0.50 },
    { x: x + w * 0.42, y: y + h * 0.80 },
    { x: x + w * 0.88, y: y + h * 0.18 }
  ];
  for (var i = 0; i < 2; i++) {
    page.drawLine({
      start: { x: pts[i].x, y: PH - pts[i].y },
      end: { x: pts[i + 1].x, y: PH - pts[i + 1].y },
      thickness: lw, color: color, lineCap: PDFLib.LineCapStyle.Round
    });
  }
}
function wrapLines(ctx, text, maxW) {
  var out = [];
  String(text || '').split(/\n/).forEach(function (para) {
    var line = '', chars = Array.from(para);
    for (var i = 0; i < chars.length; i++) {
      var t = line + chars[i];
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = chars[i]; }
      else line = t;
    }
    out.push(line);
  });
  return out;
}
function areaOverlayCanvas(f, text) {
  var k = OV;
  var cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.round(f.w * k));
  cv.height = Math.max(2, Math.round(f.h * k));
  var ctx = cv.getContext('2d');
  var size = 10.5 * k;
  ctx.font = '500 ' + size.toFixed(1) + 'px ' + FONT;
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'top';
  var maxW = f.w * k * 0.93;
  var lines = wrapLines(ctx, text, maxW);
  var lh = size * 1.55;
  for (var i = 0; i < lines.length; i++) {
    if (f.h * k * 0.03 + i * lh > cv.height - size) break;
    ctx.fillText(lines[i], f.w * k * 0.035, f.h * k * 0.03 + i * lh, maxW);
  }
  return cv;
}
function drawOverlays(out, skipText, skipPageNo) {      // 한 문서(page 순서 = PAGES)에 입력·체크·서명을 얹기
  var pages = out.getPages();
  var chain = Promise.resolve();
  if (!skipText) {
    pages.forEach(function (page, i) {
      if (PAGES[i] === skipPageNo) return;
      FIELDS.filter(function (f) { return f.p === PAGES[i] && f.t === 'text'; }).forEach(function (f) {
        var v = valOf(f, CT);
        if (!v) return;
        var cv = textOverlayCanvas(f, v);
        chain = chain.then(function () {
          return out.embedPng(cv.toDataURL('image/png')).then(function (emb) {
            page.drawImage(emb, { x: f.x, y: PH - f.y - f.h, width: f.w, height: f.h });
          });
        });
      });
    });
  }
  return chain.then(function () {
    var uniq = [];
    Object.keys(S.signs).forEach(function (id) {
      var v = S.signs[id];
      if (v && uniq.indexOf(v) < 0) uniq.push(v);   // 같은 서명은 한 번만 심는다
    });
    var areas = FIELDS.filter(function (f) { return f.t === 'area' && S.texts[f.id]; });
    var areaCv = {};
    areas.forEach(function (f) { areaCv[f.id] = areaOverlayCanvas(f, S.texts[f.id]); });
    var jobs = uniq.map(function (src) { return out.embedPng(src); })
      .concat(areas.map(function (f) { return out.embedPng(areaCv[f.id].toDataURL('image/png')); }));
    return Promise.all(jobs).then(function (embs) {
      var embOf = {}, embArea = {};
      uniq.forEach(function (src, i) { embOf[src] = embs[i]; });
      areas.forEach(function (f, i) { embArea[f.id] = embs[uniq.length + i]; });
      pages.forEach(function (page, i) {
        if (PAGES[i] === skipPageNo) return;       // 공통 1쪽은 앞 문서에서 이미 작성됨
        FIELDS.filter(function (f) { return f.p === PAGES[i]; }).forEach(function (f) {
          if (f.t === 'check') { if (S.checks[f.id]) drawCheckVector(page, f); }
          else if (f.t === 'sign') { if (embOf[S.signs[f.id]]) drawSignImage(page, embOf[S.signs[f.id]], f); }
          else if (f.t === 'radio') { if (S.opts[f.id] != null) drawGlyphCheck(page, f, f.rows[S.opts[f.id]]); }
          else if (f.t === 'area') { if (embArea[f.id]) page.drawImage(embArea[f.id], { x: f.x, y: PH - f.y - f.h, width: f.w, height: f.h }); }
        });
      });
    });
  });
}
function buildFinalPdf() {
  return prepareOut().then(function (out) {
    return drawOverlays(out, true, 0).then(function () { return out.saveAsBase64(); });
  }).catch(function (e) {
    _outDoc = null; _outJob = null;      // 실패하면 다음 시도에서 새로 만든다
    throw e;
  });
}
/* 두 지사 동시 발송 최적화
   · 공통 1쪽(개인정보 동의·서명)은 첫 문서 결과에서 그대로 복사 → 다시 그리지 않는다.
   · 서명 PNG도 문서당 1장만 embed해서 두 장에 동일 적용한다. */
function buildDocPages(prev) {
  return contractBytes().then(function (bytes) {
    return PDFLib.PDFDocument.load(bytes.slice(0));
  }).then(function (src) {
    return PDFLib.PDFDocument.create().then(function (out) {
      var chain = Promise.resolve();
      PAGES.forEach(function (p) {                 // pdf-lib: 대상문서.copyPages(원본문서, [쪽]) — 한 쪽씩
        chain = chain.then(function () {
          var ri = (prev && p === 1) ? prev.pages.indexOf(1) : -1;
          var from = ri >= 0 ? prev.doc : src;
          var idx = ri >= 0 ? ri : p - 1;
          return out.copyPages(from, [idx]).then(function (list) {
            if (list && list[0]) out.addPage(list[0]);
          });
        });
      });
      return chain.then(function () { return out; });
    });
  });
}
function buildSecondPdf(prev) {
  return buildDocPages(prev).then(function (out) {
    return drawOverlays(out, false, 1).then(function () { return out.saveAsBase64(); });
  });
}
function buildFirstDuoPdf() {          // 1단계: 문서 객체를 남겨 두 번째 PDF에서 1쪽을 재사용
  return prepareOut().then(function (out) {
    return drawOverlays(out, true, 0).then(function () { return out; });
  });
}

/* ---------------- 관리자 ---------------- */
var SID = '';
try { SID = sessionStorage.getItem(SIDKEY) || ''; } catch (e) {}
function isCloseType(c) { return /종료/.test((c && c.type) || ''); }

/* ---------------- 자동로그인 저장소 (이 기기) ---------------- */
function ls_() { try { return window.localStorage; } catch (e) { return null; } }
function encPin_(p) { try { return btoa(String(p)); } catch (e) { return ''; } }
function decPin_(v) { try { return atob(String(v)); } catch (e) { return ''; } }
function savedPin() {
  var l = ls_();
  try { var v = l && l.getItem(PINKEY); return v ? decPin_(v) : ''; } catch (e) { return ''; }
}
function savePin(p) {
  var l = ls_();
  try { if (l && p) l.setItem(PINKEY, encPin_(p)); } catch (e) {}
}
function clearSavedPin() {
  var l = ls_();
  try { if (l) l.removeItem(PINKEY); } catch (e) {}
}
function clearSession() {
  SID = '';
  try { sessionStorage.removeItem(SIDKEY); } catch (e) {}
}
function clearLogin() { clearSession(); clearSavedPin(); }   // [나가기] — 다시 들어가려면 PIN 입력

/* ---------------- 카톡 배너(클릭 카드) 공유 ----------------
   · JavaScript 키는 카카오 JS SDK용 공개 키입니다(등록한 도메인에서만 동작).
   · Admin 키·REST API 키·Client Secret은 이 파일에 넣지 않습니다. */
var KAKAO_JS_KEY = 'd9c778f46f68a0f4e86b5b5e88b5a859';
var KAKAO_IMG = 'https://inuricompany-sudo.github.io/gaonnuri-today/esign/og.png?v=2';   // v2: 배너 이미지에서 지사명 제거(카톡 캐시 방지용 쿼리)
var KAKAO_IMG_CLOSE = 'https://inuricompany-sudo.github.io/gaonnuri-today/esign/og_close.png';   // 종료안내문 전용 배너
function shareUrlOf(c) { return certLink(c); }
function duoLinkOf(a, b) {
  return location.origin + location.pathname + '?t=' + encodeURIComponent(a) + '&t2=' + encodeURIComponent(b);
}
function certLink(c) {                    // 두 지사 동시 발송이면 링크 1개(두 토큰)
  if (c && c._t2) return duoLinkOf(c.token, c._t2);
  return location.origin + location.pathname + '?t=' + encodeURIComponent((c && c.token) || '');
}
function branchLabelOf(c) { return c && c._t2 ? '계룡·논산' : ((c && c.branch) || '계룡'); }

/* ---------------- 문자로 보내기 (v29) ----------------
   · sms:{번호}?body={인코딩} 표준 형식 — 안드로이드·아이폰 기본 문자 앱이 바로 뜹니다.
   · 번호가 비어 있으면 번호 없이 열고, 문자 앱에서 받는 사람을 고르게 합니다. */
function smsNumber(c) { return String((c && c.phone) || '').replace(/[^0-9]/g, ''); }
function smsBodyOf(c) {
  var link = certLink(c);
  var who = (c && c.name) ? c.name + '님' : '안녕하세요';
  var period = (c && c.start && c.end) ? (c.start + ' ~ ' + c.end) : '';
  if (isCloseType(c)) {
    return '[가온누리산후도우미]\n' + who + ', 안녕하세요.\n' +
      '서비스 종료안내문을 보내 드립니다.' + (period ? '\n이용기간: ' + period : '') + '\n\n' +
      '아래 링크에서 내용을 확인하시고 전자서명해 주시면 감사하겠습니다.\n' + link + '\n\n' +
      '링크는 본인만 사용하실 수 있도록 다른 분께 공유하지 말아 주세요.';
  }
  return '[가온누리산후도우미]\n' + who + ', 안녕하세요.\n' +
    '관리사님 계약서식(' + branchLabelOf(c) + '지사) 검토와 전자서명을 부탁드립니다.' +
    (period ? '\n계약기간: ' + period : '') + '\n\n' +
    '▶ 문서 확인·서명하기\n' + link + '\n\n' +
    '링크는 본인만 사용하실 수 있도록 다른 분께 공유하지 말아 주세요.';
}
function smsHrefOf(c) { return 'sms:' + smsNumber(c) + '?body=' + encodeURIComponent(smsBodyOf(c)); }
function smsAttrTitle(c) {
  return smsNumber(c) ? '' : ' title="연락처가 비어 있어 문자 앱에서 받는 사람을 직접 고르셔야 합니다"';
}
function bindSmsButtons(root, byToken) {
  root.querySelectorAll('[data-sms]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.stopPropagation();                                  // 목록 행 클릭(상세 열기)으로 번지지 않게
      var c = byToken && byToken[a.getAttribute('data-sms')];
      if (c && !smsNumber(c)) toast('연락처가 없습니다. 문자 앱에서 받는 사람을 골라 주세요.');
    });
  });
}
function kakaoInit() {
  try {
    if (!window.Kakao || !Kakao.init) return false;
    if (!Kakao.isInitialized()) Kakao.init(KAKAO_JS_KEY);
    return Kakao.isInitialized();
  } catch (e) { return false; }
}
function kakaoBannerPayload(c) {
  var link = certLink(c);
  var typeLabel = isCloseType(c) ? '서비스 종료안내문' : (c.type || '관리사님 계약서식');
  var who = c.name ? c.name + '님' : '수신자';      // 배너에는 지사명(계룡지사·논산지사)을 넣지 않는다
  return {
    objectType: 'feed',
    content: {
      title: '[가온누리산후도우미] 검토할 문서가 도착했습니다',
      description: '[' + typeLabel + '] ' +
        who + ', 문서를 확인하고 전자서명을 진행해 주세요.',
      imageUrl: isCloseType(c) ? KAKAO_IMG_CLOSE : KAKAO_IMG,
      imageWidth: 1200,
      imageHeight: 630,
      link: { mobileWebUrl: link, webUrl: link }
    },
    buttons: [{ title: '문서 검토 및 작성', link: { mobileWebUrl: link, webUrl: link } }]
  };
}
function sendKakaoBanner(c) {
  if (!c || !c.token) { toast('보낼 문서를 찾지 못했습니다'); return; }
  if (!kakaoInit()) { toast('카카오 공유를 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
  try {
    Kakao.Share.sendDefault(kakaoBannerPayload(c));
  } catch (e) {
    toast('카톡 공유를 열지 못했습니다: ' + ((e && (e.message || e)) || ''));
  }
}
function showAdmin() {
  kakaoInit();
  if (SID) {
    api({ action: 'list', sid: SID }).then(function (r) {
      if (r && r.ok) return renderDash(r.list);
      clearSession();          // 세션만 만료된 경우 — 저장된 PIN으로 조용히 다시 들어갑니다
      autoLogin();
    }).catch(function () { showPin(''); });
    return;
  }
  autoLogin();
}
/* 저장된 PIN이 있으면 잠금 화면 없이 바로 관리자 화면 (오늘현황 앱과 같은 자동로그인) */
function autoLogin() {
  var pin = savedPin();
  if (!pin) { showPin(''); return; }
  showPin('', true);
  api({ action: 'login', pin: pin }).then(function (r) {
    if (r && r.ok) {
      SID = r.sid;
      try { sessionStorage.setItem(SIDKEY, SID); } catch (e) {}
      if (r.list) return renderDash(r.list);
      return api({ action: 'list', sid: SID }).then(function (l) {
        if (l && l.ok) return renderDash(l.list);
        clearSavedPin();
        showPin('목록을 불러오지 못했습니다. PIN을 다시 입력해 주세요.');
      });
    }
    if (r && r.error === 'locked') { showPin('5회 오입력으로 10분간 잠겼습니다'); return; }
    if (r && r.error === 'bad_pin') {
      clearSavedPin();          // 저장된 PIN이 더 이상 맞지 않습니다 — 처음부터 다시
      showPin('저장된 PIN이 맞지 않습니다. 다시 입력해 주세요.');
      return;
    }
    showPin('');
  }).catch(function () { showPin('네트워크 오류 — PIN을 입력해 주세요.'); });
}
function showPin(msg0, opening) {
  app.innerHTML = '';
  app.appendChild(el('<header class="top"><div class="tinfo"><div class="t1">가온누리 전자계약 · 관리자</div>' +
    '<div class="t2">' + (opening ? '관리자 화면으로 들어가는 중입니다' : '관리자 PIN 4자리를 입력해 주세요') + '</div></div></header>'));
  if (opening) {
    app.appendChild(el('<div class="wrap"><div class="card" style="padding:26px 16px;text-align:center">' +
      '<div class="spin" style="margin:0 auto"></div>' +
      '<div class="muted small" style="margin-top:12px">이 기기에서 자동으로 로그인하고 있습니다…</div></div></div>'));
    return;
  }
  var wrap = el('<div class="wrap"><div class="card" style="padding:20px 16px">' +
    '<div class="pindots"><i></i><i></i><i></i><i></i></div>' +
    '<div class="pinpad">' +
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-n="' + n + '">' + n + '</button>'; }).join('') +
    '<button data-act="del">←</button><button data-n="0">0</button><button data-act="ok">확인</button>' +
    '</div><div class="muted small" id="pinmsg" style="text-align:center;margin-top:14px;min-height:18px"></div>' +
    '<div class="muted small" id="pinremember" style="text-align:center;margin-top:2px;color:#8b939b">이 기기에서는 다음부터 PIN 입력 없이 열립니다 · [나가기]로 해제</div>' +
    '</div></div>');
  app.appendChild(wrap);
  var buf = '', busy = false;
  var dots = wrap.querySelectorAll('.pindots i');
  function paint() { dots.forEach(function (d, i) { d.className = i < buf.length ? 'on' : ''; }); }
  function msg(t) { $('#pinmsg').textContent = t; }
  if (msg0) msg(msg0);
  function submitPin() {
    if (busy) return;
    if (buf.length !== 4) { msg('4자리를 입력해 주세요'); return; }
    busy = true; msg('확인 중…');
    var pin = buf;
    api({ action: 'login', pin: pin }).then(function (r) {
      busy = false;
      if (r.ok) {
        SID = r.sid;
        try { sessionStorage.setItem(SIDKEY, SID); } catch (e) {}
        savePin(pin);                       // 자동로그인용 저장 (나가기 때 지움)
        busy = false;
        if (r.list) return renderDash(r.list);
        return api({ action: 'list', sid: SID }).then(function (l) {
          if (l && l.ok) return renderDash(l.list);
          msg('목록을 불러오지 못했습니다. 다시 시도해 주세요.');
        });
      }
      buf = ''; paint();
      if (r.error === 'locked') msg('5회 오입력으로 10분간 잠겼습니다');
      else if (r.error === 'bad_pin') msg('PIN이 맞지 않습니다 (남은 횟수 ' + r.left + ')');
      else msg('확인할 수 없습니다');
    }).catch(function () { busy = false; msg('네트워크 오류'); });
  }
  wrap.querySelectorAll('.pinpad button').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = b.getAttribute('data-n'), act = b.getAttribute('data-act');
      if (act === 'del') { buf = buf.slice(0, -1); paint(); return; }
      if (act === 'ok') { submitPin(); return; }
      if (buf.length < 4) { buf += n; paint(); }
      if (buf.length === 4) setTimeout(submitPin, 120);
    });
  });
}
function renderDash(list) {
  kakaoInit();
  pairDuoRows(list);
  app.innerHTML = '';
  var head = el('<div class="adminbar"><div class="t1">전자계약 관리</div>' +
    '<button class="linkbtn" id="newBtn">+ 새 계약</button>' +
    '<button class="linkbtn" id="logout">나가기</button></div>');
  app.appendChild(head);
  var wrap = el('<div id="adminbody"></div>');
  app.appendChild(wrap);
  head.querySelector('#logout').addEventListener('click', function () {
    clearLogin(); showPin('');          // 저장된 자동로그인도 함께 해제
  });
  head.querySelector('#newBtn').addEventListener('click', function () { renderCreate(); });
  var wait = list.filter(function (c) { return c.status !== '완료'; }).length;
  var html = '<div class="wrap" style="padding-bottom:30px">' +
    '<div class="muted small" style="margin:0 0 8px 2px">대기 ' + wait + ' · 완료 ' + (list.length - wait) + ' · 전체 ' + list.length + '</div>';
  if (!list.length) html += '<div class="card"><div class="muted">아직 만든 계약이 없습니다. [+ 새 계약]으로 링크를 만들어 주세요.</div></div>';
  var byToken = {};
  list.forEach(function (c) { byToken[c.token] = c; });
  html += '<div style="background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden">';
  list.forEach(function (c) {
    html += '<div class="list-row">' +
      '<div class="list-item" data-token="' + esc(c.token) + '">' +
      '<div style="flex:1;min-width:0"><div class="n">' + esc(c.name || '(이름 없음)') + ' <span class="chip br">' + esc(c.branch) + '</span>' +
      (isCloseType(c) ? ' <span class="chip close">종료안내문</span>' : '') +
      (c._t2 ? ' <span class="chip duo">계룡+논산</span>' : '') + '</div>' +
      '<div class="s">' + esc(c.start || '') + ' ~ ' + esc(c.end || '') + '</div></div>' +
      '<div class="r"><span class="chip ' + (c.status === '완료' ? 'done' : 'wait') + '">' + esc(c.status) + '</span>' +
      '<div class="s">' + esc((c.status === '완료' ? c.done : c.created) || '').slice(5, 16) + '</div></div></div>' +
      '<div class="li-acts">' +
      '<button class="btn kakao" data-share="' + esc(c.token) + '">카톡 배너 보내기</button>' +
      '<a class="btn sms" data-sms="' + esc(c.token) + '" href="' + esc(smsHrefOf(c)) + '"' + smsAttrTitle(c) + '>문자로 보내기</a>' +
      '</div></div>';
  });
  html += '</div></div>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.list-item').forEach(function (n) {
    n.addEventListener('click', function () { openDetail(n.getAttribute('data-token'), byToken[n.getAttribute('data-token')]); });
  });
  wrap.querySelectorAll('[data-share]').forEach(function (b) {
    b.addEventListener('click', function () { sendKakaoBanner(byToken[b.getAttribute('data-share')]); });
  });
  bindSmsButtons(wrap, byToken);        // 문자로 보내기 — 기본 문자 앱이 바로 뜹니다
}
/* 두 지사 동시 발송 건 묶기: 같은 사람·같은 기간으로 계룡/논산이 10분 안에 만들어졌으면 한 건 */
function createdMs(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : NaN;
}
function pairDuoRows(list) {
  var used = {};
  list.forEach(function (c) {
    c._t2 = c._t2 || '';
    if (c._t2 || used[c.token] || isCloseType(c) || c.branch !== '계룡') return;
    var best = null, gapBest = 1e12;
    list.forEach(function (o) {
      if (o.token === c.token || used[o.token] || o.branch !== '논산' || isCloseType(o)) return;
      if (o.name !== c.name || o.start !== c.start || o.end !== c.end) return;
      if (String(o.jumin || '') !== String(c.jumin || '')) return;
      var gap = Math.abs(createdMs(o.created) - createdMs(c.created));
      if (isNaN(gap) || gap > 10 * 60 * 1000) return;
      if (gap < gapBest) { gapBest = gap; best = o; }
    });
    if (best) { c._t2 = best.token; best._t2 = c.token; used[best.token] = 1; used[c.token] = 1; }
  });
}
function renderCreate() {
  var b = $('#adminbody');
  var d = new Date(), t = todayParts();
  var y1 = t.y + 1;
  var today = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  b.innerHTML = '<div class="wrap"><div class="card">' +
    '<h2>새 문서 링크 만들기</h2>' +
    '<div class="formrow"><label>양식</label><select id="c_type">' +
      '<option value="관리사님 계약서식">관리사님 계약서식</option>' +
      '<option value="서비스 종료안내문">서비스 종료안내문 (모니터링)</option>' +
    '</select></div>' +
    '<div id="form_contract">' +
      '<div class="formrow"><label>지사</label><select id="c_branch"><option>계룡+논산</option><option>계룡</option><option>논산</option></select></div>' +
      '<div class="g2"><div class="formrow"><label>관리사 성명</label><input id="c_name" placeholder="예: 홍길동"></div>' +
      '<div class="formrow"><label>주민등록번호</label><input id="c_jumin" placeholder="000000-0000000" inputmode="numeric" autocomplete="off"></div></div>' +
      '<div class="g2"><div class="formrow"><label>연락처</label><input id="c_phone" placeholder="010-0000-0000" inputmode="numeric" autocomplete="off"></div>' +
      '<div class="formrow"><label>계약기간 시작</label><input id="c_start" placeholder="2026-11-20" inputmode="numeric" autocomplete="off" value="' + today + '"></div></div>' +
      '<div class="g2"><div class="formrow"><label>계약기간 종료</label><input id="c_end" placeholder="' + y1 + '-11-19" inputmode="numeric" autocomplete="off"></div>' +
      '<div class="formrow"><label>메모(선택)</label><input id="c_memo" placeholder=""></div></div>' +
      '<div class="formrow"><label>관리사 주소</label><input id="c_addr" placeholder="예: 대전광역시 유성구 대학로 99, 101동 1001호"></div>' +
    '</div>' +
    '<div id="form_close" class="hidden">' +
      '<div class="g2"><div class="formrow"><label>지사</label><select id="x_branch"><option>계룡</option><option>논산</option></select></div>' +
      '<div class="formrow"><label>이용자(산모) 성명</label><input id="x_name" placeholder="예: 윤슬기"></div></div>' +
      '<div class="g2"><div class="formrow"><label>연락처</label><input id="x_phone" placeholder="010-0000-0000" inputmode="numeric" autocomplete="off"></div>' +
      '<div class="formrow"><label>제공인력(관리사)</label><input id="x_worker" placeholder="예: 김용미"></div></div>' +
      '<div class="g2"><div class="formrow"><label>서비스 시작일</label><input id="x_start" inputmode="numeric" autocomplete="off" placeholder="YYYY-MM-DD"></div>' +
      '<div class="formrow"><label>서비스 종료일</label><input id="x_end" inputmode="numeric" autocomplete="off" placeholder="YYYY-MM-DD"></div></div>' +
      '<div class="g2"><div class="formrow"><label>이용유형(바우처)</label><input id="x_voucher" placeholder="예: A통합1"></div>' +
      '<div class="formrow"><label>서비스기간(일수)</label><input id="x_term" placeholder="예: 20일"></div></div>' +
      '<div class="g2"><div class="formrow"><label>기존 제공기간</label><input id="x_beforePeriod" placeholder="시작일·종료일 입력 시 자동"></div>' +
      '<div class="formrow"><label>변경 제공기간</label><input id="x_afterPeriod" placeholder="시작일·종료일 입력 시 자동"></div></div>' +
      '<div class="g2"><div class="formrow"><label>기존 제공인력</label><input id="x_beforeWorker" placeholder="자동"></div>' +
      '<div class="formrow"><label>변경 제공인력</label><input id="x_afterWorker" placeholder="자동">' +
      '<label class="mini"><input type="checkbox" id="x_same"> 변동없음</label></div></div>' +
      '<div class="g2"><div class="formrow"><label>변경 적용일</label><input id="x_apply" inputmode="numeric" autocomplete="off" placeholder="YYYY-MM-DD"></div>' +
      '<div class="formrow"><label>메모(선택)</label><input id="x_memo" placeholder=""></div></div>' +
    '</div>' +
    '<div style="margin-top:16px"><button class="btn" id="c_ok">링크 만들기</button></div>' +
    '<div id="c_result" style="margin-top:12px"></div>' +
    '</div><button class="btn ghost" id="c_back">목록으로</button></div>';
  b.querySelector('#c_back').addEventListener('click', function () { refreshList(); });

  /* 숫자만 입력해도 전화번호·날짜·주민번호에 하이픈 자동 (다른 input 처리보다 먼저 연결) */
  [['c_phone', fmtPhone], ['c_jumin', fmtJumin], ['c_start', fmtDate], ['c_end', fmtDate],
   ['x_phone', fmtPhone], ['x_start', fmtDate], ['x_end', fmtDate], ['x_apply', fmtDate]
  ].forEach(function (p) { attachAutoFormat(b.querySelector('#' + p[0]), p[1]); });

  /* 양식 전환 */
  var sel = b.querySelector('#c_type');
  sel.addEventListener('change', function () {
    var close = sel.value === '서비스 종료안내문';
    b.querySelector('#form_contract').classList.toggle('hidden', close);
    b.querySelector('#form_close').classList.toggle('hidden', !close);
  });

  /* 종료안내문 입력 자동 채우기 (직접 고친 칸은 그대로 둠) */
  function cv(id) { var e = $('#' + id); return e ? e.value.trim() : ''; }
  function syncClose() {
    var st = cv('x_start'), en = cv('x_end');
    var term = cv('x_term').replace(/[^0-9]/g, '');
    var w = cv('x_worker');
    var period = (st && en) ? (st + ' ~ ' + en + (term ? ' (' + term + '\uC77C)' : '')) : '';
    var bp = $('#x_beforePeriod'), ap = $('#x_afterPeriod');
    if (bp && !bp.dataset.touched) bp.value = period;
    if (ap && !ap.dataset.touched) ap.value = period;
    var bw = $('#x_beforeWorker'), aw = $('#x_afterWorker');
    var same = $('#x_same') && $('#x_same').checked;
    if (bw && !bw.dataset.touched) bw.value = w;
    if (aw && !aw.dataset.touched) aw.value = same ? '변동없음' : w;
    var apd = $('#x_apply');
    if (apd && !apd.dataset.touched) apd.value = st;
  }
  ['x_start', 'x_end', 'x_term', 'x_worker'].forEach(function (id) {
    var e = $('#' + id); if (e) e.addEventListener('input', syncClose);
  });
  ['x_beforePeriod', 'x_afterPeriod', 'x_beforeWorker', 'x_afterWorker', 'x_apply'].forEach(function (id) {
    var e = $('#' + id); if (e) e.addEventListener('input', function () { e.dataset.touched = '1'; });
  });
  var sameBox = $('#x_same');
  if (sameBox) sameBox.addEventListener('change', function () {
    var aw = $('#x_afterWorker');
    if (!aw) return;
    if (sameBox.checked) { aw.value = '변동없음'; delete aw.dataset.touched; }
    else { aw.dataset.touched = '1'; aw.value = cv('x_worker'); }
  });

  b.querySelector('#c_ok').addEventListener('click', function () {
    var type = sel.value;
    var close = type === '서비스 종료안내문';
    var p, item;
    if (close) {
      var st = cv('x_start'), en = cv('x_end'), ap = cv('x_apply') || st;
      var jm = function (ds) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || '');
        return m ? { y: m[1], m: m[2], d: m[3] } : { y: '', m: '', d: '' };
      };
      var pe = jm(en), pa = jm(ap);
      p = {
        action: 'create', sid: SID, type: type,
        branch: cv('x_branch'),
        name: cv('x_name'),
        phone: cv('x_phone'),
        start: st, end: en,
        memo: cv('x_memo'),
        prefill: {
          user: cv('x_name'), phone: cv('x_phone'), worker: cv('x_worker'),
          voucher: cv('x_voucher'), term: cv('x_term'),
          endY: pe.y, endM: pe.m, endD: pe.d,
          applyY: pa.y, applyM: pa.m, applyD: pa.d,
          startDate: st, endDate: en,
          beforePeriod: cv('x_beforePeriod'), beforeWorker: cv('x_beforeWorker'),
          afterPeriod: cv('x_afterPeriod'), afterWorker: cv('x_afterWorker')
        }
      };
      if (!p.name) { toast('이용자(산모) 성명을 입력해 주세요'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.end)) { toast('서비스 종료일을 선택해 주세요'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ap)) { toast('변경 적용일을 선택해 주세요'); return; }
      item = { token: '', type: type, branch: p.branch, name: p.name, phone: p.phone, start: p.start, end: p.end };
    } else {
      p = {
        action: 'create', sid: SID, type: type,
        branch: cv('c_branch'),
        name: cv('c_name'),
        jumin: cv('c_jumin'),
        phone: cv('c_phone'),
        address: cv('c_addr'),
        start: cv('c_start'),
        end: cv('c_end'),
        memo: cv('c_memo')
      };
      if (!p.name) { toast('성명을 입력해 주세요'); return; }
      if (!/^\d{6}-?\d{7}$/.test(p.jumin)) { toast('주민등록번호 형식을 확인해 주세요'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end)) { toast('계약기간을 YYYY-MM-DD로 입력해 주세요'); return; }
      item = { token: '', type: type, branch: p.branch, name: p.name, phone: p.phone, start: p.start, end: p.end };
    }
    this.disabled = true;
    var btn0 = this;
    var doneBtn = function () { if (btn0) btn0.disabled = false; };
    if (!close && p.branch === '계룡+논산') {          // 두 지사 동시 발송
      api(Object.assign({}, p, { branch: '계룡' })).then(function (r1) {
        if (!r1 || !r1.ok) { doneBtn(); toast('실패: ' + ((r1 && r1.error) || '오류')); return; }
        return api(Object.assign({}, p, { branch: '논산' })).then(function (r2) {
          doneBtn();
          if (!r2 || !r2.ok) {
            showCreated({ token: r1.token, type: type, branch: '계룡', name: p.name, phone: p.phone, start: p.start, end: p.end },
              '계룡 계약서만 만들어졌습니다. 논산 계약서를 다시 만들어 주세요.');
            return;
          }
          showCreated({ token: r1.token, _t2: r2.token, type: type, branch: '계룡', name: p.name, phone: p.phone, start: p.start, end: p.end }, '');
        });
      }).catch(function () { doneBtn(); toast('네트워크 오류'); });
      return;
    }
    api(p).then(function (r) {
      doneBtn();
      if (!r.ok) { toast('실패: ' + (r.error || '오류')); return; }
      item.token = r.token;
      showCreated(item, '');
    }).catch(function () { doneBtn(); toast('네트워크 오류'); });
  });
}
/* 새 문서 결과 상자 (카톡 배너·문자로 보내기·안내문 복사) */
function showCreated(it, warn) {
  var box = $('#c_result');
  if (!box) return;
  var cl = isCloseType(it);
  var link = certLink(it);
  box.innerHTML = '<div class="muted small" style="margin-bottom:6px">' +
    (warn ? '<b style="color:var(--danger)">' + esc(warn) + '</b><br>' : '') +
    (cl ? '종료안내문 링크가 만들어졌습니다. 산모님께 링크를 보내 주세요.'
      : (it._t2 ? '계룡·논산 계약서 2건이 만들어졌습니다. <b>링크 1개</b>로 두 문서를 함께 서명받습니다.'
        : '계약 링크가 만들어졌습니다. 관리사님께 링크를 보내 주세요.')) + '</div>' +
    '<div class="copyrow"><input id="c_link" readonly value="' + esc(link) + '"></div>' +
    '<div class="copybtns wrapbtns"><button class="btn kakao" id="c_kakao">카톡 배너 보내기</button>' +
    '<a class="btn sms" id="c_sms" href="' + esc(smsHrefOf(it)) + '"' + smsAttrTitle(it) + '>문자로 보내기</a>' +
    '<button class="btn gray" id="c_text">문자/카톡 안내문 복사</button></div>';
  box.querySelector('#c_sms').addEventListener('click', function () {
    if (!smsNumber(it)) toast('연락처가 없습니다. 문자 앱에서 받는 사람을 골라 주세요.');
  });
  box.querySelector('#c_text').addEventListener('click', function () { copyGuide(it); });
  box.querySelector('#c_kakao').addEventListener('click', function () { sendKakaoBanner(it); });
}
function refreshList() {
  api({ action: 'list', sid: SID }).then(function (r) { if (r.ok) renderDash(r.list); });
}

/* 문자·카톡 전달용 안내문 원클릭 복사 */
function copyText(text) {
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.top = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, ta.value.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(function () { return true; })
      .catch(function () { return fallback(); });
  }
  return Promise.resolve(fallback());
}
function guideTextOf(c) {
  var branch = branchLabelOf(c);
  var link = certLink(c);
  var title = isCloseType(c) ? (c.type || '서비스 종료안내문') : (c.type || '관리사님 계약서식') + ' (' + branch + '지사)';
  return '[전자계약] 서명 요청이 왔습니다.\n\n' +
    '▶ 문서 제목\n' + title + '\n\n' +
    '▶ 보낸 사람\n가온누리산후도우미\n\n' +
    '▶ 대상자\n' + (c.name || '') + ' 님 (' + (c.start || '') + ' ~ ' + (c.end || '') + ')\n\n' +
    '▶ 문서 서명하기\n' + link + '\n\n' +
    '*본 메시지와 링크는 외부에 공유되지 않도록 주의해 주세요.';
}
function copyGuide(c) {
  return copyText(guideTextOf(c)).then(function (ok) {
    toast(ok ? '안내문을 복사했습니다. 카톡·문자에 붙여넣어 보내세요.' : '복사에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  });
}
function openDetail(token, row) {
  api({ action: 'detail', sid: SID, token: token }).then(function (r) {
    if (!r.ok) { toast('불러오지 못했습니다'); return; }
    var c = r.item;
    if (row && row._t2) c._t2 = row._t2;
    var sheet = el('<div class="sheet"><div class="panel" style="max-height:92vh;overflow:auto">' +
      '<h3>' + esc(c.name) + ' · ' + esc(branchLabelOf(c)) + '지사</h3>' +
      '<div class="muted small">' + esc(c.type || '') + ' · ' + esc(c.start) + ' ~ ' + esc(c.end) + ' · <span class="chip ' + (c.status === '완료' ? 'done' : 'wait') + '">' + esc(c.status) + '</span></div>' +
      '<div class="card" style="margin:14px 0 0;padding:12px">' +
      (isCloseType(c)
        ? '<div class="kv"><span class="k">이용유형</span><span class="v">' + esc((c.prefill || {}).voucher || '-') + ((c.prefill || {}).term ? ' · ' + esc(c.prefill.term) : '') + '</span></div>' +
          '<div class="kv"><span class="k">제공인력</span><span class="v">' + esc((c.prefill || {}).worker || '-') + '</span></div>' +
          '<div class="kv"><span class="k">변경내역</span><span class="v">' + esc((c.prefill || {}).afterPeriod || '-') + ' / ' + esc((c.prefill || {}).afterWorker || '-') + '</span></div>'
        : '<div class="kv"><span class="k">주민번호</span><span class="v">' + esc(c.jumin || '-') + '</span></div>' +
          '<div class="kv"><span class="k">주소</span><span class="v">' + esc(c.address || '-') + '</span></div>') +
      '<div class="kv"><span class="k">연락처</span><span class="v">' + esc(c.phone || '-') + '</span></div>' +
      (c._t2 ? '<div class="kv"><span class="k">발송</span><span class="v">계룡·논산 동시 발송 · 링크 1개</span></div>' : '') +
      '<div class="kv"><span class="k">생성</span><span class="v">' + esc(c.created || '-') + '</span></div>' +
      '<div class="kv"><span class="k">완료</span><span class="v">' + esc(c.done || '-') + '</span></div>' +
      '</div>' +
      '<div class="copybtns wrapbtns"><button class="btn kakao" id="d_kakao">카톡 배너 보내기</button>' +
      '<a class="btn sms" id="d_sms" href="' + esc(smsHrefOf(c)) + '"' + smsAttrTitle(c) + '>문자로 보내기</a>' +
      (c.status === '완료' ? '' : '<button class="btn gray" id="d_text">문자/카톡 안내문 복사</button>') + '</div>' +
      '<div id="d_sigs" style="margin-top:12px"></div>' +
      '<div style="margin-top:14px"><button class="btn" id="d_pdf">최종 PDF 보기</button></div>' +
      '<div id="d_view" style="margin-top:12px"></div>' +
      '<div style="margin-top:14px"><button class="btn gray" id="d_close">닫기</button></div>' +
      '</div></div>');
    document.body.appendChild(sheet);
    sheet.querySelector('#d_close').addEventListener('click', function () { sheet.remove(); });
    sheet.querySelector('#d_sms').addEventListener('click', function () {
      if (!smsNumber(c)) toast('연락처가 없습니다. 문자 앱에서 받는 사람을 골라 주세요.');
    });
    var dtext = sheet.querySelector('#d_text');
    if (dtext) dtext.addEventListener('click', function () { copyGuide(c); });
    sheet.querySelector('#d_kakao').addEventListener('click', function () { sendKakaoBanner(c); });
    if (c.signs) {
      var h = '<div class="muted small" style="margin-bottom:6px">서명</div><div style="display:flex;gap:8px;flex-wrap:wrap">';
      Object.keys(c.signs).forEach(function (id) {
        h += '<div class="sigbox" style="flex:1;min-width:90px"><img src="' + c.signs[id] + '" alt="서명"></div>';
      });
      sheet.querySelector('#d_sigs').innerHTML = h + '</div>';
    }
    sheet.querySelector('#d_pdf').addEventListener('click', function () {
      var btn = this;
      if (!c.pdfUrl) { toast('완료된 문서가 없습니다'); return; }
      btn.disabled = true; btn.textContent = '불러오는 중…';
      api({ action: 'pdf', sid: SID, token: token }).then(function (rr) {
        btn.disabled = false; btn.textContent = '최종 PDF 보기';
        if (!rr.ok || !rr.pdf) { toast('PDF 오류: ' + ((rr && (rr.error || rr.message)) || 'unknown')); return; }
        var view = sheet.querySelector('#d_view');
        view.innerHTML = '<div class="docpreview" id="dpv"></div>';
        renderPdfInto(dataUrlToBytes('data:application/pdf;base64,' + rr.pdf), view.querySelector('#dpv'));
      }).catch(function (e) { btn.disabled = false; btn.textContent = '최종 PDF 보기'; toast('PDF 오류: ' + ((e && (e.message || e)) || 'network')); });
    });
  });
}
function renderPdfInto(bytes, box) {
  pdfjsLib.getDocument({ data: bytes }).promise.then(function (pdf) {
    var i = 1;
    function next() {
      if (i > pdf.numPages) return;
      pdf.getPage(i).then(function (page) {
        var w = Math.min(box.clientWidth, 640);
        var vp = page.getViewport({ scale: w / page.getViewport({ scale: 1 }).width });
        var cv = document.createElement('canvas');
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
          box.appendChild(cv); i++; next();
        });
      });
    }
    next();
  });
}

/* ---------------- 시작 ---------------- */
(function boot() {
  app = document.getElementById('app');
  var token = qs('t') || qs('token');
  if (qs('admin') === '1') { showAdmin(); return; }
  if (token) { showRecipient(token); return; }
  app.innerHTML = '';
  app.appendChild(el('<header class="top"><div class="tinfo"><div class="t1">가온누리 전자계약</div>' +
    '<div class="t2">관리사님 계약서식 전자서명</div></div></header>'));
  app.appendChild(el('<div class="wrap"><div class="card">' +
    '<h2>링크로 접속해 주세요</h2>' +
    '<p class="muted small">계약 링크는 담당자가 문자·카카오톡으로 보내 드립니다.</p>' +
    '<div style="margin-top:12px"><a class="btn ghost" href="?admin=1">관리자 화면 열기</a></div>' +
    '</div></div>'));
})();
