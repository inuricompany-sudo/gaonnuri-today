/* =============================================================
   가온누리 전자계약 — 원본 계약서 화면 + 원본 동일 PDF 생성
   · 화면: 원본 PDF(관리사님 계약서식) 페이지 위에 필드 오버레이
   · 제출: 같은 좌표로 200dpi 캔버스 합성 → PDF(4쪽) → Apps Script 저장
   · 공개 저장소에는 개인정보·PIN 없음(테스트는 홍길동)
   ============================================================= */
var API = 'https://script.google.com/macros/s/AKfycbxNkgjaS8ERq4ZYywNroxxsROdofkLe6HEzxQDRnFSraBJGu0yKoXAEE5zc0ZpcI5G8/exec';
var CONTRACT_PDF = 'contract.pdf';
var PW = 595, PH = 841;          // A4 (pt)
var DPI = 200;                   // 최종 PDF 해상도
var FONT = '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","NanumGothic",sans-serif';
var SIDKEY = 'esign_sid_v3';

/* ---------------- 공통 ---------------- */
function $(s, r) { return (r || document).querySelector(s); }
function el(html) { var d = document.createElement('div'); d.innerHTML = String(html).trim(); return d.firstElementChild; }
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
  }).then(function (r) { return r.json(); });
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
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
function getPdf() {
  if (_pdfDoc) return Promise.resolve(_pdfDoc);
  return pdfjsLib.getDocument({ url: CONTRACT_PDF, cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/', cMapPacked: true })
    .promise.then(function (d) { _pdfDoc = d; return d; });
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
var S = { checks: {}, signs: {}, filledFirst: false };
var PAGES = [];
var fieldEls = {}, pageEls = {}, pageW = 360;

function branchPages(branch) { return branch === '논산' ? [1, 3, 6, 7] : [1, 2, 4, 5]; }
function reqFields() {
  return FIELDS.filter(function (f) { return f.req && PAGES.indexOf(f.p) >= 0; });
}
function isDone(f) { return f.t === 'check' ? !!S.checks[f.id] : !!S.signs[f.id]; }
function doneCount() {
  var n = 0; reqFields().forEach(function (f) { if (isDone(f)) n++; }); return n;
}
function valOf(f, c) {
  var t = todayParts();
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
function showRecipient(token) {
  app.innerHTML = '<div class="notice">계약서를 불러오는 중입니다…</div>';
  api({ action: 'get', token: token }).then(function (r) {
    if (!r.ok) {
      app.innerHTML = '<div class="notice err">' +
        (r.error === 'not_found' ? '계약 링크를 찾을 수 없습니다. 담당자에게 다시 받아 주세요.' : '계약서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.') +
        '</div>';
      return;
    }
    CT = r.contract; CO = r.company || {};
    S = { checks: {}, signs: {}, filledFirst: false };
    if (CT.status === '완료') { showAlreadyDone(); return; }
    buildRecipientUi();
  }).catch(function () {
    app.innerHTML = '<div class="notice err">네트워크 오류로 계약서를 불러오지 못했습니다. 새로고침해 주세요.</div>';
  });
}
function showAlreadyDone() {
  var parts = String(CT.done || '').split(' ');
  app.innerHTML = '';
  app.appendChild(el(
    '<header class="top"><div class="tinfo"><div class="t1">관리사님 계약서식</div>' +
    '<div class="t2">' + esc(CO.branch || CT.branch) + '지사 · ' + esc(CT.name) + '</div></div></header>' +
    '<div class="wrap">' +
    '<div class="card" style="text-align:center;padding:26px 16px">' +
    '<div style="font-size:38px;line-height:1">✅</div>' +
    '<h2 style="margin-top:10px">이미 서명이 완료된 계약서입니다</h2>' +
    '<p class="muted" style="margin:6px 0 0">' + esc(parts[0] || '') + ' ' + esc(parts[1] || '') + ' 완료</p>' +
    '</div>' +
    summaryCard() +
    '<p class="muted small" style="text-align:center">문의: 가온누리 산후도우미 담당자</p></div>'));
}
function summaryCard() {
  return '<div class="card"><h2>계약 내용</h2>' +
    '<div class="kv"><span class="k">지사</span><span class="v">' + esc(CO.branch || CT.branch) + '지사</span></div>' +
    '<div class="kv"><span class="k">성명</span><span class="v">' + esc(CT.name) + '</span></div>' +
    '<div class="kv"><span class="k">계약기간</span><span class="v">' + esc(CT.start) + ' ~ ' + esc(CT.end) + '</span></div>' +
    '</div>';
}

function buildRecipientUi() {
  PAGES = branchPages(CT.branch);
  fieldEls = {}; pageEls = {};
  app.innerHTML = '';
  var top = el(
    '<header class="top">' +
    '<div class="tinfo"><div class="t1">관리사님 계약서식</div>' +
    '<div class="t2">' + esc(CO.branch || CT.branch) + '지사 · ' + esc(CT.name) + ' · ' + esc(CT.start) + '~' + esc(CT.end) + '</div></div>' +
    '<div class="zoom"><button data-z="1" class="on">맞춤</button><button data-z="1.5">확대</button><button data-z="2.1">크게</button></div>' +
    '</header>');
  app.appendChild(top);

  var wrap = el('<div class="docwrap" id="docwrap"><div class="pages" id="pages"></div></div>');
  app.appendChild(wrap);

  var bar = el(
    '<div class="bottombar" id="bar">' +
    '<div class="prog"><div class="pl" id="pl">필수 입력 항목 <span>(0/5)</span></div><div class="pips" id="pips"></div></div>' +
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
    node = el('<div class="f txt" style="' + styles + '"><span class="val"></span></div>');
    var v = valOf(f, CT);
    node.querySelector('.val').textContent = v;
    node.title = v;
  } else if (f.t === 'check') {
    node = el('<div class="f chk" style="' + styles + '" role="checkbox" aria-checked="false">' +
      '<span class="box"></span>' +
      '<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12.6 L9.6 18 L19.6 5.6" stroke="#0f5fa8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span class="hit"></span></div>');
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
    }
  });
}

function bindUi() {
  var btn = $('#nextBtn');
  btn.addEventListener('click', function () {
    if (doneCount() === reqFields().length) { openSubmitSheet(); return; }
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
  btn.textContent = all ? '작성 완료 · 제출하기' : (done === 0 ? '입력 시작' : '다음 항목');
  btn.disabled = false;
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

/* ---------------- 서명 패드 ---------------- */
function openSignPad(f) {
  var title = f.p === 1 ? '개인정보 동의 서명' : (f.p === 2 || f.p === 3 ? '보안각서 서명' : '계약서 서명');
  var sheet = el('<div class="sheet"><div class="panel">' +
    '<h3>' + title + '</h3>' +
    '<div class="muted small">아래 칸에 손글씨로 서명해 주세요.</div>' +
    '<div class="padwrap"><canvas></canvas><div class="ph">여기에 서명</div></div>' +
    '<div class="hintline"><button class="linkbtn" id="clr">다시 쓰기</button><span class="muted small">' + esc(CT.name) + ' 님</span></div>' +
    '<div class="row2" style="margin-top:10px"><button class="btn gray" id="cancel">취소</button><button class="btn" id="ok">서명 완료</button></div>' +
    '</div></div>');
  document.body.appendChild(sheet);

  var cv = sheet.querySelector('canvas'), wrap = sheet.querySelector('.padwrap'), ph = sheet.querySelector('.ph');
  var ctx = cv.getContext('2d'), dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  var drawn = false, drawing = false, last = null;
  function resize() {
    var r = wrap.getBoundingClientRect();
    var w = Math.max(200, r.width), h = 230;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }
  setTimeout(resize, 30);
  function pos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left), y: (e.clientY - r.top) };
  }
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault(); drawing = true; drawn = true; ph.style.display = 'none';
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    last = pos(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drawing) return; e.preventDefault();
    var p = pos(e), mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y); ctx.stroke();
    last = p;
  });
  cv.addEventListener('pointerup', function () { drawing = false; });
  cv.addEventListener('pointercancel', function () { drawing = false; });

  sheet.querySelector('#clr').addEventListener('click', function () { resize(); drawn = false; ph.style.display = ''; });
  sheet.querySelector('#cancel').addEventListener('click', function () { sheet.remove(); });
  sheet.querySelector('#ok').addEventListener('click', function () {
    if (!drawn) { toast('서명을 먼저 해 주세요'); return; }
    var data = trimCanvas(cv);
    if (!data) { toast('서명을 먼저 해 주세요'); return; }
    S.signs[f.id] = data;
    var n = fieldEls[f.id];
    n.querySelector('img').src = data;
    n.classList.add('on');
    sheet.remove();
    updateBar();
    if (doneCount() === reqFields().length) toast('필수 항목을 모두 채웠습니다. 제출해 주세요.');
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
    '<div class="kv"><span class="k">문서</span><span class="v">' + esc(CT.type || '관리사님 계약서식') + '</span></div>' +
    '<div class="kv"><span class="k">지사</span><span class="v">' + esc(CO.branch || CT.branch) + '지사</span></div>' +
    '<div class="kv"><span class="k">성명</span><span class="v">' + esc(CT.name) + '</span></div>' +
    '<div class="kv"><span class="k">계약기간</span><span class="v">' + esc(CT.start) + ' ~ ' + esc(CT.end) + '</span></div>' +
    '<div class="kv"><span class="k">서명</span><span class="v">' + req.length + '개 항목 완료</span></div>' +
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
  showLoading('계약서를 만들고 있어요', '잠시만 기다려 주세요 (10초 정도 걸립니다)');
  buildFinalPdf().then(function (b64) {
    return api({
      action: 'submit', token: CT.token,
      checks: S.checks, signs: S.signs,
      pdf: b64, ua: navigator.userAgent
    });
  }).then(function (r) {
    hideLoading();
    if (!r || !r.ok) {
      toast('제출에 실패했습니다: ' + ((r && r.error) || '오류'));
      return;
    }
    CT.status = '완료'; CT.done = r.doneAt || '';
    showDone(r);
  }).catch(function (e) {
    hideLoading();
    toast('제출 중 오류가 발생했습니다. 다시 시도해 주세요.');
    console.error(e);
  });
}

function showDone(r) {
  app.innerHTML = '';
  app.appendChild(el('<header class="top"><div class="tinfo"><div class="t1">관리사님 계약서식</div>' +
    '<div class="t2">' + esc(CO.branch || CT.branch) + '지사 · ' + esc(CT.name) + '</div></div></header>'));
  app.appendChild(el('<div class="wrap">' +
    '<div class="card" style="text-align:center;padding:28px 16px">' +
    '<div style="font-size:40px;line-height:1">✅</div>' +
    '<h2 style="margin-top:10px">서명이 완료되었습니다</h2>' +
    '<p class="muted" style="margin:6px 0 0">' + esc(r.doneAt || '') + ' (KST)</p>' +
    '</div>' +
    summaryCard() +
    '<div class="card"><h2>안내</h2><p class="muted small" style="margin:0">' +
    '서명하신 계약서는 가온누리 산후도우미에 자동 보관되었습니다. 따로 보내실 서류는 없습니다.<br>' +
    '문의: 가온누리 산후도우미 담당자</p></div></div>'));
}

/* ---------------- 최종 PDF 생성(화면과 동일) ---------------- */
function drawCheckMark(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = '#0f5fa8';
  ctx.lineWidth = Math.max(1.4, w * 0.13);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.20, y + h * 0.50);
  ctx.lineTo(x + w * 0.43, y + h * 0.75);
  ctx.lineTo(x + w * 0.84, y + h * 0.24);
  ctx.stroke();
  ctx.restore();
}
function drawImageFit(ctx, img, x, y, w, h, padRatio) {
  var pad = Math.min(w, h) * (padRatio == null ? 0.06 : padRatio);
  var bw = w - pad * 2, bh = h - pad * 2;
  var ar = (img.width || 1) / (img.height || 1);
  var dw = bw, dh = bw / ar;
  if (dh > bh) { dh = bh; dw = bh * ar; }
  ctx.drawImage(img, x + pad + (bw - dw) / 2, y + pad + (bh - dh) / 2, dw, dh);
}
function loadImg(src) {
  return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
}
function buildFinalPdf() {
  var imgs = {};
  var jobs = Object.keys(S.signs).map(function (id) {
    return loadImg(S.signs[id]).then(function (i) { imgs[id] = i; });
  });
  return Promise.all(jobs).then(function () {
    return PDFLib.PDFDocument.create();
  }).then(function (out) {
    var chain = Promise.resolve();
    PAGES.forEach(function (pno) {
      chain = chain.then(function () {
        return renderPageCanvas(pno, Math.round(PW * DPI / 72)).then(function (cv) {
          var ctx = cv.getContext('2d'), k = cv.width / PW;
          FIELDS.filter(function (f) { return f.p === pno; }).forEach(function (f) {
            var x = f.x * k, y = f.y * k, w = f.w * k, h = f.h * k;
            if (f.t === 'text') {
              var v = valOf(f, CT); if (!v) return;
              var size = fitFont(v, f.w, f.h) * k;
              ctx.font = '500 ' + size.toFixed(2) + 'px ' + FONT;
              ctx.fillStyle = '#111';
              ctx.textBaseline = 'middle';
              ctx.fillText(v, x + w * 0.02, y + h * 0.53, w * 0.97);
            } else if (f.t === 'check') {
              if (S.checks[f.id]) drawCheckMark(ctx, x, y, w, h);
            } else if (f.t === 'sign') {
              if (imgs[f.id]) drawImageFit(ctx, imgs[f.id], x, y, w, h, 0.02);
            }
          });
          var jpg = cv.toDataURL('image/jpeg', 0.93);
          return out.embedJpg(dataUrlToBytes(jpg)).then(function (emb) {
            var p = out.addPage([PW, PH]);
            p.drawImage(emb, { x: 0, y: 0, width: PW, height: PH });
          });
        });
      });
    });
    return chain.then(function () { return out.saveAsBase64(); });
  });
}

/* ---------------- 관리자 ---------------- */
var SID = sessionStorage.getItem(SIDKEY) || '';
function showAdmin() {
  if (SID) { api({ action: 'list', sid: SID }).then(function (r) { if (r.ok) renderDash(r.list); else { SID = ''; sessionStorage.removeItem(SIDKEY); showPin(); } }); }
  else showPin();
}
function showPin() {
  app.innerHTML = '';
  app.appendChild(el('<header class="top"><div class="tinfo"><div class="t1">가온누리 전자계약 · 관리자</div><div class="t2">관리자 PIN 4자리를 입력해 주세요</div></div></header>'));
  var wrap = el('<div class="wrap"><div class="card" style="padding:20px 16px">' +
    '<div class="pindots"><i></i><i></i><i></i><i></i></div>' +
    '<div class="pinpad">' +
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-n="' + n + '">' + n + '</button>'; }).join('') +
    '<button data-act="del">←</button><button data-n="0">0</button><button data-act="ok">확인</button>' +
    '</div><div class="muted small" id="pinmsg" style="text-align:center;margin-top:14px;min-height:18px"></div>' +
    '</div></div>');
  app.appendChild(wrap);
  var buf = '', busy = false;
  var dots = wrap.querySelectorAll('.pindots i');
  function paint() { dots.forEach(function (d, i) { d.className = i < buf.length ? 'on' : ''; }); }
  function msg(t) { $('#pinmsg').textContent = t; }
  function submitPin() {
    if (busy) return;
    if (buf.length !== 4) { msg('4자리를 입력해 주세요'); return; }
    busy = true; msg('확인 중…');
    api({ action: 'login', pin: buf }).then(function (r) {
      busy = false;
      if (r.ok) { SID = r.sid; sessionStorage.setItem(SIDKEY, SID); return api({ action: 'list', sid: SID }); }
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
  app.innerHTML = '';
  var head = el('<div class="adminbar"><div class="t1">전자계약 관리</div>' +
    '<button class="linkbtn" id="newBtn">+ 새 계약</button>' +
    '<button class="linkbtn" id="logout">나가기</button></div>');
  app.appendChild(head);
  var wrap = el('<div id="adminbody"></div>');
  app.appendChild(wrap);
  head.querySelector('#logout').addEventListener('click', function () {
    SID = ''; sessionStorage.removeItem(SIDKEY); showPin();
  });
  head.querySelector('#newBtn').addEventListener('click', function () { renderCreate(); });
  var wait = list.filter(function (c) { return c.status !== '완료'; }).length;
  var html = '<div class="wrap" style="padding-bottom:30px">' +
    '<div class="muted small" style="margin:0 0 8px 2px">대기 ' + wait + ' · 완료 ' + (list.length - wait) + ' · 전체 ' + list.length + '</div>';
  if (!list.length) html += '<div class="card"><div class="muted">아직 만든 계약이 없습니다. [+ 새 계약]으로 링크를 만들어 주세요.</div></div>';
  html += '<div style="background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden">';
  list.forEach(function (c) {
    html += '<div class="list-item" data-token="' + esc(c.token) + '">' +
      '<div style="flex:1;min-width:0"><div class="n">' + esc(c.name || '(이름 없음)') + ' <span class="chip br">' + esc(c.branch) + '</span></div>' +
      '<div class="s">' + esc(c.start || '') + ' ~ ' + esc(c.end || '') + '</div></div>' +
      '<div class="r"><span class="chip ' + (c.status === '완료' ? 'done' : 'wait') + '">' + esc(c.status) + '</span>' +
      '<div class="s">' + esc((c.status === '완료' ? c.done : c.created) || '').slice(5, 16) + '</div></div></div>';
  });
  html += '</div></div>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.list-item').forEach(function (n) {
    n.addEventListener('click', function () { openDetail(n.getAttribute('data-token')); });
  });
}
function renderCreate() {
  var b = $('#adminbody');
  var d = new Date(), t = todayParts();
  var y1 = t.y + 1;
  b.innerHTML = '<div class="wrap"><div class="card">' +
    '<h2>새 계약 링크 만들기</h2>' +
    '<div class="formrow"><label>지사</label><select id="c_branch"><option>계룡</option><option>논산</option></select></div>' +
    '<div class="g2"><div class="formrow"><label>관리사 성명</label><input id="c_name" placeholder="예: 홍길동"></div>' +
    '<div class="formrow"><label>주민등록번호</label><input id="c_jumin" placeholder="000000-0000000" inputmode="numeric"></div></div>' +
    '<div class="g2"><div class="formrow"><label>연락처</label><input id="c_phone" placeholder="010-0000-0000" inputmode="tel"></div>' +
    '<div class="formrow"><label>계약기간 시작</label><input id="c_start" placeholder="2026-11-20" value="' + d.toISOString().slice(0, 10) + '"></div></div>' +
    '<div class="g2"><div class="formrow"><label>계약기간 종료</label><input id="c_end" placeholder="' + y1 + '-11-19"></div>' +
    '<div class="formrow"><label>메모(선택)</label><input id="c_memo" placeholder=""></div></div>' +
    '<div class="formrow"><label>관리사 주소</label><input id="c_addr" placeholder="예: 대전광역시 유성구 대학로 99, 101동 1001호"></div>' +
    '<div style="margin-top:16px"><button class="btn" id="c_ok">링크 만들기</button></div>' +
    '<div id="c_result" style="margin-top:12px"></div>' +
    '</div><button class="btn ghost" id="c_back">목록으로</button></div>';
  b.querySelector('#c_back').addEventListener('click', function () { refreshList(); });
  b.querySelector('#c_ok').addEventListener('click', function () {
    var p = {
      action: 'create', sid: SID,
      branch: $('#c_branch').value,
      name: $('#c_name').value.trim(),
      jumin: $('#c_jumin').value.trim(),
      phone: $('#c_phone').value.trim(),
      address: $('#c_addr').value.trim(),
      start: $('#c_start').value.trim(),
      end: $('#c_end').value.trim(),
      memo: $('#c_memo').value.trim()
    };
    if (!p.name) { toast('성명을 입력해 주세요'); return; }
    if (!/^\d{6}-?\d{7}$/.test(p.jumin)) { toast('주민등록번호 형식을 확인해 주세요'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end)) { toast('계약기간을 YYYY-MM-DD로 입력해 주세요'); return; }
    this.disabled = true;
    api(p).then(function (r) {
      var btn = $('#c_ok'); if (btn) btn.disabled = false;
      if (!r.ok) { toast('실패: ' + (r.error || '오류')); return; }
      var link = location.origin + location.pathname + '?t=' + r.token;
      var box = $('#c_result');
      box.innerHTML = '<div class="muted small" style="margin-bottom:6px">계약 링크가 만들어졌습니다. 관리사님께 이 링크를 보내 주세요.</div>' +
        '<div class="copyrow"><input id="c_link" readonly value="' + esc(link) + '"><button class="btn" style="width:auto;padding:10px 14px" id="c_copy">복사</button></div>';
      box.querySelector('#c_copy').addEventListener('click', function () {
        var i = box.querySelector('#c_link'); i.select(); i.setSelectionRange(0, 999);
        if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast('링크를 복사했습니다'); });
        else { document.execCommand('copy'); toast('링크를 복사했습니다'); }
      });
    }).catch(function () { var btn = $('#c_ok'); if (btn) btn.disabled = false; toast('네트워크 오류'); });
  });
}
function refreshList() {
  api({ action: 'list', sid: SID }).then(function (r) { if (r.ok) renderDash(r.list); });
}
function openDetail(token) {
  api({ action: 'detail', sid: SID, token: token }).then(function (r) {
    if (!r.ok) { toast('불러오지 못했습니다'); return; }
    var c = r.item;
    var sheet = el('<div class="sheet"><div class="panel" style="max-height:92vh;overflow:auto">' +
      '<h3>' + esc(c.name) + ' · ' + esc(c.branch) + '지사</h3>' +
      '<div class="muted small">' + esc(c.start) + ' ~ ' + esc(c.end) + ' · <span class="chip ' + (c.status === '완료' ? 'done' : 'wait') + '">' + esc(c.status) + '</span></div>' +
      '<div class="card" style="margin:14px 0 0;padding:12px">' +
      '<div class="kv"><span class="k">주민번호</span><span class="v">' + esc(c.jumin || '-') + '</span></div>' +
      '<div class="kv"><span class="k">연락처</span><span class="v">' + esc(c.phone || '-') + '</span></div>' +
      '<div class="kv"><span class="k">주소</span><span class="v">' + esc(c.address || '-') + '</span></div>' +
      '<div class="kv"><span class="k">생성</span><span class="v">' + esc(c.created || '-') + '</span></div>' +
      '<div class="kv"><span class="k">완료</span><span class="v">' + esc(c.done || '-') + '</span></div>' +
      '</div>' +
      '<div id="d_sigs" style="margin-top:12px"></div>' +
      '<div style="margin-top:14px"><button class="btn" id="d_pdf">최종 PDF 보기</button></div>' +
      '<div id="d_view" style="margin-top:12px"></div>' +
      '<div style="margin-top:14px"><button class="btn gray" id="d_close">닫기</button></div>' +
      '</div></div>');
    document.body.appendChild(sheet);
    sheet.querySelector('#d_close').addEventListener('click', function () { sheet.remove(); });
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
        if (!rr.ok || !rr.pdf) { toast('PDF를 불러오지 못했습니다'); return; }
        var view = sheet.querySelector('#d_view');
        view.innerHTML = '<div class="docpreview" id="dpv"></div>';
        renderPdfInto(dataUrlToBytes('data:application/pdf;base64,' + rr.pdf), view.querySelector('#dpv'));
      }).catch(function () { btn.disabled = false; btn.textContent = '최종 PDF 보기'; toast('네트워크 오류'); });
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
