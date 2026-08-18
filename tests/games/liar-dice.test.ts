import type { McpAgent } from '../helpers/mcp-agent'
import { expect } from 'vitest'
import { step } from '../helpers/log'
import { CHAIN_HINT, defineGameFlowSuite } from '../helpers/match'

interface LiarPayload {
  status: 'waiting' | 'playing' | 'finished' | 'aborted'
  currentPlayer: 'you' | 'opponent' | null
  currentBid?: string
  diceLeft?: { you: number, opponent: number }
  round?: number
  lastCall?: { total: number, correct: boolean, youLost: boolean }
  board?: string
  winner?: 'you' | 'opponent' | 'draw'
  reason?: string
}

defineGameFlowSuite(
  'liar-dice MCP 全流程',
  {
    gameId: 'liar-dice',
    gameName: 'Liar\'s Dice',
    agentLabels: ['玩家A', '玩家B'],
    expectedWinner: 'either',
    verifyRest: (room) => {
      console.log('REST 返回关键字段:', JSON.stringify({
        finishReason: room.game.finishReason,
        moveCount: room.game.moveCount,
        winner: room.players.find(player => player.sessionId === room.winner)?.nickname,
      }, null, 2))
      expect(room.game.finishReason).toBe('no-dice')
    },
  },
  async (match) => {
    step('步骤 6 · 交替叫牌/开牌直到一方骰子归零')
    const room = await match.chainRoom()
    if (room.status === 'finished' || room.status === 'aborted') {
      console.log('对局已结束，跳过叫牌步骤（链路已打完）。')
      return
    }
    expect(room.status, `对局尚未开始：请按链路顺序先运行「步骤 5」。${CHAIN_HINT}`).toBe('playing')

    // 确定性脚本：轮到开局时报“全场骰子数×6”（几乎必然被开掉），对方一律开牌；
    // 按响应里的 currentPlayer 决定下一步由谁行动，随机骰子也不影响收敛。
    let last = await match.agentA.call<{ game: LiarPayload }>('get-room', { roomId: match.roomId })
    let mover: McpAgent = match.agentA
    let final: LiarPayload | undefined

    for (let i = 0; i < 40; i++) {
      const state = last.game
      const total = (state.diceLeft?.you ?? 0) + (state.diceLeft?.opponent ?? 0)
      const args = state.currentBid
        ? { type: 'call', reason: `测试脚本第 ${i + 1} 手：开牌验证` }
        : { type: 'bid', call: `${total}x6`, reason: `测试脚本第 ${i + 1} 手：报满额逼对手开牌` }
      const result = await mover.call<LiarPayload>('make-liar-dice-move', args)
      expect(['playing', 'finished']).toContain(result.status)
      console.log(`\n===== 第 ${i + 1} 手（${mover.label}）后 =====`)
      console.log(result.board ?? '(无棋盘)')
      final = result

      if (result.status === 'finished')
        break
      mover = result.currentPlayer === 'you'
        ? mover
        : (mover === match.agentA ? match.agentB : match.agentA)
      last = { game: result }
    }

    expect(final, '40 手内未分出胜负，请检查叫牌/开牌脚本').toBeDefined()
    expect(final?.status).toBe('finished')
    expect(final?.reason).toBe('no-dice')
    expect(['you', 'opponent']).toContain(final?.winner)
    console.log('\n一方骰子归零，对局结束。')
  },
)
