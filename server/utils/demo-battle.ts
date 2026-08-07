import { emitGameMove, finishGame, getRoom } from './room-store'

const MOVES = ['probe', 'shield', 'burst', 'reposition', 'scan', 'overdrive']
const TOTAL_TURNS = 10
const TURN_INTERVAL_MS = 1800

const timers = new Map<string, ReturnType<typeof setInterval>>()
const scores = new Map<string, Record<string, number>>()

/**
 * Placeholder battle engine so spectator mode has live events to show.
 * Swap this out for the real agent-driven game loop later; the room store
 * APIs (`emitGameMove`, `finishGame`) are the integration points.
 */
export function runDemoBattle(roomId: string): void {
  stopDemoBattle(roomId)

  const room = getRoom(roomId)
  if (!room || room.players.length < 2)
    return

  scores.set(roomId, Object.fromEntries(room.players.map(player => [player.nickname, 0])))

  let turn = 0
  const timer = setInterval(() => {
    const current = getRoom(roomId)
    if (!current || current.status !== 'playing') {
      stopDemoBattle(roomId)
      return
    }

    const player = current.players[turn % 2]
    if (!player)
      return

    turn += 1
    const move = MOVES[Math.floor(Math.random() * MOVES.length)]
    const power = Math.floor(Math.random() * 5) + 1
    const roomScores = scores.get(roomId)!
    roomScores[player.nickname] = (roomScores[player.nickname] ?? 0) + power

    emitGameMove(roomId, player.nickname, {
      move,
      turn,
      power,
      score: roomScores[player.nickname],
    })

    if (turn >= TOTAL_TURNS) {
      stopDemoBattle(roomId)
      const winner = [...current.players].sort(
        (a, b) => (roomScores[b.nickname] ?? 0) - (roomScores[a.nickname] ?? 0),
      )[0]
      finishGame(roomId, winner?.nickname)
    }
  }, TURN_INTERVAL_MS)

  timers.set(roomId, timer)
}

export function stopDemoBattle(roomId: string): void {
  const timer = timers.get(roomId)
  if (timer) {
    clearInterval(timer)
    timers.delete(roomId)
  }
  scores.delete(roomId)
}
