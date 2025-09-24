import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Stage, Layer, Rect, Text, Group, Ellipse, Image as KonvaImage, Line } from 'react-konva'
import { nanoid } from 'nanoid'
import { WebsocketProvider } from 'y-websocket'
import { getQueryParam, loadOrCreate, randomColor } from './utils'
import Modal from './components/Modal'
import useImage from 'use-image'

export default function App() {
  const room = useMemo(() => getQueryParam('room', 'public3'), [])
  const [fishImage] = useImage('/fish.png')

  const [userName, setUserName] = useState(
    loadOrCreate<string>('fish:name', () => `user-${nanoid(4)}`)
  )

  const [myColor] = useState(
    loadOrCreate<string>('fish:color', () => randomColor())
  )

  useEffect(() => {
    try {
      localStorage.setItem('fish:name', JSON.stringify(userName))
    } catch { }
  }, [userName])

  useEffect(() => {
    try {
      localStorage.setItem('fish:color', JSON.stringify(myColor))
    } catch { }
  }, [myColor])

  const [stageSize, setStageSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 64
  })

  const [showDrawingModal, setShowDrawingModal] = useState(false)
  const lastActivityRef = useRef<number>(Date.now())
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [animationEnabled] = useState(true)
  const [wavePhase, setWavePhase] = useState(0)
  const [bubblePhase, setBubblePhase] = useState(0)

  useEffect(() => {
    if (userName && myColor) {
      setShowDrawingModal(false)
    }
    setIsRendering(true)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (animationEnabled) {
        setWavePhase(prev => prev + 0.025)
        setBubblePhase(prev => prev + 0.01)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [animationEnabled])

  const handleChangeUserName = useCallback((name: string) => {
    setUserName(name)
  }, [])

  const handleSaveSkin = useCallback((dataUrl: string) => {
    const arr = fishArrayRef.current
    const id = myFishIdRef.current
    if (!arr || !id) return
    const items = arr.toArray()
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        const next: Fish = { ...items[i], skin: dataUrl }
        arr.delete(i, 1)
        arr.insert(i, [next])
        break
      }
    }
    setShowDrawingModal(false)
  }, [])

  useEffect(() => {
    const onResize = () => {
      setStageSize({ width: window.innerWidth, height: window.innerHeight - 64 })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const fishArrayRef = useRef<Y.Array<Fish> | null>(null)
  const foodMapRef = useRef<Y.Map<Food> | null>(null)
  const scoresArrayRef = useRef<Y.Array<Score> | null>(null)

  const [fishes, setFishes] = useState<Fish[]>([])
  const [food, setFood] = useState<Food | null>(null)
  const [scores, setScores] = useState<Score[]>([])
  const myFishIdRef = useRef<string | null>(null)
  const prevNameRef = useRef<string>(userName)
  const renderStateRef = useRef<Map<string, {
    x: number;
    y: number;
    dx: number;
    dy: number;
    swimPhase: number;
    swimAmplitude: number;
    swimFrequency: number;
    directionChangeTimer: number;
    baseSpeed: number;
    currentSpeed: number;
    targetDx: number;
    targetDy: number;
  }>>(new Map())

  const getStoredFishId = () => {
    try {
      return JSON.parse(localStorage.getItem('fish:id') || 'null') as string | null
    } catch {
      return null
    }
  }

  const setStoredFishId = (id: string | null) => {
    try {
      if (id) localStorage.setItem('fish:id', JSON.stringify(id))
      else localStorage.removeItem('fish:id')
    } catch { }
  }

  const removeMyFish = useCallback(() => {
    const arr = fishArrayRef.current
    const id = myFishIdRef.current
    if (!arr || !id) return

    const items = arr.toArray()
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].id === id) {
        arr.delete(i, 1)
        break
      }
    }
    myFishIdRef.current = null
    setStoredFishId(null)
  }, [])

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now()

    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current)
    }

    inactivityTimeoutRef.current = setTimeout(() => {
      removeMyFish()
    }, 300000)
  }, [removeMyFish])

  const checkCollision = useCallback((fish: Fish, food: Food) => {
    const distance = Math.sqrt(
      Math.pow(fish.x - food.x, 2) + Math.pow(fish.y - food.y, 2)
    )
    return distance < (18 + food.radius)
  }, [])

  const spawnFood = useCallback(() => {
    const foodMap = foodMapRef.current
    if (!foodMap) return

    const width = Math.max(100, stageSize.width)
    const height = Math.max(100, stageSize.height)
    const radius = 8
    const x = Math.random() * (width - radius * 2) + radius
    const y = Math.random() * (height - radius * 2) + radius

    const newFood: Food = {
      id: nanoid(),
      x,
      y,
      radius
    }

    foodMap.set('current', newFood)
  }, [stageSize])

  const handleFishEatFood = useCallback((_fishId: string, fishOwner: string) => {
    const scoresArray = scoresArrayRef.current
    if (!scoresArray) return

    const currentScores = scoresArray.toArray()
    const existingScoreIndex = currentScores.findIndex(s => s.owner === fishOwner)

    if (existingScoreIndex >= 0) {
      const updatedScore = { ...currentScores[existingScoreIndex], points: currentScores[existingScoreIndex].points + 1 }
      scoresArray.delete(existingScoreIndex, 1)
      scoresArray.insert(existingScoreIndex, [updatedScore])
    } else {
      scoresArray.push([{ owner: fishOwner, points: 1 }])
    }

    // Spawn new food
    spawnFood()
  }, [spawnFood])


  const memoizedFishArray = useMemo(() => {
    const uniqueFishes = new Set(fishes.map(f => f.id))
    return Array.from(uniqueFishes).map(id => fishes.find(f => f.id === id)).filter(f => f !== undefined) as Fish[]
  }, [fishes])

  useEffect(() => {
    const doc = new Y.Doc()
    const provider = new WebsocketProvider('ws://crdt.railway.internal', room, doc)
    const fishArray = doc.getArray<Fish>('fishes')
    const foodMap = doc.getMap<Food>('food')
    const scoresArray = doc.getArray<Score>('scores')

    ydocRef.current = doc
    providerRef.current = provider
    fishArrayRef.current = fishArray
    foodMapRef.current = foodMap
    scoresArrayRef.current = scoresArray

    const handleUpdate = (event: Y.YArrayEvent<Fish>) => {
      const arrSnap = fishArray.toArray()
      setFishes(arrSnap)

      const ids = new Set(arrSnap.map(f => f.id))
      const map = renderStateRef.current
      for (const key of Array.from(map.keys())) {
        if (!ids.has(key)) map.delete(key)
      }

      let index = 0
      for (const d of event.changes.delta) {
        if ((d as any).retain != null) {
          index += (d as any).retain as number
        }
        if ((d as any).insert != null) {
          const inserted = (d as any).insert as Fish[]
          for (let i = 0; i < inserted.length; i++) {
            const f = arrSnap[index + i]
            if (f) {
              map.set(f.id, {
                x: f.x,
                y: f.y,
                dx: f.dx,
                dy: f.dy,
                swimPhase: f.swimPhase || Math.random() * Math.PI * 2,
                swimAmplitude: f.swimAmplitude || 0.1 + Math.random() * 0.2,
                swimFrequency: f.swimFrequency || 0.02 + Math.random() * 0.03,
                directionChangeTimer: f.directionChangeTimer || 120 + Math.random() * 180,
                baseSpeed: f.baseSpeed || 0.4 + Math.random() * 0.4,
                currentSpeed: f.currentSpeed || f.baseSpeed || 1.2 + Math.random() * 1.2,
                targetDx: f.targetDx || f.dx,
                targetDy: f.targetDy || f.dy
              })
            }
          }
          index += inserted.length
        }
      }
      if (event.changes.delta.length === 0 && map.size === 0) {
        for (const f of arrSnap) {
          map.set(f.id, {
            x: f.x,
            y: f.y,
            dx: f.dx,
            dy: f.dy,
            swimPhase: f.swimPhase || Math.random() * Math.PI * 2,
            swimAmplitude: f.swimAmplitude || 0.1 + Math.random() * 0.2,
            swimFrequency: f.swimFrequency || 0.02 + Math.random() * 0.03,
            directionChangeTimer: f.directionChangeTimer || 120 + Math.random() * 180,
            baseSpeed: f.baseSpeed || 1.2 + Math.random() * 1.2,
            currentSpeed: f.currentSpeed || f.baseSpeed || 1.2 + Math.random() * 1.2,
            targetDx: f.targetDx || f.dx,
            targetDy: f.targetDy || f.dy
          })
        }
      }
    }

    const handleFoodUpdate = () => {
      const currentFood = foodMap.get('current')
      setFood(currentFood || null)
    }

    const handleScoresUpdate = () => {
      const scoresSnap = scoresArray.toArray()
      setScores(scoresSnap)
    }

    fishArray.observe(handleUpdate)
    foodMap.observe(handleFoodUpdate)
    scoresArray.observe(handleScoresUpdate)

    const initial = fishArray.toArray()
    setFishes(initial)

    const initialFood = foodMap.get('current')
    setFood(initialFood || null)

    const initialScores = scoresArray.toArray()
    setScores(initialScores)
    for (const f of initial) {
      renderStateRef.current.set(f.id, {
        x: f.x,
        y: f.y,
        dx: f.dx,
        dy: f.dy,
        swimPhase: f.swimPhase || Math.random() * Math.PI * 2,
        swimAmplitude: f.swimAmplitude || 0.3 + Math.random() * 0.4,
        swimFrequency: f.swimFrequency || 0.02 + Math.random() * 0.03,
        directionChangeTimer: f.directionChangeTimer || 120 + Math.random() * 180,
        baseSpeed: f.baseSpeed || 1.2 + Math.random() * 1.2,
        currentSpeed: f.currentSpeed || f.baseSpeed || 1.2 + Math.random() * 1.2,
        targetDx: f.targetDx || f.dx,
        targetDy: f.targetDy || f.dy
      })
    }

    const ensureSingleOnSync = (isSynced: boolean) => {
      if (!isSynced) return
      doc.transact(() => {
        const arr = fishArray
        const list = arr.toArray()
        const storedId = getStoredFishId()
        if (storedId) {
          const idx = list.findIndex(f => f.id === storedId)
          if (idx >= 0) {
            myFishIdRef.current = storedId
            const cur = arr.get(idx) as Fish
            const desired = { ...cur, owner: userName, color: myColor }
            if (cur.owner !== desired.owner || cur.color !== desired.color) {
              arr.delete(idx, 1)
              arr.insert(idx, [desired])
            }
          }
        }
        const mineIdx: number[] = []
        for (let i = 0; i < list.length; i++) if (list[i].owner === userName) mineIdx.push(i)
        if (mineIdx.length === 0) {
          const width = Math.max(100, stageSize.width)
          const height = Math.max(100, stageSize.height)
          const radius = 18
          const startX = Math.random() * (width - radius * 2) + radius
          const startY = Math.random() * (height - radius * 2) + radius
          const baseSpeed = 0.4 + Math.random() * 0.4
          const angle = Math.random() * Math.PI * 2
          const dx = Math.cos(angle) * baseSpeed
          const dy = Math.sin(angle) * baseSpeed
          const id = nanoid()
          myFishIdRef.current = id
          setStoredFishId(id)
          arr.push([{
            id,
            owner: userName,
            color: myColor,
            x: startX,
            y: startY,
            dx,
            dy,
            swimPhase: Math.random() * Math.PI * 2,
            swimAmplitude: 0.1 + Math.random() * 0.2,
            swimFrequency: 0.02 + Math.random() * 0.03,
            directionChangeTimer: 120 + Math.random() * 180,
            baseSpeed,
            currentSpeed: baseSpeed,
            targetDx: dx,
            targetDy: dy
          }])
        } else {
          const keepIdx = mineIdx[0]
          for (let k = mineIdx.length - 1; k >= 1; k--) arr.delete(mineIdx[k], 1)
          const keep = arr.get(keepIdx) as Fish
          myFishIdRef.current = keep.id
          setStoredFishId(keep.id)
          if (keep.owner !== userName || keep.color !== myColor) {
            const next = { ...keep, owner: userName, color: myColor }
            arr.delete(keepIdx, 1)
            arr.insert(keepIdx, [next])
          }
        }

        const currentFood = foodMap.get('current')
        if (!currentFood) {
          spawnFood()
        }
      })
    }
    provider.once('sync', ensureSingleOnSync)

    const onUnload = () => {
      removeMyFish()
    }

    const onUserActivity = () => {
      updateActivity()
    }

    const onWindowFocus = () => {
      updateActivity()
    }

    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('mousemove', onUserActivity)
    window.addEventListener('keydown', onUserActivity)
    window.addEventListener('click', onUserActivity)
    window.addEventListener('scroll', onUserActivity)

    updateActivity()

    heartbeatIntervalRef.current = setInterval(() => {
      updateActivity()
    }, 60000)

    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('mousemove', onUserActivity)
      window.removeEventListener('keydown', onUserActivity)
      window.removeEventListener('click', onUserActivity)
      window.removeEventListener('scroll', onUserActivity)

      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
      }

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }

      fishArray.unobserve(handleUpdate)
      foodMap.unobserve(handleFoodUpdate)
      scoresArray.unobserve(handleScoresUpdate)
      provider.off('sync', ensureSingleOnSync as any)
      provider.destroy()
      doc.destroy()
    }
  }, [room, updateActivity, spawnFood])

  useEffect(() => {
    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
      removeMyFish()
    }
  }, [removeMyFish])

  useEffect(() => {
    const arr = fishArrayRef.current
    if (!arr) return
    const items = arr.toArray()
    const myId = myFishIdRef.current || getStoredFishId()
    if (myId) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === myId) {
          const cur = items[i]
          if (cur.owner !== userName) {
            const next = { ...cur, owner: userName }
            arr.delete(i, 1)
            arr.insert(i, [next])
          }
          myFishIdRef.current = myId
          setStoredFishId(myId)
          prevNameRef.current = userName
          return
        }
      }
    }
    const ownerIdx = items.findIndex(f => f.owner === userName)
    if (ownerIdx >= 0) {
      myFishIdRef.current = items[ownerIdx].id
      setStoredFishId(items[ownerIdx].id)
    }
  }, [userName])

  useEffect(() => {
    const arr = fishArrayRef.current
    if (!arr) return
    const id = myFishIdRef.current
    if (!id) return
    const items = arr.toArray()
    const me = items.find(x => x.id === id)
    if (me && !me.skin && !isRendering) setShowDrawingModal(true)
  }, [fishes.length])


  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const arr = fishArrayRef.current
      const id = myFishIdRef.current
      const local = renderStateRef.current
      if (!arr || !local) return
      const items = arr.toArray()
      const width = Math.max(50, stageSize.width)
      const height = Math.max(50, stageSize.height)
      const radius = 18
      let wroteMine = false
      for (let i = 0; i < items.length; i++) {
        const f = items[i]
        const current = local.get(f.id) || {
          x: f.x,
          y: f.y,
          dx: f.dx,
          dy: f.dy,
          swimPhase: f.swimPhase || Math.random() * Math.PI * 2,
          swimAmplitude: f.swimAmplitude || 0.1 + Math.random() * 0.2,
          swimFrequency: f.swimFrequency || 0.02 + Math.random() * 0.03,
          directionChangeTimer: f.directionChangeTimer || 120 + Math.random() * 180,
          baseSpeed: f.baseSpeed || 1.2 + Math.random() * 1.2,
          currentSpeed: f.currentSpeed || f.baseSpeed || 1.2 + Math.random() * 1.2,
          targetDx: f.targetDx || f.dx,
          targetDy: f.targetDy || f.dy
        }

        let { x, y, dx, dy, swimPhase, swimAmplitude, swimFrequency, directionChangeTimer, baseSpeed, currentSpeed, targetDx, targetDy } = current

        swimPhase += swimFrequency

        directionChangeTimer--

        if (directionChangeTimer <= 0) {
          const randomValue = Math.random()
          if (randomValue < 0.3) {
            targetDx = dx
            targetDy = dy
          } else if (randomValue < 0.7) {
            targetDx = -dx
            targetDy = -dy
          } else {
            const changeAngle = (Math.random() - 0.5) * Math.PI * 0.33
            const currentAngle = Math.atan2(dy, dx)
            const newAngle = currentAngle + changeAngle
            targetDx = Math.cos(newAngle) * baseSpeed
            targetDy = Math.sin(newAngle) * baseSpeed
          }
          directionChangeTimer = 300 + Math.random() * 400
        }

        const turnSpeed = 0.02
        dx += (targetDx - dx) * turnSpeed
        dy += (targetDy - dy) * turnSpeed

        const movementAngle = Math.atan2(dy, dx)
        const perpendicularAngle = movementAngle + Math.PI / 2
        const waveOffsetX = Math.cos(perpendicularAngle) * Math.sin(swimPhase) * swimAmplitude * 0.5
        const waveOffsetY = Math.sin(perpendicularAngle) * Math.sin(swimPhase) * swimAmplitude * 0.5

        const speedVariation = 0.9 + 0.2 * Math.sin(swimPhase * 1.5)
        currentSpeed = baseSpeed * speedVariation

        x += dx * currentSpeed + waveOffsetX
        y += dy * currentSpeed + waveOffsetY

        if (x < radius) {
          x = radius
          if (Math.random() < 0.7) {
            targetDx = Math.abs(dx)
            targetDy = dy
          } else {
            targetDx = Math.abs(dx) + Math.random() * 0.2
            targetDy = dy
          }
          directionChangeTimer = 200 + Math.random() * 300
        }
        else if (x > width - radius) {
          x = width - radius
          if (Math.random() < 0.7) {
            targetDx = -Math.abs(dx)
            targetDy = dy
          } else {
            targetDx = -Math.abs(dx) - Math.random() * 0.2
            targetDy = dy
          }
          directionChangeTimer = 200 + Math.random() * 300
        }

        if (y < radius) {
          y = radius
          if (Math.random() < 0.7) {
            targetDx = dx
            targetDy = Math.abs(dy)
          } else {
            targetDx = dx
            targetDy = Math.abs(dy) + Math.random() * 0.2
          }
          directionChangeTimer = 200 + Math.random() * 300
        }
        else if (y > height - radius) {
          y = height - radius
          if (Math.random() < 0.7) {
            targetDx = dx
            targetDy = -Math.abs(dy)
          } else {
            targetDx = dx
            targetDy = -Math.abs(dy) - Math.random() * 0.2
          }
          directionChangeTimer = 200 + Math.random() * 300
        }

        local.set(f.id, {
          x,
          y,
          dx,
          dy,
          swimPhase,
          swimAmplitude,
          swimFrequency,
          directionChangeTimer,
          baseSpeed,
          currentSpeed,
          targetDx,
          targetDy
        })

        if (!wroteMine && id && f.id === id) {
          const next = {
            ...f,
            x,
            y,
            dx,
            dy,
            swimPhase,
            swimAmplitude,
            swimFrequency,
            directionChangeTimer,
            baseSpeed,
            currentSpeed,
            targetDx,
            targetDy
          }
          if (next.x !== f.x || next.y !== f.y || next.dx !== f.dx || next.dy !== f.dy ||
            next.swimPhase !== f.swimPhase || next.swimAmplitude !== f.swimAmplitude ||
            next.swimFrequency !== f.swimFrequency || next.directionChangeTimer !== f.directionChangeTimer ||
            next.baseSpeed !== f.baseSpeed || next.currentSpeed !== f.currentSpeed ||
            next.targetDx !== f.targetDx || next.targetDy !== f.targetDy) {
            arr.delete(i, 1)
            arr.insert(i, [next])
          }
          wroteMine = true
        }

        if (food && checkCollision(f, food)) {
          handleFishEatFood(f.id, f.owner)
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stageSize, food, checkCollision, handleFishEatFood])

  const toolbarHeight = 64

  const OceanBackground = useCallback(() => {
    const width = stageSize.width
    const height = stageSize.height

    const seaweedPositions = useMemo(() => {
      const seaweeds = []
      for (let i = 0; i < 8; i++) {
        seaweeds.push({
          x: (width / 8) * i + Math.random() * 50,
          height: 60 + Math.random() * 80,
          sway: Math.random() * Math.PI * 2
        })
      }
      return seaweeds
    }, [width])

    const bubblePositions = useMemo(() => {
      const bubbles = []
      for (let i = 0; i < 15; i++) {
        bubbles.push({
          x: Math.random() * width,
          y: height - Math.random() * height * 0.3,
          size: 2 + Math.random() * 4,
        })
      }
      return bubbles
    }, [width, height])

    return (
      <Group>
        <Rect x={0} y={0} width={width} height={height} fill="#87CEEB" />

        <Rect
          x={0}
          y={height - 40}
          width={width}
          height={40}
          fill="#F4A460"
        />

        {Array.from({ length: 20 }, (_, i) => (
          <Ellipse
            key={i}
            x={Math.random() * width}
            y={height - 20 + Math.random() * 20}
            radiusX={1 + Math.random() * 3}
            radiusY={0.5 + Math.random() * 1}
            fill="#DEB887"
            opacity={0.6}
          />
        ))}

        {seaweedPositions.map((seaweed, i) => (
          <Group key={i} x={seaweed.x} y={height - 40}>
            <Line
              points={[
                0, 0,
                Math.sin(wavePhase * 0.1 + seaweed.sway) * 2, -seaweed.height * 0.3,
                Math.sin(wavePhase * 0.1 + seaweed.sway + 0.5) * 3, -seaweed.height * 0.6,
                Math.sin(wavePhase * 0.1 + seaweed.sway + 1) * 1.5, -seaweed.height
              ]}
              stroke="#228B22"
              strokeWidth={3}
              lineCap="round"
            />
            <Line
              points={[
                5, 0,
                Math.sin(wavePhase * 0.1 + seaweed.sway + 0.3) * 1.5, -seaweed.height * 0.4,
                Math.sin(wavePhase * 0.1 + seaweed.sway + 0.8) * 2, -seaweed.height * 0.7,
                Math.sin(wavePhase * 0.1 + seaweed.sway + 1.2) * 1, -seaweed.height
              ]}
              stroke="#32CD32"
              strokeWidth={2}
              lineCap="round"
            />
          </Group>
        ))}

        {Array.from({ length: 3 }, (_, waveIndex) => (
          <Line
            key={waveIndex}
            points={Array.from({ length: width / 10 }, (_, i) => {
              const x = i * 10
              const y = 20 + waveIndex * 15 + Math.sin((x * 0.01) + wavePhase * 0.1 + waveIndex) * 4
              return [x, y]
            }).flat()}
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth={2 + waveIndex}
            lineCap="round"
          />
        ))}

        {bubblePositions.map((bubble, i) => (
          <Group key={i}>
            <Ellipse
              x={bubble.x + Math.sin(bubblePhase * 0.1 + i) * 1}
              y={bubble.y - (bubblePhase * 0.3 + i * 1) % (height + 50)}
              radiusX={bubble.size}
              radiusY={bubble.size}
              fill="rgba(255, 255, 255, 0.3)"
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth={0.5}
            />
            <Ellipse
              x={bubble.x + Math.sin(bubblePhase * 0.1 + i) * 1 - bubble.size * 0.3}
              y={bubble.y - (bubblePhase * 0.3 + i * 1) % (height + 50) - bubble.size * 0.3}
              radiusX={bubble.size * 0.3}
              radiusY={bubble.size * 0.3}
              fill="rgba(255, 255, 255, 0.8)"
            />
          </Group>
        ))}
      </Group>
    )
  }, [stageSize, wavePhase, bubblePhase])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: toolbarHeight,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 12px',
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        borderBottom: '2px solid #4a90e2',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap' }}>
          {scores.map((score, index) => (
            <div key={index} style={{
              fontSize: 13,
              color: '#fff',
              background: 'rgba(255,255,255,0.2)',
              padding: '4px 8px',
              borderRadius: 12,
              fontWeight: 500,
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)'
            }}>
              🐠 {score.owner}: {score.points} điểm
            </div>
          ))}
        </div>
        <button onClick={() => setShowDrawingModal(true)} style={{
          border: '2px solid #fff',
          background: 'rgba(255,255,255,0.2)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: 20,
          fontWeight: 500,
          textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}>🎨 Vẽ Cá</button>
      </div>
      <div style={{ flex: 1 }}>
        <Stage width={stageSize.width} height={stageSize.height} style={{ background: '#87CEEB' }}>
          <Layer>
            <OceanBackground />
            {food && (
              <Group x={food.x} y={food.y}>
                <Ellipse
                  x={0}
                  y={0}
                  radiusX={food.radius}
                  radiusY={food.radius}
                  fill="#FFD700"
                  stroke="#FFA500"
                  strokeWidth={2}
                />
                <Ellipse
                  x={-food.radius * 0.3}
                  y={-food.radius * 0.3}
                  radiusX={food.radius * 0.3}
                  radiusY={food.radius * 0.3}
                  fill="#FFF"
                  opacity={0.9}
                />
                <Ellipse
                  x={food.radius * 0.2}
                  y={-food.radius * 0.2}
                  radiusX={food.radius * 0.15}
                  radiusY={food.radius * 0.15}
                  fill="#FFF"
                  opacity={0.6}
                />
              </Group>
            )}
            {memoizedFishArray.map((f) => {
              const local = renderStateRef.current.get(f.id) || f
              const hasSkin = Boolean(f.skin)
              let img: HTMLImageElement | undefined
              if (hasSkin && f.skin) {
                const el = new window.Image()
                el.src = f.skin
                img = el
              }
              const rx = 22
              const ry = 12

              const rotation = Math.atan2(local.dy, local.dx) * (180 / Math.PI)

              return (
                <Group key={f.id} x={local.x} y={local.y} rotation={rotation}>
                  {hasSkin && img ? (
                    <KonvaImage
                      image={img}
                      x={-24}
                      y={-24}
                      width={48}
                      height={48}
                    />
                  ) : (
                    <KonvaImage
                      x={-24}
                      y={-24}
                      width={48}
                      height={48}
                      rotation={180}
                      image={fishImage}
                    />

                  )}
                  <Text x={-rx} y={-ry - 18} text={f.owner} fontSize={12} fill="#111" />
                </Group>
              )
            })}
          </Layer>
        </Stage>
      </div>
      <Modal
        open={showDrawingModal}
        onClose={() => setShowDrawingModal(false)}
        onSave={handleSaveSkin}
        userName={userName}
        onChangeUserName={handleChangeUserName}
      />
    </div>
  )
}
