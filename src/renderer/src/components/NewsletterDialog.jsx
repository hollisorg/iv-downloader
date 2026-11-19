// The IV Newsletter box in a dialog, for IV apps without a settings page (source of truth: IVAI
// docs/newsletter/apps/NewsletterDialog.jsx). Open it from a small "Newsletter" link; Escape or Close shuts it.
import { useEffect, useRef } from 'react'
import NewsletterBox from './NewsletterBox'

export default function NewsletterDialog({ api, open, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="ivnl-dialog" aria-label="The IV Newsletter" onClose={onClose}>
      {open && <NewsletterBox api={api} />}
      <div className="ivnl-card-actions">
        <button type="button" className="ivnl-secondary" onClick={onClose}>Close</button>
      </div>
    </dialog>
  )
}
