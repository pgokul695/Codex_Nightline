import EventList from './components/EventList'
import Uploader from './components/Uploader'
import useEventExtractor from './hooks/useEventExtractor'
import './App.css'

function App() {
  const {
    extractedEvents,
    setExtractedEvents,
    extractFromFile,
    isProcessing,
    error,
  } = useEventExtractor()

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
    </main>
  )
}

export default App
