import test from 'node:test'
import assert from 'node:assert/strict'
import { PiAcpSession } from '../../src/acp/session.js'
import { FakeAgentSideConnection, FakePiRpcProcess, asAgentConn } from '../helpers/fakes.js'

function makeSession(
  conn: FakeAgentSideConnection,
  proc: FakePiRpcProcess,
  formElicitation = true
): PiAcpSession {
  return new PiAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: [],
    formElicitation
  })
}

const tick = () => new Promise(r => setTimeout(r, 0))

// ---------------------------------------------------------------------------
// select
// ---------------------------------------------------------------------------

test('PiAcpSession: select renders an elicitation form with oneOf options', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.elicitationResponse = { action: 'accept', content: { choice: 'choice-1' } }
  makeSession(conn, proc)

  proc.emit({
    type: 'extension_ui_request',
    id: 'ui-1',
    method: 'select',
    title: 'Pick one',
    options: ['Alpha', 'Beta']
  })
  await tick()

  assert.equal(conn.elicitationRequests.length, 1)
  assert.equal(conn.permissionRequests.length, 0, 'must not use a permission dialog')

  const req = conn.elicitationRequests[0] as any
  assert.equal(req.mode, 'form')
  assert.equal(req.sessionId, 's1')
  // `message` is the card header; the schema title must stay unset so the same
  // text does not render twice.
  assert.equal(req.message, 'Pick one')
  assert.equal(req.requestedSchema.title, undefined)
  assert.deepEqual(req.requestedSchema.required, ['choice'])
  assert.deepEqual(req.requestedSchema.properties.choice.oneOf, [
    { const: 'choice-0', title: 'Alpha' },
    { const: 'choice-1', title: 'Beta' }
  ])
  // The chosen option's *label* goes back to pi, not the internal constant.
  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-1', value: 'Beta' }])
})

test('PiAcpSession: select declined via elicitation cancels the dialog', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.elicitationResponse = { action: 'decline' }
  makeSession(conn, proc)

  proc.emit({ type: 'extension_ui_request', id: 'ui-1', method: 'select', title: 'Pick', options: ['A', 'B'] })
  await tick()

  assert.equal(conn.permissionRequests.length, 0, 'a decline must not open a second dialog')
  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-1', cancelled: true }])
})

test('PiAcpSession: select falls back to a permission request when elicitation is unsupported', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  // Advertised capability missing, and the call rejects: both lead to the fallback.
  conn.elicitationError = new Error('Method not found')
  conn.nextPermissionResponse = { outcome: { outcome: 'selected', optionId: 'choice-1' } }
  makeSession(conn, proc)

  proc.emit({
    type: 'extension_ui_request',
    id: 'ui-1',
    method: 'select',
    title: 'Pick one',
    options: ['Alpha', 'Beta']
  })
  await tick()

  assert.equal(conn.elicitationRequests.length, 1)
  assert.equal(conn.permissionRequests.length, 1)
  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-1', value: 'Beta' }])
})

test('PiAcpSession: select goes straight to permission when the client has no capability', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.nextPermissionResponse = { outcome: { outcome: 'selected', optionId: 'choice-0' } }
  makeSession(conn, proc, false)

  proc.emit({
    type: 'extension_ui_request',
    id: 'ui-1',
    method: 'select',
    title: 'Pick one',
    options: ['Alpha', 'Beta']
  })
  await tick()

  assert.equal(conn.elicitationRequests.length, 0, 'must not probe elicitation when unsupported')
  assert.equal(conn.permissionRequests.length, 1)
  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-1', value: 'Alpha' }])
})

// ---------------------------------------------------------------------------
// confirm
// ---------------------------------------------------------------------------

test('PiAcpSession: confirm renders a boolean elicitation field', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.elicitationResponse = { action: 'accept', content: { confirmed: true } }
  makeSession(conn, proc)

  proc.emit({
    type: 'extension_ui_request',
    id: 'ui-2',
    method: 'confirm',
    title: 'Clear session?',
    message: 'All messages will be lost.'
  })
  await tick()

  assert.equal(conn.elicitationRequests.length, 1)
  assert.equal(conn.permissionRequests.length, 0)

  const req = conn.elicitationRequests[0] as any
  assert.equal(req.message, 'Clear session?')
  assert.equal(req.requestedSchema.properties.confirmed.type, 'boolean')
  assert.deepEqual(req.requestedSchema.required, ['confirmed'])
  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-2', confirmed: true }])
})

test('PiAcpSession: confirm reports false when the user leaves it unchecked', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.elicitationResponse = { action: 'accept', content: { confirmed: false } }
  makeSession(conn, proc)

  proc.emit({ type: 'extension_ui_request', id: 'ui-2', method: 'confirm', title: 'Sure?', message: 'Really.' })
  await tick()

  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-2', confirmed: false }])
})

test('PiAcpSession: confirm falls back to permission when elicitation is unsupported', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.elicitationError = new Error('Method not found')
  conn.nextPermissionResponse = { outcome: { outcome: 'selected', optionId: 'yes' } }
  makeSession(conn, proc)

  proc.emit({ type: 'extension_ui_request', id: 'ui-2', method: 'confirm', title: 'Sure?', message: 'Really.' })
  await tick()

  assert.equal(conn.permissionRequests.length, 1)
  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-2', confirmed: true }])
})

// ---------------------------------------------------------------------------
// multi-select (the questionnaire's `ui.input` fallback)
// ---------------------------------------------------------------------------

const MULTI_TITLE = [
  '[Colors] Which colors do you like?',
  '',
  '1. Red — Warm and bold',
  '2. Blue — Calm and cool',
  '3. Green — Fresh and natural',
  '',
  'Enter the numbers of all that apply, comma-separated (e.g. "1,3").'
].join('\n')

test('PiAcpSession: multi-select input renders real checkboxes instead of a text box', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.elicitationResponse = {
    action: 'accept',
    content: { selection: ['choice-0', 'choice-2'] }
  }
  makeSession(conn, proc)

  proc.emit({
    type: 'extension_ui_request',
    id: 'ui-3',
    method: 'input',
    title: MULTI_TITLE,
    placeholder: '1,3; custom answer'
  })
  await tick()

  assert.equal(conn.elicitationRequests.length, 1)
  const req = conn.elicitationRequests[0] as any
  const selection = req.requestedSchema.properties.selection
  assert.equal(selection.type, 'array')
  // Options keep their label/description split so the client can render both.
  assert.deepEqual(selection.items.anyOf, [
    { const: 'choice-0', title: 'Red', description: 'Warm and bold' },
    { const: 'choice-1', title: 'Blue', description: 'Calm and cool' },
    { const: 'choice-2', title: 'Green', description: 'Fresh and natural' }
  ])
  // The preamble keeps the question text but must not repeat the option list.
  assert.match(req.message, /Which colors do you like\?/)
  assert.doesNotMatch(req.message, /1\. Red/)
  // A freeform escape hatch must remain available.
  assert.equal(req.requestedSchema.properties.custom.type, 'string')
  // Back to pi in the grammar the questionnaire actually parses.
  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-3', value: '1,3' }])
})

test('PiAcpSession: multi-select combines a custom answer with the selection', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.elicitationResponse = {
    action: 'accept',
    content: { selection: ['choice-1'], custom: '  teal  ' }
  }
  makeSession(conn, proc)

  proc.emit({
    type: 'extension_ui_request',
    id: 'ui-3',
    method: 'input',
    title: MULTI_TITLE,
    placeholder: '1,3; custom answer'
  })
  await tick()

  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-3', value: '2; teal' }])
})

test('PiAcpSession: multi-select accepts custom text when nothing is checked', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.elicitationResponse = { action: 'accept', content: { selection: [], custom: 'magenta' } }
  makeSession(conn, proc)

  proc.emit({
    type: 'extension_ui_request',
    id: 'ui-3',
    method: 'input',
    title: MULTI_TITLE,
    placeholder: '1,3; custom answer'
  })
  await tick()

  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-3', value: 'magenta' }])
})

test('PiAcpSession: an ordinary input is still a plain text field', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  conn.elicitationResponse = { action: 'accept', content: { value: 'typed' } }
  makeSession(conn, proc)

  // Not a multi-select: the placeholder differs, so no checkbox parsing happens.
  proc.emit({
    type: 'extension_ui_request',
    id: 'ui-4',
    method: 'input',
    title: 'Type your answer:',
    placeholder: ''
  })
  await tick()

  const req = conn.elicitationRequests[0] as any
  assert.equal(req.requestedSchema.properties.value.type, 'string')
  assert.equal(req.requestedSchema.properties.selection, undefined)
  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-4', value: 'typed' }])
})

test('PiAcpSession: input is cancelled when the client cannot elicit and it is not multi-select', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  makeSession(conn, proc, false)

  proc.emit({ type: 'extension_ui_request', id: 'ui-5', method: 'input', title: 'Type your answer:' })
  await tick()

  assert.equal(conn.elicitationRequests.length, 0)
  assert.deepEqual(proc.extensionUiResponses, [{ id: 'ui-5', cancelled: true }])
})
