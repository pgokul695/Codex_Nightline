import { useState } from 'react'
import EventList from './components/EventList'
import Uploader from './components/Uploader'
import useEventExtractor from './hooks/useEventExtractor'
import { exportEvents } from './utils/exportLogic'
import './App.css'

function App() {
  const {
    extractedEvents,
    setExtractedEvents,
    extractFromFile,
    isProcessing,
    error,
  } = useEventExtractor()
  const [exportMessage, setExportMessage] = useState('')

  const handleExport = async () => {
    setExportMessage('')
    try {
      const result = await exportEvents(extractedEvents)
      setExportMessage(`Exported ${result.count} event${result.count === 1 ? '' : 's'}.`)
    } catch (exportError) {
      setExportMessage(
        exportError instanceof Error ? exportError.message : 'Unable to export events.',
      )
    }
  }

  return (
    <main className="schedge">
      <header className="schedge__header">
        <p className="eyebrow">Schedge</p>
        <h1>Check it before it reaches your calendar.</h1>
        <p className="schedge__lede">
          Extract events from a schedule PDF, then edit every detail before export.
        </p>
      </header>
      <Uploader
        extractFromFile={extractFromFile}
        isProcessing={isProcessing}
        error={error}
      />
      <EventList
        extractedEvents={extractedEvents}
        setExtractedEvents={setExtractedEvents}
      />
      {extractedEvents.length ? (
        <section className="export-bar" aria-label="Calendar export">
          <button type="button" className="export-button" onClick={handleExport}>
            Export All
          </button>
          {exportMessage ? <p role="status">{exportMessage}</p> : null}
        </section>
      ) : null}
    </main>
  )
}

export default App
