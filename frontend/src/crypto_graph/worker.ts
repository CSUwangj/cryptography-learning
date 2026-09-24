import { executeWorkerRequest, type CompiledGraph, type WorkerRequest } from './index'

const compiledGraphs = new Map<string, CompiledGraph>()
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  self.postMessage(executeWorkerRequest(event.data, compiledGraphs))
})
