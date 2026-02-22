export function generateNodeId(topic: string, level: number): string {
  const normalized = topic
    .toLowerCase()
    .replace(/[^a-z0-9\u3000-\u9fff\uff00-\uffef]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 32)
  return `em_${level}_${normalized}_${hashCode(topic + level)}`
}

function hashCode(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(hash).toString(36)
}

export function generateRandomId(): string {
  return 'em_' + Math.random().toString(36).substring(2, 11)
}
