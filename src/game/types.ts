export type InventoryItem = { id: string; name: string; qty: number }

export type GameState = {
  xp: number
  level: number
  meseta: number
  className: 'HUmar'
  hp: number
  maxHp: number
  tp: number
  maxTp: number
  zone: 'Pioneer 2' | 'Forest 1'
  inventory: InventoryItem[]
  activeQuestId: string | null
  completedQuestIds: string[]
  questProgress: Record<string, number>
}

