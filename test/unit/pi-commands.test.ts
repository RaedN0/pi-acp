import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXTENSION_ITEMS_CAP,
  extensionCommandNames,
  toAvailableCommandsFromPiGetCommands
} from '../../src/acp/pi-commands.js'
import { mergeCommands } from '../../src/acp/agent.js'

test('toAvailableCommandsFromPiGetCommands: includes extension commands by default and filters skill commands', () => {
  const data = {
    commands: [
      { name: 'x', description: 'X', source: 'extension' },
      { name: 'skill:foo', description: 'Foo', source: 'skill', location: 'user' },
      { name: 'y', source: 'prompt', location: 'project' }
    ]
  }

  const all = toAvailableCommandsFromPiGetCommands(data, { enableSkillCommands: true }).commands
  assert.deepEqual(all, [
    { name: 'x', description: 'X' },
    { name: 'skill:foo', description: 'Foo' },
    { name: 'y', description: '(prompt:project)' }
  ])

  const excludeExt = toAvailableCommandsFromPiGetCommands(data, {
    enableSkillCommands: true,
    includeExtensionCommands: false
  }).commands
  assert.deepEqual(excludeExt, [
    { name: 'skill:foo', description: 'Foo' },
    { name: 'y', description: '(prompt:project)' }
  ])

  const noSkills = toAvailableCommandsFromPiGetCommands(data, { enableSkillCommands: false }).commands
  assert.deepEqual(noSkills, [
    { name: 'x', description: 'X' },
    { name: 'y', description: '(prompt:project)' }
  ])
})

test('toAvailableCommandsFromPiGetCommands: caps extension commands but keeps prompts', () => {
  const commands: Array<Record<string, unknown>> = []
  for (let i = 0; i < EXTENSION_ITEMS_CAP + 5; i++) commands.push({ name: `ext${i}`, source: 'extension' })
  commands.push({ name: 'promptcmd', source: 'prompt' })

  const { commands: out } = toAvailableCommandsFromPiGetCommands({ commands })

  assert.equal(out.filter(c => c.name.startsWith('ext')).length, EXTENSION_ITEMS_CAP)
  assert.ok(out.some(c => c.name === 'promptcmd'))
})

test('extensionCommandNames: extracts only extension command names', () => {
  const names = extensionCommandNames([
    { name: 'ping', source: 'extension' },
    { name: 'compact', source: 'builtin' },
    { name: '  spaced  ', source: 'extension' },
    { name: '', source: 'extension' },
    { name: 'no-source' }
  ])

  assert.deepEqual(names, ['ping', 'spaced'])
})

test('mergeCommands: built-ins win name collisions when passed first', () => {
  const merged = mergeCommands(
    [{ name: 'compact', description: 'builtin' }],
    [
      { name: 'compact', description: 'extension' },
      { name: 'ping', description: 'extension' }
    ]
  )

  assert.deepEqual(merged, [
    { name: 'compact', description: 'builtin' },
    { name: 'ping', description: 'extension' }
  ])
})
