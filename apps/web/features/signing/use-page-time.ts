"use client"

import { useRef, useEffect, useCallback } from "react"

export interface PageTime {
  page: number
  seconds: number
}

/**
 * Tracks how many seconds each PDF page is visible in the viewport.
 * Uses IntersectionObserver — observes elements with id="pdf-page-{n}".
 *
 * Call startTracking() once the PDF is rendered, stopTracking() on cleanup.
 * getPageTimes() returns the current accumulated totals.
 */
export function usePageTimeTracker(pageCount: number) {
  const enterTimes = useRef<Map<number, number>>(new Map())   // pageNum → enterTimestamp
  const accumulated = useRef<Map<number, number>>(new Map())  // pageNum → total ms
  const observer = useRef<IntersectionObserver | null>(null)

  const flush = useCallback((pageNum: number) => {
    const enter = enterTimes.current.get(pageNum)
    if (enter !== undefined) {
      const elapsed = Date.now() - enter
      accumulated.current.set(pageNum, (accumulated.current.get(pageNum) ?? 0) + elapsed)
      enterTimes.current.delete(pageNum)
    }
  }, [])

  const startTracking = useCallback(() => {
    if (observer.current) return

    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const match = entry.target.id.match(/^pdf-page-(\d+)$/)
          if (!match) return
          const pageNum = parseInt(match[1], 10)

          if (entry.isIntersecting) {
            enterTimes.current.set(pageNum, Date.now())
          } else {
            flush(pageNum)
          }
        })
      },
      { threshold: 0.1 },
    )

    for (let i = 1; i <= pageCount; i++) {
      const el = document.getElementById(`pdf-page-${i}`)
      if (el) observer.current.observe(el)
    }
  }, [pageCount, flush])

  const stopTracking = useCallback(() => {
    // Flush any pages still visible
    enterTimes.current.forEach((_, pageNum) => flush(pageNum))
    observer.current?.disconnect()
    observer.current = null
  }, [flush])

  const getPageTimes = useCallback((): PageTime[] => {
    // Flush any currently-visible pages before returning
    enterTimes.current.forEach((_, pageNum) => flush(pageNum))
    const result: PageTime[] = []
    accumulated.current.forEach((ms, page) => {
      if (ms > 0) result.push({ page, seconds: Math.round(ms / 1000) })
    })
    return result.sort((a, b) => a.page - b.page)
  }, [flush])

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => stopTracking()
  }, [stopTracking])

  return { startTracking, stopTracking, getPageTimes }
}
