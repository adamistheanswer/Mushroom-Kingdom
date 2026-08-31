import { useEffect, useState } from 'react'

export const MOBILE_MEDIA_QUERY = '(max-width: 640px)'

export const useIsMobile = (query: string = MOBILE_MEDIA_QUERY) => {
   const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches)

   useEffect(() => {
      const mediaQuery = window.matchMedia(query)
      const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)

      setIsMobile(mediaQuery.matches)
      mediaQuery.addEventListener('change', handleChange)

      return () => {
         mediaQuery.removeEventListener('change', handleChange)
      }
   }, [query])

   return isMobile
}
