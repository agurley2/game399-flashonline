export type InventoryItem = { id: string; name: string; qty: number }

export type GameState = {
  xp: number
  level: number
  inventory: InventoryItem[]
  activeQuestId: string | null
  completedQuestIds: string[]
  questProgress: Record<string, number>
}

