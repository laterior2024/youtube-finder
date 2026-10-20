import type { ReactNode } from 'react';

/** Native disclosure keeps edits mounted when closed and supports keyboard activation. */
export default function Disclosure({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <details className={`editor-disclosure ${className}`}>
    <summary><span>{title}</span><span className="disclosure-hint" aria-hidden="true" /></summary>
    <div className="disclosure-content">{children}
      <button type="button" className="secondary-action mt-3 w-full" onClick={event => { const details = event.currentTarget.closest('details'); if (details) details.open = false; }}>접기 ↑</button>
    </div>
  </details>;
}
