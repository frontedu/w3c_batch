export function resolveUrlToBase(locUrl: string, baseUrl: string): string {
  const loc = new URL(locUrl)
  const base = new URL(baseUrl)
  loc.protocol = base.protocol
  loc.hostname = base.hostname
  loc.port = base.port
  return loc.toString()
}

export function getOrigin(url: string): string {
  return new URL(url).origin
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function isLocalhost(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1')
  }
}
