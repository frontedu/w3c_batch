import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'

const MAX_DEPTH = 3

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => name === 'url' || name === 'sitemap',
})

export async function extractUrlsFromSitemap(
  sitemapUrl: string,
  depth = 0
): Promise<string[]> {
  if (depth > MAX_DEPTH) {
    console.warn(`Max sitemap depth (${MAX_DEPTH}) reached, skipping: ${sitemapUrl}`)
    return []
  }

  let xmlText: string
  try {
    const response = await axios.get<string>(sitemapUrl, {
      responseType: 'text',
      headers: { 'User-Agent': 'w3c_batch/1.0 (automated validator)' },
      timeout: 30000,
    })
    xmlText = response.data
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to fetch sitemap at ${sitemapUrl}: ${message}`)
  }

  const parsed = parser.parse(xmlText) as Record<string, unknown>

  if (parsed.sitemapindex) {
    const index = parsed.sitemapindex as Record<string, unknown>
    const sitemaps = (index.sitemap ?? []) as Array<Record<string, string>>
    const urls: string[] = []
    for (const entry of sitemaps) {
      if (entry.loc) {
        const nested = await extractUrlsFromSitemap(entry.loc, depth + 1)
        urls.push(...nested)
      }
    }
    return urls
  }

  if (parsed.urlset) {
    const urlset = parsed.urlset as Record<string, unknown>
    const urlEntries = (urlset.url ?? []) as Array<Record<string, string>>
    return urlEntries
      .map((entry) => entry.loc)
      .filter((loc): loc is string => typeof loc === 'string' && loc.length > 0)
  }

  throw new Error(`Unrecognized sitemap format at ${sitemapUrl}`)
}

export type ParseResult =
  | { kind: 'urls'; urls: string[] }
  | { kind: 'sitemapindex'; sitemapUrls: string[] }

export function parseUrlsFromXml(xmlText: string): ParseResult {
  const parsed = parser.parse(xmlText) as Record<string, unknown>

  if (parsed.urlset) {
    const urlset = parsed.urlset as Record<string, unknown>
    const urlEntries = (urlset.url ?? []) as Array<Record<string, string>>
    const urls = urlEntries
      .map((entry) => entry.loc)
      .filter((loc): loc is string => typeof loc === 'string' && loc.length > 0)
    return { kind: 'urls', urls }
  }

  if (parsed.sitemapindex) {
    const index = parsed.sitemapindex as Record<string, unknown>
    const sitemaps = (index.sitemap ?? []) as Array<Record<string, string>>
    const sitemapUrls = sitemaps
      .map((entry) => entry.loc)
      .filter((loc): loc is string => typeof loc === 'string' && loc.length > 0)
    return { kind: 'sitemapindex', sitemapUrls }
  }

  throw new Error('Unrecognized XML format. Expected a sitemap <urlset> with <url> entries.')
}
