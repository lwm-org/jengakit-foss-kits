/**
 * itchy-runtime.js
 * KidCode Studio v2.3 - Debugger Enabled VM
 */

export class ItchyRuntime {
  constructor(onUpdate, onDebug) {
    this.sprites = new Map()
    this.threads = []
    this.isRunning = false
    this.onUpdate = onUpdate
    this.onDebug = onDebug // Callback for debugger events/errors
    this.globalVars = new Map()
  }

  initSprite(id, state) {
    this.sprites.set(id, {
      ...state,
      direction: state.direction === undefined ? 90 : state.direction,
      visible: state.visible !== false,
      size: state.size || 100,
      sayText: '',
      x: state.x || 0,
      y: state.y || 0,
      costumes: state.costumes || [],
      currentCostume: state.currentCostume || 0
    })
  }

  updateSpriteState(id, update) {
    const s = this.sprites.get(id)
    if (s) {
      Object.assign(s, update)
      this.onUpdate(id, { ...s })
    }
  }

  start(projectData, stopAtLine = -1) {
    console.log("Runtime: Starting project", projectData)
    this.stop()
    this.isRunning = true

    projectData.forEach(sprite => {
      this.initSprite(sprite.id, sprite)
      // Check for start trigger
      if (sprite.generatedCode && (sprite.generatedCode.includes('// start:flag') || sprite.generatedCode.includes('// event:flag'))) {
        const thread = this.createThread(sprite.id, sprite.generatedCode, stopAtLine)
        if (thread) this.threads.push(thread)
      }
    })

    if (this.threads.length > 0) {
      this.tick()
    } else {
      this.isRunning = false
    }
  }

  stop() {
    this.isRunning = false
    this.threads = []
  }

  createThread(spriteId, code, stopAtLine) {
    try {
      const sandbox = this.getSandbox(spriteId)
      
      // Instrument code with line tracking yield statements
      const lines = code.split('\n')
      const instrumentedLines = lines.map((line, idx) => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('}') && !trimmed.startsWith('while') && !trimmed.startsWith('for')) {
          return `yield { line: ${idx + 1} }; ${line}`
        }
        return line
      })
      const instrumentedCode = instrumentedLines.join('\n')

      const generatorFunc = new Function('sandbox', `
        return function* () {
          const move = (s) => sandbox.move(s);
          const turn = (d) => sandbox.turn(d);
          const goto = (x, y) => sandbox.goto(x, y);
          const wait = (s) => sandbox.wait(s);
          const point = (d) => sandbox.point(d);
          const setX = (x) => sandbox.setX(x);
          const setY = (y) => sandbox.setY(y);
          const changeX = (dx) => sandbox.changeX(dx);
          const changeY = (dy) => sandbox.changeY(dy);
          const say = (t) => sandbox.say(t);
          const show = () => sandbox.show();
          const hide = () => sandbox.hide();
          const play = (s) => sandbox.play(s);
          const setVar = (n, v) => sandbox.setVar(n, v);
          
          try {
            ${instrumentedCode}
          } catch (e) {
            sandbox.reportError(e.message);
          }
        }
      `)(sandbox)
      
      return {
        spriteId,
        generator: generatorFunc(),
        stopAtLine
      }
    } catch (e) {
      this.onDebug(spriteId, { type: 'error', message: `Compilation Error: ${e.message}` })
      return null
    }
  }

  getSandbox(id) {
    const runtime = this
    return {
      reportError(msg) {
        runtime.onDebug(id, { type: 'error', message: msg })
      },
      *move(steps) {
        const s = runtime.sprites.get(id)
        const rad = (s.direction - 90) * (Math.PI / 180)
        runtime.updateSpriteState(id, { 
          x: s.x + steps * Math.cos(rad), 
          y: s.y - steps * Math.sin(rad) 
        })
        yield
      },
      *turn(deg) {
        const s = runtime.sprites.get(id)
        runtime.updateSpriteState(id, { direction: (s.direction + deg) % 360 })
        yield
      },
      *goto(x, y) {
        runtime.updateSpriteState(id, { x, y })
        yield
      },
      *point(direction) {
        runtime.updateSpriteState(id, { direction })
        yield
      },
      *setX(x) { runtime.updateSpriteState(id, { x }); yield },
      *setY(y) { runtime.updateSpriteState(id, { y }); yield },
      *changeX(dx) {
        const s = runtime.sprites.get(id)
        runtime.updateSpriteState(id, { x: (s.x || 0) + dx })
        yield
      },
      *changeY(dy) {
        const s = runtime.sprites.get(id)
        runtime.updateSpriteState(id, { y: (s.y || 0) + dy })
        yield
      },
      *say(text) {
        runtime.updateSpriteState(id, { sayText: text })
        yield
      },
      *show() { runtime.updateSpriteState(id, { visible: true }); yield },
      *hide() { runtime.updateSpriteState(id, { visible: false }); yield },
      *play(soundId) { 
        runtime.onDebug(id, { type: 'log', message: `Playing sound: ${soundId}` })
        yield 
      },
      setVar(name, val) { 
        runtime.globalVars.set(name, val)
        runtime.onDebug(id, { type: 'log', message: `Variable ${name} set to ${val}` })
      },
      *wait(s) {
        const end = Date.now() + s * 1000
        while (Date.now() < end) yield
      }
    }
  }

  tick() {
    if (!this.isRunning) return

    this.threads = this.threads.filter(thread => {
      try {
        const result = thread.generator.next()
        
        // Handle line highlighting and breakpoints
        if (result.value && result.value.line) {
          this.onDebug(thread.spriteId, { type: 'step', line: result.value.line })
          if (thread.stopAtLine > 0 && result.value.line === thread.stopAtLine) {
            this.onDebug(thread.spriteId, { type: 'log', message: `Breakpoint hit at line ${thread.stopAtLine}` })
            return false // Terminate thread at breakpoint
          }
        }
        
        return !result.done
      } catch (e) {
        this.onDebug(thread.spriteId, { type: 'error', message: e.message })
        return false
      }
    })

    if (this.isRunning && this.threads.length > 0) {
      requestAnimationFrame(() => this.tick())
    } else {
      this.isRunning = false
    }
  }
}
