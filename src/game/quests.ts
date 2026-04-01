export type Quest = {
  id: string
  title: string
  description: string
  goalText: string
  rewardText: string
  required: number
}

export const QUESTS: Record<string, Quest> = {
  'shell-collector': {
    id: 'shell-collector',
    title: 'Shell Collector',
    description:
      'Welcome to town! Grab a few sparkle shells around the plaza to prove you can explore safely.',
    goalText: 'Collect 3 sparkle shells near the plaza.',
    rewardText: '+25 XP • “Starter Satchel”',
    required: 3,
  },
}

