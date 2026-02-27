import http from 'http'
import { URL } from 'url'
import { randomUUID } from 'crypto'
import { readFile, stat } from 'fs/promises'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import pLimit from 'p-limit'
import axios from 'axios'
import { parseUrlsFromXml } from './sitemap.js'
import { fetchPageHtml, validateHtml, validateUrl } from './validator.js'
import { resolveUrlToBase, getOrigin, sleep, isLocalhost } from './utils.js'
import { generateHtmlReport } from './html-report.js'
import type { PageResult, PageStatus, Report, ReportSummary, W3CMessage } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PORT = parseInt(process.env.PORT ?? '3000', 10)

interface Job {
  buffered: string[]
  listeners: Set<(data: string) => void>
  report: string | null
  done: boolean
  aborted: boolean
}

const jobs = new Map<string, Job>()

function createJob(): [string, Job] {
  const id = randomUUID()
  const job: Job = { buffered: [], listeners: new Set(), report: null, done: false, aborted: false }
  jobs.set(id, job)
  return [id, job]
}

function emit(job: Job, event: Record<string, unknown>): void {
  const data = `data: ${JSON.stringify(event)}\n\n`
  job.buffered.push(data)
  job.listeners.forEach((fn) => fn(data))
}

function endJob(job: Job): void {
  emit(job, { type: 'stream_end' })
  job.done = true
}

async function validatePage(url: string): Promise<W3CMessage[]> {
  if (isLocalhost(url)) {
    const html = await fetchPageHtml(url)
    return validateHtml(html)
  }

  try {
    return await validateUrl(url)
  } catch {
    const html = await fetchPageHtml(url)
    return validateHtml(html)
  }
}

async function runValidation(
  job: Job,
  params: { xml: string; base: string }
): Promise<void> {
  let rawUrls: string[]
  try {
    const result = parseUrlsFromXml(params.xml)

    if (result.kind === 'urls') {
      rawUrls = result.urls
    } else {
      emit(job, { type: 'sitemapindex_resolving', count: result.sitemapUrls.length, urls: result.sitemapUrls })
      rawUrls = []
      for (const sitemapUrl of result.sitemapUrls) {
        try {
          emit(job, { type: 'sitemapindex_fetching', url: sitemapUrl })
          const resp = await axios.get<string>(sitemapUrl, {
            responseType: 'text',
            headers: { 'User-Agent': 'w3c_batch/1.0 (automated validator)' },
            timeout: 30000,
          })
          const nested = parseUrlsFromXml(resp.data)
          if (nested.kind === 'urls') {
            rawUrls.push(...nested.urls)
            emit(job, { type: 'sitemapindex_fetched', url: sitemapUrl, count: nested.urls.length })
          }
        } catch (err: unknown) {
          emit(job, { type: 'sitemapindex_fetch_error', url: sitemapUrl, message: err instanceof Error ? err.message : String(err) })
        }
      }
      emit(job, { type: 'sitemapindex_resolved', totalUrls: rawUrls.length })
    }
  } catch (err: unknown) {
    emit(job, { type: 'sitemap_error', message: err instanceof Error ? err.message : String(err) })
    endJob(job)
    return
  }

  if (rawUrls.length === 0) {
    emit(job, { type: 'sitemap_error', message: 'No <url> entries found in the sitemap XML.' })
    endJob(job)
    return
  }

  const baseUrl = params.base.trim() || getOrigin(rawUrls[0])
  const resolvedUrls = rawUrls.map((url) => ({
    source: url,
    resolved: resolveUrlToBase(url, baseUrl),
  }))

  emit(job, {
    type: 'sitemap_done',
    count: resolvedUrls.length,
    urls: resolvedUrls.map((u) => u.resolved),
  })

  const results: PageResult[] = new Array(resolvedUrls.length)
  const limit = pLimit(1)

  const tasks = resolvedUrls.map(({ source, resolved }, index) =>
    limit(async () => {
      if (job.aborted) return
      const start = Date.now()
      let result: PageResult

      try {
        emit(job, { type: 'page_fetching', index, url: resolved })
        const messages = await validatePage(resolved)
        emit(job, { type: 'page_validating', index, url: resolved })

        const duration = Date.now() - start
        const errors = messages.filter((m) => m.type === 'error').length
        const warnings = messages.filter((m) => m.type === 'warning').length
        const status: PageStatus = errors > 0 ? 'errors' : warnings > 0 ? 'warnings' : 'clean'

        result = { url: resolved, sourceUrl: source, messages, status, duration }
      } catch (err: unknown) {
        result = {
          url: resolved,
          sourceUrl: source,
          messages: [],
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
          duration: Date.now() - start,
        }
      }

      results[index] = result
      emit(job, {
        type: 'page_done',
        index,
        url: result.url,
        status: result.status,
        messages: result.messages,
        duration: result.duration,
        errorMessage: result.errorMessage,
      })

      await sleep(1000)
    })
  )

  await Promise.all(tasks)

  const valid = results.filter(Boolean)
  const summary: ReportSummary = {
    totalPages: valid.length,
    pagesWithErrors: valid.filter((r) => r.status === 'errors').length,
    pagesWithWarnings: valid.filter((r) => r.status === 'warnings').length,
    pagesClean: valid.filter((r) => r.status === 'clean').length,
    pagesFailed: valid.filter((r) => r.status === 'failed').length,
    totalErrors: valid.reduce((s, r) => s + r.messages.filter((m) => m.type === 'error').length, 0),
    totalWarnings: valid.reduce((s, r) => s + r.messages.filter((m) => m.type === 'warning').length, 0),
    totalInfos: valid.reduce((s, r) => s + r.messages.filter((m) => m.type === 'info').length, 0),
    generatedAt: new Date().toISOString(),
    sitemapUrl: baseUrl,
  }

  job.report = generateHtmlReport({ summary, pages: valid } as Report)
  emit(job, { type: 'done', summary })
  endJob(job)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (req.method === 'GET' && url.pathname === '/') {
    try {
      const indexPath = join(__dirname, '..', 'index.html')
      const content = await readFile(indexPath, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(content)
    } catch {
      res.writeHead(500)
      res.end('Error loading UI')
    }
    return
  }

  const MIME_TYPES: Record<string, string> = {
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
  }

  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const publicDir = join(__dirname, '..', 'public')
    const filePath = join(publicDir, url.pathname)
    if (!filePath.startsWith(publicDir)) { res.writeHead(403); res.end('Forbidden'); return }
    try {
      await stat(filePath)
      const ext = extname(filePath)
      const mime = MIME_TYPES[ext] || 'application/octet-stream'
      const content = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/validate') {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => {
      let params: { xml: string; base: string }
      try {
        params = JSON.parse(body) as typeof params
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }
      const [jobId, job] = createJob()
      runValidation(job, params).catch(console.error)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jobId }))
    })
    return
  }

  const streamMatch = /^\/api\/stream\/([^/]+)$/.exec(url.pathname)
  if (req.method === 'GET' && streamMatch) {
    const job = jobs.get(streamMatch[1])
    if (!job) { res.writeHead(404); res.end('Job not found'); return }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    for (const d of job.buffered) res.write(d)
    if (job.done) { res.end(); return }
    const listener = (d: string) => { res.write(d); if (d.includes('"stream_end"')) res.end() }
    job.listeners.add(listener)
    req.on('close', () => job.listeners.delete(listener))
    return
  }

  const reportMatch = /^\/api\/report\/([^/]+)$/.exec(url.pathname)
  if (req.method === 'GET' && reportMatch) {
    const job = jobs.get(reportMatch[1])
    if (!job || !job.report) { res.writeHead(404); res.end('Report not ready'); return }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="w3c-report.html"',
    })
    res.end(job.report)
    return
  }

  const abortMatch = /^\/api\/abort\/([^/]+)$/.exec(url.pathname)
  if (req.method === 'POST' && abortMatch) {
    const job = jobs.get(abortMatch[1])
    if (!job) { res.writeHead(404); res.end('Job not found'); return }
    job.aborted = true
    emit(job, { type: 'cancelled' })
    endJob(job)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log()
  console.log(`  W3C_BATCH Validator  →  http://localhost:${PORT}`)
  console.log()
})
