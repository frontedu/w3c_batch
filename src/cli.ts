import { program } from 'commander'
import ora from 'ora'
import pLimit from 'p-limit'
import { writeFile } from 'fs/promises'
import { extractUrlsFromSitemap } from './sitemap.js'
import { fetchPageHtml, validateHtml, validateUrl } from './validator.js'
import { printAllPageDetails, printSummary, printUniqueErrors, spinnerFetchText, spinnerValidateText, spinnerDoneText } from './reporter.js'
import { generateHtmlReport } from './html-report.js'
import { resolveUrlToBase, getOrigin, sleep, isLocalhost } from './utils.js'
import type { PageResult, ReportSummary, Report, PageStatus, W3CMessage } from './types.js'

program
  .name('w3c_batch')
  .description('W3C_BATCH — Batch validate all pages in a sitemap against the W3C Nu HTML validator')
  .requiredOption('--sitemap <url>', 'URL of the sitemap.xml to crawl')
  .option('--base <url>', 'Override the base URL for all pages (default: origin from --sitemap)')
  .option('--output <file>', 'Path to write the HTML report (default: report.html)', 'report.html')
  .option('--delay <ms>', 'Delay in ms between requests — W3C recommends ≥1000ms (default: 1000)', '1000')
  .option('--unique', 'Show unique errors summary after validation')

program.parse()

const options = program.opts<{
  sitemap: string
  base?: string
  output: string
  delay: string
  unique?: boolean
}>()

async function validatePage(url: string, spinner: ReturnType<typeof ora>): Promise<W3CMessage[]> {
  if (isLocalhost(url)) {
    const html = await fetchPageHtml(url)
    spinner.text = spinnerValidateText(url)
    return validateHtml(html)
  }

  try {
    spinner.text = spinnerValidateText(url)
    return await validateUrl(url)
  } catch {
    spinner.text = spinnerFetchText(url)
    const html = await fetchPageHtml(url)
    spinner.text = spinnerValidateText(url)
    return validateHtml(html)
  }
}

async function main() {
  const sitemapUrl = options.sitemap
  const baseUrl = options.base ?? getOrigin(sitemapUrl)
  const delay = Math.max(0, parseInt(options.delay, 10) || 1000)
  const outputFile = options.output

  console.log()
  console.log(`  Sitemap:     ${sitemapUrl}`)
  console.log(`  Base URL:    ${baseUrl}`)
  console.log(`  Delay:       ${delay}ms`)
  console.log(`  Output:      ${outputFile}`)
  console.log()

  const sitemapSpinner = ora('Fetching sitemap…').start()
  let rawUrls: string[]
  try {
    rawUrls = await extractUrlsFromSitemap(sitemapUrl)
    sitemapSpinner.succeed(`Found ${rawUrls.length} URL${rawUrls.length !== 1 ? 's' : ''} in sitemap`)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    sitemapSpinner.fail(`Failed to fetch sitemap: ${message}`)
    process.exit(1)
  }

  if (rawUrls.length === 0) {
    console.log('  No URLs found in sitemap. Exiting.')
    process.exit(0)
  }

  const resolvedUrls = rawUrls.map((url) => ({
    source: url,
    resolved: resolveUrlToBase(url, baseUrl),
  }))

  console.log()

  const limit = pLimit(1)
  const results: PageResult[] = []

  const tasks = resolvedUrls.map(({ source, resolved }, index) =>
    limit(async () => {
      const spinner = ora({ text: spinnerFetchText(resolved), prefixText: '' }).start()
      const startTime = Date.now()
      let result: PageResult

      try {
        const messages = await validatePage(resolved, spinner)

        const duration = Date.now() - startTime
        const errors = messages.filter((m) => m.type === 'error').length
        const warnings = messages.filter((m) => m.type === 'warning').length
        const status: PageStatus = errors > 0 ? 'errors' : warnings > 0 ? 'warnings' : 'clean'

        result = { url: resolved, sourceUrl: source, messages, status, duration }
      } catch (err: unknown) {
        const duration = Date.now() - startTime
        const errorMessage = err instanceof Error ? err.message : String(err)
        result = { url: resolved, sourceUrl: source, messages: [], status: 'failed', errorMessage, duration }
      }

      const doneText = spinnerDoneText(result)
      if (result.status === 'failed' || result.status === 'errors') {
        spinner.fail(doneText)
      } else if (result.status === 'warnings') {
        spinner.warn(doneText)
      } else {
        spinner.succeed(doneText)
      }

      results[index] = result

      if (delay > 0) {
        await sleep(delay)
      }
    })
  )

  await Promise.all(tasks)

  printAllPageDetails(results)

  if (options.unique) {
    printUniqueErrors(results)
  }

  const summary: ReportSummary = {
    totalPages: results.length,
    pagesWithErrors: results.filter((r) => r.status === 'errors').length,
    pagesWithWarnings: results.filter((r) => r.status === 'warnings').length,
    pagesClean: results.filter((r) => r.status === 'clean').length,
    pagesFailed: results.filter((r) => r.status === 'failed').length,
    totalErrors: results.reduce((sum, r) => sum + r.messages.filter((m) => m.type === 'error').length, 0),
    totalWarnings: results.reduce((sum, r) => sum + r.messages.filter((m) => m.type === 'warning').length, 0),
    totalInfos: results.reduce((sum, r) => sum + r.messages.filter((m) => m.type === 'info').length, 0),
    generatedAt: new Date().toISOString(),
    sitemapUrl,
  }

  const report: Report = { summary, pages: results }
  const html = generateHtmlReport(report)
  await writeFile(outputFile, html, 'utf-8')

  printSummary(summary, outputFile)

  if (summary.pagesWithErrors > 0 || summary.pagesFailed > 0) {
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`Fatal error: ${message}`)
  process.exit(1)
})
