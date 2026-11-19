'use client'

import React, { useState } from 'react'
import { X, ChevronRight } from 'lucide-react'

const steps = [
  { title: "Welcome!", text: "This is KidCode Studio. Let's learn how to make things move!" },
  { title: "The Blocks", text: "On the left, you'll find blocks. Drag them to the workspace to create scripts." },
  { title: "The Stage", text: "This is where your sprites come to life! Click the green flag to start." }
]

export default function TutorialOverlay({ onClose }) {
  const [currentStep, setCurrentStep] = useState(0)

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X size={24} />
        </button>

        <div className="text-center">
          <div className="w-16 h-16 bg-itchy-primary/10 rounded-full flex items-center justify-center text-itchy-primary mx-auto mb-6">
            <span className="text-2xl font-bold">{currentStep + 1}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">{steps[currentStep].title}</h2>
          <p className="text-slate-600 text-lg mb-8 leading-relaxed">{steps[currentStep].text}</p>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div key={i} className={`h-2 rounded-full transition-all ${i === currentStep ? 'w-8 bg-itchy-primary' : 'w-2 bg-slate-200'}`} />
            ))}
          </div>
          <button 
            onClick={() => currentStep === steps.length - 1 ? onClose() : setCurrentStep(s => s + 1)}
            className="bg-itchy-primary text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:scale-105 transition-transform active:scale-95"
          >
            {currentStep === steps.length - 1 ? "Let's Go!" : "Next"} <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
