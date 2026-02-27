import type { Report, PageResult, W3CMessage } from './types.js'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getStatusBadge(result: PageResult): string {
  if (result.status === 'failed') return '<span class="badge badge-failed">FAILED</span>'
  if (result.status === 'errors') {
    const errors = result.messages.filter((m) => m.type === 'error').length
    const warnings = result.messages.filter((m) => m.type === 'warning').length
    const errBadge = `<span class="badge badge-error">${errors} error${errors !== 1 ? 's' : ''}</span>`
    const warnBadge = warnings > 0 ? ` <span class="badge badge-warning">${warnings} warn</span>` : ''
    return errBadge + warnBadge
  }
  if (result.status === 'warnings') {
    const count = result.messages.filter((m) => m.type === 'warning').length
    return `<span class="badge badge-warning">${count} warning${count !== 1 ? 's' : ''}</span>`
  }
  return '<span class="badge badge-clean">✓</span>'
}

function getMessageIcon(msg: W3CMessage): string {
  if (msg.type === 'error') return '✗'
  if (msg.type === 'warning') return '⚠'
  return 'ℹ'
}

function renderMessage(msg: W3CMessage): string {
  const icon = getMessageIcon(msg)
  let location = ''
  if (msg.lastLine !== undefined) {
    const line = msg.firstLine ?? msg.lastLine
    const col = msg.firstColumn !== undefined ? `:${msg.firstColumn}` : ''
    location = `<span class="msg-location">line ${line}${col}</span>`
  }

  const extract = msg.extract
    ? `<pre class="msg-extract">${escapeHtml(msg.extract)}</pre>`
    : ''

  return `
    <div class="message message-${msg.type}">
      <span class="msg-icon">${icon}</span>
      <div class="msg-content">
        <span class="msg-text">${escapeHtml(msg.message)}</span>
        ${location}
        ${extract}
      </div>
    </div>`
}

function renderPage(result: PageResult, index: number): string {
  const errors = result.messages.filter((m) => m.type === 'error').length
  const warnings = result.messages.filter((m) => m.type === 'warning').length
  const infos = result.messages.filter((m) => m.type === 'info').length

  const statsHtml = result.status === 'failed'
    ? `<span class="stat stat-error">Failed: ${escapeHtml(result.errorMessage ?? 'Unknown error')}</span>`
    : [
        errors > 0 ? `<span class="stat stat-error">${errors} error${errors !== 1 ? 's' : ''}</span>` : '',
        warnings > 0 ? `<span class="stat stat-warning">${warnings} warning${warnings !== 1 ? 's' : ''}</span>` : '',
        infos > 0 ? `<span class="stat stat-info">${infos} info</span>` : '',
        result.status === 'clean' ? '<span class="stat stat-clean">✓ Valid</span>' : '',
      ].filter(Boolean).join('')

  const messagesHtml = result.status === 'failed'
    ? ''
    : result.messages.map(renderMessage).join('')

  const dataStatus = result.status

  return `
  <section id="page-${index + 1}" class="page-section" data-status="${dataStatus}">
    <details ${result.status !== 'clean' ? 'open' : ''}>
      <summary class="page-summary page-${result.status}">
        <span class="page-index">#${index + 1}</span>
        <span class="page-url">${escapeHtml(result.url)}</span>
        <span class="page-stats">${statsHtml}</span>
      </summary>
      <div class="page-messages">
        ${messagesHtml || '<p class="no-issues">No issues found.</p>'}
      </div>
    </details>
  </section>`
}

function renderSidebarItem(result: PageResult, index: number): string {
  const badge = getStatusBadge(result)
  const shortUrl = result.url.replace(/^https?:\/\/[^/]+/, '') || '/'
  const urlDisplay = shortUrl.length > 40 ? shortUrl.slice(0, 37) + '...' : shortUrl

  return `
    <a href="#page-${index + 1}" class="nav-item nav-${result.status}" title="${escapeHtml(result.url)}">
      <span class="nav-index">${index + 1}</span>
      <span class="nav-url">${escapeHtml(urlDisplay)}</span>
      ${badge}
    </a>`
}

export function generateHtmlReport(report: Report): string {
  const { summary, pages } = report
  const sidebarItems = pages.map(renderSidebarItem).join('')
  const pagesSections = pages.map(renderPage).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>W3C Validation Report — ${escapeHtml(summary.sitemapUrl)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --color-error: #dc2626;
      --color-warning: #d97706;
      --color-info: #2563eb;
      --color-clean: #16a34a;
      --color-failed: #7c3aed;
      --color-bg: #0f172a;
      --color-surface: #1e293b;
      --color-surface2: #334155;
      --color-text: #e2e8f0;
      --color-text-muted: #94a3b8;
      --color-border: #334155;
      --sidebar-width: 280px;
      --stats-height: 60px;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      font-size: 14px;
      line-height: 1.5;
    }
    .stats-bar {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: var(--stats-height);
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      padding: 0 20px;
      gap: 24px;
      z-index: 100;
    }
    .stats-bar h1 { font-size: 16px; font-weight: 700; white-space: nowrap; }
    .stats-bar .stat-group { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .stats-bar .stat-item { display: flex; align-items: center; gap: 4px; font-size: 13px; }
    .stats-bar .stat-item .val { font-weight: 700; }
    .stats-bar .stat-item.errors .val { color: var(--color-error); }
    .stats-bar .stat-item.warnings .val { color: var(--color-warning); }
    .stats-bar .stat-item.clean .val { color: var(--color-clean); }
    .stats-bar .stat-item.total .val { color: var(--color-text); }
    .stats-bar .generated { margin-left: auto; font-size: 12px; color: var(--color-text-muted); white-space: nowrap; }
    .sidebar {
      position: fixed; top: var(--stats-height); left: 0;
      width: var(--sidebar-width); bottom: 0;
      background: var(--color-surface);
      border-right: 1px solid var(--color-border);
      overflow-y: auto; z-index: 90;
    }
    .sidebar-header {
      padding: 12px 16px; font-size: 11px; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--color-text-muted);
      border-bottom: 1px solid var(--color-border);
      position: sticky; top: 0; background: var(--color-surface); z-index: 1;
    }
    .sidebar-filters {
      padding: 8px 16px; display: flex; gap: 6px; flex-wrap: wrap;
      border-bottom: 1px solid var(--color-border);
    }
    .filter-btn {
      padding: 4px 10px; border-radius: 4px;
      border: 1px solid var(--color-border); background: transparent;
      color: var(--color-text-muted); font-size: 12px; cursor: pointer; transition: all 0.15s;
    }
    .filter-btn:hover, .filter-btn.active {
      background: var(--color-surface2); color: var(--color-text); border-color: var(--color-text-muted);
    }
    .filter-btn.active { font-weight: 600; }
    .nav-item {
      display: flex; align-items: center; gap: 8px; padding: 8px 16px;
      text-decoration: none; color: var(--color-text-muted);
      border-bottom: 1px solid var(--color-border); transition: background 0.1s; font-size: 12px;
    }
    .nav-item:hover { background: var(--color-surface2); color: var(--color-text); }
    .nav-item.hidden { display: none; }
    .nav-index { min-width: 24px; font-size: 11px; color: var(--color-text-muted); }
    .nav-url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nav-item.nav-errors .nav-url { color: var(--color-error); }
    .nav-item.nav-warnings .nav-url { color: var(--color-warning); }
    .nav-item.nav-clean .nav-url { color: var(--color-clean); }
    .nav-item.nav-failed .nav-url { color: var(--color-failed); }
    .badge { padding: 2px 6px; border-radius: 10px; font-size: 11px; font-weight: 600; white-space: nowrap; }
    .badge-error { background: rgba(220,38,38,0.2); color: var(--color-error); }
    .badge-warning { background: rgba(217,119,6,0.2); color: var(--color-warning); }
    .badge-clean { background: rgba(22,163,74,0.2); color: var(--color-clean); }
    .badge-failed { background: rgba(124,58,237,0.2); color: var(--color-failed); }
    .main { margin-left: var(--sidebar-width); margin-top: var(--stats-height); padding: 24px; max-width: 900px; }
    .controls { display: flex; gap: 10px; margin-bottom: 20px; }
    .ctrl-btn {
      padding: 6px 14px; border-radius: 6px;
      border: 1px solid var(--color-border); background: var(--color-surface);
      color: var(--color-text); font-size: 13px; cursor: pointer; transition: background 0.15s;
    }
    .ctrl-btn:hover { background: var(--color-surface2); }
    .page-section { margin-bottom: 12px; }
    .page-section.hidden { display: none; }
    details { border-radius: 8px; overflow: hidden; border: 1px solid var(--color-border); }
    details[open] > summary { border-bottom: 1px solid var(--color-border); }
    .page-summary {
      display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      cursor: pointer; list-style: none; background: var(--color-surface); user-select: none;
    }
    .page-summary::-webkit-details-marker { display: none; }
    .page-summary::before {
      content: '▶'; font-size: 10px; color: var(--color-text-muted);
      transition: transform 0.2s; min-width: 12px;
    }
    details[open] > .page-summary::before { transform: rotate(90deg); }
    .page-summary:hover { background: var(--color-surface2); }
    .page-clean { border-left: 3px solid var(--color-clean); }
    .page-warnings { border-left: 3px solid var(--color-warning); }
    .page-errors { border-left: 3px solid var(--color-error); }
    .page-failed { border-left: 3px solid var(--color-failed); }
    .page-index { font-size: 12px; color: var(--color-text-muted); min-width: 28px; }
    .page-url {
      flex: 1; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .page-stats { display: flex; gap: 8px; align-items: center; }
    .stat { font-size: 12px; font-weight: 600; }
    .stat-error { color: var(--color-error); }
    .stat-warning { color: var(--color-warning); }
    .stat-info { color: var(--color-info); }
    .stat-clean { color: var(--color-clean); }
    .page-messages { background: var(--color-bg); padding: 12px 16px; }
    .no-issues { color: var(--color-clean); font-size: 13px; padding: 4px 0; }
    .message {
      display: flex; gap: 10px; padding: 8px 0;
      border-bottom: 1px solid var(--color-border);
    }
    .message:last-child { border-bottom: none; }
    .msg-icon { font-size: 14px; min-width: 16px; margin-top: 1px; }
    .message-error .msg-icon { color: var(--color-error); }
    .message-warning .msg-icon { color: var(--color-warning); }
    .message-info .msg-icon { color: var(--color-info); }
    .msg-content { flex: 1; }
    .msg-text { display: block; font-size: 13px; line-height: 1.4; }
    .message-error .msg-text { color: #fca5a5; }
    .message-warning .msg-text { color: #fcd34d; }
    .message-info .msg-text { color: #93c5fd; }
    .msg-location {
      display: inline-block; margin-top: 2px; font-size: 11px;
      color: var(--color-text-muted); font-family: monospace;
    }
    .msg-extract {
      margin-top: 6px; padding: 6px 10px; background: var(--color-surface2);
      border-radius: 4px; font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px; color: var(--color-text-muted); white-space: pre-wrap; overflow-x: auto;
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--color-surface2); border-radius: 3px; }
    @media (max-width: 768px) {
      :root { --sidebar-width: 0px; }
      .sidebar { display: none; }
      .main { margin-left: 0; }
    }
  </style>
</head>
<body>

<header class="stats-bar">
  <h1>W3C Validation Report</h1>
  <div class="stat-group">
    <span class="stat-item total"><span class="lbl">Pages:</span> <span class="val">${summary.totalPages}</span></span>
    <span class="stat-item clean"><span class="lbl">Clean:</span> <span class="val">${summary.pagesClean}</span></span>
    <span class="stat-item warnings"><span class="lbl">Warnings:</span> <span class="val">${summary.pagesWithWarnings}</span></span>
    <span class="stat-item errors"><span class="lbl">Errors:</span> <span class="val">${summary.pagesWithErrors}</span></span>
  </div>
  <span class="generated">Generated ${escapeHtml(summary.generatedAt)}</span>
</header>

<nav class="sidebar">
  <div class="sidebar-header">Pages (${summary.totalPages})</div>
  <div class="sidebar-filters">
    <button class="filter-btn active" onclick="filterPages('all', this)">All</button>
    <button class="filter-btn" onclick="filterPages('errors', this)">Errors</button>
    <button class="filter-btn" onclick="filterPages('warnings', this)">Warnings</button>
    <button class="filter-btn" onclick="filterPages('clean', this)">Clean</button>
  </div>
  <div id="nav-list">
    ${sidebarItems}
  </div>
</nav>

<main class="main">
  <div class="controls">
    <button class="ctrl-btn" onclick="expandAll()">Expand All</button>
    <button class="ctrl-btn" onclick="collapseAll()">Collapse All</button>
  </div>

  <div id="pages-list">
    ${pagesSections}
  </div>
</main>

<script>
  function filterPages(status, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#nav-list .nav-item').forEach(item => {
      if (status === 'all') { item.classList.remove('hidden'); }
      else { item.classList.toggle('hidden', !item.classList.contains('nav-' + status)); }
    });
    document.querySelectorAll('#pages-list .page-section').forEach(section => {
      if (status === 'all') { section.classList.remove('hidden'); }
      else { section.classList.toggle('hidden', section.getAttribute('data-status') !== status); }
    });
  }
  function expandAll() {
    document.querySelectorAll('#pages-list details:not(.hidden)').forEach(d => d.setAttribute('open', ''));
  }
  function collapseAll() {
    document.querySelectorAll('#pages-list details').forEach(d => d.removeAttribute('open'));
  }
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const href = item.getAttribute('href');
      if (!href) return;
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const details = target.querySelector('details');
        if (details) details.setAttribute('open', '');
      }
    });
  });
</script>

</body>
</html>`
}
