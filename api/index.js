import express from 'express'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import WebSocket from 'ws'
import fs from 'fs'
import db from './db.json' assert { type: 'json' }
global.WebSocket = WebSocket

const app = express()

app.use(express.json())

const doc = new Y.Doc();
const yArray = doc.getArray('strokes')

let provider = null

function clearAllData() {
  doc.destroy()
  yArray.delete(0, yArray.length)
  yArray.insert(0, db.strokes)
  console.log('Cleared all data')
  console.log(doc.isDestroyed)
}

function connectWebSocketProvider() {
  try {
    provider = new WebsocketProvider('ws://localhost:1234', 'public2', doc)
    
    provider.on('status', (event) => {
      console.log('WebsocketProvider status:', event.status)
    })

    provider.on('sync', (isSynced) => {
      console.log('Document sync status:', isSynced)
      if (isSynced) {
        console.log('Document synced with y-websocket server')
        console.log('Current strokes count after sync:', yArray.length)
        console.log('Current strokes:', yArray.toArray())
      }
    })

    provider.on('connection-error', (event) => {
      console.error('WebsocketProvider connection error:', event)
    })

    provider.on('connection-close', (event) => {
      console.log('WebsocketProvider connection closed:', event)
    })

    // Listen to strokes array updates
    yArray.observe((event) => {
      console.log('=== Strokes Array Updated ===')
      console.log('Added:', event.changes.added.size)
      console.log('Deleted:', event.changes.deleted.size)
      console.log('Current strokes count:', yArray.length)
      console.log('Latest strokes:', yArray.toArray().slice(-3))
      console.log('============================')
    })

    doc.on('update', (update, origin) => {
      console.log('Document update received, origin:', origin === provider ? 'provider' : 'external')
      console.log('Update size:', update.length, 'bytes')
      if (origin !== provider) {
        console.log('Document updated from external source (client)')
        console.log('Current strokes after external update:', yArray.length)
      }
    })

  } catch (error) {
    console.error('Error creating WebsocketProvider:', error)
  }
}

app.get('/', (req, res) => {
  const update = Y.encodeStateAsUpdate(doc)
  res.send(update)
})

app.get('/data', (req, res) => {
  const data = db
  res.json(data)
})


// app.post('/clear', (req, res) => {
//   clearAllData()
//   res.send('All data cleared')
// })

app.listen(3000, () => {
  console.log('API Server is running on port 3000')
  console.log('Connecting to y-websocket server...')
  clearAllData()
  connectWebSocketProvider()
})