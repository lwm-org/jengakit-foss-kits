'use client'

import React, { useRef, useEffect, useState } from 'react'

const COSTUMES = Array.from({ length: 30 }, (_, i) => ({
  id: `c${i+1}`,
  color: `hsl(${i * 12}, 75%, 60%)`
}))

export default function Stage({ sprites, isRunning, onUpdateSprite, onSelectSprite, selectedSpriteId }) {
  const canvasRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const getMousePos = (canvas, evt) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: evt.clientX - rect.left - 240,
      y: 180 - (evt.clientY - rect.top)
    }
  }

  const handleMouseDown = (e) => {
    const canvas = canvasRef.current
    const pos = getMousePos(canvas, e)
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i]
      const dist = Math.sqrt((pos.x - s.x)**2 + (pos.y - s.y)**2)
      if (dist < 30 * (s.size/100)) {
        onSelectSprite(s.id)
        setIsDragging(true)
        setDragOffset({ x: s.x - pos.x, y: s.y - pos.y })
        return
      }
    }
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !selectedSpriteId) return
    const canvas = canvasRef.current
    const pos = getMousePos(canvas, e)
    onUpdateSprite(selectedSpriteId, {
      x: pos.x + dragOffset.x,
      y: pos.y + dragOffset.y
    })
  }

  const handleMouseUp = () => setIsDragging(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let frameId

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // Grid
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 1
      ctx.beginPath()
      for(let x = 0; x <= 480; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, 360); }
      for(let y = 0; y <= 360; y += 40) { ctx.moveTo(0, y); ctx.lineTo(480, y); }
      ctx.stroke()

      // Crosshair
      ctx.strokeStyle = '#f1f5f9'
      ctx.beginPath()
      ctx.moveTo(240, 0); ctx.lineTo(240, 360)
      ctx.moveTo(0, 180); ctx.lineTo(480, 180)
      ctx.stroke()

      sprites.forEach(sprite => {
        if (!sprite.visible) return
        
        ctx.save()
        ctx.translate(240 + sprite.x, 180 - sprite.y)
        ctx.rotate((sprite.direction - 90) * Math.PI / 180)
        const scale = (sprite.size || 100) / 100
        ctx.scale(scale, scale)
        
        if (sprite.id === selectedSpriteId) {
          ctx.strokeStyle = '#6B46C1'
          ctx.lineWidth = 3 / scale
          ctx.beginPath()
          ctx.arc(0, 0, 35, 0, Math.PI * 2)
          ctx.stroke()
        }

        // Body
        const costume = COSTUMES.find(c => c.id === sprite.costumes[sprite.currentCostume]) || COSTUMES[0]
        ctx.fillStyle = costume.color
        ctx.beginPath()
        ctx.arc(0, 0, 30, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'
        ctx.lineWidth = 2
        ctx.stroke()
        
        // Eyes
        ctx.fillStyle = 'white'
        ctx.beginPath()
        ctx.arc(-12, -8, 8, 0, Math.PI * 2)
        ctx.arc(12, -8, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#1e293b'
        ctx.beginPath()
        ctx.arc(-12, -8, 4, 0, Math.PI * 2)
        ctx.arc(12, -8, 4, 0, Math.PI * 2)
        ctx.fill()
        
        // Smile
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(0, 5, 10, 0.2 * Math.PI, 0.8 * Math.PI)
        ctx.stroke()

        ctx.restore()

        if (sprite.sayText) {
          ctx.save()
          ctx.translate(240 + sprite.x, 180 - sprite.y)
          const bubbleY = -50 * scale
          ctx.font = 'bold 16px Inter, system-ui, sans-serif'
          const metrics = ctx.measureText(sprite.sayText)
          const bW = metrics.width + 30
          const bH = 40
          
          ctx.fillStyle = 'white'
          ctx.shadowColor = 'rgba(0,0,0,0.1)'
          ctx.shadowBlur = 10
          ctx.beginPath()
          ctx.roundRect(-bW/2, bubbleY - bH, bW, bH, 15)
          ctx.fill()
          ctx.shadowBlur = 0
          
          ctx.strokeStyle = '#e2e8f0'
          ctx.lineWidth = 2
          ctx.stroke()
          
          ctx.beginPath()
          ctx.moveTo(-8, bubbleY); ctx.lineTo(8, bubbleY); ctx.lineTo(0, bubbleY + 12); ctx.closePath()
          ctx.fill(); ctx.stroke()
          
          ctx.fillStyle = '#1e293b'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(sprite.sayText, 0, bubbleY - bH/2)
          ctx.restore()
        }
      })

      frameId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(frameId)
  }, [sprites, selectedSpriteId])

  return (
    <div className="relative shadow-2xl bg-white overflow-hidden rounded-[2.5rem] border-[6px] border-slate-200 aspect-[4/3] group">
      <canvas 
        ref={canvasRef} 
        width={480} 
        height={360} 
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full block cursor-crosshair touch-none"
      />
      <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-slate-900/80 backdrop-blur text-white text-[10px] px-3 py-1.5 rounded-full font-black tracking-widest border border-white/10">
          480 x 360 STAGE
        </div>
      </div>
    </div>
  )
}
