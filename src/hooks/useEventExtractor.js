import { useCallback, useState } from 'react'
import * as chrono from 'chrono-node'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { env, pipeline } from '@xenova/transformers'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
env.allowLocalModels = true
env.allowRemoteModels = false
env.localModelPath = '/models/'
env.backends.onnx.wasm.wasmPaths = '/ort/'

const MODEL_ID = 'Xenova/LaMini-Flan-T5-248M'
const DOCUMENT_LIMIT = 9000
const MONTHS = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const DAY = '(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?'
const DATE_PATTERNS = [
  /\b\d{4}\s*-\s*(?:0?[1-9]|1[0-2])\s*-\s*(?:0?[1-9]|[12]\d|3[01])\b/g,
  /\b(?:0?[1-9]|[12]\d|3[01])\s*[\/-]\s*(?:0?[1-9]|1[0-2])\s*[\/-]\s*\d{4}\b/g,
  new RegExp(`\\b${DAY}\\s+${MONTHS}\\.?\\s+\\d{4}\\b`, 'gi'),
  new RegExp(`\\b${MONTHS}\\.?\\s+${DAY}(?:,)?\\s+\\d{4}\\b`, 'gi'),
]
let generatorPromise

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
function isToday(date) { return dateKey(date) === dateKey(new Date()) }
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
async function getGenerator() {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      const modelRoot = `${env.localModelPath}${MODEL_ID}`
      try {
        const response = await fetch(`${modelRoot}/config.json`)
        const body = await response.text()
        const isJson = response.headers.get('content-type')?.includes('application/json')
        if (!response.ok || !isJson) throw new Error(`received ${response.status} ${response.statusText}`)
        JSON.parse(body)
        return await pipeline('text2text-generation', MODEL_ID, {
          dtype: 'q8',
          quantized: true,
          local_files_only: true,
        })
      } catch (error) {
        generatorPromise = undefined
        throw new Error(
          `Model assets not found at ${modelRoot}. Run \"npm run prepare-model\" before building the app. ${error instanceof Error ? error.message : ''}`,
        )
      }
    })()
  }
  return generatorPromise
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
function promptFor(text, strict = false) {
  return `Read this document and return ${strict ? 'ONLY valid JSON' : 'a JSON array'} of calendar-relevant events.

Rules: synthesize a meaningful title from subject/context; group related start/end dates into one event; for multiple fee-tier deadlines for one action, return one event using the earliest actionable deadline; never invent dates; use null when unknown; return [] when there is no event.

Schema: [{"title":"string","location":"string or null","start":"ISO date or null","end":"ISO date or null","confidence":"high or low"}]

Document:
${text.slice(0, DOCUMENT_LIMIT)}`
}
function parseJson(text) {
  const cleaned = String(text || '').replace(/\`\`\`(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end < start) return undefined
  try { return JSON.parse(cleaned.slice(start, end + 1)) } catch { return undefined }
}
async function generateEvents(text) {
  const generator = await getGenerator()
  for (const strict of [false, true]) {
    const output = await generator(promptFor(text, strict), { max_new_tokens: 512, do_sample: false })
    const parsed = parseJson(output?.[0]?.generated_text)
    if (parsed) return parsed
  }
  return []
}
function validateEvents(modelEvents, documentText) {
  if (!Array.isArray(modelEvents)) return []
  const supportedDates = sourceDateKeys(documentText)
  return modelEvents.flatMap((event) => {
    if (!event || typeof event !== 'object') return []
    const start = parseDate(event.start)
    const end = parseDate(event.end)
    if (!start || isToday(start) || !supportedDates.has(dateKey(start))) return []
    const validEnd = end && !isToday(end) && supportedDates.has(dateKey(end)) ? end : undefined
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
