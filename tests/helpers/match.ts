import type { WatchFrame } from './watch-room'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearChainState, loadChainState, saveChainState } from './chain-state'
import { step } from './log'
import { McpAgent } from './mcp-agent'
import { resolveOrigin } from './origin'
import { listExpectedTools } from './tools'
import { watchRoom } from './watch-room'

export type GameId = 'gomoku' | 'liar-dice' | '24-point'
export type WinnerExpectation = 'A' | 'B' | 'either'

export const CHAIN_HINT = '本流程所有步骤共享同一条对局链路（同一 token、同一房间、同一局）；「步骤 1」登录永远建立新链路，其余步骤会沿用已保存的链路状态，不会重新登录或新建房间。缺少前置状态时，请先运行「步骤 1」建立链路，再按顺序执行。'

const TRAILING_SLASH = /\/+$/
const ROOM_ID_PATTERN = /^r-/

export interface GameFlowOptions {
  gameId: GameId
  gameName: string
  /** Display labels for the two agents, e.g. `['黑方', '白方']`. */
  agentLabels: [string, string]
  /** Which side is expected to win the match. Defaults to `either`. */
  expectedWinner?: WinnerExpectation
  /** Optional game-specific deep checks on the REST room payload (step 8). */
  verifyRest?: (room: RestRoom) => void
}

export interface GameFlowStep {
  title: string
  run: (match: GameMatch) => Promise<void>
}

export interface RestRoom {
  status: string
  winner?: string
  players: Array<{ sessionId: string, nickname: string }>
  events: Array<{ type: string }>
  game: {
    status: string
    finishReason?: string
    finishDetails?: Record<string, unknown>
    moveCount?: number
  }
}

export interface RoomSummaryPayload {
  status: 'waiting' | 'playing' | 'finished' | 'aborted'
  playerCount: number
  maxPlayers: number
}

/**
 * Shared "match chain" harness used by every game's E2E flow test. It owns
 * the communication plumbing (MCP clients, dynamic origin, persisted chain
 * state, SSE watchers) plus the generic steps (0-5 and 7-9); game tests only
 * provide the game-specific move script and deep assertions.
 */
export class GameMatch {
  readonly options: GameFlowOptions
  readonly run: string
  readonly nicknames: [string, string]
  readonly roomName: string
  origin: string
  agents: [McpAgent, McpAgent]
  roomId?: string
  private watchers?: [Promise<WatchFrame[]>, Promise<WatchFrame[]>]
  private stopWatches?: () => void

  constructor(options: GameFlowOptions) {
    this.options = options
    this.run = Date.now().toString(36).slice(-5)
    this.nicknames = [
      `vitest-${options.agentLabels[0]}-${this.run}`,
      `vitest-${options.agentLabels[1]}-${this.run}`,
    ]
    this.roomName = `vitest-${options.gameId}-${this.run}`
    this.origin = 'http://localhost:3001'
    this.agents = [undefined!, undefined!]
  }

  get agentA(): McpAgent {
    return this.agents[0]
  }

  get agentB(): McpAgent {
    return this.agents[1]
  }

  get expectedWinner(): WinnerExpectation {
    return this.options.expectedWinner ?? 'either'
  }

  /** beforeAll: resolve origin, connect the two agents, restore the chain. */
  async setup(): Promise<void> {
    const resolved = await resolveOrigin()
    this.origin = resolved.origin
    console.log(`检测到 dev server: ${this.origin}（来源: ${resolved.source}）`)

    const preflight = await fetch(`${this.origin.replace(TRAILING_SLASH, '')}/api/rooms`).catch(() => null)
    if (!preflight?.ok) {
      throw new Error(
        `无法连接 ${this.origin}。请先启动 dev server（pnpm dev），或设置 ZP_ORIGIN 指向运行中的环境。`,
      )
    }

    this.agents = [
      await McpAgent.connect(this.options.agentLabels[0], this.origin),
      await McpAgent.connect(this.options.agentLabels[1], this.origin),
    ]

    const saved = await loadChainState(this.options.gameId)
    if (!saved)
      return

    this.agents[0].setToken(saved.agentAToken)
    this.agents[1].setToken(saved.agentBToken)
    this.nicknames[0] = saved.agentANickname
    this.nicknames[1] = saved.agentBNickname

    if (!saved.roomId) {
      console.log('已恢复上一步的登录 token，继续在链路上创建房间。')
      return
    }

    this.roomId = saved.roomId
    try {
      const room = await this.chainRoom()
      console.log(`已恢复上一步的链路：房间 ${this.roomId}（${room.status}），沿用已登录 token，不重新登录、不重建房间。`)
    }
    catch {
      this.roomId = undefined
      await clearChainState(this.options.gameId)
      console.log('已保存的链路状态已失效（房间被清理或 token 过期），已重置；请从「步骤 1」重新建立链路。')
    }
  }

  /** afterAll: stop watchers and close the MCP clients. */
  async teardown(): Promise<void> {
    this.stopWatches?.()
    await this.agents?.[0]?.close()
    await this.agents?.[1]?.close()
  }

  async stepToolsList(): Promise<void> {
    step('步骤 0 · 校验 MCP 工具清单')
    const expectedTools = await listExpectedTools()
    const aTools = await this.agentA.listTools()
    const bTools = await this.agentB.listTools()
    expect([...aTools].sort()).toEqual(expectedTools)
    expect([...bTools].sort()).toEqual(expectedTools)
    console.log(`工具清单（来自 server/mcp/tools，共 ${expectedTools.length} 个）: ${expectedTools.join(', ')}`)

    // A full run always includes this step: reset any saved chain so it
    // starts fresh. Running 步骤 0 alone also restarts the chain.
    const hasChain = Boolean(this.roomId) || await loadChainState(this.options.gameId) !== null
    if (hasChain) {
      this.roomId = undefined
      this.agentA.clearToken()
      this.agentB.clearToken()
      await clearChainState(this.options.gameId)
      console.log('（步骤 0）已重置链路状态，本次运行将建立全新的链路。')
    }
  }

  async stepLogin(): Promise<void> {
    step('步骤 1 · 两个人物分别登录')
    // 重新登录 = 开启新链路：永远重新登录，并作废旧链路的房间状态。
    if (this.roomId || this.agentA.hasToken || this.agentB.hasToken)
      console.log('重新登录即开启新链路：旧链路的 token/房间将作废，本次建立全新链路。')
    this.roomId = undefined
    this.nicknames[0] = `vitest-${this.options.agentLabels[0]}-${this.run}`
    this.nicknames[1] = `vitest-${this.options.agentLabels[1]}-${this.run}`
    await this.agentA.login('vitest', this.nicknames[0])
    await this.agentB.login('vitest', this.nicknames[1])
    expect(this.agentA.hasToken).toBe(true)
    expect(this.agentB.hasToken).toBe(true)
    await this.persistChain()
  }

  async stepCreateRoom(): Promise<void> {
    step('步骤 2 · 创建房间')
    expect(this.agentA.hasToken, `缺少登录 token（请先运行「步骤 1」建立链路）。${CHAIN_HINT}`).toBe(true)
    if (this.roomId) {
      const room = await this.chainRoom()
      console.log(`链路已存在（房间 ${this.roomId}，状态 ${room.status}），跳过重建房间。`)
      return
    }
    const created = await this.agentA.call<{
      roomId: string
      room: { status: string, playerCount: number, maxPlayers: number }
    }>('create-room', { game: this.options.gameId, name: this.roomName })
    this.roomId = created.roomId
    expect(this.roomId).toMatch(ROOM_ID_PATTERN)
    expect(created.room.status).toBe('waiting')
    expect(created.room.playerCount).toBe(1)
    expect(created.room.maxPlayers).toBe(2)
    await this.persistChain()
  }

  async stepStartWatches(): Promise<void> {
    step('步骤 3 · 双方启动整场 SSE watch 流')
    expect(this.roomId, `缺少房间（请先运行「步骤 2」建立链路）。${CHAIN_HINT}`).toBeDefined()
    expect(this.agentA.hasToken && this.agentB.hasToken, `缺少登录 token（请先运行「步骤 1」建立链路）。${CHAIN_HINT}`).toBe(true)
    const controller = new AbortController()
    this.watchers = [
      watchRoom({
        origin: this.origin,
        roomId: this.roomId!,
        token: this.agentA.tokenValue,
        label: `${this.options.agentLabels[0]}视角`,
        signal: controller.signal,
      }),
      watchRoom({
        origin: this.origin,
        roomId: this.roomId!,
        token: this.agentB.tokenValue,
        label: `${this.options.agentLabels[1]}视角`,
        signal: controller.signal,
      }),
    ]
    this.stopWatches = () => controller.abort()
    console.log('两个 SSE 监听已启动，后续帧会实时输出。')
  }

  async stepJoin(): Promise<void> {
    step('步骤 4 · 加入房间')
    const room = await this.chainRoom()
    if (room.playerCount >= room.maxPlayers) {
      console.log(`第二名玩家已在房间（${room.playerCount}/${room.maxPlayers}），跳过加入。`)
      return
    }
    const joined = await this.agentB.call<{
      room: { status: string, playerCount: number, maxPlayers: number }
    }>('join-room', { roomId: this.roomId })
    expect(joined.room.status).toBe('waiting')
    expect(joined.room.playerCount).toBe(2)
    expect(joined.room.maxPlayers).toBe(2)
  }

  async stepStartGame(): Promise<void> {
    step('步骤 5 · 双方 start-game（第二次调用触发开局）')
    const room = await this.chainRoom()
    if (room.status !== 'waiting') {
      console.log(`房间状态为 ${room.status}，对局已开始/结束，跳过 start-game。`)
      return
    }
    const aReady = await this.agentA.call<{
      readyCount: number
      maxPlayers: number
      room: { status: string }
    }>('start-game')
    expect(aReady.readyCount).toBe(1)
    expect(aReady.maxPlayers).toBe(2)
    expect(aReady.room.status).toBe('waiting')

    const bStarted = await this.agentB.call<{
      game: { status: string, currentPlayer: 'you' | 'opponent' | null }
      room: { status: string }
    }>('start-game')
    expect(bStarted.room.status).toBe('playing')
    expect(bStarted.game.status).toBe('playing')
    // 竞速游戏（24 Point）没有轮次概念；回合制游戏由建房方（A）先手。
    if (this.options.gameId !== '24-point')
      expect(bStarted.game.currentPlayer).toBe('opponent')
    console.log('对局开始。')
  }

  /** Current chain room state through MCP `get-room` (agent A's view). */
  async chainRoom(): Promise<RoomSummaryPayload> {
    expect(this.roomId, `缺少房间。${CHAIN_HINT}`).toBeDefined()
    const data = await this.agentA.call<{ room: RoomSummaryPayload }>('get-room', { roomId: this.roomId })
    return data.room
  }

  async stepVerifyRoom(): Promise<void> {
    step('步骤 7 · 通过 get-room 复核终局状态')
    expect(this.roomId, `请按链路顺序运行到「步骤 6」。${CHAIN_HINT}`).toBeDefined()
    const finalRoom = await this.agentA.call<{
      room: { status: string }
      game: { status: string, winner?: 'you' | 'opponent' | 'draw', reason?: string }
    }>('get-room', { roomId: this.roomId })
    expect(finalRoom.room.status).toBe('finished')
    expect(finalRoom.game.status).toBe('finished')
    expect(finalRoom.game.reason).toBeTruthy()
    if (this.expectedWinner === 'A')
      expect(finalRoom.game.winner).toBe('you')
    else if (this.expectedWinner === 'B')
      expect(finalRoom.game.winner).toBe('opponent')
    else
      expect(['you', 'opponent']).toContain(finalRoom.game.winner)
  }

  async stepVerifyRest(): Promise<void> {
    step('步骤 8 · REST 房间详情终局断言')
    expect(this.roomId, `请按链路顺序运行到「步骤 6」。${CHAIN_HINT}`).toBeDefined()
    const response = await fetch(`${this.origin.replace(TRAILING_SLASH, '')}/api/rooms/${this.roomId}`)
    expect(response.ok).toBe(true)
    const room = await response.json() as RestRoom
    expect(room.status).toBe('finished')
    expect(room.game.status).toBe('finished')
    expect(room.game.finishReason).toBeTruthy()
    expect(room.game.moveCount ?? 0).toBeGreaterThan(0)
    expect(room.events.some(event => event.type === 'game_finished')).toBe(true)

    if (this.expectedWinner === 'either') {
      expect(room.winner).toBeTruthy()
    }
    else {
      const expectedNickname = this.expectedWinner === 'A' ? this.nicknames[0] : this.nicknames[1]
      const winner = room.players.find(player => player.sessionId === room.winner)
      expect(winner?.nickname).toBe(expectedNickname)
    }
    this.options.verifyRest?.(room)
  }

  async stepVerifySse(): Promise<void> {
    step('步骤 9 · 等待双方 SSE 流收到终局并关闭')
    expect(this.roomId, `请按链路顺序运行到「步骤 6」。${CHAIN_HINT}`).toBeDefined()

    let aFrames: WatchFrame[]
    let bFrames: WatchFrame[]
    if (this.watchers) {
      const watchers = Promise.all(this.watchers)
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('SSE 流未在 10 秒内结束，请确认前面的步骤已把对局打完')),
          10_000,
        )
      })
      const [aResult, bResult] = await Promise.race([watchers, timeout])
        .finally(() => clearTimeout(timer))
      aFrames = aResult
      bFrames = bResult
    }
    else {
      // 单独续跑本步骤时没有进程内的监听，改为对链路中的同一房间临时打开 SSE
      // 复查终局帧（不新建房间，仍属于同一条链路）。
      console.log('本轮未启动 SSE 监听，改为对链路中的房间临时打开 SSE 复查终局帧。')
      const controller = new AbortController()
      try {
        const frames = await watchRoom({
          origin: this.origin,
          roomId: this.roomId!,
          token: this.agentA.tokenValue,
          label: '终局复查',
          signal: controller.signal,
          timeoutMs: 10_000,
        })
        aFrames = frames
        bFrames = frames
      }
      finally {
        controller.abort()
      }
    }

    const terminal = (frames: WatchFrame[]) =>
      frames.some(frame =>
        frame.data.status === 'finished'
        || (frame.data.room as { status?: string } | undefined)?.status === 'finished')
    expect(terminal(aFrames)).toBe(true)
    expect(terminal(bFrames)).toBe(true)
    console.log(`SSE 流正常结束（${this.options.agentLabels[0]} ${aFrames.length} 帧，${this.options.agentLabels[1]} ${bFrames.length} 帧）。`)
  }

  private async persistChain(): Promise<void> {
    await saveChainState(this.options.gameId, {
      agentAToken: this.agentA.tokenValue!,
      agentBToken: this.agentB.tokenValue!,
      agentANickname: this.nicknames[0],
      agentBNickname: this.nicknames[1],
      roomId: this.roomId,
    })
  }
}

/**
 * Register the standard per-step `it` suite for a game flow. Game-specific
 * behavior plugs in as `extraSteps` (run between step 5 and the play step)
 * and the `play` script (step 6).
 */
export function defineGameFlowSuite(
  title: string,
  options: GameFlowOptions,
  play: GameFlowStep['run'],
  extraSteps: GameFlowStep[] = [],
): void {
  describe.sequential(title, () => {
    const match = new GameMatch(options)

    beforeAll(async () => {
      await match.setup()
    })

    afterAll(async () => {
      await match.teardown()
    })

    it('步骤 0 · 校验 MCP 工具清单与 server/mcp/tools 文件一致', async () => {
      await match.stepToolsList()
    }, 60_000)

    it('步骤 1 · 两个人物分别登录', async () => {
      await match.stepLogin()
    }, 60_000)

    it('步骤 2 · 创建房间', async () => {
      await match.stepCreateRoom()
    }, 60_000)

    it('步骤 3 · 双方启动整场 SSE watch 流', async () => {
      await match.stepStartWatches()
    }, 60_000)

    it('步骤 4 · 加入房间', async () => {
      await match.stepJoin()
    }, 60_000)

    it('步骤 5 · 双方 start-game（第二次调用触发开局）', async () => {
      await match.stepStartGame()
    }, 60_000)

    for (const extra of extraSteps) {
      it(extra.title, async () => {
        await extra.run(match)
      }, 60_000)
    }

    it('步骤 6 · 执行动作直到分出胜负', async () => {
      await play(match)
    }, 60_000)

    it('步骤 7 · 通过 get-room 复核终局状态', async () => {
      await match.stepVerifyRoom()
    }, 60_000)

    it('步骤 8 · REST 房间详情终局断言', async () => {
      await match.stepVerifyRest()
    }, 60_000)

    it('步骤 9 · 等待双方 SSE 流收到终局并关闭', async () => {
      await match.stepVerifySse()
    }, 60_000)
  })
}
