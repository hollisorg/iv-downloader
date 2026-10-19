import { useMemo } from 'react'

// "Variance field": wobbly concentric rings around a dark core. Generated, not an image,
// so it stays crisp at any size. Purely decorative.
const RINGS = 26

function ringPath(r, seed) {
  const pts = []
  const steps = 160
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const wobble =
      Math.sin(a * 5 + seed) * 0.05 +
      Math.sin(a * 9 - seed * 1.7) * 0.025 +
      Math.sin(a * 3 + seed * 0.5) * 0.04
    const rr = r * (1 + wobble * (0.4 + r / 420))
    pts.push(`${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`)
  }
  return `M${pts.join('L')}Z`
}

export default function Field() {
  const rings = useMemo(
    () =>
      Array.from({ length: RINGS }, (_, i) => {
        const r = 46 + i * 15
        return { d: ringPath(r, i * 0.61), i }
      }),
    []
  )

  return (
    <div className="field" aria-hidden>
      <svg viewBox="-460 -460 920 920">
        <defs>
          <radialGradient id="core" r="0.5">
            <stop offset="0" stopColor="#100c0e" />
            <stop offset="0.55" stopColor="#2a0f16" />
            <stop offset="1" stopColor="#f44859" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="field-rings">
          {rings.map(({ d, i }) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={i % 3 === 0 ? 'var(--red)' : 'var(--pink)'}
              strokeOpacity={Math.max(0.07, 0.62 - i * 0.022)}
              strokeWidth={i % 4 === 0 ? 2.2 : 1}
            />
          ))}
        </g>
        <circle r="70" fill="url(#core)" />
        <circle r="30" fill="#100c0e" stroke="var(--pink)" strokeOpacity="0.8" strokeWidth="1.5" />
        <circle r="9" cx="-9" cy="-9" fill="var(--paper)" fillOpacity="0.85" />
      </svg>
    </div>
  )
}
