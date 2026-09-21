import { executeWorkerRequest, type WorkerRequest } from './index'

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  self.postMessage(executeWorkerRequest(event.data))
})
