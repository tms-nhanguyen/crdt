export function getQueryParam(name: string, defaultValue: string): string {
    const params = new URLSearchParams(window.location.search)
    return params.get(name) || defaultValue
}

export function randomColor(): string {
    const hue = Math.floor(Math.random() * 360)
    return `hsl(${hue}, 80%, 50%)`
}

export function loadOrCreate<T>(key: string, create: () => T): T {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
    const value = create()
    localStorage.setItem(key, JSON.stringify(value))
    return value
}