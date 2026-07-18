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

const DATE_PATTERNS = [
  /\b(?:0?[1-9]|[12]\d|3[01])\s*[\/-]\s*(?:0?[1-9]|1[0-2])\s*[\/-]\s*\d{2,4}\b/g,
  /\b(?:0?[1-9]|1[0-2])\s*[\/-]\s*(?:0?[1-9]|[12]\d|3[01])\s*[\/-]\s*\d{2,4}\b/g,
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:0?[1-9]|[12]\d|3[01])(?:,\s*\d{4})?\b/gi,
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

function dateWindows(blocks) {
  const windows = []

  blocks.forEach((block, index) => {
    for (const pattern of DATE_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(block)) !== null) {
        windows.push({
          rawDate: match[0],
          contextChunk: blocks
            .slice(Math.max(0, index - 2), Math.min(blocks.length, index + 3))
            .join(' '),
        })
      }
    }
  })

  // The same numeric date can match both DD/MM and MM/DD patterns. Processing
  // it once preserves the useful context without emitting duplicate events.
  return windows.filter(
    (window, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.rawDate === window.rawDate &&
          candidate.contextChunk === window.contextChunk,
      ) === index,
  )
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
        chunks.map(async ({ rawDate, contextChunk }) => {
          const details = await identifyEvent(contextChunk)
          const parsedDate = rawDate ? chrono.parseDate(rawDate) : undefined

          return {
            id: makeId(),
            title: details.title,
            location: details.location,
            // A text-only/no-date PDF still gets a usable event. The current
            // time is deliberately a fallback, not an inferred event duration.
            start: parsedDate || new Date(),
            end: undefined,
          }
        }),
      )

      setExtractedEvents(events)
      return events
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
