import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT_PX = 768

function computeIsMobile() {
  return window.innerWidth < MOBILE_BREAKPOINT_PX
}

// 'ontouchstart' in window reflects the device's hardware and never changes
// while the page is open, unlike viewport width - so only isMobile needs a
// resize listener; isTouch is computed once and left alone.
const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window

export function useDevice() {
  const [isMobile, setIsMobile] = useState(computeIsMobile)

  useEffect(() => {
    const onResize = () => setIsMobile(computeIsMobile())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return { isMobile, isTouch: isTouchDevice }
}
