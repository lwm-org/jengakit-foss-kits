'use client'

import React from 'react'
import { Trash2 } from 'lucide-react'

export default function SpriteList({ sprites, selectedSpriteId, onSelect, onDelete }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {sprites.map(sprite => (
        <div 
          key={sprite.id}
          className={`
            relative group aspect-square rounded-2xl border-4 flex flex-col items-center justify-center p-2 transition-all cursor-pointer
            ${selectedSpriteId === sprite.id 
              ? 'border-itchy-primary bg-itchy-primary/10 shadow-inner scale-105' 
              : 'border-slate-200 bg-white hover:border-itchy-primary/40'}
          `}
          onClick={() => onSelect(sprite.id)}
        >
          <div className="flex-1 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-itchy-primary/20 flex items-center justify-center text-itchy-primary font-black text-2xl">
              {sprite.name[0]}
            </div>
          </div>
          <span className="text-[11px] font-black text-slate-600 truncate w-full text-center px-1">
            {sprite.name}
          </span>
          
          {sprites.length > 1 && (
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(sprite.id); }}
              className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-90"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
