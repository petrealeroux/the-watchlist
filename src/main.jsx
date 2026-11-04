import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import { Search, Plus, Film, LogOut, X, Clapperboard, Bookmark, Sparkles, LoaderCircle, List as ListIcon, Trash2, ArrowLeft, Star, Tv } from 'lucide-react'
import './style.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const genresList = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','History','Horror','Music','Mystery','Romance','Science Fiction','Thriller','War','Western']
const platformsList = ['Netflix','Disney+','Prime Video','Max','Apple TV+','SkyShowtime','Streamz','VRT MAX','GoPlay','YouTube','Other']
const poster = p => p ? `https://image.tmdb.org/t/p/w500${p}` : ''
const yearOf = d => d ? String(d).slice(0,4) : ''
const TMDB_GENRES = {28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Science Fiction',53:'Thriller',10752:'War',37:'Western',10759:'Action',10762:'Family',10763:'Documentary',10764:'Reality',10765:'Science Fiction',10766:'Drama',10767:'Talk',10768:'War'}
const normalise = item => ({
  tmdb_id: item.id || null,
  media_type: item.media_type === 'tv' || item.media_type === 'series' ? 'series' : 'movie',
  title: item.title || item.name || 'Untitled',
  release_year: Number(yearOf(item.release_date || item.first_air_date)) || null,
  overview: item.overview || '',
  poster_path: item.poster_path || null,
  genres: (item.genre_ids || []).map(id => TMDB_GENRES[id]).filter(Boolean),
  platforms: [],
  status: 'to_watch',
  rating: null,
  source: item.id ? 'tmdb' : 'manual'
})
const statusLabels = {to_watch:'To watch',watching:'Watching',watched:'Watched',not_interested:'Not for me'}

function App() {
  const [session,setSession] = useState(null)
  const [authMode,setAuthMode] = useState('login')
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [authMessage,setAuthMessage] = useState('')
  const [items,setItems] = useState([])
  const [lists,setLists] = useState([])
  const [itemLists,setItemLists] = useState([])
  const [loading,setLoading] = useState(true)
  const [query,setQuery] = useState('')
  const [results,setResults] = useState([])
  const [searching,setSearching] = useState(false)
  const [searchError,setSearchError] = useState('')
  const [showAdd,setShowAdd] = useState(false)
  const [draft,setDraft] = useState(null)
  const [manualTitle,setManualTitle] = useState('')
  const [manualType,setManualType] = useState('movie')
  const [filter,setFilter] = useState('all')
  const [typeFilter,setTypeFilter] = useState('all')
  const [genreFilter,setGenreFilter] = useState('all')
  const [platformFilter,setPlatformFilter] = useState('all')
  const [sort,setSort] = useState('recent')
  const [saving,setSaving] = useState(false)
  const [notice,setNotice] = useState('')
  const [activeTab,setActiveTab] = useState('library')
  const [activeList,setActiveList] = useState(null)
  const [newListName,setNewListName] = useState('')
  const [showListCreator,setShowListCreator] = useState(false)
  const [selectedLists,setSelectedLists] = useState([])
  const [recommendations,setRecommendations] = useState([])
  const [recLoading,setRecLoading] = useState(false)
  const [recMessage,setRecMessage] = useState('')
  const [recRegion,setRecRegion] = useState('BE')

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({data}) => setSession(data.session))
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadAll()
    else { setItems([]); setLists([]); setItemLists([]); setLoading(false) }
  }, [session])

  async function loadAll() {
    setLoading(true)
    const [itemRes,listRes,linkRes] = await Promise.all([
      supabase.from('watchlist_items').select('*').order('created_at',{ascending:false}),
      supabase.from('watchlist_lists').select('*').order('created_at',{ascending:true}),
      supabase.from('watchlist_item_lists').select('*')
    ])
    if (itemRes.error) setNotice(itemRes.error.message); else setItems(itemRes.data || [])
    if (listRes.error) setNotice(listRes.error.message); else setLists(listRes.data || [])
    if (linkRes.error) setNotice(linkRes.error.message); else setItemLists(linkRes.data || [])
    setLoading(false)
  }

  async function authenticate(e) {
    e.preventDefault(); setAuthMessage('')
    if (!supabase) return setAuthMessage('App setup is incomplete. Check the Supabase settings in Vercel.')
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
      if (!(data.results || []).some(x => ['movie','tv'].includes(x.media_type))) setSearchError('No matches found. Try another title or add it manually.')
    } catch(err) { setSearchError(err.message) }
    setSearching(false)
  }

  function openAdd() {
    setQuery(''); setResults([]); setSearchError(''); setDraft(null); setSelectedLists([]); setManualTitle(''); setShowAdd(true)
  }

  function chooseTitle(item) {
    setDraft(normalise(item))
    setSelectedLists([])
  }

  async function createList(name = newListName) {
    const clean = name.trim()
    if (!clean) return
    const {data,error} = await supabase.from('watchlist_lists').insert({name:clean,user_id:session.user.id}).select().single()
    if (error) setNotice(error.message)
    else { setLists(prev => [...prev,data]); setSelectedLists(prev => [...prev,data.id]); setNewListName(''); setShowListCreator(false); setNotice(`Created "${clean}".`) }
  }

  async function saveDraft(e) {
    e.preventDefault()
    const itemDraft = draft || (manualTitle.trim() ? {title:manualTitle.trim(),media_type:manualType,release_year:null,overview:'',poster_path:null,genres:[],platforms:[],status:'to_watch',rating:null,source:'manual',tmdb_id:null} : null)
    if (!itemDraft?.title?.trim()) return
    setSaving(true)
    const payload = {...itemDraft, title:itemDraft.title.trim(), user_id:session.user.id}
    const {data,error} = await supabase.from('watchlist_items').insert(payload).select().single()
    if (error) { setNotice(error.message); setSaving(false); return }
    setItems(prev => [data,...prev])
    if (selectedLists.length) {
      const links = selectedLists.map(list_id => ({user_id:session.user.id,item_id:data.id,list_id}))
      const linkRes = await supabase.from('watchlist_item_lists').insert(links)
      if (linkRes.error) setNotice(`Title saved, but list assignment failed: ${linkRes.error.message}`)
      else setItemLists(prev => [...prev,...links])
    }
    setShowAdd(false); setResults([]); setQuery(''); setDraft(null); setNotice('Added to your library.')
    setSaving(false)
  }

  async function updateItem(id,changes) {
    const {data,error} = await supabase.from('watchlist_items').update({...changes,updated_at:new Date().toISOString()}).eq('id',id).select().single()
    if (error) setNotice(error.message)
    else setItems(prev => prev.map(x => x.id===id ? data : x))
  }

  async function deleteItem(id) {
    if (!window.confirm('Remove this title from your library?')) return
    const {error} = await supabase.from('watchlist_items').delete().eq('id',id)
    if (error) setNotice(error.message)
    else { setItems(prev => prev.filter(x=>x.id!==id)); setItemLists(prev=>prev.filter(x=>x.item_id!==id)) }
  }

  async function deleteList(list) {
    if (!window.confirm(`Delete the list "${list.name}"? Your titles will remain in your library.`)) return
    const {error} = await supabase.from('watchlist_lists').delete().eq('id',list.id)
    if (error) setNotice(error.message)
    else { setLists(prev=>prev.filter(x=>x.id!==list.id)); setItemLists(prev=>prev.filter(x=>x.list_id!==list.id)); if(activeList===list.id) setActiveList(null); setNotice('List deleted. Your titles are safe.') }
  }

  async function toggleItemList(itemId,listId,checked) {
    if (checked) {
      const row={user_id:session.user.id,item_id:itemId,list_id:listId}
      const {error}=await supabase.from('watchlist_item_lists').insert(row)
      if(error) setNotice(error.message); else setItemLists(prev=>[...prev,row])
    } else {
      const {error}=await supabase.from('watchlist_item_lists').delete().eq('item_id',itemId).eq('list_id',listId)
      if(error) setNotice(error.message); else setItemLists(prev=>prev.filter(x=>!(x.item_id===itemId&&x.list_id===listId)))
    }
  }

  async function fetchRecommendations() {
    setRecLoading(true); setRecMessage('')
    try {
      const seen = new Set(items.map(x=>`${x.media_type==='series'?'tv':'movie'}-${x.tmdb_id}`).filter(x=>!x.endsWith('-null')))
      const rated = [...items].filter(x=>x.rating>=8 && x.tmdb_id).sort((a,b)=>b.rating-a.rating).slice(0,3)
      const genres = [...new Set(items.filter(x=>x.rating>=7).flatMap(x=>x.genres||[]))].slice(0,3)
      const requests=[]
      for (const seed of rated) requests.push(fetch(`/api/tmdb?type=recommendations&id=${seed.tmdb_id}&media=${seed.media_type==='series'?'tv':'movie'}`).then(r=>r.json()))
      requests.push(fetch('/api/tmdb?type=trending').then(r=>r.json()))
      requests.push(fetch('/api/tmdb?type=popular').then(r=>r.json()))
      const responses=await Promise.all(requests)
      const pool=[]
      responses.forEach((d,i)=>(d.results||[]).forEach(x=>pool.push({...x,_reason:i<rated.length?`Because you rated ${rated[i]?.title} highly`:genres.length&&genres.includes((x.genre_ids||[]).map(id=>TMDB_GENRES[id]).find(g=>genres.includes(g)))?'Matches genres you enjoy':'Popular and trending discovery'})))
      const unique=[]
      const used=new Set()
      for(const x of pool){
        const media=x.media_type || (x.first_air_date?'tv':'movie')
        const key=`${media}-${x.id}`
        if(!x.id||used.has(key)||seen.has(key)||x.poster_path===undefined) continue
        used.add(key); unique.push({...x,media_type:media})
      }
      setRecommendations(unique.slice(0,24))
      if(!unique.length) setRecMessage('Add and rate a few titles to help us find recommendations. You can also explore popular and trending titles here.')
    } catch(e) { setRecMessage('Recommendations could not be loaded just now. Please try again.') }
    setRecLoading(false)
  }

  useEffect(()=>{ if(session && activeTab==='for-you') fetchRecommendations() },[session,activeTab,items.length])

  const listIdsForItem = id => itemLists.filter(x=>x.item_id===id).map(x=>x.list_id)
  const visible = useMemo(() => {
    let source=items
    if(activeTab==='list' && activeList) source=source.filter(x=>listIdsForItem(x.id).includes(activeList))
    return source.filter(x =>
      (filter==='all' || x.status===filter) &&
      (typeFilter==='all' || x.media_type===typeFilter) &&
      (genreFilter==='all' || (x.genres||[]).includes(genreFilter)) &&
      (platformFilter==='all' || (x.platforms||[]).includes(platformFilter))
    ).sort((a,b)=> sort==='title' ? a.title.localeCompare(b.title) : sort==='rating' ? (b.rating||0)-(a.rating||0) : new Date(b.created_at)-new Date(a.created_at))
  },[items,itemLists,activeTab,activeList,filter,typeFilter,genreFilter,platformFilter,sort])
  const watched=items.filter(x=>x.status==='watched').length
  const rated=items.filter(x=>x.rating)
  const average=rated.length?(rated.reduce((n,x)=>n+x.rating,0)/rated.length).toFixed(1):'—'

  if (!session) return <main className="auth-screen"><div className="auth-card"><div className="brand-mark"><Clapperboard size={24}/></div><p className="eyebrow">YOUR PERSONAL CINEMA</p><h1>the <em>watchlist.</em></h1><p className="muted">A little home for everything you want to watch.</p>{!supabase&&<div className="alert">Supabase connection is not configured. Check your Vercel settings.</div>}<form onSubmit={authenticate} className="auth-form"><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength="6" placeholder="At least 6 characters"/></label><button className="primary full" disabled={!supabase}>{authMode==='login'?'Sign in':'Create account'}</button></form>{authMessage&&<p className="form-message">{authMessage}</p>}<button className="text-button" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthMessage('')}}>{authMode==='login'?'New here? Create an account':'Already have an account? Sign in'}</button><p className="tiny muted">Your library is private to your account.</p></div></main>

  return <div className="app-shell">
    <aside className="sidebar"><div className="logo"><span className="logo-icon"><Clapperboard size={19}/></span><span>the <em>watchlist.</em></span></div><nav>
      <button className={activeTab==='library'?'nav active':'nav'} onClick={()=>{setActiveTab('library');setActiveList(null)}}><Bookmark size={17}/> My library <span>{items.length}</span></button>
      <button className={activeTab==='lists'||activeTab==='list'?'nav active':'nav'} onClick={()=>{setActiveTab('lists');setActiveList(null)}}><ListIcon size={17}/> Lists <span>{lists.length}</span></button>
      <button className={activeTab==='for-you'?'nav active':'nav'} onClick={()=>setActiveTab('for-you')}><Sparkles size={17}/> For you</button>
    </nav><div className="sidebar-bottom"><div className="user-pill"><div className="avatar">{session.user.email?.[0]?.toUpperCase()}</div><div className="user-email">{session.user.email}</div></div><button className="nav" onClick={()=>supabase.auth.signOut()}><LogOut size={16}/> Sign out</button></div></aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">YOUR PERSONAL CINEMA</p><h1>{activeTab==='library'?'Your library':activeTab==='lists'?'Your lists':activeTab==='list'?(lists.find(x=>x.id===activeList)?.name||'Your list'):'Picked for you'}</h1></div>{activeTab!=='for-you'&&<button className="primary" onClick={activeTab==='lists'?()=>setShowListCreator(true):openAdd}><Plus size={17}/>{activeTab==='lists'?'New list':'Add a title'}</button>}</header>
      {activeTab==='library'&&<><section className="stats"><div className="stat"><span className="stat-label">IN YOUR LIBRARY</span><strong>{items.length}</strong></div><div className="stat"><span className="stat-label">WATCHED</span><strong>{watched}</strong></div><div className="stat"><span className="stat-label">YOUR AVERAGE RATING</span><strong>{average}<small>/10</small></strong></div></section><LibraryToolbar {...{filter,setFilter,typeFilter,setTypeFilter,genreFilter,setGenreFilter,platformFilter,setPlatformFilter,sort,setSort}}/></>}
      {activeTab==='list'&&<div className="list-toolbar"><button className="text-button" onClick={()=>{setActiveTab('lists');setActiveList(null)}}><ArrowLeft size={14}/> All lists</button><span>{visible.length} {visible.length===1?'title':'titles'}</span></div>}
      {activeTab==='lists'&&<section className="lists-grid">{lists.map(list=><article className="list-card" key={list.id}><button className="list-open" onClick={()=>{setActiveList(list.id);setActiveTab('list')}}><span className="list-icon"><ListIcon/></span><b>{list.name}</b><small>{itemLists.filter(x=>x.list_id===list.id).length} titles</small></button><button className="delete-list" title="Delete list" onClick={()=>deleteList(list)}><Trash2 size={15}/></button></article>)}{!lists.length&&<div className="empty wide"><ListIcon size={30}/><h3>Your lists start here</h3><p>Create collections for different moods, people or occasions. A title can belong to more than one list.</p><button className="primary" onClick={()=>setShowListCreator(true)}><Plus size={16}/> Create your first list</button></div>}</section>}
      {(activeTab==='library'||activeTab==='list')&&(loading?<div className="empty"><LoaderCircle className="spin"/> Loading your library…</div>:visible.length?<div className="poster-grid">{visible.map(item=><PosterCard key={item.id} item={item} lists={lists} itemListIds={listIdsForItem(item.id)} updateItem={updateItem} deleteItem={deleteItem} toggleItemList={toggleItemList}/>)}</div>:<div className="empty"><Film size={30}/><h3>{activeTab==='list'?'This list is empty':'Your next movie night starts here'}</h3><p>{activeTab==='list'?'Add titles to this list when saving a title or from its list selector.':'Add films and series to build your own little library.'}</p>{activeTab==='library'&&<button className="primary" onClick={openAdd}><Plus size={16}/> Add your first title</button>}</div>)}
      {activeTab==='for-you'&&<section className="recommend"><div className="section-heading"><div><p className="eyebrow">TASTE + DISCOVERY</p><h2>Your next favourite?</h2></div><button className="secondary" onClick={fetchRecommendations} disabled={recLoading}>Refresh</button></div><p className="muted">A mix of titles inspired by highly rated favourites, plus popular and trending discoveries. Titles already in your library are excluded.</p>{recLoading?<div className="empty"><LoaderCircle className="spin"/> Finding your next watch…</div>:recommendations.length?<div className="recommend-grid">{recommendations.map(x=><article className="recommend-card" key={`${x.media_type}-${x.id}`}><div className="recommend-poster">{x.poster_path?<img src={poster(x.poster_path)} alt=""/>:<Film/>}</div><div className="recommend-info"><b>{x.title||x.name}</b><span>{x.media_type==='tv'?'Series':'Movie'} · {yearOf(x.release_date||x.first_air_date)||'—'}</span><small>{x._reason}</small><button className="mini-save" onClick={()=>{chooseTitle(x);setShowAdd(true)}}><Plus size={13}/> Add to library</button></div></article>)}</div>:<div className="empty"><Sparkles size={28}/><h3>Your taste is taking shape</h3><p>{recMessage||'Rate a few titles to help us build recommendations.'}</p></div>}</section>}
    </main>
    {showAdd&&<div className="modal-backdrop" onClick={()=>setShowAdd(false)}><section className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">GROW YOUR LIBRARY</p><h2>{draft?'Add to your library':'Find a movie or series'}</h2></div><button className="icon-button" onClick={()=>setShowAdd(false)}><X/></button></div>
      {!draft?<><form className="search-form" onSubmit={searchTitles}><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a title…" autoFocus/><button className="primary" disabled={searching}>{searching?'Searching…':'Search'}</button></form>{searchError&&<p className="form-message">{searchError}</p>}<div className="search-results">{results.map(r=><button className="result" key={`${r.media_type}-${r.id}`} onClick={()=>chooseTitle(r)}><div className="result-poster">{r.poster_path?<img src={poster(r.poster_path)} alt=""/>:<Film/>}</div><div><b>{r.title||r.name}</b><span>{r.media_type==='tv'?'Series':'Movie'} · {yearOf(r.release_date||r.first_air_date)||'Year unknown'}</span><small>{r.overview}</small></div><Plus size={18}/></button>)}</div><button className="text-button" onClick={()=>{setDraft({title:'',media_type:'movie',release_year:null,overview:'',poster_path:null,genres:[],platforms:[],status:'to_watch',rating:null,source:'manual',tmdb_id:null});setManualTitle('')}}>Can't find it? Add manually</button></>:<form className="add-form" onSubmit={saveDraft}>
        {draft.source==='manual'?<><label>Title<input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Type<select value={draft.media_type} onChange={e=>setDraft({...draft,media_type:e.target.value})}><option value="movie">Movie</option><option value="series">Series</option></select></label></>:<div className="chosen-title"><div className="chosen-poster">{draft.poster_path?<img src={poster(draft.poster_path)} alt=""/>:<Film/>}</div><div><b>{draft.title}</b><span>{draft.media_type==='series'?'Series':'Movie'} · {draft.release_year||'Year unknown'}</span><small>Details imported from TMDb</small></div></div>}
        <label>Status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="to_watch">To watch</option><option value="watching">Watching</option><option value="watched">Watched</option><option value="not_interested">Not for me</option></select></label>
        <div><div className="field-row"><span className="field-label">Add to custom lists (optional)</span><button type="button" className="text-button compact" onClick={()=>setShowListCreator(true)}><Plus size={13}/> New list</button></div>{lists.length?<div className="list-checks">{lists.map(l=><label key={l.id} className="check-option"><input type="checkbox" checked={selectedLists.includes(l.id)} onChange={e=>setSelectedLists(prev=>e.target.checked?[...prev,l.id]:prev.filter(x=>x!==l.id))}/>{l.name}</label>)}</div>:<p className="muted small">No custom lists yet. You can create one here.</p>}</div>
        <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setDraft(null)}>Back</button><button className="primary" disabled={saving}>{saving?'Saving…':'Save title'}</button></div>
      </form>}
    </section></div>}
    {showListCreator&&<div className="modal-backdrop top-modal" onClick={()=>setShowListCreator(false)}><section className="modal small-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">YOUR COLLECTIONS</p><h2>Create a list</h2></div><button className="icon-button" onClick={()=>setShowListCreator(false)}><X/></button></div><form className="add-form" onSubmit={e=>{e.preventDefault();createList()}}><label>List name<input autoFocus maxLength="60" value={newListName} onChange={e=>setNewListName(e.target.value)} placeholder="e.g. With Pieter" required/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowListCreator(false)}>Cancel</button><button className="primary" disabled={!newListName.trim()}>Create list</button></div></form></section></div>}
    {notice&&<button className="toast" onClick={()=>setNotice('')}>{notice} <X size={14}/></button>}
    <footer className="app-footer">Movie and TV metadata provided by TMDb. This product uses the TMDb API but is not endorsed or certified by TMDb.</footer>
  </div>
}

function LibraryToolbar({filter,setFilter,typeFilter,setTypeFilter,genreFilter,setGenreFilter,platformFilter,setPlatformFilter,sort,setSort}) {
  return <div className="toolbar"><div className="filter-tabs">{[['all','Everything'],['to_watch','To watch'],['watching','Watching'],['watched','Watched'],['not_interested','Not for me']].map(([v,l])=><button key={v} className={filter===v?'tab selected':'tab'} onClick={()=>setFilter(v)}>{l}</button>)}</div><div className="filter-controls"><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All types</option><option value="movie">Movies</option><option value="series">Series</option></select><select value={genreFilter} onChange={e=>setGenreFilter(e.target.value)}><option value="all">All genres</option>{genresList.map(g=><option key={g}>{g}</option>)}</select><select value={platformFilter} onChange={e=>setPlatformFilter(e.target.value)}><option value="all">All platforms</option>{platformsList.map(p=><option key={p}>{p}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently added</option><option value="title">Title A–Z</option><option value="rating">Highest rated</option></select></div></div>
}

function PosterCard({item,lists,itemListIds,updateItem,deleteItem,toggleItemList}) {
  const [showLists,setShowLists]=useState(false)
  return <article className="poster-card"><div className="poster-image">{item.poster_path?<img loading="lazy" src={poster(item.poster_path)} alt={`${item.title} poster`}/>:<div className="poster-placeholder"><Clapperboard size={25}/><span>{item.title}</span></div>}</div><div className="poster-meta"><div className="title-line"><b>{item.title}</b><button className="delete" title="Remove" onClick={()=>deleteItem(item.id)}><X size={14}/></button></div><span>{item.release_year||'Year unknown'} · {item.media_type==='series'?'Series':'Movie'}</span><select className="status-select" value={item.status} onChange={e=>updateItem(item.id,{status:e.target.value})}>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><div className="rating-row"><span>YOUR RATING</span><select aria-label="Your rating" value={item.rating||''} onChange={e=>updateItem(item.id,{rating:e.target.value?Number(e.target.value):null})}><option value="">— / 10</option>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1} / 10</option>)}</select></div><button className="list-toggle" onClick={()=>setShowLists(v=>!v)}><ListIcon size={13}/> {itemListIds.length?`${itemListIds.length} custom list${itemListIds.length===1?'':'s'}`:'Add to a list'}</button>{showLists&&<div className="card-list-options">{lists.map(l=><label key={l.id}><input type="checkbox" checked={itemListIds.includes(l.id)} onChange={e=>toggleItemList(item.id,l.id,e.target.checked)}/>{l.name}</label>)}</div>}</div></article>
}

createRoot(document.getElementById('root')).render(<App/>)
