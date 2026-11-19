'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Square, Save, FolderOpen, Plus, Settings, Trash2, Image as ImageIcon, Music, Home as HomeIcon, Bug, Terminal } from 'lucide-react'
import BlocklyComponent from '../components/BlocklyComponent'
import Stage from '../components/Stage'
import SpriteList from '../components/SpriteList'
import { ItchyRuntime } from '../lib/runtime/itchy-runtime'
import { saveProjectLocally, getLocalProjects } from '../lib/db'

// ─── LIBRARIES ─────────────────────────────────────────────────────────────

const COSTUMES = Array.from({ length: 30 }, (_, i) => ({
  id: `c${i+1}`,
  name: `Costume ${i+1}`,
  color: `hsl(${i * 12}, 75%, 60%)`
}))

const SOUNDS = [
  { id: 's1', name: 'Pop' }, { id: 's2', name: 'Boop' }, { id: 's3', name: 'Jump' },
  { id: 's4', name: 'Laser' }, { id: 's5', name: 'Win' }, { id: 's6', name: 'Fail' },
  { id: 's7', name: 'Coin' }, { id: 's8', name: 'Meow' }, { id: 's9', name: 'Bark' },
  { id: 's10', name: 'Bird' }
]

// ─── TWO-WAY SYNC PARSER ──────────────────────────────────────────────────

const parseCodeToBlocks = (code) => {
  let xml = '<xml xmlns="https://developers.google.com/blockly/xml">';
  
  // We check for different start types
  let baseBlockType = 'event_whenflagclicked';
  if (code.includes('// event:click')) baseBlockType = 'event_whenthisspriteclicked';
  
  xml += `<block type="${baseBlockType}" id="start" x="20" y="20">`;
  
  const lines = code.split('\n');
  let blockCount = 0;

  lines.forEach(line => {
    const moveMatch = line.match(/move\((\d+)\)/);
    const turnMatch = line.match(/turn\((-?\d+)\)/);
    const sayMatch = line.match(/say\("([^"]+)"\)/);
    const gotoMatch = line.match(/goto\((-?\d+),\s*(-?\d+)\)/);
    
    let blockXml = '';
    if (moveMatch) {
      blockXml = `<block type="motion_move"><field name="STEPS">${moveMatch[1]}</field>`;
    } else if (turnMatch) {
      const deg = parseInt(turnMatch[1]);
      const type = deg >= 0 ? 'motion_turn_right' : 'motion_turn_left';
      blockXml = `<block type="${type}"><field name="DEGREES">${Math.abs(deg)}</field>`;
    } else if (sayMatch) {
      blockXml = `<block type="looks_say"><field name="TEXT">${sayMatch[1]}</field>`;
    } else if (gotoMatch) {
      blockXml = `<block type="motion_goto_xy"><field name="X">${gotoMatch[1]}</field><field name="Y">${gotoMatch[2]}</field>`;
    }

    if (blockXml) {
      xml += `<next>${blockXml}`;
      blockCount++;
    }
  });

  // Close blocks
  for(let i=0; i<blockCount; i++) xml += '</next></block>';
  xml += '</block></xml>';
  return xml;
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState('code')
  const [isRunning, setIsRunning] = useState(false)
  const [sprites, setSprites] = useState([
    { id: '1', name: 'Itchy Cat', x: 0, y: 0, direction: 90, costumes: [COSTUMES[0].id], currentCostume: 0, visible: true, code: '', generatedCode: '', size: 100, sayText: '' }
  ])
  const [selectedSpriteId, setSelectedSpriteId] = useState('1')
  const [projectName, setProjectName] = useState('Final Super Scratchy v2.2')
  const [showProjects, setShowProjects] = useState(false)
  const [savedProjects, setSavedProjects] = useState([])
  
  // Debugger state
  const [debugLogs, setDebugLogs] = useState([])
  const [highlightedLine, setHighlightedLine] = useState(-1)
  const [stopAtLine, setStopAtLine] = useState(-1)
  const [showDebugger, setShowDebugger] = useState(true)

  const runtimeRef = useRef(null)
  const spritesRef = useRef(sprites)
  const selectedSpriteIdRef = useRef(selectedSpriteId)

  useEffect(() => {
    spritesRef.current = sprites
    selectedSpriteIdRef.current = selectedSpriteId
  }, [sprites, selectedSpriteId])

  // Initialize runtime with debugger callbacks
  useEffect(() => {
    runtimeRef.current = new ItchyRuntime(
      (id, update) => {
        setSprites(prev => prev.map(s => s.id === id ? { ...s, ...update } : s))
      },
      (id, event) => {
        if (event.type === 'step') {
          setHighlightedLine(event.line)
        } else if (event.type === 'error') {
          setDebugLogs(prev => [...prev, { id: Date.now(), spriteId: id, message: event.message, type: 'error' }])
        }
      }
    )
  }, [])

  const handleRun = (lineToStop = -1) => {
    setDebugLogs([])
    setHighlightedLine(-1)
    setStopAtLine(lineToStop)
    setIsRunning(true)
    runtimeRef.current.start(spritesRef.current, lineToStop)
  }

  const handleStop = () => {
    setIsRunning(false)
    setHighlightedLine(-1)
    runtimeRef.current.stop()
    setSprites(prev => prev.map(s => ({ ...s, sayText: '' })))
  }

  const updateSprite = useCallback((id, update) => {
    setSprites(prev => prev.map(s => s.id === id ? { ...s, ...update } : s))
  }, [])

  const updateCode = useCallback((code, generatedCode) => {
    const targetId = selectedSpriteIdRef.current
    setSprites(prev => prev.map(s => s.id === targetId ? { ...s, code, generatedCode } : s))
  }, [])

  const handleHackerChange = (newGeneratedCode) => {
    const targetId = selectedSpriteIdRef.current
    // Attempt basic sync back to blocks
    const newBlockXml = parseCodeToBlocks(newGeneratedCode);
    setSprites(prev => prev.map(s => s.id === targetId ? { ...s, code: newBlockXml, generatedCode: newGeneratedCode } : s))
  }

  const handleSave = async () => {
    await saveProjectLocally({ name: projectName, data: { sprites, selectedSpriteId } })
    alert('Project Saved Locally!')
  }

  const loadProjects = async () => {
    const projs = await getLocalProjects()
    setSavedProjects(projs)
    setShowProjects(true)
  }

  const loadProject = (proj) => {
    setSprites(proj.data.sprites)
    setSelectedSpriteId(proj.data.selectedSpriteId)
    setProjectName(proj.name)
    setShowProjects(false)
  }

  const addSprite = () => {
    const newId = Math.random().toString(36).substr(2, 9)
    const newSprite = {
      id: newId,
      name: `Sprite ${sprites.length + 1}`,
      x: 0, y: 0, direction: 90,
      costumes: [COSTUMES[0].id], currentCostume: 0, visible: true,
      code: '', generatedCode: '', size: 100, sayText: ''
    }
    setSprites(prev => [...prev, newSprite])
    setSelectedSpriteId(newId)
  }

  const deleteSprite = (id) => {
    if (sprites.length <= 1) return
    const nextSprites = sprites.filter(s => s.id !== id)
    setSprites(nextSprites)
    if (selectedSpriteId === id) setSelectedSpriteId(nextSprites[0].id)
  }

  const selectedSprite = sprites.find(s => s.id === selectedSpriteId)

  return (
    <main className="flex flex-col h-screen w-screen bg-itchy-workspace font-sans text-slate-800 antialiased">
      {/* Header */}
      <div className="h-16 bg-itchy-primary flex items-center px-6 justify-between shadow-xl z-20">
        <div className="flex items-center gap-6 text-white">
          <div className="bg-white/20 p-2 rounded-xl border border-white/10 shadow-inner"><HomeIcon size={24} /></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Project Name</span>
            <input 
              type="text" 
              value={projectName} 
              onChange={(e) => setProjectName(e.target.value)}
              className="bg-transparent text-white font-black text-xl border-none outline-none focus:bg-white/5 px-1 rounded transition-all w-64"
            />
          </div>
          <div className="h-10 w-px bg-white/20 mx-2" />
          <div className="flex items-center bg-white/10 rounded-full p-1.5 px-4 gap-4 border border-white/10">
            <button 
              onClick={() => { setDebugLogs([{id: Date.now(), type: 'log', message: 'System boot... starting scripts.'}]); handleRun(); }}
              className={`p-2.5 rounded-full transition-all hover:scale-125 active:scale-95 ${isRunning ? 'bg-green-500 text-white shadow-[0_0_25px_rgba(34,197,94,0.8)] scale-110' : 'text-green-300 hover:text-white hover:bg-green-500/20'}`}
              title="Run (Play)"
            >
              <Play fill="currentColor" size={28} />
            </button>
            <button 
              onClick={handleStop}
              className="p-2.5 rounded-full text-red-300 hover:text-white transition-all hover:scale-125 active:scale-90 hover:bg-red-500/20"
              title="Stop All"
            >
              <Square fill="currentColor" size={28} />
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSave} className="flex items-center gap-2 bg-white hover:bg-slate-100 text-itchy-primary px-6 py-2.5 rounded-2xl text-sm font-black transition-all shadow-lg active:scale-95 border-b-4 border-slate-200">
            <Save size={20} /> SAVE
          </button>
          <button onClick={loadProjects} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-2xl text-sm font-black transition-all active:scale-95 border border-white/20">
            <FolderOpen size={20} /> GALLERY
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Editor Tabs */}
        <div className="flex-1 flex flex-col relative border-r-2 border-slate-200 bg-white">
          <div className="h-14 bg-slate-50 border-b-2 border-slate-200 flex items-center px-8 gap-12 text-sm font-black text-slate-400">
            <TabBtn active={activeTab === 'code'} onClick={() => setActiveTab('code')} icon={<Play size={18}/>} label="CODE" />
            <TabBtn active={activeTab === 'costumes'} onClick={() => setActiveTab('costumes')} icon={<ImageIcon size={18}/>} label="COSTUMES" />
            <TabBtn active={activeTab === 'sounds'} onClick={() => setActiveTab('sounds')} icon={<Music size={18}/>} label="SOUNDS" />
            <TabBtn active={activeTab === 'hacker'} onClick={() => setActiveTab('hacker')} icon={<Bug size={18}/>} label="HACKER" />
          </div>
          <div className="flex-1 relative">
            <div className={`w-full h-full ${activeTab === 'code' ? 'block' : 'hidden'}`}>
              <BlocklyComponent 
                selectedSpriteId={selectedSpriteId} 
                onUpdateCode={updateCode}
                initialCode={selectedSprite?.code}
              />
            </div>
            
            {activeTab === 'costumes' && (
              <div className="p-8 grid grid-cols-4 gap-6 overflow-y-auto max-h-full bg-slate-50">
                {COSTUMES.map(c => (
                  <button key={c.id} className="group flex flex-col items-center gap-3 p-4 rounded-3xl border-4 border-white hover:border-itchy-primary hover:bg-white transition-all shadow-sm">
                    <div className="w-24 h-24 rounded-2xl shadow-inner transition-transform group-hover:scale-110" style={{ background: c.color }} />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
            
            {activeTab === 'sounds' && (
              <div className="p-8 grid grid-cols-2 gap-4 overflow-y-auto max-h-full bg-slate-50">
                {SOUNDS.map(s => (
                  <button key={s.id} className="flex items-center gap-4 p-6 rounded-2xl bg-white border-4 border-transparent hover:border-itchy-primary transition-all text-left shadow-sm group">
                    <div className="p-4 bg-itchy-primary/10 rounded-full text-itchy-primary group-hover:scale-110 transition-transform"><Music size={32}/></div>
                    <div>
                      <p className="font-black text-slate-700 text-lg uppercase tracking-tight">{s.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Click to Hear</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'hacker' && (
              <div className="p-0 h-full flex flex-col bg-slate-900 text-green-400 font-mono overflow-hidden">
                <div className="flex justify-between items-center p-6 bg-black/20 border-b border-white/5">
                  <h3 className="text-xl font-black tracking-tighter uppercase text-white flex items-center gap-3">
                    <Bug size={24} className="text-green-400"/> Hacker Mode 2.2
                  </h3>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => handleRun(stopAtLine)}
                      className="bg-green-500 text-black px-4 py-2 rounded-xl text-xs font-black transition-all hover:bg-green-400 active:scale-95 flex items-center gap-2"
                    >
                      <Terminal size={14}/> RUN TO LINE {stopAtLine > 0 ? stopAtLine : ''}
                    </button>
                    <button 
                      onClick={() => {
                        const blob = new Blob([JSON.stringify({projectName, sprites, selectedSpriteId}, null, 2)], {type: 'application/json'});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}.itchy`;
                        a.click();
                      }}
                      className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all border border-white/10"
                    >
                      EXPORT
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 flex min-h-0 relative">
                  {/* Line Numbers */}
                  <div className="w-14 bg-black/40 border-r border-white/5 flex flex-col text-[10px] items-center py-6 text-white/30 select-none">
                    {(selectedSprite?.generatedCode || '').split('\n').map((_, i) => (
                      <div 
                        key={i} 
                        className={`h-6 w-full flex items-center justify-center cursor-pointer hover:bg-white/5 hover:text-white transition-colors ${stopAtLine === i + 1 ? 'text-yellow-400 font-bold bg-yellow-400/10' : ''} ${highlightedLine === i + 1 ? 'text-green-400 bg-green-400/10' : ''}`}
                        onClick={() => setStopAtLine(i + 1)}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  
                  {/* Code Editor */}
                  <div className="flex-1 relative overflow-hidden">
                    <textarea 
                      value={selectedSprite?.generatedCode || ''}
                      onChange={(e) => handleHackerChange(e.target.value)}
                      className="w-full h-full bg-transparent p-6 outline-none resize-none text-sm leading-6 z-10 relative"
                      spellCheck="false"
                    />
                    {/* Execution Highlight */}
                    {highlightedLine > 0 && (
                      <div 
                        className="absolute left-0 right-0 bg-green-500/10 border-y border-green-500/20 pointer-events-none transition-all duration-75"
                        style={{ top: `${(highlightedLine - 1) * 24 + 24}px`, height: '24px' }}
                      />
                    )}
                  </div>
                </div>

                {/* Collapsible Debugger */}
                <div className={`bg-black/60 border-t border-white/10 transition-all duration-300 flex flex-col ${showDebugger ? 'h-56' : 'h-10'}`}>
                  <div 
                    className="h-10 px-6 flex items-center justify-between cursor-pointer hover:bg-white/5 shrink-0"
                    onClick={() => setShowDebugger(!showDebugger)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Debug Console ({debugLogs.length})</span>
                      {debugLogs.some(l => l.type === 'error') && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                    </div>
                    <span className="text-white/40 text-xs">{showDebugger ? 'CLOSE ▼' : 'OPEN ▲'}</span>
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto text-xs space-y-1 font-mono">
                    {debugLogs.length > 0 ? debugLogs.map(log => (
                      <div key={log.id} className={`${log.type === 'error' ? 'text-red-400' : 'text-blue-400'} flex gap-2 border-b border-white/5 pb-1`}>
                        <span className="opacity-30 shrink-0">[{new Date(log.id).toLocaleTimeString()}]</span>
                        <span className="font-black uppercase tracking-tighter shrink-0">{log.type}:</span>
                        <span className="break-all">{log.message}</span>
                      </div>
                    )) : <div className="text-white/10 italic text-center py-10 tracking-widest uppercase text-[10px]">No active issues in runtime. Build stable.</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stage & Sprite List */}
        <div className="w-[600px] flex flex-col bg-slate-100 p-6 gap-6 shadow-inner">
          <Stage 
            sprites={sprites} 
            isRunning={isRunning} 
            onUpdateSprite={updateSprite}
            onSelectSprite={setSelectedSpriteId}
            selectedSpriteId={selectedSpriteId}
          />

          <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-[3rem] border-2 border-slate-200 shadow-2xl">
            <div className="p-6 border-b-2 border-slate-50 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-6">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-400 tracking-[0.15em] uppercase px-1">Sprite Name</label>
                  <input 
                    type="text" 
                    value={selectedSprite?.name || ''} 
                    onChange={(e) => updateSprite(selectedSpriteId, { name: e.target.value })} 
                    className="text-sm font-black bg-white px-4 py-2 rounded-2xl border-2 border-slate-200 outline-none w-44 focus:border-itchy-primary transition-all shadow-inner"
                  />
                </div>
                <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-2xl border-b-2 border-slate-200/50">
                  <div className="flex flex-col items-center w-12">
                    <span className="text-[9px] font-black text-slate-400 uppercase">X</span>
                    <span className="text-xs font-black">{Math.round(selectedSprite?.x)}</span>
                  </div>
                  <div className="w-px h-6 bg-slate-200" />
                  <div className="flex flex-col items-center w-12">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Y</span>
                    <span className="text-xs font-black">{Math.round(selectedSprite?.y)}</span>
                  </div>
                </div>
              </div>
              <button className="bg-slate-100 p-3.5 rounded-2xl text-slate-400 hover:text-itchy-primary hover:bg-itchy-primary/10 transition-all active:rotate-180 border-b-2 border-slate-200">
                <Settings size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-white">
              <SpriteList sprites={sprites} selectedSpriteId={selectedSpriteId} onSelect={setSelectedSpriteId} onDelete={deleteSprite} />
            </div>

            <div className="p-6 border-t-2 border-slate-50 flex justify-end bg-slate-50/30">
              <button onClick={addSprite} className="h-16 w-16 rounded-2xl bg-itchy-primary text-white flex items-center justify-center shadow-lg hover:scale-110 hover:rotate-90 transition-all active:scale-95 border-b-4 border-purple-900/30">
                <Plus size={44} strokeWidth={4} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Projects Modal */}
      {showProjects && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-lg z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[3.5rem] p-12 max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border-4 border-white/20">
            <div className="flex justify-between items-center mb-10 px-4">
              <h2 className="text-5xl font-black text-slate-800 tracking-tight italic">My Gallery</h2>
              <button onClick={() => setShowProjects(false)} className="bg-slate-100 hover:bg-red-500 hover:text-white p-5 rounded-full transition-all font-black text-xl shadow-md active:scale-90">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-8 p-4">
              {savedProjects.length > 0 ? savedProjects.map(p => (
                <button key={p.id} onClick={() => loadProject(p)} className="p-10 bg-slate-50 rounded-[3rem] border-4 border-white hover:border-itchy-primary hover:bg-white text-left transition-all group shadow-xl hover:-translate-y-2">
                  <div className="flex justify-between items-start mb-4">
                    <p className="font-black text-3xl group-hover:text-itchy-primary uppercase tracking-tighter">{p.name}</p>
                    <div className="p-2 bg-itchy-primary/10 rounded-lg text-itchy-primary opacity-0 group-hover:opacity-100 transition-opacity"><Play size={20} fill="currentColor"/></div>
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Modified {new Date(p.lastModified).toLocaleDateString()}</p>
                </button>
              )) : (
                <div className="col-span-2 text-center py-32 bg-slate-50 rounded-[3rem] border-4 border-dashed border-slate-200">
                  <p className="text-3xl font-black text-slate-300 uppercase tracking-widest italic opacity-50">Empty Gallery</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-4 h-full border-b-4 transition-all ${active ? 'border-itchy-primary text-itchy-primary bg-itchy-primary/5' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'}`}
    >
      {icon}
      <span className="font-black tracking-[0.15em] text-xs">{label}</span>
    </button>
  )
}
