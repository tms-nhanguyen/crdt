import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Stage, Layer, Line, Circle, Text, Group } from 'react-konva'
import { nanoid } from 'nanoid'
import { WebsocketProvider } from 'y-websocket'

type Stroke = {
  points: number[]
  color: string
  user: string
}

type AwarenessState = {
  name: string
  color: string
  cursor?: { x: number; y: number } | null
  draft?: { points: number[]; color: string } | null
}

function getQueryParam(name: string, defaultValue: string): string {
  const params = new URLSearchParams(window.location.search)
  return params.get(name) || defaultValue
}

function randomColor(seed?: string): string {
  const base = seed
    ? Array.from(seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    : Math.floor(Math.random() * 360)
  const hue = base % 360
  return `hsl(${hue}, 80%, 45%)`
}

function loadOrCreate<T>(key: string, create: () => T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {}
  const value = create()
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
  return value
}

export default function App() {
  const room = useMemo(() => getQueryParam('room', 'public'), [])

  const [userName, setUserName] = useState(
    loadOrCreate<string>('wb:name', () => `user-${nanoid(4)}`)
  )
  const [userColor] = useState(
    loadOrCreate<string>('wb:color', () => randomColor(nanoid(6)))
  )

  useEffect(() => {
    try {
      localStorage.setItem('wb:name', JSON.stringify(userName))
    } catch {}
  }, [userName])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight - 56 })

  useEffect(() => {
    function onResize() {
      setStageSize({ width: window.innerWidth, height: window.innerHeight - 56 })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const ydocRef = useRef<Y.Doc>(null)
  const providerRef = useRef<WebsocketProvider>(null)
  const strokesYArrayRef = useRef<Y.Array<Stroke>>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])

  const [isDrawing, setIsDrawing] = useState(false)
  const [draftPoints, setDraftPoints] = useState<number[]>([])

  useEffect(() => {
    const doc = new Y.Doc()
    const provider = new WebsocketProvider('ws://localhost:1234', room, doc)


    const strokesArray = doc.getArray<Stroke>('strokes')
    ydocRef.current = doc
    providerRef.current = provider
    strokesYArrayRef.current = strokesArray

    setStrokes(strokesArray.toArray())

    const updateHandler = () => {
      setStrokes(strokesArray.toArray())
    }
    strokesArray.observe(updateHandler)

    provider.awareness.setLocalStateField('user', { name: userName, color: userColor })
    provider.awareness.setLocalStateField('cursor', null)
    provider.awareness.setLocalStateField('draft', null)

    return () => {
      strokesArray.unobserve(updateHandler)
      provider.destroy()
      doc.destroy()
    }
  }, [room])

  useEffect(() => {
    const provider = providerRef.current
    if (!provider) return
    provider.awareness.setLocalStateField('user', { name: userName, color: userColor })
  }, [userName, userColor])

  const handleMouseDown = (e: any) => {
    setIsDrawing(true)
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const pts = [pos.x, pos.y]
    setDraftPoints(pts)
    providerRef.current?.awareness.setLocalStateField('draft', {
      points: pts,
      color: userColor
    })
  }

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (pos) {
      providerRef.current?.awareness.setLocalStateField('cursor', { x: pos.x, y: pos.y })
    }
    if (!isDrawing || !pos) return
    setDraftPoints(prev => {
      const next = prev.concat([pos.x, pos.y])
      providerRef.current?.awareness.setLocalStateField('draft', {
        points: next,
        color: userColor
      })
      return next
    })
  }

  const logStrokeData = async (stroke: Stroke) => {
    try {
      const logData = {
        timestamp: new Date().toISOString(),
        action: 'stroke_completed',
        stroke: {
          points: stroke.points,
          color: stroke.color,
          user: stroke.user,
          pointCount: stroke.points.length / 2
        },
        documentState: {
          totalStrokes: strokesYArrayRef.current?.length || 0,
          room: room,
          clientId: providerRef.current?.awareness.clientID
        }
      }
      
      console.log('=== Stroke Completed ===')
      console.log(JSON.stringify(logData, null, 2))
      console.log('========================')
      
      // Send to API server
      await fetch('http://localhost:3000/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logData)
      }).catch(error => {
        console.warn('Failed to send log to API server:', error)
      })
      
    } catch (error) {
      console.error('Error logging stroke data:', error)
    }
  }

  const handleMouseUp = () => {
    if (isDrawing && draftPoints.length >= 2) {
      const stroke: Stroke = { points: draftPoints, color: userColor, user: userName }
      const yarr = strokesYArrayRef.current
      if (yarr) {
        yarr.push([stroke])
        // Log the completed stroke
        logStrokeData(stroke)
      }
    }
    setIsDrawing(false)
    setDraftPoints([])
    providerRef.current?.awareness.setLocalStateField('draft', null)
  }

  const logClearAction = async () => {
    try {
      const logData = {
        timestamp: new Date().toISOString(),
        action: 'canvas_cleared',
        user: userName,
        documentState: {
          room: room,
          clientId: providerRef.current?.awareness.clientID
        }
      }
      
      console.log('=== Canvas Cleared ===')
      console.log(JSON.stringify(logData, null, 2))
      console.log('=====================')
      
      await fetch('http://localhost:3000/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logData)
      }).catch(error => {
        console.warn('Failed to send clear log to API server:', error)
      })
      
    } catch (error) {
      console.error('Error logging clear action:', error)
    }
  }

  const handleClear = () => {
    const yarr = strokesYArrayRef.current
    if (!yarr) return
    if (yarr.length > 0) {
      yarr.delete(0, yarr.length)
      // Log the clear action
      logClearAction()
    }
  }

  const [awarenessSeq, setAwarenessSeq] = useState(0)
  useEffect(() => {
    const provider = providerRef.current
    if (!provider) return
    const onChange = () => setAwarenessSeq(s => s + 1)
    provider.awareness.on('change', onChange)
    return () => provider.awareness.off('change', onChange)
  }, [])

  const remoteStates = useMemo(() => {
    const provider = providerRef.current
    if (!provider) return [] as Array<{ id: number; state: AwarenessState }>
    const states = Array.from(provider.awareness.getStates().entries()) as Array<[
      number,
      any
    ]>
    return states
      .filter(([id]) => id !== provider.awareness.clientID)
      .map(([id, raw]) => {
        const name: string = raw?.user?.name ?? 'user'
        const color: string = raw?.user?.color ?? '#000'
        const cursor = raw?.cursor as AwarenessState['cursor']
        const draft = raw?.draft as AwarenessState['draft']
        return { id, state: { name, color, cursor, draft } }
      })
  }, [awarenessSeq])


  // Periodic logging of document state
  useEffect(() => {
    const logPeriodicState = async () => {
      try {
        const logData = {
          timestamp: new Date().toISOString(),
          action: 'periodic_state_log',
          documentState: {
            totalStrokes: strokesYArrayRef.current?.length || 0,
            room: room,
            clientId: providerRef.current?.awareness.clientID,
            userName: userName,
            connectedUsers: remoteStates.length + 1
          },
          awareness: {
            localUser: { name: userName, color: userColor },
            remoteUsers: remoteStates.map(({ state }) => ({
              name: state.name,
              color: state.color,
              hasCursor: !!state.cursor,
              isDrawing: !!state.draft
            }))
          }
        }
        
        console.log('=== Periodic State Log ===')
        console.log(JSON.stringify(logData, null, 2))
        console.log('==========================')
        
        await fetch('http://localhost:3000/log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(logData)
        }).catch(error => {
          console.warn('Failed to send periodic log to API server:', error)
        })
        
      } catch (error) {
        console.error('Error logging periodic state:', error)
      }
    }

    const interval = setInterval(logPeriodicState, 10000) // Every 10 seconds
    return () => clearInterval(interval)
  }, [room, userName, userColor, remoteStates])

  const toolbarHeight = 56

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', background: '#fff', color: '#111', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: toolbarHeight, borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12 }}>
        <div style={{ fontWeight: 600 }}>Room: {room}</div>
        <input
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Your name"
          style={{ border: '1px solid #ccc', padding: '6px 8px', borderRadius: 4, background: '#fff', color: '#111' }}
        />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: userColor, border: '1px solid #00000020' }} />
          <span style={{ fontSize: 12, color: '#666' }}>You</span>
      </div>
        <button onClick={handleClear} style={{ marginLeft: 'auto', border: '1px solid #111', background: '#fff', color: '#111', padding: '8px 12px', borderRadius: 4 }}>
          Clear
        </button>
      </div>
      <div style={{ flex: 1 }}>
        <Stage
          width={stageSize.width}
          height={stageSize.height}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          style={{ cursor: 'crosshair', background: '#fff' }}
        >
          <Layer>
            {strokes.map((s, idx) => (
              <Line
                key={idx}
                points={s.points}
                stroke={s.color}
                strokeWidth={3}
                tension={0.4}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation="source-over"
              />
            ))}

            {draftPoints.length > 1 && (
              <Line
                points={draftPoints}
                stroke={userColor}
                strokeWidth={3}
                tension={0.4}
                lineCap="round"
                lineJoin="round"
                opacity={0.8}
              />
            )}

            {remoteStates.map(({ id, state }) => (
              <Group key={id}>
                {state.draft?.points && state.draft.points.length > 1 && (
                  <Line
                    points={state.draft.points}
                    stroke={state.draft.color}
                    strokeWidth={3}
                    tension={0.4}
                    lineCap="round"
                    lineJoin="round"
                    opacity={0.6}
                  />
                )}
              </Group>
            ))}
          </Layer>

          <Layer>
            {remoteStates.map(({ id, state }) => {
              if (!state.cursor) return null
              const { x, y } = state.cursor
              const name = state.name
              const color = state.color
              return (
                <Group key={`cursor-${id}`} x={x} y={y}>
                  <Circle x={0} y={0} radius={4} fill={color} stroke="#00000020" strokeWidth={1} />
                  <Text
                    x={8}
                    y={-8}
                    text={name}
                    fontSize={12}
                    fill={'#111'}
                    padding={2}
                  />
                </Group>
              )
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
