import chalk from 'chalk'
import type { PageResult, ReportSummary, W3CMessage } from './types.js'
import { formatDuration } from './utils.js'

export function printPageDetail(result: PageResult, index: number): void {
  const errors = result.messages.filter((m) => m.type === 'error')
  const warnings = result.messages.filter((m) => m.type === 'warning')
  const infos = result.messages.filter((m) => m.type === 'info')

  if (result.status === 'clean') return

  console.log()
  console.log(chalk.bold(`Page #${index + 1}: ${result.url}`))

  if (result.status === 'failed') {
    console.log(chalk.red(`  ✗ Failed: ${result.errorMessage}`))
    return
  }

  const parts: string[] = []
  if (errors.length > 0) parts.push(chalk.red(`${errors.length} error${errors.length !== 1 ? 's' : ''}`))
  if (warnings.length > 0) parts.push(chalk.yellow(`${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`))
  if (infos.length > 0) parts.push(chalk.blue(`${infos.length} info`))
  console.log(`  ${parts.join(', ')}`)

  for (const msg of result.messages) {
    const icon = msg.type === 'error' ? chalk.red('✗') : msg.type === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ')
    const colorFn = msg.type === 'error' ? chalk.red : msg.type === 'warning' ? chalk.yellow : chalk.blue

    let location = ''
    if (msg.lastLine !== undefined) {
      location = chalk.gray(` [line ${msg.firstLine ?? msg.lastLine}${msg.firstColumn !== undefined ? `:${msg.firstColumn}` : ''}]`)
    }

    console.log(`  ${icon} ${colorFn(msg.message)}${location}`)

    if (msg.extract) {
      const trimmed = msg.extract.replace(/\n/g, '↵').slice(0, 120)
      console.log(`    ${chalk.gray(trimmed)}`)
    }
  }
}

export function printAllPageDetails(results: PageResult[]): void {
  const pagesWithIssues = results.filter((r) => r.status !== 'clean')
  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== 'clean') {
      printPageDetail(results[i], i)
    }
  }
  if (pagesWithIssues.length === 0) {
    console.log()
    console.log(chalk.green('  All pages passed validation!'))
  }
}

export function printUniqueErrors(results: PageResult[]): void {
  const seen = new Map<string, { msg: W3CMessage; count: number }>()

  for (const result of results) {
    for (const msg of result.messages) {
      const hash = `${msg.type}::${msg.message.trim()}`
      const existing = seen.get(hash)
      if (existing) {
        existing.count++
      } else {
        seen.set(hash, { msg, count: 1 })
      }
    }
  }

  if (seen.size === 0) return

  const width = 52
  const line = '─'.repeat(width)

  console.log()
  console.log(chalk.bold('┌' + line + '┐'))
  console.log(chalk.bold('│') + chalk.bold.magenta('  Unique Issues').padEnd(width + 1) + chalk.bold('│'))
  console.log(chalk.bold('├' + line + '┤'))

  const totalAll = Array.from(seen.values()).reduce((s, v) => s + v.count, 0)
  const row = (label: string, value: string | number, colorFn = chalk.white) => {
    const labelStr = `  ${label}`
    const valueStr = String(value)
    const padding = width - labelStr.length - valueStr.length
    console.log(chalk.bold('│') + labelStr + colorFn(valueStr).padStart(valueStr.length + padding) + chalk.bold('│'))
  }

  row('Total occurrences:', totalAll)
  row('Unique issues:', seen.size, chalk.cyan)
  console.log(chalk.bold('└' + line + '┘'))
  console.log()

  for (const [, { msg, count }] of seen) {
    const icon = msg.type === 'error' ? chalk.red('✗') : msg.type === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ')
    const colorFn = msg.type === 'error' ? chalk.red : msg.type === 'warning' ? chalk.yellow : chalk.blue
    const countLabel = count > 1 ? chalk.gray(` (×${count} pages)`) : ''
    console.log(`  ${icon} ${colorFn(msg.message)}${countLabel}`)
  }
  console.log()
}

export function printSummary(summary: ReportSummary, outputFile?: string): void {
  const width = 52
  const line = '─'.repeat(width)

  console.log()
  console.log(chalk.bold('┌' + line + '┐'))
  console.log(chalk.bold('│') + chalk.bold.cyan('  W3C Validation Summary').padEnd(width + 1) + chalk.bold('│'))
  console.log(chalk.bold('├' + line + '┤'))

  const row = (label: string, value: string | number, colorFn = chalk.white) => {
    const labelStr = `  ${label}`
    const valueStr = String(value)
    const padding = width - labelStr.length - valueStr.length
    console.log(chalk.bold('│') + labelStr + colorFn(valueStr).padStart(valueStr.length + padding) + chalk.bold('│'))
  }

  row('Total pages:', summary.totalPages)
  row('Clean pages:', summary.pagesClean, chalk.green)
  row('Pages with warnings:', summary.pagesWithWarnings, summary.pagesWithWarnings > 0 ? chalk.yellow : chalk.green)
  row('Pages with errors:', summary.pagesWithErrors, summary.pagesWithErrors > 0 ? chalk.red : chalk.green)
  if (summary.pagesFailed > 0) {
    row('Failed pages:', summary.pagesFailed, chalk.red)
  }

  console.log(chalk.bold('├' + line + '┤'))
  row('Total errors:', summary.totalErrors, summary.totalErrors > 0 ? chalk.red : chalk.green)
  row('Total warnings:', summary.totalWarnings, summary.totalWarnings > 0 ? chalk.yellow : chalk.green)
  row('Total infos:', summary.totalInfos, chalk.blue)

  if (outputFile) {
    console.log(chalk.bold('├' + line + '┤'))
    const fileLabel = '  Report saved to:'
    const fileValue = ` ${outputFile}`
    const padding = width - fileLabel.length - fileValue.length
    console.log(chalk.bold('│') + fileLabel + chalk.cyan(fileValue) + ' '.repeat(Math.max(0, padding)) + chalk.bold('│'))
  }

  console.log(chalk.bold('└' + line + '┘'))
  console.log()
}

export function spinnerFetchText(url: string): string {
  const short = url.length > 60 ? '...' + url.slice(-57) : url
  return `Fetching ${chalk.cyan(short)}`
}

export function spinnerValidateText(url: string): string {
  const short = url.length > 60 ? '...' + url.slice(-57) : url
  return `Validating ${chalk.cyan(short)}`
}

export function spinnerDoneText(result: PageResult): string {
  const short = result.url.length > 60 ? '...' + result.url.slice(-57) : result.url
  const duration = result.duration !== undefined ? chalk.gray(` (${formatDuration(result.duration)})`) : ''

  if (result.status === 'failed') {
    return `${chalk.red(short)} — ${chalk.red('failed')}${duration}`
  }

  const errors = result.messages.filter((m) => m.type === 'error').length
  const warnings = result.messages.filter((m) => m.type === 'warning').length

  if (errors > 0) {
    return `${chalk.red(short)} — ${chalk.red(`${errors} error${errors !== 1 ? 's' : ''}`)}${warnings > 0 ? chalk.yellow(`, ${warnings} warning${warnings !== 1 ? 's' : ''}`) : ''}${duration}`
  }

  if (warnings > 0) {
    return `${chalk.yellow(short)} — ${chalk.yellow(`${warnings} warning${warnings !== 1 ? 's' : ''}`)}${duration}`
  }

  return `${chalk.green(short)}${duration}`
}
