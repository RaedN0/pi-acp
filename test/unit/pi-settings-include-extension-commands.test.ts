import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getIncludeExtensionCommands } from '../../src/acp/pi-settings.js'

function makeAgentDir(settings: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-acp-agent-'))
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings), 'utf-8')
  return dir
}

function makeCwd(settings?: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-acp-cwd-'))
  if (settings) {
    mkdirSync(join(dir, '.pi'))
    writeFileSync(join(dir, '.pi', 'settings.json'), JSON.stringify(settings), 'utf-8')
  }
  return dir
}

test('getIncludeExtensionCommands: setting and env precedence', () => {
  const prevAgentDir = process.env.PI_CODING_AGENT_DIR
  const prevEnv = process.env.PI_ACP_INCLUDE_EXTENSION_COMMANDS

  try {
    // Default: enabled.
    process.env.PI_CODING_AGENT_DIR = makeAgentDir({})
    delete process.env.PI_ACP_INCLUDE_EXTENSION_COMMANDS
    assert.equal(getIncludeExtensionCommands(makeCwd()), true)

    // Env disables when the pi setting is absent.
    process.env.PI_ACP_INCLUDE_EXTENSION_COMMANDS = '0'
    assert.equal(getIncludeExtensionCommands(makeCwd()), false)

    // The pi setting wins over env.
    process.env.PI_CODING_AGENT_DIR = makeAgentDir({ acp: { includeExtensionCommands: true } })
    assert.equal(getIncludeExtensionCommands(makeCwd()), true)

    // Project setting disables.
    process.env.PI_CODING_AGENT_DIR = makeAgentDir({})
    delete process.env.PI_ACP_INCLUDE_EXTENSION_COMMANDS
    assert.equal(getIncludeExtensionCommands(makeCwd({ acp: { includeExtensionCommands: false } })), false)
  } finally {
    if (prevAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = prevAgentDir
    if (prevEnv === undefined) delete process.env.PI_ACP_INCLUDE_EXTENSION_COMMANDS
    else process.env.PI_ACP_INCLUDE_EXTENSION_COMMANDS = prevEnv
  }
})
