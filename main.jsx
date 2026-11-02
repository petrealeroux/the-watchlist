import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import { Search, Plus, Film, Tv, Star, LogOut, X, SlidersHorizontal, Clapperboard, Bookmark, Sparkles, Check, LoaderCircle } from 'lucide-react'
import './style.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const genresList = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','History','Horror','Music','Mystery','Romance','Science Fiction','Thriller','War','Western']
const platformsList = ['Netflix','Disney+','Prime Video','Max','Apple TV+','SkyShowtime','Streamz','VRT MAX','GoPlay','YouTube','Other']
const poster = p => p ? `https://image.tmdb.org/t/p/w500${p}` : ''
const yearOf = d => d ? String(d).slice(0,4) : ''
const normalise = item => ({
  tmdb_id: item.id,
  media_type: item.media_type === 'tv' ? 'series' : 'movie',
  title: item.title || item.name || 'Untitled',
  release_year: Number(yearOf(item.release_date || item.first_air_date)) || null,
  overview: item.overview || '',
  poster_path: item.poster_path || null,
  genres: (item.genre_ids || []).map(id => TMDB_GENRES[id]).filter(Boolean),
  platforms: [],
  status: 'to_watch',
  rating: null,
  source: 'tmdb'
})
const TMDB_GENRES = {28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Science Fiction',53:'Thriller',10752:'War',37:'Western',10759:'Action',10762:'Family',10763:'Documentary',10764:'Reality',10765:'Science Fiction',10766:'Drama',10767:'Talk',10768:'War'}

function App() {
  const [session,setSession] = useState(null)
  const [authMode,setAuthMode] = useState('login')
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [authMessage,setAuthMessage] = useState('')
  const [items,setItems] = useState([])
  const [loading,setLoading] = useState(true)
  const [query,setQuery] = useState('')
  const [results,setResults] = useState([])
  const [searching,setSearching] = useState(false)
  const [searchError,setSearchError] = useState('')
  const [showAdd,setShowAdd] = useState(false)
  const [manual,setManual] = useState(false)
  const [draft,setDraft] = useState(null)
  const [filter,setFilter] = useState('all')
  const [typeFilter,setTypeFilter] = useState('all')
  const [genreFilter,setGenreFilter] = useState('all')
  const [platformFilter,setPlatformFilter] = useState('all')
  const [sort,setSort] = useState('recent')
  const [saving,setSaving] = useState(false)
  const [notice,setNotice] = useState('')
  const [activeTab,setActiveTab] = useState('library')

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({data}) => setSession(data.session))
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) loadItems(); else setItems([]) }, [session])

  async function loadItems() {
    setLoading(true)
    const {data,error} = await supabase.from('watchlist_items').select('*').order('created_at',{ascending:false})
    if (error) setNotice(error.message)
    else setItems(data || [])
    setLoading(false)
  }

  async function authenticate(e) {
    e.preventDefault(); setAuthMessage('')
    if (!supabase) return setAuthMessage('App setup is incomplete. Add your Supabase settings in Vercel.')
    const fn = authMode === 'login' ? supabase.auth.signInWithPassword({email,password}) : supabase.auth.signUp({email,password})
    const {error} = await fn
    setAuthMessage(error ? error.message : authMode === 'login' ? 'Signed in.' : 'Account created. Check your email if confirmation is required.')
  }

  async function searchTitles(e) {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true); setSearchError(''); setResults([])
    try {
      const r = await fetch(`/api/tmdb?type=search&query=${encodeURIComponent(query)}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Search failed.')
      setResults((data.results || []).filter(x => ['movie','tv'].includes(x.media_type)).slice(0,12))
      if (!(data.results || []).length) setSearchError('No matches found. Try another title or add it manually.')
    } catch(err) { setSearchError(err.message) }
    setSearching(false)
  }

  function startAdd(item=null) {
    setManual(!item)
    setDraft(item ? normalise(item) : {title:'',media_type:'movie',release_year:'',overview:'',poster_path:'',genres:[],platforms:[],status:'to_watch',rating:null,source:'manual'})
    setShowAdd(true)
  }

  async function saveDraft(e) {
    e.preventDefault()
    if (!draft?.title?.trim()) return
    setSaving(true)
    const payload = {...draft, title:draft.title.trim(), release_year:Number(draft.release_year)||null, user_id:session.user.id}
    const {data,error} = await supabase.from('watchlist_items').insert(payload).select().single()
    if (error) setNotice(error.message)
    else { setItems(prev => [data,...prev]); setShowAdd(false); setResults([]); setQuery(''); setNotice('Added to your library.') }
    setSaving(false)
  }

  async function updateItem(id,changes) {
    const {data,error} = await supabase.from('watchlist_items').update({...changes,updated_at:new Date().toISOString()}).eq('id',id).select().single()
    if (error) setNotice(error.message)
    else setItems(prev => prev.map(x => x.id===id ? data : x))
  }
  async function deleteItem(id) {
    const {error} = await supabase.from('watchlist_items').delete().eq('id',id)
    if (error) setNotice(error.message)
    else setItems(prev => prev.filter(x=>x.id!==id))
  }

  const visible = useMemo(() => items.filter(x =>
    (filter==='all' || x.status===filter) &&
    (typeFilter==='all' || x.media_type===typeFilter) &&
    (genreFilter==='all' || (x.genres||[]).includes(genreFilter)) &&
    (platformFilter==='all' || (x.platforms||[]).includes(platformFilter))
  ).sort((a,b)=> sort==='title' ? a.title.localeCompare(b.title) : sort==='rating' ? (b.rating||0)-(a.rating||0) : new Date(b.created_at)-new Date(a.created_at)),[items,filter,typeFilter,genreFilter,platformFilter,sort])

  const watched = items.filter(x=>x.status==='watched').length
  const rated = items.filter(x=>x.rating)
  const average = rated.length ? (rated.reduce((n,x)=>n+x.rating,0)/rated.length).toFixed(1) : '—'

  if (!session) return <main className="auth-screen"><div className="auth-card"><div className="brand-mark"><Clapperboard size={24}/></div><p className="eyebrow">YOUR PERSONAL CINEMA</p><h1>the <em>watchlist.</em></h1><p className="muted">A little home for everything you want to watch.</p>
    {!supabase && <div className="alert">Supabase connection is not configured yet. The app owner needs to add the project URL and publishable key in the deployment settings.</div>}
    <form onSubmit={authenticate} className="auth-form"><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength="6" placeholder="At least 6 characters"/></label><button className="primary full" disabled={!supabase}>{authMode==='login'?'Sign in':'Create account'}</button></form>
    {authMessage && <p className="form-message">{authMessage}</p>}<button className="text-button" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthMessage('')}}>{authMode==='login'?'New here? Create an account':'Already have an account? Sign in'}</button>
    <p className="tiny muted">Your library is private to your account.</p></div></main>

  return <div className="app-shell"><aside className="sidebar"><div className="logo"><span className="logo-icon"><Clapperboard size={19}/></span><span>the <em>watchlist.</em></span></div><nav><button className={activeTab==='library'?'nav active':'nav'} onClick={()=>setActiveTab('library')}><Bookmark size={17}/> My library <span>{items.length}</span></button><button className={activeTab==='for-you'?'nav active':'nav'} onClick={()=>setActiveTab('for-you')}><Sparkles size={17}/> For you</button></nav><div className="sidebar-bottom"><div className="user-pill"><div className="avatar">{session.user.email?.[0]?.toUpperCase()}</div><div className="user-email">{session.user.email}</div></div><button className="nav" onClick={()=>supabase.auth.signOut()}><LogOut size={16}/> Sign out</button></div></aside>
  <main className="main"><header className="topbar"><div><p className="eyebrow">YOUR PERSONAL CINEMA</p><h1>{activeTab==='library'?'Your library':'Picked for you'}</h1></div><button className="primary" onClick={()=>{setShowAdd(true);setManual(false);setDraft(null)}}><Plus size={17}/> Add a title</button></header>
    <section className="stats"><div className="stat"><span className="stat-label">IN YOUR LIBRARY</span><strong>{items.length}</strong></div><div className="stat"><span className="stat-label">WATCHED</span><strong>{watched}</strong></div><div className="stat"><span className="stat-label">YOUR AVERAGE RATING</span><strong>{average}<small>/10</small></strong></div></section>
    {activeTab==='for-you' ? <section className="recommend"><div className="section-heading"><div><p className="eyebrow">BASED ON YOUR TASTE</p><h2>Your next favourite?</h2></div></div><p className="muted">As you rate titles and save your favourite genres, recommendations will become more useful. For now, these are your highest-rated titles.</p><div className="poster-grid">{[...items].filter(x=>x.rating).sort((a,b)=>b.rating-a.rating).slice(0,8).map(x=><article className="poster-card" key={x.id}><Poster item={x}/><div className="poster-meta"><b>{x.title}</b><span>★ {x.rating}/10 · {x.release_year||'—'}</span></div></article>)}</div>{!rated.length&&<div className="empty"><Sparkles size={28}/><h3>Your taste is taking shape</h3><p>Rate a few films and series out of 10 to start building your personal recommendations.</p></div>}</section> :
    <>
    <div className="toolbar"><div className="filter-tabs">{[['all','Everything'],['to_watch','To watch'],['watching','Watching'],['watched','Watched'],['not_interested','Not for me']].map(([v,l])=><button key={v} className={filter===v?'tab selected':'tab'} onClick={()=>setFilter(v)}>{l}</button>)}</div><div className="filter-controls"><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All types</option><option value="movie">Movies</option><option value="series">Series</option></select><select value={genreFilter} onChange={e=>setGenreFilter(e.target.value)}><option value="all">All genres</option>{genresList.map(g=><option key={g}>{g}</option>)}</select><select value={platformFilter} onChange={e=>setPlatformFilter(e.target.value)}><option value="all">All platforms</option>{platformsList.map(p=><option key={p}>{p}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently added</option><option value="title">Title A–Z</option><option value="rating">Highest rated</option></select></div></div>
    {loading ? <div className="empty"><LoaderCircle className="spin"/> Loading your library…</div> : visible.length ? <div className="poster-grid">{visible.map(item=><article className="poster-card" key={item.id}><Poster item={item}/><div className="poster-meta"><div className="title-line"><b>{item.title}</b><button className="delete" title="Remove" onClick={()=>deleteItem(item.id)}><X size={14}/></button></div><span>{item.release_year||'Year unknown'} · {item.media_type==='series'?'Series':'Movie'}</span><div className="chips">{(item.genres||[]).slice(0,2).map(g=><i key={g}>{g}</i>)}</div><select className="status-select" value={item.status} onChange={e=>updateItem(item.id,{status:e.target.value})}><option value="to_watch">To watch</option><option value="watching">Watching</option><option value="watched">Watched</option><option value="not_interested">Not interested</option></select><div className="rating-row"><span>YOUR RATING</span><select aria-label="Your rating" value={item.rating||''} onChange={e=>updateItem(item.id,{rating:e.target.value?Number(e.target.value):null})}><option value="">— / 10</option>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1} / 10</option>)}</select></div><div className="chips">{(item.platforms||[]).map(p=><i key={p}>{p}</i>)}</div></div></article>)}</div> : <div className="empty"><Film size={30}/><h3>Your next movie night starts here</h3><p>Add films and series to build your own little library.</p><button className="primary" onClick={()=>{setShowAdd(true);setDraft(null);setManual(false)}}><Plus size={16}/> Add your first title</button></div>}
    </>}
  </main>
  {showAdd && <div className="modal-backdrop" onClick={()=>setShowAdd(false)}><section className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">GROW YOUR LIBRARY</p><h2>{draft?'Add to your watchlist':'Find a movie or series'}</h2></div><button className="icon-button" onClick={()=>setShowAdd(false)}><X/></button></div>
    {!draft ? <><form className="search-form" onSubmit={searchTitles}><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a title…" autoFocus/><button className="primary" disabled={searching}>{searching?'Searching…':'Search'}</button></form>{searchError&&<p className="form-message">{searchError}</p>}<div className="search-results">{results.map(r=><button className="result" key={`${r.media_type}-${r.id}`} onClick={()=>startAdd(r)}><div className="result-poster">{r.poster_path?<img src={poster(r.poster_path)}/>:<Film/>}</div><div><b>{r.title||r.name}</b><span>{r.media_type==='tv'?'Series':'Movie'} · {yearOf(r.release_date||r.first_air_date)||'Year unknown'}</span><small>{r.overview}</small></div><Plus size={18}/></button>)}</div><button className="text-button" onClick={()=>startAdd()}>Can't find it? Add manually</button></> :
    <form className="add-form" onSubmit={saveDraft}><label>Title<input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><div className="form-row"><label>Type<select value={draft.media_type} onChange={e=>setDraft({...draft,media_type:e.target.value})}><option value="movie">Movie</option><option value="series">Series</option></select></label><label>Release year<input type="number" min="1888" max="2100" value={draft.release_year||''} onChange={e=>setDraft({...draft,release_year:e.target.value})}/></label></div><label>Description<textarea rows="2" value={draft.overview} onChange={e=>setDraft({...draft,overview:e.target.value})}/></label><div><span className="field-label">Genres</span><div className="choice-grid">{genresList.map(g=><button type="button" key={g} className={draft.genres.includes(g)?'choice on':'choice'} onClick={()=>setDraft({...draft,genres:draft.genres.includes(g)?draft.genres.filter(x=>x!==g):[...draft.genres,g]})}>{g}</button>)}</div></div><div><span className="field-label">Streaming platforms in Belgium</span><div className="choice-grid">{platformsList.map(p=><button type="button" key={p} className={draft.platforms.includes(p)?'choice on':'choice'} onClick={()=>setDraft({...draft,platforms:draft.platforms.includes(p)?draft.platforms.filter(x=>x!==p):[...draft.platforms,p]})}>{p}</button>)}</div></div><div className="form-row"><label>Status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="to_watch">To watch</option><option value="watching">Watching</option><option value="watched">Watched</option><option value="not_interested">Not interested</option></select></label><label>Your rating<select value={draft.rating||''} onChange={e=>setDraft({...draft,rating:e.target.value?Number(e.target.value):null})}><option value="">Not rated</option>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}/10</option>)}</select></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setDraft(null)}>Back</button><button className="primary" disabled={saving}>{saving?'Saving…':'Save to library'}</button></div></form>}
  </section></div>}
  {notice&&<button className="toast" onClick={()=>setNotice('')}>{notice} <X size={14}/></button>}
  <footer className="app-footer">Movie and TV metadata provided by TMDb. This product uses the TMDb API but is not endorsed or certified by TMDb.</footer>
  </div>
}

function Poster({item}) { return <div className="poster-image">{item.poster_path?<img loading="lazy" src={poster(item.poster_path)} alt={`${item.title} poster`}/>:<div className="poster-placeholder"><Clapperboard size={30}/><span>{item.title}</span></div>}</div> }

createRoot(document.getElementById('root')).render(<App/>)
