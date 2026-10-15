import test from 'node:test'
import assert from 'node:assert/strict'
import { HANDLED_PROMPT_IDLE_MS, PiAcpSession } from '../../src/acp/session.js'
import { FakeAgentSideConnection, FakePiRpcProcess, asAgentConn } from '../helpers/fakes.js'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function makeSession(proc: FakePiRpcProcess, conn: FakeAgentSideConnection): PiAcpSession {
  return new PiAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })
}

test('PiAcpSession: handled disposition resolves end_turn after idle window without agent events', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  proc.promptResult = { disposition: 'handled' }

  const session = makeSession(proc, conn)

  let resolved = false
  const p = session.prompt('/ping').then(reason => {
    resolved = true
    return reason
  })

  // Let the prompt RPC response land and arm the idle watcher.
  await sleep(0)
  proc.emit({ type: 'extension_ui_request', id: 'n1', method: 'notify', message: 'pong' })

  // A fire-and-forget notify must not settle the turn immediately.
  await sleep(HANDLED_PROMPT_IDLE_MS / 2)
  assert.equal(resolved, false)

  assert.equal(await p, 'end_turn')
  assert.equal(resolved, true)
})

test('PiAcpSession: agent_start during a handled turn cancels the watcher and uses settle flow', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  proc.promptResult = { disposition: 'handled' }

  const session = makeSession(proc, conn)

  let resolved = false
  const p = session.prompt('/ping').then(reason => {
    resolved = true
    return reason
  })

  await sleep(0)
  proc.emit({ type: 'agent_start' })

  // The idle window passing must NOT settle the turn once an agent run is in flight.
  await sleep(HANDLED_PROMPT_IDLE_MS + 100)
  assert.equal(resolved, false)

  proc.emit({ type: 'agent_end' })
  proc.emit({ type: 'agent_settled' })
  assert.equal(await p, 'end_turn')
})

test('PiAcpSession: legacy pi without disposition resolves known extension commands via idle window', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  proc.promptResult = {}

  const session = makeSession(proc, conn)
  session.setKnownExtensionCommands(['ping'])

  assert.equal(await session.prompt('/ping some args'), 'end_turn')
})

test('PiAcpSession: legacy pi without disposition keeps settle-based flow for normal messages', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  proc.promptResult = {}

  const session = makeSession(proc, conn)
  session.setKnownExtensionCommands(['ping'])

  let resolved = false
  const p = session.prompt('hello there').then(reason => {
    resolved = true
    return reason
  })

  await sleep(HANDLED_PROMPT_IDLE_MS + 100)
  assert.equal(resolved, false)

  proc.emit({ type: 'agent_settled' })
  assert.equal(await p, 'end_turn')
})

test('PiAcpSession: cancel while handled watcher pending resolves and session stays usable', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  proc.promptResult = { disposition: 'handled' }

  const session = makeSession(proc, conn)

  const p = session.prompt('/ping')
  await sleep(0)
  assert.equal(session.wasCancelRequested(), false)

  await session.cancel()
  assert.equal(await p, 'cancelled')

  // The session must be usable for a subsequent prompt.
  proc.promptResult = { disposition: 'started' }
  const p2 = session.prompt('hello')
  await sleep(0)
  proc.emit({ type: 'agent_start' })
  proc.emit({ type: 'agent_end' })
  proc.emit({ type: 'agent_settled' })
  assert.equal(await p2, 'end_turn')
})

test('PiAcpSession: child exit while handled watcher pending resolves the prompt', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  proc.promptResult = { disposition: 'handled' }

  const session = makeSession(proc, conn)

  const p = session.prompt('/ping')
  await sleep(0)
  proc.exit()

  assert.equal(await p, 'end_turn')
})
