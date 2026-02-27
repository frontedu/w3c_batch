export type MessageType = 'error' | 'warning' | 'info'

export interface W3CMessage {
  type: MessageType
  message: string
  extract?: string
  firstLine?: number
  lastLine?: number
  firstColumn?: number
  lastColumn?: number
  subType?: string
}

export type PageStatus = 'clean' | 'warnings' | 'errors' | 'failed'

export interface PageResult {
  url: string
  sourceUrl: string
  messages: W3CMessage[]
  status: PageStatus
  errorMessage?: string
  duration?: number
}

export interface ReportSummary {
  totalPages: number
  pagesWithErrors: number
  pagesWithWarnings: number
  pagesClean: number
  pagesFailed: number
  totalErrors: number
  totalWarnings: number
  totalInfos: number
  generatedAt: string
  sitemapUrl: string
}

export interface Report {
  summary: ReportSummary
  pages: PageResult[]
}
