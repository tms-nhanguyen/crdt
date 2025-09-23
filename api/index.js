import express from 'express'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const app = express()

app.use(express.json())

const doc = new Y.Doc();
const yArray = doc.getArray('shared-array')

let provider = null
const LOG_INTERVAL = 3000

function connectWebSocketProvider() {
  try {
    provider = new WebsocketProvider('ws://localhost:1234', 'api-logger', doc)
    
    provider.on('status', (event) => {
      console.log('WebsocketProvider status:', event.status)
    })

    provider.on('sync', (isSynced) => {
      if (isSynced) {
        console.log('Document synced with y-websocket server')
      }
    })

    provider.on('connection-error', (event) => {
      console.error('WebsocketProvider connection error:', event)
    })

    provider.on('connection-close', (event) => {
      console.log('WebsocketProvider connection closed:', event)
    })

    // Listen to document updates
    doc.on('update', (update, origin) => {
      if (origin !== provider) {
        console.log('Document updated from external source')
      }
    })

  } catch (error) {
    console.error('Error creating WebsocketProvider:', error)
  }
}

function logData() {
  const data = {
    timestamp: new Date().toISOString(),
    documentSize: doc.getXmlFragment().length,
    arrayLength: yArray.length,
    arrayData: yArray.toArray(),
    stateVector: Y.encodeStateVector(doc)
  }
  
  console.log('=== CRDT Data Log ===')
  console.log(JSON.stringify(data, null, 2))
  console.log('====================')
}

app.get('/', (req, res) => {
  const update = Y.encodeStateAsUpdate(doc)
  res.send(update)
})

app.get('/data', (req, res) => {
  const data = {
    timestamp: new Date().toISOString(),
    arrayData: yArray.toArray(),
    documentSize: doc.getXmlFragment().length
  }
  res.json(data)
})

app.post('/log', (req, res) => {
  try {
    const logData = req.body
    console.log('=== Client Log Received ===')
    console.log(JSON.stringify(logData, null, 2))
    console.log('===========================')
    
    res.json({ success: true, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Error processing log:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.listen(3000, () => {
  console.log('API Server is running on port 3000')
  console.log('Connecting to y-websocket server...')
  
  connectWebSocketProvider()
  
  setInterval(logData, LOG_INTERVAL)
  console.log(`Started periodic logging every ${LOG_INTERVAL}ms`)
})