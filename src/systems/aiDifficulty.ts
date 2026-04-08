export type DifficultyLevel = 'easy' | 'normal' | 'hard';

export function usesNormalAiBehavior(difficulty?: DifficultyLevel): boolean {
  return difficulty === 'normal' || difficulty === 'hard';
}
