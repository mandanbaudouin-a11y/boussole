import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel']
const THROTTLE_MS = 1000

export function useIdleTimer(timeoutMs, onIdle, enabled) {
  const timerRef = useRef(null)
  const lastResetRef = useRef(0)
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!enabled) return undefined

    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onIdleRef.current(), timeoutMs)
    }

    const onActivity = () => {
      const now = Date.now()
      if (now - lastResetRef.current < THROTTLE_MS) return
      lastResetRef.current = now
      arm()
    }

    arm()
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity))
    }
  }, [enabled, timeoutMs])
}
