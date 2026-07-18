import { useCallback, useState } from 'react'
import * as chrono from 'chrono-node'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()

const EXTRACTION_API_URL = (import.meta.env.VITE_EXTRACTION_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const MONTHS = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const DAY = '(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?'
const DATE_PATTERNS = [
  /\b\d{4}\s*-\s*(?:0?[1-9]|1[0-2])\s*-\s*(?:0?[1-9]|[12]\d|3[01])\b/g,
  /\b(?:0?[1-9]|[12]\d|3[01])\s*[\/.\-]\s*(?:0?[1-9]|1[0-2])\s*[\/.\-]\s*\d{4}\b/g,
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
function dateKeyFromParts(year, month, day) {
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? dateKey(date)
    : undefined
}
function addNumericDateKeys(value, keys) {
  const match = String(value).match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})$/)
  if (!match) return
  const first = Number(match[1])
  const second = Number(match[2])
  const year = Number(match[3])
  // PDFs do not encode whether 12/07 is DMY or MDY. Preserve both source-backed
  // interpretations, rather than silently rejecting a valid backend ISO date.
  for (const [month, day] of [[second, first], [first, second]]) {
    const key = dateKeyFromParts(year, month, day)
    if (key) keys.add(key)
  }
}
function sourceDateKeys(text) {
  const keys = new Set()
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      const date = parseDate(match[0])
      if (date) keys.add(dateKey(date))
      addNumericDateKeys(match[0], keys)
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
  console.debug('[Schedger] Extraction response received', {
    isArray: Array.isArray(events),
    type: typeof events,
    events,
  })
  if (!Array.isArray(events)) throw new Error('Extraction backend returned an invalid event list.')
  return events
}
function warnSkippedEvent(event, reason) {
  console.warn('[Schedger] Skipped extracted event:', reason, event)
}
function normalizeExtractedEvent(rawEvent, supportedDates) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    warnSkippedEvent(rawEvent, 'expected an event object')
    return undefined
  }

  // This is the single boundary between the Gemini response schema
  // (snake_case strings) and the review UI schema (Date objects).
  const start = parseDate(rawEvent.start_date)
  const end = parseDate(rawEvent.end_date)
  if (!rawEvent.start_date) {
    warnSkippedEvent(rawEvent, 'missing required start_date')
    return undefined
  }
  if (!start) {
    warnSkippedEvent(rawEvent, `invalid start_date: ${rawEvent.start_date}`)
    return undefined
  }
  if (!supportedDates.has(dateKey(start))) {
    warnSkippedEvent(rawEvent, `start_date is not present in the PDF: ${rawEvent.start_date}`)
    return undefined
  }
  if (rawEvent.end_date && !end) {
    console.warn('[Schedger] Ignoring invalid end_date for extracted event:', rawEvent)
  }
  if (end && !supportedDates.has(dateKey(end))) {
    console.warn('[Schedger] Ignoring end_date that is not present in the PDF:', rawEvent)
  }

  return {
    id: makeId(),
    title: typeof rawEvent.title === 'string' && rawEvent.title.trim() ? rawEvent.title.trim() : 'Notification Event',
    location: typeof rawEvent.location === 'string' && rawEvent.location.trim() ? rawEvent.location.trim() : undefined,
    start,
    end: end && supportedDates.has(dateKey(end)) ? end : undefined,
    confidence: rawEvent.confidence,
  }
}
function normalizeExtractedEvents(modelEvents, documentText) {
  if (!Array.isArray(modelEvents)) {
    console.warn('[Schedger] Ignored extraction response because it was not an array:', modelEvents)
    return []
  }
  const supportedDates = sourceDateKeys(documentText)
  return modelEvents.map((event) => normalizeExtractedEvent(event, supportedDates)).filter(Boolean)
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
      const events = normalizeExtractedEvents(await generateEvents(text), text)
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
