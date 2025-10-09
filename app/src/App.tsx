import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Stage, Layer, Rect, Text, Group, Ellipse, Image as KonvaImage, Line } from 'react-konva'
import { nanoid } from 'nanoid'
import { WebsocketProvider } from 'y-websocket'
import { getQueryParam, loadOrCreate, randomColor } from './utils'
import Modal from './components/Modal'
import useImage from 'use-image'

export default function App() {
  const room = useMemo(() => getQueryParam('room', 'public-2'), [])
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
  const eatenFoodRef = useRef<Set<string>>(new Set())
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
    speedVariation: number;
    speedBoostTimer: number;
    swimmingStyle: 'normal' | 'fast' | 'slow' | 'erratic';
    styleChangeTimer: number;
    foodAttraction: boolean;
    sensingRange: number;
    foodSeekingTimer: number;
  }>>(new Map())
  const renderStateInitializedRef = useRef<Set<string>>(new Set())

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
  }, [])

  const checkCollision = useCallback((fish: Fish, food: Food) => {
    const distance = Math.sqrt(
      Math.pow(fish.x - food.x, 2) + Math.pow(fish.y - food.y, 2)
    )
    return distance < (18 + food.radius)
  }, [])

  const spawnFood = useCallback(() => {
    const foodMap = foodMapRef.current
    if (!foodMap) return

    const width = Math.max(100, window.innerWidth)
    const height = Math.max(100, window.innerHeight - 64)
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
    eatenFoodRef.current.clear()
  }, [])

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
    const provider = new WebsocketProvider('wss://crdt-production.up.railway.app', room, doc)
    const fishArray = doc.getArray<Fish>('fishes')
    const foodMap = doc.getMap<Food>('food')
    const scoresArray = doc.getArray<Score>('scores')

    // Preserve existing render state
    const preservedRenderState = new Map(renderStateRef.current)
    const preservedInitializedSet = new Set(renderStateInitializedRef.current)

    ydocRef.current = doc
    providerRef.current = provider
    fishArrayRef.current = fishArray
    foodMapRef.current = foodMap
    scoresArrayRef.current = scoresArray

    // Restore preserved render state
    renderStateRef.current = preservedRenderState
    renderStateInitializedRef.current = preservedInitializedSet

    const handleUpdate = (event: Y.YArrayEvent<Fish>) => {
      const arrSnap = fishArray.toArray()

      // Remove duplicate users by ID - keep the latest one
      const uniqueFishes = new Map<string, Fish>()
      for (const fish of arrSnap) {
        if (!uniqueFishes.has(fish.id) || fish.owner === userName) {
          uniqueFishes.set(fish.id, fish)
        }
      }

      // Update the array with unique fishes
      const uniqueFishArray = Array.from(uniqueFishes.values())
      if (uniqueFishArray.length !== arrSnap.length) {
        fishArray.delete(0, arrSnap.length)
        fishArray.insert(0, uniqueFishArray)
        return
      }

      setFishes(uniqueFishArray)

      const ids = new Set(uniqueFishArray.map(f => f.id))
      const map = renderStateRef.current
      const initializedSet = renderStateInitializedRef.current
      for (const key of Array.from(map.keys())) {
        if (!ids.has(key)) {
          map.delete(key)
          initializedSet.delete(key)
        }
      }

      let index = 0
      for (const d of event.changes.delta) {
        if ((d as any).retain != null) {
          index += (d as any).retain as number
        }
        if ((d as any).insert != null) {
          const inserted = (d as any).insert as Fish[]
          for (let i = 0; i < inserted.length; i++) {
            const f = uniqueFishArray[index + i]
            if (f) {
              const existingState = map.get(f.id)
              if (!existingState) {
                const swimmingStyle = f.swimmingStyle || ['normal', 'fast', 'slow', 'erratic'][Math.floor(Math.random() * 4)] as 'normal' | 'fast' | 'slow' | 'erratic'
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
                  targetDy: f.targetDy || f.dy,
                  speedVariation: f.speedVariation || 0.3 + Math.random() * 0.4,
                  speedBoostTimer: f.speedBoostTimer || Math.random() * 300 + 200,
                  swimmingStyle,
                  styleChangeTimer: Math.random() * 600 + 400,
                  foodAttraction: f.foodAttraction ?? true,
                  sensingRange: f.sensingRange || 80 + Math.random() * 60,
                  foodSeekingTimer: f.foodSeekingTimer || Math.random() * 200 + 100
                })
                renderStateInitializedRef.current.add(f.id)
              } else {
                const myFishId = myFishIdRef.current
                if (f.id !== myFishId) {
                  existingState.dx = f.dx
                  existingState.dy = f.dy
                  existingState.baseSpeed = f.baseSpeed || existingState.baseSpeed
                  existingState.currentSpeed = f.currentSpeed || existingState.currentSpeed
                  existingState.targetDx = f.targetDx || existingState.targetDx
                  existingState.targetDy = f.targetDy || existingState.targetDy
                }
              }
            }
          }
          index += inserted.length
        }
      }
      if (event.changes.delta.length === 0 && map.size === 0) {
        for (const f of uniqueFishArray) {
          const existingState = map.get(f.id)
          if (!existingState) {
            const swimmingStyle = f.swimmingStyle || ['normal', 'fast', 'slow', 'erratic'][Math.floor(Math.random() * 4)] as 'normal' | 'fast' | 'slow' | 'erratic'
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
              targetDy: f.targetDy || f.dy,
              speedVariation: f.speedVariation || 0.3 + Math.random() * 0.4,
              speedBoostTimer: f.speedBoostTimer || Math.random() * 300 + 200,
              swimmingStyle,
              styleChangeTimer: Math.random() * 600 + 400,
              foodAttraction: f.foodAttraction ?? true,
              sensingRange: f.sensingRange || 80 + Math.random() * 60,
              foodSeekingTimer: f.foodSeekingTimer || Math.random() * 200 + 100
            })
            renderStateInitializedRef.current.add(f.id)
          }
        }
      }
    }

    const handleFoodUpdate = () => {
      const currentFood = foodMap.get('current')
      setFood(currentFood || null)
      if (currentFood) {
        eatenFoodRef.current.clear()
      }
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
      const existingState = renderStateRef.current.get(f.id)
      if (!existingState) {
        const swimmingStyle = f.swimmingStyle || ['normal', 'fast', 'slow', 'erratic'][Math.floor(Math.random() * 4)] as 'normal' | 'fast' | 'slow' | 'erratic'
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
          targetDy: f.targetDy || f.dy,
          speedVariation: f.speedVariation || 0.3 + Math.random() * 0.4,
          speedBoostTimer: f.speedBoostTimer || Math.random() * 300 + 200,
          swimmingStyle,
          styleChangeTimer: Math.random() * 600 + 400,
          foodAttraction: f.foodAttraction ?? true,
          sensingRange: f.sensingRange || 80 + Math.random() * 60,
          foodSeekingTimer: f.foodSeekingTimer || Math.random() * 200 + 100
        })
        renderStateInitializedRef.current.add(f.id)
      }
    }

    const ensureSingleOnSync = (isSynced: boolean) => {
      if (!isSynced) return
      doc.transact(() => {
        const arr = fishArray
        const list = arr.toArray()

        // Remove duplicate users by ID - keep the latest one
        const uniqueFishes = new Map<string, Fish>()
        for (const fish of list) {
          if (!uniqueFishes.has(fish.id) || fish.owner === userName) {
            uniqueFishes.set(fish.id, fish)
          }
        }

        // Update the array with unique fishes if duplicates found
        const uniqueFishArray = Array.from(uniqueFishes.values())
        if (uniqueFishArray.length !== list.length) {
          arr.delete(0, list.length)
          arr.insert(0, uniqueFishArray)
        }

        const storedId = getStoredFishId()
        if (storedId) {
          const idx = uniqueFishArray.findIndex(f => f.id === storedId)
          if (idx >= 0) {
            myFishIdRef.current = storedId
            const cur = uniqueFishArray[idx]

            const existingState = renderStateRef.current.get(cur.id)
            if (!existingState) {
              const swimmingStyle = cur.swimmingStyle || ['normal', 'fast', 'slow', 'erratic'][Math.floor(Math.random() * 4)] as 'normal' | 'fast' | 'slow' | 'erratic'
              renderStateRef.current.set(cur.id, {
                x: cur.x,
                y: cur.y,
                dx: cur.dx,
                dy: cur.dy,
                swimPhase: cur.swimPhase || Math.random() * Math.PI * 2,
                swimAmplitude: cur.swimAmplitude || 0.1 + Math.random() * 0.2,
                swimFrequency: cur.swimFrequency || 0.02 + Math.random() * 0.03,
                directionChangeTimer: cur.directionChangeTimer || 120 + Math.random() * 180,
                baseSpeed: cur.baseSpeed || 0.4 + Math.random() * 0.4,
                currentSpeed: cur.currentSpeed || cur.baseSpeed || 0.4 + Math.random() * 0.4,
                targetDx: cur.targetDx || cur.dx,
                targetDy: cur.targetDy || cur.dy,
                speedVariation: cur.speedVariation || 0.3 + Math.random() * 0.4,
                speedBoostTimer: cur.speedBoostTimer || Math.random() * 300 + 200,
                swimmingStyle,
                styleChangeTimer: Math.random() * 600 + 400,
                foodAttraction: cur.foodAttraction ?? true,
                sensingRange: cur.sensingRange || 80 + Math.random() * 60,
                foodSeekingTimer: cur.foodSeekingTimer || Math.random() * 200 + 100
              })
              renderStateInitializedRef.current.add(cur.id)
            }
            const currentState = renderStateRef.current.get(cur.id)
            const desired = {
              ...cur,
              owner: userName,
              color: myColor,
              x: currentState?.x ?? cur.x,
              y: currentState?.y ?? cur.y,
              dx: currentState?.dx ?? cur.dx,
              dy: currentState?.dy ?? cur.dy,
              swimPhase: currentState?.swimPhase ?? cur.swimPhase,
              swimAmplitude: currentState?.swimAmplitude ?? cur.swimAmplitude,
              swimFrequency: currentState?.swimFrequency ?? cur.swimFrequency,
              directionChangeTimer: currentState?.directionChangeTimer ?? cur.directionChangeTimer,
              baseSpeed: currentState?.baseSpeed ?? cur.baseSpeed,
              currentSpeed: currentState?.currentSpeed ?? cur.currentSpeed,
              targetDx: currentState?.targetDx ?? cur.targetDx,
              targetDy: currentState?.targetDy ?? cur.targetDy,
              swimmingStyle: currentState?.swimmingStyle ?? cur.swimmingStyle,
              speedVariation: currentState?.speedVariation ?? cur.speedVariation,
              speedBoostTimer: currentState?.speedBoostTimer ?? cur.speedBoostTimer,
              foodAttraction: currentState?.foodAttraction ?? cur.foodAttraction,
              sensingRange: currentState?.sensingRange ?? cur.sensingRange,
              foodSeekingTimer: currentState?.foodSeekingTimer ?? cur.foodSeekingTimer
            }
            if (cur.owner !== desired.owner || cur.color !== desired.color) {
              arr.delete(idx, 1)
              arr.insert(idx, [desired])
            }
          }
        }
        const mineIdx: number[] = []
        for (let i = 0; i < uniqueFishArray.length; i++) if (uniqueFishArray[i].owner === userName) mineIdx.push(i)
        if (mineIdx.length === 0) {
          const width = Math.max(100, stageSize.width)
          const height = Math.max(100, stageSize.height)
          const startX = width / 2
          const startY = height / 2
          const baseSpeed = 0.4 + Math.random() * 0.4
          const angle = Math.random() * Math.PI * 2
          const dx = Math.cos(angle) * baseSpeed
          const dy = Math.sin(angle) * baseSpeed
          const id = nanoid()
          myFishIdRef.current = id
          setStoredFishId(id)
          const swimmingStyle = ['normal', 'fast', 'slow', 'erratic'][Math.floor(Math.random() * 4)] as 'normal' | 'fast' | 'slow' | 'erratic'
          const newFish = {
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
            targetDy: dy,
            speedVariation: 0.3 + Math.random() * 0.4,
            speedBoostTimer: Math.random() * 300 + 200,
            swimmingStyle,
            foodAttraction: true,
            sensingRange: 80 + Math.random() * 60,
            foodSeekingTimer: Math.random() * 200 + 100
          }
          arr.push([newFish])

          renderStateRef.current.set(id, {
            x: startX,
            y: startY,
            dx,
            dy,
            swimPhase: newFish.swimPhase,
            swimAmplitude: newFish.swimAmplitude,
            swimFrequency: newFish.swimFrequency,
            directionChangeTimer: newFish.directionChangeTimer,
            baseSpeed,
            currentSpeed: baseSpeed,
            targetDx: dx,
            targetDy: dy,
            speedVariation: newFish.speedVariation,
            speedBoostTimer: newFish.speedBoostTimer,
            swimmingStyle: newFish.swimmingStyle,
            styleChangeTimer: Math.random() * 600 + 400,
            foodAttraction: newFish.foodAttraction,
            sensingRange: newFish.sensingRange,
            foodSeekingTimer: newFish.foodSeekingTimer
          })
          renderStateInitializedRef.current.add(id)
        } else {
          const keepIdx = mineIdx[0]
          for (let k = mineIdx.length - 1; k >= 1; k--) {
            const fishToRemove = uniqueFishArray[mineIdx[k]]
            const actualIdx = arr.toArray().findIndex(f => f.id === fishToRemove.id)
            if (actualIdx >= 0) arr.delete(actualIdx, 1)
          }
          const keep = uniqueFishArray[keepIdx]
          myFishIdRef.current = keep.id
          setStoredFishId(keep.id)

          const existingState = renderStateRef.current.get(keep.id)
          if (!existingState) {
            const swimmingStyle = keep.swimmingStyle || ['normal', 'fast', 'slow', 'erratic'][Math.floor(Math.random() * 4)] as 'normal' | 'fast' | 'slow' | 'erratic'
            renderStateRef.current.set(keep.id, {
              x: keep.x,
              y: keep.y,
              dx: keep.dx,
              dy: keep.dy,
              swimPhase: keep.swimPhase || Math.random() * Math.PI * 2,
              swimAmplitude: keep.swimAmplitude || 0.1 + Math.random() * 0.2,
              swimFrequency: keep.swimFrequency || 0.02 + Math.random() * 0.03,
              directionChangeTimer: keep.directionChangeTimer || 120 + Math.random() * 180,
              baseSpeed: keep.baseSpeed || 0.4 + Math.random() * 0.4,
              currentSpeed: keep.currentSpeed || keep.baseSpeed || 0.4 + Math.random() * 0.4,
              targetDx: keep.targetDx || keep.dx,
              targetDy: keep.targetDy || keep.dy,
              speedVariation: keep.speedVariation || 0.3 + Math.random() * 0.4,
              speedBoostTimer: keep.speedBoostTimer || Math.random() * 300 + 200,
              swimmingStyle,
              styleChangeTimer: Math.random() * 600 + 400,
              foodAttraction: keep.foodAttraction ?? true,
              sensingRange: keep.sensingRange || 80 + Math.random() * 60,
              foodSeekingTimer: keep.foodSeekingTimer || Math.random() * 200 + 100
            })
            renderStateInitializedRef.current.add(keep.id)
          }
          if (keep.owner !== userName || keep.color !== myColor) {
            const currentState = renderStateRef.current.get(keep.id)
            const next = {
              ...keep,
              owner: userName,
              color: myColor,
              x: currentState?.x ?? keep.x,
              y: currentState?.y ?? keep.y,
              dx: currentState?.dx ?? keep.dx,
              dy: currentState?.dy ?? keep.dy,
              swimPhase: currentState?.swimPhase ?? keep.swimPhase,
              swimAmplitude: currentState?.swimAmplitude ?? keep.swimAmplitude,
              swimFrequency: currentState?.swimFrequency ?? keep.swimFrequency,
              directionChangeTimer: currentState?.directionChangeTimer ?? keep.directionChangeTimer,
              baseSpeed: currentState?.baseSpeed ?? keep.baseSpeed,
              currentSpeed: currentState?.currentSpeed ?? keep.currentSpeed,
              targetDx: currentState?.targetDx ?? keep.targetDx,
              targetDy: currentState?.targetDy ?? keep.targetDy
            }
            const actualIdx = arr.toArray().findIndex(f => f.id === keep.id)
            if (actualIdx >= 0) {
              arr.delete(actualIdx, 1)
              arr.insert(actualIdx, [next])
            }
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

      // Preserve render state for next initialization
      // renderStateRef and renderStateInitializedRef will be preserved automatically
    }
  }, [room])

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

    // Remove duplicate users by ID - keep the latest one
    const uniqueFishes = new Map<string, Fish>()
    for (const fish of items) {
      if (!uniqueFishes.has(fish.id) || fish.owner === userName) {
        uniqueFishes.set(fish.id, fish)
      }
    }

    // Update the array with unique fishes if duplicates found
    const uniqueFishArray = Array.from(uniqueFishes.values())
    if (uniqueFishArray.length !== items.length) {
      arr.delete(0, items.length)
      arr.insert(0, uniqueFishArray)
    }

    const myId = myFishIdRef.current || getStoredFishId()
    if (myId) {
      for (let i = 0; i < uniqueFishArray.length; i++) {
        if (uniqueFishArray[i].id === myId) {
          const cur = uniqueFishArray[i]
          if (cur.owner !== userName) {
            const currentState = renderStateRef.current.get(cur.id)
            const next = {
              ...cur,
              owner: userName,
              x: currentState?.x ?? cur.x,
              y: currentState?.y ?? cur.y,
              dx: currentState?.dx ?? cur.dx,
              dy: currentState?.dy ?? cur.dy,
              swimPhase: currentState?.swimPhase ?? cur.swimPhase,
              swimAmplitude: currentState?.swimAmplitude ?? cur.swimAmplitude,
              swimFrequency: currentState?.swimFrequency ?? cur.swimFrequency,
              directionChangeTimer: currentState?.directionChangeTimer ?? cur.directionChangeTimer,
              baseSpeed: currentState?.baseSpeed ?? cur.baseSpeed,
              currentSpeed: currentState?.currentSpeed ?? cur.currentSpeed,
              targetDx: currentState?.targetDx ?? cur.targetDx,
              targetDy: currentState?.targetDy ?? cur.targetDy,
              swimmingStyle: currentState?.swimmingStyle ?? cur.swimmingStyle,
              speedVariation: currentState?.speedVariation ?? cur.speedVariation,
              speedBoostTimer: currentState?.speedBoostTimer ?? cur.speedBoostTimer,
              foodAttraction: currentState?.foodAttraction ?? cur.foodAttraction,
              sensingRange: currentState?.sensingRange ?? cur.sensingRange,
              foodSeekingTimer: currentState?.foodSeekingTimer ?? cur.foodSeekingTimer
            }
            const actualIdx = arr.toArray().findIndex(f => f.id === cur.id)
            if (actualIdx >= 0) {
              arr.delete(actualIdx, 1)
              arr.insert(actualIdx, [next])
            }
          }
          myFishIdRef.current = myId
          setStoredFishId(myId)
          prevNameRef.current = userName
          return
        }
      }
    }
    const ownerIdx = uniqueFishArray.findIndex(f => f.owner === userName)
    if (ownerIdx >= 0) {
      myFishIdRef.current = uniqueFishArray[ownerIdx].id
      setStoredFishId(uniqueFishArray[ownerIdx].id)
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
        const current = local.get(f.id)
        if (!current) {
          if (!renderStateInitializedRef.current.has(f.id)) {
            const swimmingStyle = f.swimmingStyle || ['normal', 'fast', 'slow', 'erratic'][Math.floor(Math.random() * 4)] as 'normal' | 'fast' | 'slow' | 'erratic'
            local.set(f.id, {
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
              targetDy: f.targetDy || f.dy,
              speedVariation: f.speedVariation || 0.3 + Math.random() * 0.4,
              speedBoostTimer: f.speedBoostTimer || Math.random() * 300 + 200,
              swimmingStyle,
              styleChangeTimer: Math.random() * 600 + 400,
              foodAttraction: f.foodAttraction ?? true,
              sensingRange: f.sensingRange || 80 + Math.random() * 60,
              foodSeekingTimer: f.foodSeekingTimer || Math.random() * 200 + 100
            })
            renderStateInitializedRef.current.add(f.id)
          }
          continue
        }

        let { x, y, dx, dy, swimPhase, swimAmplitude, swimFrequency, directionChangeTimer, baseSpeed, currentSpeed, targetDx, targetDy, speedVariation, speedBoostTimer, swimmingStyle, styleChangeTimer, foodAttraction, sensingRange, foodSeekingTimer } = current

        swimPhase += swimFrequency

        directionChangeTimer--
        speedBoostTimer--
        styleChangeTimer--
        foodSeekingTimer--

        // Swimming style changes
        if (styleChangeTimer <= 0) {
          const styles: ('normal' | 'fast' | 'slow' | 'erratic')[] = ['normal', 'fast', 'slow', 'erratic']
          swimmingStyle = styles[Math.floor(Math.random() * styles.length)]
          styleChangeTimer = Math.random() * 800 + 600
        }

        // Apply swimming style effects
        let styleMultiplier = 1
        let styleVariation = 0
        switch (swimmingStyle) {
          case 'fast':
            styleMultiplier = 1.5
            styleVariation = 0.2
            break
          case 'slow':
            styleMultiplier = 0.6
            styleVariation = 0.1
            break
          case 'erratic':
            styleMultiplier = 1.2
            styleVariation = 0.6
            break
          default:
            styleMultiplier = 1
            styleVariation = 0.3
        }

        // Speed boost events
        if (speedBoostTimer <= 0) {
          speedBoostTimer = Math.random() * 400 + 300
          if (Math.random() < 0.3) {
            speedVariation = Math.random() * 0.8 + 0.2
          }
        }

        // Food attraction logic
        if (foodAttraction && food && foodSeekingTimer <= 0) {
          const distanceToFood = Math.sqrt(Math.pow(x - food.x, 2) + Math.pow(y - food.y, 2))

          if (distanceToFood <= sensingRange) {
            // Calculate direction to food
            const angleToFood = Math.atan2(food.y - y, food.x - x)
            const attractionStrength = Math.max(0.1, 1 - (distanceToFood / sensingRange))

            // Blend current direction with food direction
            const currentAngle = Math.atan2(dy, dx)
            const blendAngle = currentAngle + (angleToFood - currentAngle) * attractionStrength * 0.3

            // Update target direction
            targetDx = Math.cos(blendAngle) * baseSpeed
            targetDy = Math.sin(blendAngle) * baseSpeed

            // Increase speed when seeking food
            currentSpeed *= (1 + attractionStrength * 0.4)

            // Reset food seeking timer
            foodSeekingTimer = 60 + Math.random() * 120
          } else {
            // Reset food seeking timer if no food in range
            foodSeekingTimer = Math.random() * 200 + 100
          }
        }

        if (directionChangeTimer <= 0) {
          const randomValue = Math.random()
          if (randomValue < 0.4) {
            targetDx = dx
            targetDy = dy
          } else if (randomValue < 0.6) {
            targetDx = -dx
            targetDy = -dy
          } else {
            const changeAngle = (Math.random() - 0.5) * Math.PI * 0.5
            const currentAngle = Math.atan2(dy, dx)
            const newAngle = currentAngle + changeAngle
            targetDx = Math.cos(newAngle) * baseSpeed
            targetDy = Math.sin(newAngle) * baseSpeed
          }
          directionChangeTimer = 180 + Math.random() * 240
        }

        const turnSpeed = 0.015
        dx += (targetDx - dx) * turnSpeed
        dy += (targetDy - dy) * turnSpeed

        const movementAngle = Math.atan2(dy, dx)
        const perpendicularAngle = movementAngle + Math.PI / 2
        const waveOffsetX = Math.cos(perpendicularAngle) * Math.sin(swimPhase) * swimAmplitude * 0.5
        const waveOffsetY = Math.sin(perpendicularAngle) * Math.sin(swimPhase) * swimAmplitude * 0.5

        const naturalVariation = 0.9 + 0.2 * Math.sin(swimPhase * 1.5)
        const randomVariation = 1 + (Math.random() - 0.5) * styleVariation
        const boostVariation = 1 + Math.sin(swimPhase * 2) * speedVariation * 0.3

        currentSpeed = baseSpeed * styleMultiplier * naturalVariation * randomVariation * boostVariation

        x += dx * currentSpeed + waveOffsetX
        y += dy * currentSpeed + waveOffsetY

        if (x < radius) {
          x = radius
          targetDx = Math.abs(dx) * 0.8
          targetDy = dy * 0.8
          directionChangeTimer = 120 + Math.random() * 180
        }
        else if (x > width - radius) {
          x = width - radius
          targetDx = -Math.abs(dx) * 0.8
          targetDy = dy * 0.8
          directionChangeTimer = 120 + Math.random() * 180
        }

        if (y < radius) {
          y = radius
          targetDx = dx * 0.8
          targetDy = Math.abs(dy) * 0.8
          directionChangeTimer = 120 + Math.random() * 180
        }
        else if (y > height - radius) {
          y = height - radius
          targetDx = dx * 0.8
          targetDy = -Math.abs(dy) * 0.8
          directionChangeTimer = 120 + Math.random() * 180
        }

        const prevState = local.get(f.id)
        const maxJumpDistance = 50

        if (prevState && Math.sqrt(Math.pow(x - prevState.x, 2) + Math.pow(y - prevState.y, 2)) > maxJumpDistance) {
          x = prevState.x + dx * currentSpeed
          y = prevState.y + dy * currentSpeed
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
          targetDy,
          speedVariation,
          speedBoostTimer,
          swimmingStyle,
          styleChangeTimer,
          foodAttraction,
          sensingRange,
          foodSeekingTimer
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
            targetDy,
            speedVariation,
            speedBoostTimer,
            swimmingStyle,
            foodAttraction,
            sensingRange,
            foodSeekingTimer
          }
          const positionChanged = Math.abs(next.x - f.x) > 0.1 || Math.abs(next.y - f.y) > 0.1
          const movementChanged = next.dx !== f.dx || next.dy !== f.dy ||
            next.swimPhase !== f.swimPhase || next.swimAmplitude !== f.swimAmplitude ||
            next.swimFrequency !== f.swimFrequency || next.directionChangeTimer !== f.directionChangeTimer ||
            next.baseSpeed !== f.baseSpeed || next.currentSpeed !== f.currentSpeed ||
            next.targetDx !== f.targetDx || next.targetDy !== f.targetDy ||
            next.speedVariation !== f.speedVariation || next.speedBoostTimer !== f.speedBoostTimer ||
            next.swimmingStyle !== f.swimmingStyle || next.foodAttraction !== f.foodAttraction ||
            next.sensingRange !== f.sensingRange || next.foodSeekingTimer !== f.foodSeekingTimer

          if (positionChanged || movementChanged) {
            arr.delete(i, 1)
            arr.insert(i, [next])
          }
          wroteMine = true
        }

        if (food && !eatenFoodRef.current.has(food.id) && checkCollision({ ...f, x, y }, food)) {
          eatenFoodRef.current.add(food.id)
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
