import axios from 'axios'
import type { W3CMessage } from './types.js'

const W3C_VALIDATOR_URL = 'https://validator.w3.org/nu/?out=json'
const USER_AGENT = 'w3c_batch/1.0 (automated validator)'

interface W3CApiResponse {
  messages: Array<{
    type: string
    subType?: string
    message: string
    extract?: string
    firstLine?: number
    lastLine?: number
    firstColumn?: number
    lastColumn?: number
  }>
}

function normalizeType(type: string, subType?: string): W3CMessage['type'] {
  if (type === 'error') return 'error'
  if (type === 'info' && subType === 'warning') return 'warning'
  return 'info'
}

function mapMessages(data: W3CApiResponse): W3CMessage[] {
  return data.messages.map((msg) => ({
    type: normalizeType(msg.type, msg.subType),
    message: msg.message,
    extract: msg.extract,
    firstLine: msg.firstLine,
    lastLine: msg.lastLine,
    firstColumn: msg.firstColumn,
    lastColumn: msg.lastColumn,
    subType: msg.subType,
  }))
}

export async function fetchPageHtml(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    responseType: 'text',
    headers: { 'User-Agent': USER_AGENT },
    timeout: 30000,
  })
  return response.data
}

export async function validateHtml(html: string): Promise<W3CMessage[]> {
  const response = await axios.post<W3CApiResponse>(W3C_VALIDATOR_URL, html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'User-Agent': USER_AGENT,
    },
    timeout: 60000,
  })
  return mapMessages(response.data)
}

export async function validateUrl(url: string): Promise<W3CMessage[]> {
  const reqUrl = `${W3C_VALIDATOR_URL}&doc=${encodeURIComponent(url)}`
  const response = await axios.get<W3CApiResponse>(reqUrl, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 60000,
  })
  return mapMessages(response.data)
}
