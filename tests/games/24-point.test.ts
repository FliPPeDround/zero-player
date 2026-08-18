import { expect } from 'vitest'
import { step } from '../helpers/log'
import { CHAIN_HINT, defineGameFlowSuite } from '../helpers/match'
import { parseChallengeNumbers, solve24 } from '../helpers/twenty-four-solver'

interface TwentyFourPayload {
  status: 'waiting' | 'playing' | 'finished' | 'aborted'
  challenge?: string
  question?: number
  solved?: number
  winner?: 'you' | 'opponent' | 'draw'
  reason?: string
}

defineGameFlowSuite(
  '24-point MCP 全流程',
  {
    gameId: '24-point',
    gameName: '24 Point',
    agentLabels: ['玩家A', '玩家B'],
    expectedWinner: 'A',
    verifyRest: (room) => {
      const puzzles = room.game.finishDetails?.puzzles as unknown[] | undefined
      console.log('REST 返回关键字段:', JSON.stringify({
        finishReason: room.game.finishReason,
        puzzleCount: puzzles?.length,
        moveCount: room.game.moveCount,
      }, null, 2))
      expect(room.game.finishReason).toBe('all-questions-solved')
      expect(puzzles).toHaveLength(6)
    },
  },
  async (match) => {
    step('步骤 6 · 双方各自解完 6 道 24 点题目（先手方获胜）')
    const room = await match.chainRoom()
    if (room.status === 'finished' || room.status === 'aborted') {
      console.log('对局已结束，跳过解题步骤（链路已打完）。')
      return
    }
    expect(room.status, `对局尚未开始：请按链路顺序先运行「步骤 5」。${CHAIN_HINT}`).toBe('playing')

    for (const [index, player] of [match.agentA, match.agentB].entries()) {
      let last = await player.call<{ game: TwentyFourPayload }>('get-room', { roomId: match.roomId })
      for (let q = 0; q < 6; q++) {
        const challenge = last.game.challenge ?? ''
        const numbers = parseChallengeNumbers(challenge)
        expect(numbers, `题目解析失败: ${challenge}`).toHaveLength(4)
        const expression = solve24(numbers)
        expect(expression, `题目无解（不应发生）: ${challenge}`).toBeTruthy()

        // 玩家B 每题放慢一点，保证先手方（玩家A）个人用时更短、确定胜出。
        if (index === 1)
          await new Promise(resolve => setTimeout(resolve, 150))

        const result = await player.call<TwentyFourPayload>('make-24-point-move', {
          expression: expression!,
          reason: `测试脚本第 ${q + 1} 题`,
        })
        expect(result.solved).toBe(q + 1)
        console.log(`[${player.label}] 第 ${q + 1}/6 题: ${numbers.join(' ')} → ${expression}`)
        last = { game: result }
      }
    }

    const final = await match.agentA.call<{ game: TwentyFourPayload }>('get-room', { roomId: match.roomId })
    expect(final.game.status).toBe('finished')
    expect(final.game.winner).toBe('you')
    expect(final.game.reason).toBe('all-questions-solved')
    console.log('\n双方都解完 6 题，用时更短的玩家A获胜。')
  },
)
