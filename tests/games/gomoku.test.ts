import { expect } from 'vitest'
import { step } from '../helpers/log'
import { CHAIN_HINT, defineGameFlowSuite } from '../helpers/match'

// Black (agent A) wins on the 9th move: H8..H12 in a row, white (agent B)
// plays non-blocking fillers.
const BLACK_MOVES = ['H8', 'H9', 'H10', 'H11', 'H12']
const WHITE_MOVES = ['A1', 'B2', 'C3', 'D4']

interface GomokuPayload {
  status: 'waiting' | 'playing' | 'finished' | 'aborted'
  message?: string
  currentPlayer: 'you' | 'opponent' | null
  opponent?: { nickname: string, model: string, harness: string }
  opponentLastMessage?: string
  moveNumber?: number
  lastMove?: string
  board?: string
  winner?: 'you' | 'opponent' | 'draw'
  reason?: string
}

defineGameFlowSuite(
  'gomoku MCP 全流程',
  {
    gameId: 'gomoku',
    gameName: 'Gomoku',
    agentLabels: ['黑方', '白方'],
    expectedWinner: 'A',
    verifyRest: (room) => {
      const winnerNickname = room.players.find(player => player.sessionId === room.winner)?.nickname
      const winLine = (room.game.finishDetails?.winLine as Array<{ x: number, y: number }> | undefined) ?? []
      console.log('REST 返回关键字段:')
      console.log(JSON.stringify({
        status: room.status,
        winnerNickname,
        finishReason: room.game.finishReason,
        winLine,
        moveCount: room.game.moveCount,
        eventCount: room.events.length,
      }, null, 2))
      expect(room.game.finishReason).toBe('five-in-row')
      expect(winLine).toHaveLength(5)
      expect(room.game.moveCount).toBe(9)
      const lastMoveEvent = room.events.filter(event => event.type === 'move').at(-1)
      expect(lastMoveEvent?.payload?.message).toBe('黑方嘲讽 5')
      expect(lastMoveEvent?.payload?.reason).toBe('测试脚本第 9 手')
    },
  },
  async (match) => {
    step('步骤 6 · 交替落子，黑方第 9 手五连获胜')
    const room = await match.chainRoom()
    if (room.status === 'finished' || room.status === 'aborted') {
      console.log('对局已结束，跳过落子步骤（链路已打完）。')
      return
    }
    expect(room.status, `对局尚未开始：请按链路顺序先运行「步骤 5」。${CHAIN_HINT}`).toBe('playing')

    let finalMove: GomokuPayload | undefined
    let blackCount = 0
    let whiteCount = 0
    for (let i = 0; i < 9; i++) {
      const isBlack = i % 2 === 0
      const agent = isBlack ? match.agentA : match.agentB
      const move = isBlack ? BLACK_MOVES[i / 2]! : WHITE_MOVES[(i - 1) / 2]!
      const message = isBlack ? `黑方嘲讽 ${blackCount + 1}` : `白方回敬 ${whiteCount + 1}`
      const opponentLastMessage = i === 0
        ? undefined
        : isBlack
          ? `白方回敬 ${whiteCount}`
          : `黑方嘲讽 ${blackCount}`
      const result = await agent.call<GomokuPayload>('make-gomoku-move', {
        move,
        reason: `测试脚本第 ${i + 1} 手`,
        message,
      })
      expect(result.status).toBe(i === 8 ? 'finished' : 'playing')
      expect(result.lastMove).toBe(move)
      if (i < 8)
        expect(result.moveNumber).toBe(i + 2)
      const opponentNickname = isBlack ? match.nicknames[1] : match.nicknames[0]
      expect(result.opponent?.nickname).toBe(opponentNickname)
      expect(result.opponent?.model).toBeTruthy()
      expect(result.opponentLastMessage).toBe(opponentLastMessage)
      if (isBlack)
        blackCount++
      else
        whiteCount++
      if (i === 1)
        console.log(`白方收到黑方首手 message: ${result.opponentLastMessage}`)
      console.log(`\n===== ${agent.label} 落子 ${move} 后的棋盘（第 ${i + 1} 手）=====`)
      console.log(result.board ?? '(无棋盘)')
      finalMove = result
    }

    expect(finalMove?.status).toBe('finished')
    expect(finalMove?.winner).toBe('you')
    expect(finalMove?.reason).toBe('five-in-row')
    expect(finalMove?.lastMove).toBe('H12')
    console.log('\n黑方五连获胜，对局结束。')
  },
  [
    {
      title: '负向校验 · 开局白方抢黑方回合应被拒绝',
      run: async (match) => {
        step('负向校验 · 开局白方抢黑方回合应被拒绝')
        const room = await match.chainRoom()
        if (room.status === 'finished' || room.status === 'aborted') {
          console.log('对局已结束，跳过负向校验。')
          return
        }
        expect(room.status, `对局尚未开始：请按链路顺序先运行「步骤 5」。${CHAIN_HINT}`).toBe('playing')
        const rejected = await match.agentB.call<GomokuPayload>('make-gomoku-move', {
          move: 'H8',
          reason: '尝试抢黑方回合（不应生效）',
          message: '白方抢跑（不应生效）',
        })
        expect(rejected.message).toMatch(/not your turn/i)
        expect(rejected.status).toBe('playing')
        expect(rejected.moveNumber).toBe(1)
        expect(rejected.lastMove).toBeUndefined()
        console.log('白方抢回合被拒绝，棋盘无变化。')
      },
    },
  ],
)
