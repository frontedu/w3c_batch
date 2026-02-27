(function () {
  var $ = function (id) { return document.getElementById(id); };
  var pageCount = 0;
  var doneCount = 0;
  var currentJobId = null;
  var globalSeenErrors = new Set();
  var tplTarget = $('tpl-target');
  var tplLogEntry = $('tpl-log-entry');

  function initTheme() {
    var saved = localStorage.getItem('theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    updateThemeIcon();
  }

  function updateThemeIcon() {
    var current = document.documentElement.getAttribute('data-theme');
    $('theme-toggle').textContent = current === 'dark' ? '\u2600' : '\u263D';
  }

  $('theme-toggle').addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon();
  });

  initTheme();

  $('stop-btn').addEventListener('click', function () {
    if (!currentJobId) return;
    fetch('/api/abort/' + currentJobId, { method: 'POST' });
    sysLog('ABORTING...');
  });

  $('unique-toggle').addEventListener('change', function (e) {
    document.body.classList.toggle('strict-unique', e.target.checked);
  });

  function esc(s) {
    var el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  function fmt(ms) {
    return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
  }

  function sysLog(t) {
    var el = $('status-line');
    el.textContent = t;
    el.style.animation = 'none';
    requestAnimationFrame(function () {
      el.style.animation = 'pulse-opacity 1s infinite alternate';
    });
  }

  function updateMet(c, t) {
    $('metric-counter').textContent =
      String(c).padStart(3, '0') + ' / ' + String(t).padStart(3, '0');
  }

  function showStop() { $('stop-btn').style.display = 'block'; }
  function hideStop() { $('stop-btn').style.display = 'none'; }

  function resetBtn() {
    var b = $('start-btn');
    b.disabled = false;
    b.textContent = 'SCAN_NOW';
    $('status-line').style.animation = 'none';
    hideStop();
    currentJobId = null;
  }

  $('cfg').addEventListener('submit', function (e) {
    e.preventDefault();

    var xml = $('xml').value.trim();
    var base = $('base').value.trim();

    if (!xml) { sysLog('ERR: MISSING_PAYLOAD'); return; }

    $('start-btn').disabled = true;
    $('start-btn').textContent = 'SCANNING...';
    $('empty-state').style.display = 'none';
    $('data-flow').replaceChildren();
    $('dash-summary').style.display = 'none';
    $('filter-bar').style.display = 'flex';
    pageCount = 0;
    doneCount = 0;
    globalSeenErrors.clear();
    sysLog('PARSING_XML_DATA');
    updateMet(0, 0);

    fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: xml, base: base, concurrency: 1, delay: 1000 })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('SERVER_LINK_FAIL ' + r.status);
        return r.json();
      })
      .then(function (data) { currentJobId = data.jobId; showStop(); openStream(data.jobId); })
      .catch(function (err) { sysLog(err.message); resetBtn(); });
  });

  function openStream(jobId) {
    var es = new EventSource('/api/stream/' + jobId);
    es.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch (_) { return; }
      handleEvent(msg, jobId);
      if (msg.type === 'stream_end') es.close();
    };
    es.onerror = function () { es.close(); };
  }

  function handleEvent(msg, jobId) {
    if (msg.type === 'sitemap_error') {
      sysLog('ERR_XML: ' + msg.message);
      resetBtn();
    }
    else if (msg.type === 'sitemapindex_resolving') {
      sysLog('SITEMAPINDEX_DETECTED — RESOLVING ' + msg.count + ' NESTED SITEMAP(S)');
    }
    else if (msg.type === 'sitemapindex_fetching') {
      sysLog('FETCHING: ' + msg.url);
    }
    else if (msg.type === 'sitemapindex_fetched') {
      sysLog('FETCHED ' + msg.count + ' URLs FROM: ' + msg.url);
    }
    else if (msg.type === 'sitemapindex_resolved') {
      sysLog('RESOLVED — ' + msg.totalUrls + ' TOTAL URLs COLLECTED');
    }
    else if (msg.type === 'sitemapindex_fetch_error') {
      sysLog('WARN: FAILED TO FETCH ' + msg.url);
    }
    else if (msg.type === 'sitemap_done') {
      pageCount = msg.count;
      sysLog('URLS_EXTRACTED_AWAITING_VALIDATION');
      updateMet(0, pageCount);
      renderTargets(msg.urls);
    }
    else if (msg.type === 'page_fetching') { updateTargetStatus(msg.index, 'fetching'); }
    else if (msg.type === 'page_validating') { updateTargetStatus(msg.index, 'validating'); }
    else if (msg.type === 'page_done') {
      doneCount++;
      updateMet(doneCount, pageCount);
      updateTargetResult(msg.index, msg.status, msg);
    }
    else if (msg.type === 'cancelled') {
      sysLog('SCAN_ABORTED');
      resetBtn();
    }
    else if (msg.type === 'done') {
      if (msg.summary) renderDash(msg.summary, jobId);
      sysLog('SEQUENCE_COMPLETE');
      resetBtn();
    }
    else if (msg.type === 'error') { sysLog('ERR_SYS: ' + msg.message); resetBtn(); }
  }

  function renderTargets(urls) {
    var frag = document.createDocumentFragment();

    urls.forEach(function (url, i) {
      var clone = tplTarget.content.cloneNode(true);
      var wrapper = clone.firstElementChild;
      wrapper.id = 'tgt-' + i;
      wrapper.style.animationDelay = (i * 0.03) + 's';

      var idxEl = wrapper.querySelector('.idx-stamp');
      idxEl.textContent = '[' + String(i + 1).padStart(3, '0') + ']';

      var pathEl = wrapper.querySelector('.path-data');
      try {
        var u = new URL(url);
        pathEl.innerHTML = esc(u.origin) + ' <span style="color:var(--text-main)">' + esc(u.pathname + u.search) + '</span>';
      } catch (_) {
        pathEl.textContent = url;
      }

      var metaEl = wrapper.querySelector('.meta-status');
      metaEl.id = 'meta-' + i;

      frag.appendChild(clone);
    });

    $('data-flow').replaceChildren(frag);
  }

  function updateTargetStatus(idx, state) {
    var wrap = $('tgt-' + idx);
    if (!wrap) return;
    wrap.className = 'st-' + state;
    var meta = $('meta-' + idx);
    var badge = meta.querySelector('.badge-sig') || document.createElement('span');
    badge.className = 'badge-sig';
    badge.textContent = state === 'fetching' ? 'LINKING...' : 'ANALYZING...';
    meta.replaceChildren(badge);
  }

  function updateTargetResult(idx, state, data) {
    var wrap = $('tgt-' + idx);
    if (!wrap) return;
    wrap.className = 'st-' + state;
    var meta = $('meta-' + idx);
    var msgs = (data && data.messages) ? data.messages : [];

    meta.replaceChildren();

    if (state === 'clean') {
      appendBadge(meta, 'CLEAN_PASS');
    } else if (state === 'warnings') {
      var wc = msgs.filter(function (m) { return m.type === 'warning'; }).length;
      appendBadge(meta, wc + ' WARN');
      attachLogs(wrap, msgs);
    } else if (state === 'errors') {
      var ec = msgs.filter(function (m) { return m.type === 'error'; }).length;
      var wc2 = msgs.filter(function (m) { return m.type === 'warning'; }).length;
      appendBadge(meta, ec + ' ERR');
      if (wc2) {
        var wBadge = appendBadge(meta, wc2 + ' WRN');
        wBadge.style.color = 'var(--warn)';
        wBadge.style.borderColor = 'var(--warn)';
      }
      attachLogs(wrap, msgs);
    } else if (state === 'failed') {
      appendBadge(meta, 'FAILURE');
      var errSpan = document.createElement('span');
      errSpan.textContent = '[' + ((data && data.errorMessage) || 'TRAP_EXCEPTION') + ']';
      meta.appendChild(errSpan);
    }

    if (data && data.duration) {
      var durSpan = document.createElement('span');
      durSpan.textContent = '[' + fmt(data.duration) + ']';
      meta.appendChild(durSpan);
    }
  }

  function appendBadge(parent, text) {
    var badge = document.createElement('span');
    badge.className = 'badge-sig';
    badge.textContent = text;
    parent.appendChild(badge);
    return badge;
  }

  function attachLogs(wrap, msgs) {
    var old = wrap.querySelector('.log-stream');
    if (old) old.remove();
    if (!msgs || !msgs.length) return;

    var stream = document.createElement('div');
    stream.className = 'log-stream fade-in-up';

    msgs.forEach(function (m) {
      var hash = m.type + '::' + m.message.trim();
      var isDup = globalSeenErrors.has(hash);
      globalSeenErrors.add(hash);

      var clone = tplLogEntry.content.cloneNode(true);
      var entry = clone.firstElementChild;
      entry.classList.add('e-' + m.type);
      if (isDup) entry.classList.add('msg-duplicate');

      entry.querySelector('.log-hdr-t').textContent = m.type.toUpperCase() + '_DETECTED';

      var locEl = entry.querySelector('.log-loc');
      if (m.lastLine) {
        locEl.textContent = 'L:' + m.lastLine + (m.firstColumn ? ' C:' + m.firstColumn : '');
      }

      entry.querySelector('.log-msg').textContent = m.message;

      if (m.extract) {
        var ctx = document.createElement('div');
        ctx.className = 'log-ctx';
        ctx.textContent = m.extract;
        entry.appendChild(ctx);
      }

      stream.appendChild(clone);
    });

    wrap.querySelector('.target-block').appendChild(stream);
  }

  function renderDash(s, jobId) {
    var box = $('dash-summary');
    var c = $('dash-content');
    c.replaceChildren();

    var grid = document.createElement('div');
    grid.className = 'dash-grid';

    addStatCard(grid, 'TOTAL_PAGES', s.totalPages, '');
    addStatCard(grid, 'PASSED_CLEAN', s.pagesClean, 'sc-ok');
    addStatCard(grid, 'PAGES_W_WARNS', s.pagesWithWarnings, 'sc-warn');
    addStatCard(grid, 'CRITICAL_ERRS', s.pagesWithErrors, 'sc-err');

    var totalsRow = document.createElement('div');
    totalsRow.style.cssText = 'grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px';

    var totalErrCard = document.createElement('div');
    totalErrCard.className = 'stat-card sc-err';
    totalErrCard.style.borderColor = 'var(--err)';
    var totalErrLbl = document.createElement('span');
    totalErrLbl.className = 'stat-lbl';
    totalErrLbl.style.color = 'var(--err)';
    totalErrLbl.textContent = 'TOTAL ERRORS';
    var totalErrVal = document.createElement('span');
    totalErrVal.className = 'stat-val';
    totalErrVal.textContent = s.totalErrors;
    totalErrCard.appendChild(totalErrLbl);
    totalErrCard.appendChild(totalErrVal);

    var totalWarnCard = document.createElement('div');
    totalWarnCard.className = 'stat-card sc-warn';
    totalWarnCard.style.borderColor = 'var(--warn)';
    var totalWarnLbl = document.createElement('span');
    totalWarnLbl.className = 'stat-lbl';
    totalWarnLbl.style.color = 'var(--warn)';
    totalWarnLbl.textContent = 'TOTAL WARNINGS';
    var totalWarnVal = document.createElement('span');
    totalWarnVal.className = 'stat-val';
    totalWarnVal.textContent = s.totalWarnings;
    totalWarnCard.appendChild(totalWarnLbl);
    totalWarnCard.appendChild(totalWarnVal);

    totalsRow.appendChild(totalErrCard);
    totalsRow.appendChild(totalWarnCard);
    grid.appendChild(totalsRow);

    c.appendChild(grid);

    var dlBtn = document.createElement('button');
    dlBtn.className = 'dl-action';
    dlBtn.textContent = 'DOWNLOAD_DIAGNOSTIC_REPORT.HTML';
    dlBtn.addEventListener('click', function () {
      window.open('/api/report/' + jobId, '_blank');
    });
    c.appendChild(dlBtn);

    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function addStatCard(parent, label, value, cls) {
    var card = document.createElement('div');
    card.className = 'stat-card' + (cls ? ' ' + cls : '');
    var lbl = document.createElement('span');
    lbl.className = 'stat-lbl';
    lbl.textContent = label;
    var val = document.createElement('span');
    val.className = 'stat-val';
    val.textContent = value;
    card.appendChild(lbl);
    card.appendChild(val);
    parent.appendChild(card);
  }


})();
