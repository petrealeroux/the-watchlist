export default async function handler(req, res) {
  const token = process.env.TMDB_ACCESS_TOKEN
  if (!token) return res.status(503).json({ error: 'TMDb is not configured yet. Add TMDB_ACCESS_TOKEN in Vercel environment variables.' })
  const { type = 'search', query = '', id = '', media = 'movie' } = req.query
  let path = ''
  if (type === 'search') {
    if (!query.trim()) return res.status(400).json({ error: 'Please enter a title.' })
    path = `/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`
  } else if (type === 'providers' && id && ['movie', 'tv'].includes(media)) {
    path = `/${media}/${encodeURIComponent(id)}/watch/providers`
  } else {
    return res.status(400).json({ error: 'Unsupported request.' })
  }
  try {
    const upstream = await fetch(`https://api.themoviedb.org/3${path}`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }
    })
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch {
    return res.status(502).json({ error: 'Could not reach TMDb.' })
  }
}
