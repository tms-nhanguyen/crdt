type Fish = {
    id: string
    owner: string
    color: string
    x: number
    y: number
    dx: number
    dy: number
    skin?: string
    swimPhase?: number
    swimAmplitude?: number
    swimFrequency?: number
    directionChangeTimer?: number
    baseSpeed?: number
    currentSpeed?: number
    targetDx?: number
    targetDy?: number
    speedVariation?: number
    speedBoostTimer?: number
    swimmingStyle?: 'normal' | 'fast' | 'slow' | 'erratic'
    foodAttraction?: boolean
    sensingRange?: number
    foodSeekingTimer?: number
}

type Food = {
    id: string
    x: number
    y: number
    radius: number
}

type Score = {
    owner: string
    points: number
}