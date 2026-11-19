'use client'

import React, { useEffect, useRef } from 'react'
import * as Blockly from 'blockly'
import { javascriptGenerator } from 'blockly/javascript'

export default function BlocklyComponent({ selectedSpriteId, onUpdateCode, initialCode }) {
  const blocklyDiv = useRef()
  const workspace = useRef()
  const isSyncing = useRef(false)

  useEffect(() => {
    // ─── CUSTOM BLOCK DEFINITIONS ──────────────────────────────────────────
    
    const motionColor = '#4C97FF'
    const looksColor = '#9966FF'
    const soundColor = '#CF63CF'
    const eventColor = '#FFBF00'
    const controlColor = '#FFAB19'
    const sensingColor = '#5CB1D6'
    const operatorColor = '#59C059'
    const dataColor = '#FF8C1A'

    // MOTION (10)
    Blockly.Blocks['motion_move'] = { init: function() { this.appendDummyInput().appendField('move').appendField(new Blockly.FieldNumber(10), 'STEPS').appendField('steps'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }
    Blockly.Blocks['motion_turn_right'] = { init: function() { this.appendDummyInput().appendField('turn ↻').appendField(new Blockly.FieldNumber(15), 'DEGREES').appendField('degrees'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }
    Blockly.Blocks['motion_turn_left'] = { init: function() { this.appendDummyInput().appendField('turn ↺').appendField(new Blockly.FieldNumber(15), 'DEGREES').appendField('degrees'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }
    Blockly.Blocks['motion_goto_xy'] = { init: function() { this.appendDummyInput().appendField('go to x:').appendField(new Blockly.FieldNumber(0), 'X').appendField('y:').appendField(new Blockly.FieldNumber(0), 'Y'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }
    Blockly.Blocks['motion_goto_random'] = { init: function() { this.appendDummyInput().appendField('go to random position'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }
    Blockly.Blocks['motion_point_direction'] = { init: function() { this.appendDummyInput().appendField('point in direction').appendField(new Blockly.FieldAngle(90), 'DIRECTION'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }
    Blockly.Blocks['motion_set_x'] = { init: function() { this.appendDummyInput().appendField('set x to').appendField(new Blockly.FieldNumber(0), 'X'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }
    Blockly.Blocks['motion_set_y'] = { init: function() { this.appendDummyInput().appendField('set y to').appendField(new Blockly.FieldNumber(0), 'Y'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }
    Blockly.Blocks['motion_change_x'] = { init: function() { this.appendDummyInput().appendField('change x by').appendField(new Blockly.FieldNumber(10), 'DX'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }
    Blockly.Blocks['motion_change_y'] = { init: function() { this.appendDummyInput().appendField('change y by').appendField(new Blockly.FieldNumber(10), 'DY'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(motionColor) } }

    // LOOKS (New category)
    Blockly.Blocks['looks_say'] = { init: function() { this.appendDummyInput().appendField('say').appendField(new Blockly.FieldTextInput('Hello!'), 'TEXT'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(looksColor) } }
    Blockly.Blocks['looks_think'] = { init: function() { this.appendDummyInput().appendField('think').appendField(new Blockly.FieldTextInput('Hmm...'), 'TEXT'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(looksColor) } }
    Blockly.Blocks['looks_show'] = { init: function() { this.appendDummyInput().appendField('show'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(looksColor) } }
    Blockly.Blocks['looks_hide'] = { init: function() { this.appendDummyInput().appendField('hide'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(looksColor) } }
    Blockly.Blocks['looks_switchcostume'] = { init: function() { this.appendDummyInput().appendField('switch costume to').appendField(new Blockly.FieldDropdown([['costume1','c1'],['costume2','c2']]), 'COSTUME'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(looksColor) } }
    Blockly.Blocks['looks_nextcostume'] = { init: function() { this.appendDummyInput().appendField('next costume'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(looksColor) } }
    Blockly.Blocks['looks_setsize'] = { init: function() { this.appendDummyInput().appendField('set size to').appendField(new Blockly.FieldNumber(100), 'SIZE').appendField('%'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(looksColor) } }

    // SOUND (New category)
    Blockly.Blocks['sound_play'] = { init: function() { this.appendDummyInput().appendField('play sound').appendField(new Blockly.FieldDropdown([['pop','s1'],['boop','s2'],['meow','s8']]), 'SOUND'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(soundColor) } }
    Blockly.Blocks['sound_stopall'] = { init: function() { this.appendDummyInput().appendField('stop all sounds'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(soundColor) } }

    // EVENTS (10)
    Blockly.Blocks['event_whenflagclicked'] = { init: function() { this.appendDummyInput().appendField('🏁 when clicked'); this.setNextStatement(true); this.setColour(eventColor) } }
    Blockly.Blocks['event_whenkeypressed'] = { init: function() { this.appendDummyInput().appendField('when').appendField(new Blockly.FieldDropdown([['space','SPACE'],['up arrow','UP'],['down arrow','DOWN'],['left arrow','LEFT'],['right arrow','RIGHT']]), 'KEY').appendField('key pressed'); this.setNextStatement(true); this.setColour(eventColor) } }
    Blockly.Blocks['event_whenthisspriteclicked'] = { init: function() { this.appendDummyInput().appendField('when this sprite clicked'); this.setNextStatement(true); this.setColour(eventColor) } }
    Blockly.Blocks['event_whenbroadcastreceived'] = { init: function() { this.appendDummyInput().appendField('when I receive').appendField(new Blockly.FieldTextInput('message1'), 'MSG'); this.setNextStatement(true); this.setColour(eventColor) } }
    Blockly.Blocks['event_broadcast'] = { init: function() { this.appendDummyInput().appendField('broadcast').appendField(new Blockly.FieldTextInput('message1'), 'MSG'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(eventColor) } }
    Blockly.Blocks['event_broadcastandwait'] = { init: function() { this.appendDummyInput().appendField('broadcast').appendField(new Blockly.FieldTextInput('message1'), 'MSG').appendField('and wait'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(eventColor) } }

    // CONTROL (10)
    Blockly.Blocks['control_forever'] = { init: function() { this.appendDummyInput().appendField('forever'); this.appendStatementInput('SUBSTACK').setCheck(null); this.setPreviousStatement(true); this.setColour(controlColor) } }
    Blockly.Blocks['control_repeat'] = { init: function() { this.appendDummyInput().appendField('repeat').appendField(new Blockly.FieldNumber(10), 'TIMES'); this.appendStatementInput('SUBSTACK').setCheck(null); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(controlColor) } }
    Blockly.Blocks['control_if'] = { init: function() { this.appendValueInput('CONDITION').setCheck('Boolean').appendField('if'); this.appendStatementInput('SUBSTACK').setCheck(null).appendField('then'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(controlColor) } }
    Blockly.Blocks['control_wait'] = { init: function() { this.appendDummyInput().appendField('wait').appendField(new Blockly.FieldNumber(1), 'DURATION').appendField('seconds'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(controlColor) } }

    // SENSING (New)
    Blockly.Blocks['sensing_mousedown'] = { init: function() { this.appendDummyInput().appendField('mouse down?'); this.setOutput(true, 'Boolean'); this.setColour(sensingColor) } }
    Blockly.Blocks['sensing_keypressed'] = { init: function() { this.appendDummyInput().appendField('key').appendField(new Blockly.FieldDropdown([['space','SPACE']]), 'KEY').appendField('pressed?'); this.setOutput(true, 'Boolean'); this.setColour(sensingColor) } }

    // OPERATORS (New)
    Blockly.Blocks['operator_add'] = { init: function() { this.appendValueInput('A').setCheck('Number'); this.appendValueInput('B').setCheck('Number').appendField('+'); this.setOutput(true, 'Number'); this.setInputsInline(true); this.setColour(operatorColor) } }
    Blockly.Blocks['operator_random'] = { init: function() { this.appendDummyInput().appendField('pick random').appendField(new Blockly.FieldNumber(1), 'FROM').appendField('to').appendField(new Blockly.FieldNumber(10), 'TO'); this.setOutput(true, 'Number'); this.setColour(operatorColor) } }

    // DATA (New)
    Blockly.Blocks['data_setvariable'] = { init: function() { this.appendDummyInput().appendField('set').appendField(new Blockly.FieldTextInput('my variable'), 'VAR').appendField('to').appendField(new Blockly.FieldNumber(0), 'VALUE'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(dataColor) } }

    // ─── GENERATORS ────────────────────────────────────────────────────────
    const gen = javascriptGenerator
    
    // Motion
    gen.forBlock['motion_move'] = (b) => `yield* move(${b.getFieldValue('STEPS')});\n`
    gen.forBlock['motion_turn_right'] = (b) => `yield* turn(${b.getFieldValue('DEGREES')});\n`
    gen.forBlock['motion_turn_left'] = (b) => `yield* turn(-${b.getFieldValue('DEGREES')});\n`
    gen.forBlock['motion_goto_xy'] = (b) => `yield* goto(${b.getFieldValue('X')}, ${b.getFieldValue('Y')});\n`
    gen.forBlock['motion_goto_random'] = () => `yield* goto(Math.random()*480-240, Math.random()*360-180);\n`
    gen.forBlock['motion_point_direction'] = (b) => `yield* point(${b.getFieldValue('DIRECTION')});\n`
    gen.forBlock['motion_set_x'] = (b) => `yield* setX(${b.getFieldValue('X')});\n`
    gen.forBlock['motion_set_y'] = (b) => `yield* setY(${b.getFieldValue('Y')});\n`
    gen.forBlock['motion_change_x'] = (b) => `yield* changeX(${b.getFieldValue('DX')});\n`
    gen.forBlock['motion_change_y'] = (b) => `yield* changeY(${b.getFieldValue('DY')});\n`

    // Looks
    gen.forBlock['looks_say'] = (b) => `yield* say("${b.getFieldValue('TEXT')}");\n`
    gen.forBlock['looks_think'] = (b) => `yield* say("${b.getFieldValue('TEXT')}");\n`
    gen.forBlock['looks_show'] = () => `yield* show();\n`
    gen.forBlock['looks_hide'] = () => `yield* hide();\n`
    gen.forBlock['looks_switchcostume'] = (b) => `yield* switchCostume("${b.getFieldValue('COSTUME')}");\n`
    gen.forBlock['looks_nextcostume'] = () => `yield* nextCostume();\n`
    gen.forBlock['looks_setsize'] = (b) => `yield* setSize(${b.getFieldValue('SIZE')});\n`

    // Sound
    gen.forBlock['sound_play'] = (b) => `yield* play("${b.getFieldValue('SOUND')}");\n`
    gen.forBlock['sound_stopall'] = () => `yield* stopSounds();\n`

    // Events
    gen.forBlock['event_whenflagclicked'] = () => `// start:flag\n`
    gen.forBlock['event_whenkeypressed'] = (b) => `// event:key:${b.getFieldValue('KEY')}\n`
    gen.forBlock['event_whenthisspriteclicked'] = () => `// event:click\n`
    gen.forBlock['event_whenbroadcastreceived'] = (b) => `// event:receive:${b.getFieldValue('MSG')}\n`
    gen.forBlock['event_broadcast'] = (b) => `yield* broadcast("${b.getFieldValue('MSG')}");\n`
    gen.forBlock['event_broadcastandwait'] = (b) => `yield* broadcastWait("${b.getFieldValue('MSG')}");\n`

    // Control
    gen.forBlock['control_forever'] = (b, g) => `while(true) {\n${g.statementToCode(b, 'SUBSTACK')}  yield;\n}\n`
    gen.forBlock['control_repeat'] = (b, g) => `for(let i=0; i<${b.getFieldValue('TIMES')}; i++) {\n${g.statementToCode(b, 'SUBSTACK')}  yield;\n}\n`
    gen.forBlock['control_if'] = (b, g) => `if(${g.valueToCode(b, 'CONDITION', 0) || 'false'}) {\n${g.statementToCode(b, 'SUBSTACK')}}\n`
    gen.forBlock['control_wait'] = (b) => `yield* wait(${b.getFieldValue('DURATION')});\n`

    // Sensing
    gen.forBlock['sensing_mousedown'] = () => [`isMouseDown()`, 0]
    gen.forBlock['sensing_keypressed'] = (b) => [`isKeyPressed("${b.getFieldValue('KEY')}")`, 0]

    // Operators
    gen.forBlock['operator_add'] = (b, g) => [`(${g.valueToCode(b, 'A', 0) || 0} + ${g.valueToCode(b, 'B', 0) || 0})`, 0]
    gen.forBlock['operator_random'] = (b) => [`Math.floor(Math.random() * (${b.getFieldValue('TO')} - ${b.getFieldValue('FROM')} + 1)) + ${b.getFieldValue('FROM')}`, 0]

    // Data
    gen.forBlock['data_setvariable'] = (b) => `setVar("${b.getFieldValue('VAR')}", ${b.getFieldValue('VALUE')});\n`

    const toolbox = {
      kind: 'categoryToolbox',
      contents: [
        { kind: 'category', name: 'Motion', colour: motionColor, contents: [
          {kind:'block',type:'motion_move'}, {kind:'block',type:'motion_turn_right'}, {kind:'block',type:'motion_turn_left'},
          {kind:'block',type:'motion_goto_xy'}, {kind:'block',type:'motion_goto_random'}, {kind:'block',type:'motion_point_direction'},
          {kind:'block',type:'motion_set_x'}, {kind:'block',type:'motion_set_y'}, {kind:'block',type:'motion_change_x'}, {kind:'block',type:'motion_change_y'}
        ]},
        { kind: 'category', name: 'Looks', colour: looksColor, contents: [
          {kind:'block',type:'looks_say'}, {kind:'block',type:'looks_think'}, {kind:'block',type:'looks_show'}, {kind:'block',type:'looks_hide'},
          {kind:'block',type:'looks_switchcostume'}, {kind:'block',type:'looks_nextcostume'}, {kind:'block',type:'looks_setsize'}
        ]},
        { kind: 'category', name: 'Sound', colour: soundColor, contents: [
          {kind:'block',type:'sound_play'}, {kind:'block',type:'sound_stopall'}
        ]},
        { kind: 'category', name: 'Events', colour: eventColor, contents: [
          {kind:'block',type:'event_whenflagclicked'}, {kind:'block',type:'event_whenkeypressed'}, {kind:'block',type:'event_whenthisspriteclicked'},
          {kind:'block',type:'event_whenbroadcastreceived'}, {kind:'block',type:'event_broadcast'}, {kind:'block',type:'event_broadcastandwait'}
        ]},
        { kind: 'category', name: 'Control', colour: controlColor, contents: [
          {kind:'block',type:'control_forever'}, {kind:'block',type:'control_repeat'}, {kind:'block',type:'control_if'}, {kind:'block',type:'control_wait'}
        ]},
        { kind: 'category', name: 'Sensing', colour: sensingColor, contents: [
          {kind:'block',type:'sensing_mousedown'}, {kind:'block',type:'sensing_keypressed'}
        ]},
        { kind: 'category', name: 'Operators', colour: operatorColor, contents: [
          {kind:'block',type:'operator_add'}, {kind:'block',type:'operator_random'}
        ]},
        { kind: 'category', name: 'Variables', colour: dataColor, contents: [
          {kind:'block',type:'data_setvariable'}
        ]}
      ]
    }

    workspace.current = Blockly.inject(blocklyDiv.current, {
      toolbox,
      grid: { spacing: 25, length: 3, colour: '#eee', snap: true },
      trashcan: true,
      renderer: 'geras'
    })

    const handleChange = (e) => {
      if (e.isUiEvent || isSyncing.current) return
      const xml = Blockly.Xml.workspaceToDom(workspace.current)
      const xmlText = Blockly.Xml.domToText(xml)
      const code = gen.workspaceToCode(workspace.current)
      onUpdateCode(xmlText, code)
    }

    workspace.current.addChangeListener(handleChange)
    const handleResize = () => Blockly.svgResize(workspace.current)
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      if (workspace.current) workspace.current.dispose()
    }
  }, [])

  useEffect(() => {
    if (!workspace.current) return
    isSyncing.current = true
    workspace.current.clear()
    if (initialCode) {
      try {
        const xml = Blockly.Xml.textToDom(initialCode)
        Blockly.Xml.domToWorkspace(xml, workspace.current)
      } catch (e) { console.error('Blockly load error', e) }
    }
    isSyncing.current = false
  }, [selectedSpriteId])

  return <div className="w-full h-full relative border-t border-slate-200"><div ref={blocklyDiv} className="absolute inset-0" /></div>
}
