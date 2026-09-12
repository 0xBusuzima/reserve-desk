import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * A last line of defence so a thrown render never leaves a black screen.
 *
 * This exists because of a real report: someone ran the page through a browser
 * translator to play it in Chinese and it went dark after a few clicks. The
 * underlying cause is fixed separately, by keeping dynamic text inside
 * elements that React owns, but a blank page is a bad failure mode whatever
 * causes it, so there is now something here to catch it and say what to do.
 */
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class Boundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep it in the console so a bug report can carry something useful.
    console.error('Reserve Desk crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const translated =
      typeof document !== 'undefined' && document.documentElement.classList.contains('translated-ltr')

    return (
      <div className="boundary">
        <div className="boundary-card">
          <div className="start-eyebrow">SOMETHING BROKE</div>
          <h3 className="start-title">That should not have happened</h3>
          <p className="start-sub">
            {translated
              ? 'Browser translation rewrites the page while it is running, which can knock the simulation over. Turning translation off and reloading should get you back in.'
              : 'The page hit an error and stopped rendering rather than showing you something wrong. Reloading usually clears it.'}
          </p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="start-btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
          <p className="foot-note" style={{ marginTop: 14 }}>
            If it keeps happening I would genuinely like to know:{' '}
            <a
              href="https://github.com/0xBusuzima/reserve-desk/issues/new"
              target="_blank"
              rel="noreferrer"
            >
              open an issue
            </a>
            . The error is in your browser console.
          </p>
          <pre className="boundary-detail">{String(error.message || error)}</pre>
        </div>
      </div>
    )
  }
}
