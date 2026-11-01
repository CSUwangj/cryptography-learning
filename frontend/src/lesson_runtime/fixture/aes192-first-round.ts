import { parse, stringify } from 'yaml'

// Keep real first-batch lineage and first-round AES transforms for interaction tests.
export const firstAes192RoundLesson = (source: string): string => {
  const lesson = parse(source)
  const scheduleNodes = new Set(['key', 'rot-0', 'sub-0', 'rcon-0', 'batch-0', 'round-key-0', 'round-key-1', 'round-key-2'])
  const cipherNodes = new Set(['plaintext', 'round-key-0', 'add-round-key-0', 'sub-bytes-1', 'shift-rows-1', 'mix-columns-1', 'round-key-1', 'add-round-key-1'])
  const schedule = lesson.graphs.schedule
  schedule.nodes = schedule.nodes.filter((node: { id: string }) => scheduleNodes.has(node.id))
  schedule.outputs = schedule.outputs.filter((output: { node: string }) => scheduleNodes.has(output.node))
  lesson.graphs.cipher.nodes = lesson.graphs.cipher.nodes.filter((node: { id: string }) => cipherNodes.has(node.id))
  lesson.graphs.cipher.outputs = [{ node: 'add-round-key-1', port: 'value' }]
  lesson.steps[1].execute.bindings = Object.fromEntries(Object.entries(lesson.steps[1].execute.bindings)
    .filter(([target]) => cipherNodes.has(target.split('.')[0])))
  return stringify(lesson)
}
