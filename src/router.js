import { useCallback, useEffect, useState } from 'react'

// Routeur minimal maison plutôt qu'une dépendance comme react-router : l'app
// n'a que 4 routes plates (/, /eleve/:id, /revisions, /comptes), pas besoin
// d'un routeur complet. Le serveur Express sert déjà index.html pour toute
// route non-API, et Vite fait pareil en dev, donc l'API History native suffit.
export function useRoute() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to) => {
    if (to !== window.location.pathname) {
      window.history.pushState(null, '', to)
    }
    setPath(to)
  }, [])

  return { path, navigate }
}

export function studentIdFromPath(path) {
  const match = path.match(/^\/eleve\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

export function studentPath(id) {
  return `/eleve/${encodeURIComponent(id)}`
}
