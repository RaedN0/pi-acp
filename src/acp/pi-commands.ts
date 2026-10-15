import type { AvailableCommand } from '@agentclientprotocol/sdk'

export type PiRpcCommandInfo = {
  name?: unknown
  description?: unknown
  source?: unknown
  location?: unknown
  path?: unknown
}

/**
 * Guardrail: never advertise more than this many extension commands. Extensions can
 * register an unbounded number of commands; the picker is not built for that.
 */
export const EXTENSION_ITEMS_CAP = 100

function describeFallback(c: PiRpcCommandInfo): string {
  const source = typeof c.source === 'string' ? c.source : ''
  const location = typeof c.location === 'string' ? c.location : ''

  const parts: string[] = []
  if (source) parts.push(source)
  if (location) parts.push(location)

  return parts.length ? `(${parts.join(':')})` : '(command)'
}

export function toAvailableCommandsFromPiGetCommands(
  data: unknown,
  opts?: { enableSkillCommands?: boolean; includeExtensionCommands?: boolean }
): {
  commands: AvailableCommand[]
  raw: PiRpcCommandInfo[]
} {
  const enableSkillCommands = opts?.enableSkillCommands ?? true
  const includeExtensionCommands = opts?.includeExtensionCommands ?? true

  const root: any = data
  const commandsRaw: PiRpcCommandInfo[] = Array.isArray(root?.commands)
    ? root.commands
    : Array.isArray(root?.data?.commands)
      ? root.data.commands
      : []

  const out: AvailableCommand[] = []
  let extensionCount = 0

  for (const c of commandsRaw) {
    const name = typeof c?.name === 'string' ? c.name.trim() : ''
    if (!name) continue

    const source = typeof c?.source === 'string' ? c.source : ''
    const isExtension = source === 'extension'

    if (isExtension && !includeExtensionCommands) continue
    if (!enableSkillCommands && name.startsWith('skill:')) continue

    if (isExtension) {
      if (extensionCount >= EXTENSION_ITEMS_CAP) continue
      extensionCount += 1
    }

    const desc = typeof c?.description === 'string' ? c.description.trim() : ''

    out.push({
      name,
      description: desc || describeFallback(c)
    })
  }

  return { commands: out, raw: commandsRaw }
}

/** Names of extension-provided commands from a raw `get_commands` payload. */
export function extensionCommandNames(commands: PiRpcCommandInfo[]): string[] {
  const names: string[] = []

  for (const c of commands) {
    if (c?.source !== 'extension' || typeof c.name !== 'string') continue
    const name = c.name.trim()
    if (name) names.push(name)
  }

  return names
}
