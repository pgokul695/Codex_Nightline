import { useCallback, useState } from 'react'
import * as chrono from 'chrono-node'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()

const EXTRACTION_API_URL = (import.meta.env.VITE_EXTRACTION_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const MONTHS = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const DAY = '(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?'
const DATE_PATTERNS = [
  /\b\d{4}\s*-\s*(?:0?[1-9]|1[0-2])\s*-\s*(?:0?[1-9]|[12]\d|3[01])\b/g,
  /\b(?:0?[1-9]|[12]\d|3[01])\s*[\/-]\s*(?:0?[1-9]|1[0-2])\s*[\/-]\s*\d{4}\b/g,
  new RegExp(`\\b${DAY}\\s+${MONTHS}\\.?\\s+\\d{4}\\b`, 'gi'),
  new RegExp(`\\b${MONTHS}\\.?\\s+${DAY}(?:,)?\\s+\\d{4}\\b`, 'gi'),
]
function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `event-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
function normalizeDate(value) { return String(value).replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1') }
function parseDate(value) {
  if (!value || typeof value !== 'string') return undefined
  const date = chrono.parseDate(normalizeDate(value))
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : undefined
}
function dateKey(date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` }
function sourceDateKeys(text) {
  const keys = new Set()
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      const date = parseDate(match[0])
      if (date) keys.add(dateKey(date))
    }
  }
  return keys
}
async function extractText(file) {
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const blocks = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const content = await (await pdf.getPage(pageNumber)).getTextContent()
    for (const item of content.items) if ('str' in item && item.str.trim()) blocks.push(item.str.trim())
  }
  return blocks.join('\n').trim()
}
async function generateEvents(text) {
  const response = await fetch(`${EXTRACTION_API_URL}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Extraction backend error: ${response.status}${details ? ` — ${details.slice(0, 300)}` : ''}`)
  }
  if (!contentType.includes('application/json')) {
    throw new Error('Extraction backend returned a non-JSON response. Check VITE_EXTRACTION_API_URL.')
  }
  const events = await response.json()
  if (!Array.isArray(events)) throw new Error('Extraction backend returned an invalid event list.')
  return events
}
function validateEvents(modelEvents, documentText) {
  if (!Array.isArray(modelEvents)) return []
  const supportedDates = sourceDateKeys(documentText)
  return modelEvents.flatMap((event) => {
    if (!event || typeof event !== 'object') return []
    const start = parseDate(event.start_date)
    const end = parseDate(event.end_date)
    // Dates must parse and occur in the source; this prevents invented dates
    // (including an implicit current-date fallback) from reaching the UI.
    if (!start || !supportedDates.has(dateKey(start))) return []
    const validEnd = end && supportedDates.has(dateKey(end)) ? end : undefined
    return [{
      id: makeId(),
      title: typeof event.title === 'string' && event.title.trim() ? event.title.trim() : 'Notification Event',
      location: typeof event.location === 'string' && event.location.trim() ? event.location.trim() : undefined,
      start,
      end: validEnd,
    }]
  })
}

export function useEventExtractor() {
  const [extractedEvents, setExtractedEvents] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const extractFromFile = useCallback(async (file) => {
    setIsProcessing(true)
    setError(null)
    try {
      if (!file || typeof file.arrayBuffer !== 'function') throw new Error('A PDF file is required.')
      const text = await extractText(file)
      const events = validateEvents(await generateEvents(text), text)
      setExtractedEvents(events)
      return events
    } catch (caughtError) {
      setExtractedEvents([])
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to read this PDF file.')
      return []
    } finally {
      setIsProcessing(false)
    }
  }, [])
  return { extractedEvents, setExtractedEvents, extractFromFile, isProcessing, error }
}
export default useEventExtractor
