import { memo, useEffect, useRef, useState } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  onSave?: (dataUrl: string) => void
  userName?: string
  onChangeUserName?: (name: string) => void
}

type Tool = 'pen' | 'line' | 'rect' | 'ellipse' | 'eraser'

const Modal = ({ open, onClose, onSave, userName, onChangeUserName }: ModalProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing] = useState(true)
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [strokeColor, setStrokeColor] = useState<string>('#111827')
  const [strokeWidth] = useState<number>(3)
  const snapshotRef = useRef<ImageData | null>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = Math.floor(canvas.clientWidth * dpr)
    canvas.height = Math.floor(canvas.clientHeight * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = 3
    ctx.save()
    ctx.fillStyle = '#cfefff'
    const cssW = canvas.width / dpr
    const cssH = canvas.height / dpr
    ctx.fillRect(0, 0, cssW, cssH)
    ctx.restore()
  }, [open])

  useEffect(() => {
    const handleUpAnywhere = () => {
      if (!open) return
      if (!canvasRef.current) return
      setLastPoint(null)
    }
    window.addEventListener('pointerup', handleUpAnywhere)
    window.addEventListener('pointercancel', handleUpAnywhere)
    return () => {
      window.removeEventListener('pointerup', handleUpAnywhere)
      window.removeEventListener('pointercancel', handleUpAnywhere)
    }
  }, [open])

  if (!open) return null

  const getRelativePoint = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = (evt.target as HTMLCanvasElement).getBoundingClientRect()
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top }
  }

  const handlePointerDown = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(evt.pointerId)
    const pt = getRelativePoint(evt)
    setLastPoint(pt)
    setStartPoint(pt)
    if (tool !== 'pen' && tool !== 'eraser') {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        try {
          snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
        } catch {
          snapshotRef.current = null
        }
      }
    }
  }

  const handlePointerMove = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pt = getRelativePoint(evt)
    const applyStroke = () => {
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.lineWidth = strokeWidth
      ctx.strokeStyle = strokeColor
    }
    if (tool === 'pen' || tool === 'eraser') {
      applyStroke()
      if (tool === 'eraser') ctx.globalCompositeOperation = 'destination-out'
      if (lastPoint) {
        ctx.beginPath()
        ctx.moveTo(lastPoint.x, lastPoint.y)
        ctx.lineTo(pt.x, pt.y)
        ctx.stroke()
      }
      if (tool === 'eraser') ctx.globalCompositeOperation = 'source-over'
      setLastPoint(pt)
    } else if (startPoint) {
      if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0)
      applyStroke()
      if (tool === 'line') {
        ctx.beginPath()
        ctx.moveTo(startPoint.x, startPoint.y)
        ctx.lineTo(pt.x, pt.y)
        ctx.stroke()
      } else if (tool === 'rect') {
        const x = Math.min(startPoint.x, pt.x)
        const y = Math.min(startPoint.y, pt.y)
        const w = Math.abs(pt.x - startPoint.x)
        const h = Math.abs(pt.y - startPoint.y)
        ctx.strokeRect(x, y, w, h)
      } else if (tool === 'ellipse') {
        const cx = (startPoint.x + pt.x) / 2
        const cy = (startPoint.y + pt.y) / 2
        const rx = Math.abs(pt.x - startPoint.x) / 2
        const ry = Math.abs(pt.y - startPoint.y) / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        style={{
          width: 'min(600px, 60vw)',
          height: 'min(500px, 50vh)',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Draw</span>
            <select value={tool} onChange={(e) => setTool(e.target.value as Tool)} style={{ padding: '6px 8px' }}>
              <option value="pen">Pen</option>
              <option value="line">Line</option>
              <option value="rect">Rect</option>
              <option value="ellipse">Ellipse</option>
              <option value="eraser">Eraser</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Color</span>
              <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Name</span>
              <input value={userName || ''} onChange={(e) => onChangeUserName && onChangeUserName(e.target.value)} placeholder="Your name" style={{ border: '1px solid #ccc', padding: '6px 8px', borderRadius: 4 }} />
            </label>
            <button
              onClick={() => {
                const canvas = canvasRef.current
                if (!canvas) return
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                const dpr = Math.max(1, window.devicePixelRatio || 1)
                ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)
              }}
              style={{ border: '1px solid #111', background: '#fff', padding: '6px 10px', borderRadius: 6 }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                if (!isDrawing) {
                  onClose()
                  return
                } 
                if (!canvasRef.current || !onSave) return
                try {
                  const src = canvasRef.current
                  const out = document.createElement('canvas')
                  const outW = Math.max(1, Math.floor(src.width * 0.2))
                  const outH = Math.max(1, Math.floor(src.height * 0.2))
                  out.width = outW
                  out.height = outH
                  const octx = out.getContext('2d')
                  if (!octx) return
                  octx.clearRect(0, 0, outW, outH)
                  octx.imageSmoothingEnabled = true
                  octx.imageSmoothingQuality = 'high'
                  octx.drawImage(src, 0, 0, outW, outH)
                  const imgData = octx.getImageData(0, 0, outW, outH)
                  const data = imgData.data
                  for (let i = 0; i < data.length; i += 4) {
                    const r = data[i]
                    const g = data[i + 1]
                    const b = data[i + 2]
                  
                    if (r === 207 && g === 239 && b === 255) {
                      data[i + 3] = 0
                    }
                  }
                  octx.putImageData(imgData, 0, 0)
                  const dataUrl = out.toDataURL('image/png')
                  onSave(dataUrl)
                } catch {}
              }}
              style={{ border: '1px solid #111', background: '#fff', padding: '6px 10px', borderRadius: 6 }}
            >
              Save
            </button>
            <button onClick={onClose} style={{ border: '1px solid #111', background: '#fff', padding: '6px 10px', borderRadius: 6 }}>Close</button>
          </div>
        </div>
        <div style={{ flex: 1, position: 'relative', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            style={{ width: '200px', height: '200px', touchAction: 'none', display: 'block' }}
          />
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', color: '#374151', fontSize: 12 }}>
          Draw multiple strokes. Click Save to apply.
        </div>
      </div>
    </div>
  )
}

export default memo(Modal)