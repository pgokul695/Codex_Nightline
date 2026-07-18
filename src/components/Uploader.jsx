import { useRef, useState } from 'react'
import { FileUp, LoaderCircle } from 'lucide-react'

export function Uploader({ extractFromFile, isProcessing, error }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const submitFile = (file) => {
    if (file && !isProcessing) extractFromFile(file)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    submitFile(event.dataTransfer.files?.[0])
  }

  return (
    <section className="uploader" aria-label="PDF event extraction">
      <input
        ref={inputRef}
        className="uploader__input"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => {
          submitFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <div
        className={`drop-zone${isDragging ? ' drop-zone--dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false)
        }}
        onDrop={handleDrop}
      >
        {isProcessing ? <LoaderCircle className="spinner" aria-hidden="true" /> : <FileUp aria-hidden="true" />}
        <div>
          <h2>{isProcessing ? 'Reading your schedule…' : 'Stage a schedule'}</h2>
          <p>
            {isProcessing
              ? 'Extracting event details locally.'
              : 'Drop a PDF here, or choose one from your device.'}
          </p>
        </div>
        <button
          type="button"
          className="browse-button"
          onClick={() => inputRef.current?.click()}
          disabled={isProcessing}
        >
          Browse PDF
        </button>
      </div>
      {error ? <p className="upload-error" role="alert">{error}</p> : null}
    </section>
  )
}

export default Uploader
