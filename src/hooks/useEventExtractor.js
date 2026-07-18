import { useCallback, useState } from 'react'
import * as chrono from 'chrono-node'
import {
  GlobalWorkerOptions,
  getDocument,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import { env, pipeline } from '@xenova/transformers'

// Keep PDF.js self-contained in the Vite bundle instead of looking for a worker
// at a CDN URL.
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).toString()

// The model is intentionally local-only. If it is not already available in the
// app's local model cache, QA simply falls back to the default event title.
env.allowLocalModels = true
env.allowRemoteModels = false

const MONTHS = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const DAY = '(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?'
const QA_PREFIX_LENGTH = 6000

const DATE_PATTERNS = [
  /\b\d{4}\s*-\s*(?:0?[1-9]|1[0-2])\s*-\s*(?:0?[1-9]|[12]\d|3[01])\b/g,
  /\b(?:0?[1-9]|[12]\d|3[01])\s*[\/-]\s*(?:0?[1-9]|1[0-2])\s*[\/-]\s*\d{4}\b/g,
  new RegExp(`\\b${DAY}\\s+${MONTHS}\\.?\\s+\\d{4}\\b`, 'gi'),
  new RegExp(`\\b${MONTHS}\\.?\\s+${DAY}(?:,)?\\s+\\d{4}\\b`, 'gi'),
]

let questionAnswererPromise

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `event-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizedAnswer(answer) {
  if (!answer || typeof answer.answer !== 'string') return undefined
  const value = answer.answer.trim()
  return value || undefined
}

async function getQuestionAnswerer() {
  if (!questionAnswererPromise) {
    questionAnswererPromise = pipeline('question-answering', 'Xenova/tinyroberta-squad2', {
      dtype: 'q8',
      // Xenova v2 names its q8 option `quantized`; retaining both keeps the
      // intended q8 setting explicit and compatible with its current API.
      quantized: true,
      local_files_only: true,
    }).catch((error) => {
      // A rejected cached promise would otherwise permanently prevent a retry.
      questionAnswererPromise = undefined
      throw error
    })
  }

  return questionAnswererPromise
}

async function extractTextBlocks(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data: bytes }).promise
  const blocks = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()

    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string' && item.str.trim()) {
        blocks.push(item.str.trim())
      }
    }
  }

  return blocks
}

function dateRole(precedingText, blockIndex) {
  const label = precedingText.slice(-140)

  if (/\bstart\s*date\s*:?\s*$/i.test(label)) return 'start'
  if (/\bend\s*date\s*:?\s*$/i.test(label)) return 'end'
  if (/\b(?:event\s*date|scheduled|held\s+on|from)\s*:?\s*$/i.test(label)) return 'start'
  if (/\bto\s*:?\s*$/i.test(label)) return 'end'
  if (/\bon\s*:?\s*$/i.test(label)) return 'start'
  if (blockIndex < 12 && /\bdate\s*:\s*$/i.test(label)) return 'metadata'

  return undefined
}

function candidateScore(role) {
  if (role === 'start') return 100
  if (role === 'end') return 95
  if (role === 'metadata') return -100
  return 0
}

function normalizeDate(rawDate) {
  return rawDate.replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1')
}

function parseExtractedDate(rawDate) {
  if (!rawDate) return undefined
  const parsedDate = chrono.parseDate(normalizeDate(rawDate))
  return parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())
    ? parsedDate
    : undefined
}

function dateWindows(blocks) {
  const candidates = []

  blocks.forEach((block, index) => {
    for (const pattern of DATE_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(block)) !== null) {
        const precedingText = `${blocks
          .slice(Math.max(0, index - 6), index)
          .join(' ')} ${block.slice(Math.max(0, match.index - 140), match.index)}`
        const role = dateRole(precedingText, index)

        candidates.push({
          rawDate: match[0],
          role,
          score: candidateScore(role),
          blockIndex: index,
          contextChunk: blocks
            .slice(Math.max(0, index - 2), Math.min(blocks.length, index + 3))
            .join(' '),
        })
      }
    }
  })

  const windows = candidates.filter(
    (window, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.rawDate === window.rawDate &&
          candidate.contextChunk === window.contextChunk,
      ) === index,
  )

  const labeled = windows.filter((window) => window.role === 'start' || window.role === 'end')
  if (!labeled.length) return windows

  const byPriority = [...labeled].sort(
    (left, right) => right.score - left.score || left.blockIndex - right.blockIndex,
  )
  const start = byPriority.find((window) => window.role === 'start') || byPriority[0]
  const end = byPriority.find(
    (window) => window.role === 'end' && window.blockIndex >= start.blockIndex,
  )

  // Start/End labels describe one event, while incidental header dates are
  // ignored. Unlabelled documents keep the original all-match behavior above.
  return [{ ...start, rawEndDate: end?.rawDate }]
}

function buildQaContext(fullText, dateContext) {
  // Titles and subjects tend to appear near the beginning of a document,
  // while locations are often near the selected schedule dates. Keep both
  // sources independent from the small regex window used for date selection.
  const documentPrefix = fullText.slice(0, QA_PREFIX_LENGTH)
  if (!dateContext || documentPrefix.includes(dateContext)) return documentPrefix

  return `${documentPrefix}\n\nSchedule details:\n${dateContext}`
}

async function identifyEvent(contextChunk) {
  try {
    const qa = await getQuestionAnswerer()
    const [titleResult, locationResult] = await Promise.all([
      qa('What is the name of the event?', contextChunk),
      qa('Where is the location?', contextChunk),
    ])

    return {
      title: normalizedAnswer(titleResult) || 'Notification Event',
      location: normalizedAnswer(locationResult),
    }
  } catch {
    return { title: 'Notification Event', location: undefined }
  }
}

/**
 * Extracts calendar-shaped event data without allowing model or parsing
 * failures to escape into the consuming UI.
 */
export function useEventExtractor() {
  const [extractedEvents, setExtractedEvents] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)

  const extractFromFile = useCallback(async (file) => {
    setIsProcessing(true)
    setError(null)

    try {
      if (!file || typeof file.arrayBuffer !== 'function') {
        throw new Error('A PDF file is required.')
      }

      const blocks = await extractTextBlocks(file)
      const fullText = blocks.join(' ').trim()
      const windows = dateWindows(blocks)
      const chunks = windows.length
        ? windows
        : [{ rawDate: undefined, contextChunk: fullText }]

      const events = await Promise.all(
        chunks.map(async ({ rawDate, rawEndDate, contextChunk }) => {
          const details = await identifyEvent(buildQaContext(fullText, contextChunk))
          const parsedDate = parseExtractedDate(rawDate)
          const parsedEndDate = parseExtractedDate(rawEndDate)

          // Keep the full-text QA fallback above, but never turn a document
          // without a confirmed date into a plausible-looking calendar event.
          if (!parsedDate) return null

          return {
            id: makeId(),
            title: details.title,
            location: details.location,
            start: parsedDate,
            end: parsedEndDate,
          }
        }),
      )

      const datedEvents = events.filter(Boolean)
      setExtractedEvents(datedEvents)
      return datedEvents
    } catch (caughtError) {
      // PDF.js only reaches here for invalid input or an unreadable PDF. Model,
      // regex, and empty-text failures have all already been absorbed above.
      setExtractedEvents([])
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to read this PDF file.',
      )
      return []
    } finally {
      setIsProcessing(false)
    }
  }, [])

  return {
    extractedEvents,
    setExtractedEvents,
    extractFromFile,
    isProcessing,
    error,
  }
}

export default useEventExtractor
