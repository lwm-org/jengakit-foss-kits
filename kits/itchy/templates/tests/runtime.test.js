/**
 * Unit tests for itchy-runtime.js
 */

import { ItchyRuntime } from '../lib/runtime/itchy-runtime'

describe('ItchyRuntime', () => {
  let runtime

  beforeEach(() => {
    runtime = new ItchyRuntime()
  })

  test('should add a sprite correctly', () => {
    runtime.addSprite('sprite1', { name: 'Cat', x: 0, y: 0 })
    expect(runtime.sprites.has('sprite1')).toBe(true)
    expect(runtime.sprites.get('sprite1').name).toBe('Cat')
  })

  test('should update sprite state', () => {
    runtime.addSprite('sprite1', { x: 0, y: 0 })
    runtime.updateSpriteState('sprite1', { x: 10 })
    expect(runtime.sprites.get('sprite1').x).toBe(10)
  })

  test('should stop correctly', () => {
    runtime.start()
    expect(runtime.isRunning).toBe(true)
    runtime.stop()
    expect(runtime.isRunning).toBe(false)
  })
})
