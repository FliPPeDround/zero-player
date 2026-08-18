const OPERATORS = ['+', '-', '*', '/'] as const
const EPSILON = 1e-9
const CHALLENGE_NUMBERS = /Question \d+\/6: ([\d\s]+?) \(/
const WHITESPACE = /\s+/

/**
 * Find a 24 Point solution for four numbers (1-9) by brute-forcing every
 * permutation, operator triple and binary-tree shape. Returns a fully
 * parenthesized expression string using each number exactly once, or `null`
 * when the set is unsolvable. The platform's puzzles are generated with a
 * guaranteed solution, so `null` should never happen in practice.
 */
export function solve24(numbers: number[]): string | null {
  if (numbers.length !== 4)
    return null

  for (const [a, b, c, d] of permutations(numbers)) {
    for (const o1 of OPERATORS) {
      for (const o2 of OPERATORS) {
        for (const o3 of OPERATORS) {
          const shapes: Array<[string, number]> = [
            [`((${a}${o1}${b})${o2}${c})${o3}${d}`, apply(apply(apply(a, o1, b), o2, c), o3, d)],
            [`(${a}${o1}(${b}${o2}${c}))${o3}${d}`, apply(apply(a, o1, apply(b, o2, c)), o3, d)],
            [`${a}${o1}((${b}${o2}${c})${o3}${d})`, apply(a, o1, apply(apply(b, o2, c), o3, d))],
            [`${a}${o1}(${b}${o2}(${c}${o3}${d}))`, apply(a, o1, apply(b, o2, apply(c, o3, d)))],
            [`(${a}${o1}${b})${o2}(${c}${o3}${d})`, apply(apply(a, o1, b), o2, apply(c, o3, d))],
          ]
          for (const [expression, value] of shapes) {
            if (Number.isFinite(value) && Math.abs(value - 24) <= EPSILON)
              return expression
          }
        }
      }
    }
  }
  return null
}

/** Extract the four numbers from a challenge string like `Question 1/6: 3 3 8 8 (you solved 0/6)`. */
export function parseChallengeNumbers(challenge: string): number[] {
  const match = CHALLENGE_NUMBERS.exec(challenge)
  if (!match)
    return []
  return match[1]!.trim().split(WHITESPACE).map(Number)
}

function apply(a: number, operator: typeof OPERATORS[number], b: number): number {
  switch (operator) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return b === 0 ? Number.NaN : a / b
  }
}

function permutations<T>(items: T[]): T[][] {
  const results: T[][] = []
  const used = Array.from({ length: items.length }).fill(false) as boolean[]
  const path: T[] = []

  const walk = (): void => {
    if (path.length === items.length) {
      results.push([...path])
      return
    }
    for (let index = 0; index < items.length; index++) {
      if (used[index])
        continue
      used[index] = true
      path.push(items[index]!)
      walk()
      path.pop()
      used[index] = false
    }
  }
  walk()
  return results
}
