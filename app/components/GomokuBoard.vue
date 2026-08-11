<script setup lang="ts">
import type { GameSnapshot } from '#shared/game'
import type { GomokuCell, GomokuPoint, GomokuState } from '#shared/gomoku'
import type { Ellipse, Group, Leafer, Line } from 'leafer-ui'
import {
  GOMOKU_BLACK,
  GOMOKU_CELLS,
  GOMOKU_EMPTY,
  GOMOKU_SIZE,
  GOMOKU_STAR_POINTS,
  gomokuColumnLabel,
  gomokuIndex,
} from '#shared/gomoku'

const props = withDefaults(defineProps<{
  game?: GameSnapshot | null
}>(), {
  game: null,
})

const hostRef = ref<HTMLDivElement | null>(null)
const colorMode = useColorMode()

let LeaferClass: typeof Leafer
let GroupClass: typeof Group
let EllipseClass: typeof Ellipse
let LineClass: typeof Line

let leafer: Leafer | null = null
let gridGroup: Group | null = null
let stoneLayer: Group | null = null
let markerLayer: Group | null = null
let lastMoveMarker: Ellipse | null = null
let winMarkers: Ellipse[] = []
let resizeObserver: ResizeObserver | null = null
let size = 0
let disposed = false

const stoneNodes = new Map<number, Ellipse>()

const BOARD_PADDING_RATIO = 0.07
const BOARD_CELL_RATIO = (1 - BOARD_PADDING_RATIO * 2) / (GOMOKU_SIZE - 1)
const BOARD_LABEL_RATIO = BOARD_PADDING_RATIO / 2

function linePositionRatio(index: number): number {
  return BOARD_PADDING_RATIO + index * BOARD_CELL_RATIO
}

const state = computed<GomokuState | null>(() => {
  const value = props.game?.state
  if (!value || typeof value !== 'object')
    return null
  const candidate = value as GomokuState
  return Array.isArray(candidate.board) && candidate.board.length === GOMOKU_CELLS
    ? candidate
    : null
})

function boardMetrics() {
  const padding = size * BOARD_PADDING_RATIO
  const cell = size * BOARD_CELL_RATIO
  return { padding, cell }
}

function boardColor(name: string, fallback: string): string {
  if (!hostRef.value)
    return fallback
  return getComputedStyle(hostRef.value).getPropertyValue(name).trim() || fallback
}

function stoneMetrics(x: number, y: number) {
  const { padding, cell } = boardMetrics()
  return {
    cx: padding + x * cell,
    cy: padding + y * cell,
    radius: cell * 0.44,
    cell,
  }
}

function addGroup(group: Group): void {
  if (!leafer)
    return
  leafer.add(group)
}

function drawGrid(): void {
  if (!leafer || !gridGroup)
    return

  while (gridGroup.children.length > 0)
    gridGroup.remove(gridGroup.children[0]!)

  const { padding, cell } = boardMetrics()
  const edge = padding + cell * (GOMOKU_SIZE - 1)
  const lineColor = boardColor('--board-line', '#8884')
  const starColor = boardColor('--board-star', '#8886')
  const lineWidth = Math.max(1, cell * 0.035)

  for (let i = 0; i < GOMOKU_SIZE; i++) {
    const offset = padding + i * cell
    gridGroup.add(new LineClass({
      points: [padding, offset, edge, offset],
      stroke: lineColor,
      strokeWidth: lineWidth,
    }))
    gridGroup.add(new LineClass({
      points: [offset, padding, offset, edge],
      stroke: lineColor,
      strokeWidth: lineWidth,
    }))
  }

  const starRadius = Math.max(2, cell * 0.09)
  for (const point of GOMOKU_STAR_POINTS) {
    const { cx, cy } = stoneMetrics(point.x, point.y)
    gridGroup.add(new EllipseClass({
      x: cx - starRadius,
      y: cy - starRadius,
      width: starRadius * 2,
      height: starRadius * 2,
      fill: starColor,
    }))
  }
}

function createStone(x: number, y: number, color: GomokuCell, animate: boolean): Ellipse {
  const { cx, cy, radius } = stoneMetrics(x, y)
  const isBlack = color === GOMOKU_BLACK
  const fill = boardColor(isBlack ? '--board-black' : '--board-white', isBlack ? '#202124' : '#f8f7f2')
  const stroke = boardColor(isBlack ? '--board-black-stroke' : '--board-white-stroke', isBlack ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.18)')
  const stone = new EllipseClass({
    x: cx,
    y: cy,
    width: radius * 2,
    height: radius * 2,
    fill,
    stroke,
    strokeWidth: 1,
    around: 'center',
  })

  if (animate) {
    stone.opacity = 0
    stone.scale = 0.35
    stone.animate(
      { opacity: 1, scale: 1 },
      { duration: 0.22, easing: 'ease-out' },
    )
  }

  return stone
}

function updateLastMoveMarker(): void {
  if (!markerLayer)
    return
  if (lastMoveMarker) {
    markerLayer.remove(lastMoveMarker)
    lastMoveMarker = null
  }

  const last = state.value?.lastMove
  const winLine = props.game?.finishDetails?.winLine
  const isWinningMove = Array.isArray(winLine)
    && last != null
    && winLine.some(point => point.x === last.x && point.y === last.y)
  if (!last || isWinningMove)
    return

  const { cx, cy, radius } = stoneMetrics(last.x, last.y)
  const dotRadius = radius * 0.32
  lastMoveMarker = new EllipseClass({
    x: cx - dotRadius,
    y: cy - dotRadius,
    width: dotRadius * 2,
    height: dotRadius * 2,
    fill: boardColor('--board-accent', '#e5484d'),
  })
  markerLayer.add(lastMoveMarker)
}

function updateWinLine(): void {
  if (!markerLayer)
    return
  for (const marker of winMarkers)
    markerLayer.remove(marker)
  winMarkers = []

  const rawLine = props.game?.finishDetails?.winLine
  const line = Array.isArray(rawLine) ? rawLine as GomokuPoint[] : null
  if (!line || line.length < 2)
    return

  const highlight = boardColor('--board-win', '#39732e')

  for (const point of line) {
    const { cx, cy, radius } = stoneMetrics(point.x, point.y)
    const dotRadius = radius * 0.3
    winMarkers.push(new EllipseClass({
      x: cx - dotRadius,
      y: cy - dotRadius,
      width: dotRadius * 2,
      height: dotRadius * 2,
      fill: highlight,
      opacity: 0.85,
    }))
  }

  for (const marker of winMarkers)
    markerLayer.add(marker)
}

function renderBoard(animate: boolean): void {
  if (!leafer)
    return

  drawGrid()

  const current = state.value
  if (!current) {
    for (const stone of stoneNodes.values())
      stoneLayer?.remove(stone)
    stoneNodes.clear()
    updateLastMoveMarker()
    updateWinLine()
    return
  }

  const seen = new Set<number>()
  for (let y = 0; y < GOMOKU_SIZE; y++) {
    for (let x = 0; x < GOMOKU_SIZE; x++) {
      const index = gomokuIndex(x, y)
      const cell = current.board[index] ?? GOMOKU_EMPTY
      if (cell === GOMOKU_EMPTY)
        continue

      seen.add(index)
      if (stoneNodes.has(index))
        continue

      const stone = createStone(x, y, cell, animate)
      stoneNodes.set(index, stone)
      stoneLayer?.add(stone)
    }
  }

  for (const [index, stone] of stoneNodes) {
    if (!seen.has(index)) {
      stoneLayer?.remove(stone)
      stoneNodes.delete(index)
    }
  }

  updateLastMoveMarker()
  updateWinLine()
}

function resetBoard(): void {
  for (const stone of stoneNodes.values())
    stoneLayer?.remove(stone)
  stoneNodes.clear()
  if (lastMoveMarker) {
    markerLayer?.remove(lastMoveMarker)
    lastMoveMarker = null
  }
  for (const marker of winMarkers)
    markerLayer?.remove(marker)
  winMarkers = []
  renderBoard(false)
}

onMounted(async () => {
  const host = hostRef.value
  if (!host)
    return

  const mod = await import('leafer-ui')
  await import('@leafer-in/animate')
  if (disposed || !host.isConnected)
    return

  LeaferClass = mod.Leafer
  GroupClass = mod.Group
  EllipseClass = mod.Ellipse
  LineClass = mod.Line

  size = Math.floor(host.clientWidth || 560)
  leafer = new LeaferClass({
    view: host,
    width: size,
    height: size,
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
  })
  gridGroup = new GroupClass({ name: 'gomoku-grid' })
  stoneLayer = new GroupClass({ name: 'gomoku-stones' })
  markerLayer = new GroupClass({ name: 'gomoku-markers' })
  addGroup(gridGroup)
  addGroup(stoneLayer)
  addGroup(markerLayer)

  renderBoard(false)

  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width
    if (!width || !leafer)
      return
    const next = Math.floor(width)
    if (next === size)
      return
    size = next
    leafer.resize({ width: size, height: size })
    resetBoard()
  })
  resizeObserver.observe(host)
})

onBeforeUnmount(() => {
  disposed = true
  resizeObserver?.disconnect()
  resizeObserver = null
  leafer?.destroy()
  leafer = null
})

watch(() => props.game, () => renderBoard(true), { deep: true })

watch(() => colorMode.value, () => {
  if (leafer)
    resetBoard()
})
</script>

<template>
  <div
    ref="hostRef"
    class="board-surface border border-base rounded-lg bg-secondary w-full aspect-square select-none relative overflow-hidden"
  >
    <div class="board-labels" aria-hidden="true">
      <span
        v-for="index in GOMOKU_SIZE"
        :key="`bottom-${index}`"
        class="board-label text-micro color-faint font-mono"
        :style="{ left: `${linePositionRatio(index - 1) * 100}%`, top: `${(1 - BOARD_LABEL_RATIO) * 100}%` }"
      >
        {{ gomokuColumnLabel(index - 1) }}
      </span>
      <span
        v-for="index in GOMOKU_SIZE"
        :key="`left-${index}`"
        class="board-label text-micro color-faint font-mono"
        :style="{ left: `${BOARD_LABEL_RATIO * 100}%`, top: `${linePositionRatio(index - 1) * 100}%` }"
      >
        {{ GOMOKU_SIZE - index + 1 }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.board-surface {
  --board-line: #8884;
  --board-star: #8886;
  --board-black: #202124;
  --board-white: #f8f7f2;
  --board-black-stroke: rgba(255, 255, 255, 0.35);
  --board-white-stroke: rgba(0, 0, 0, 0.18);
  --board-accent: #e5484d;
  --board-win: var(--colors-primary-600);
}

:global(html.dark .board-surface) {
  --board-line: #8885;
  --board-star: #8887;
  --board-black: #2b2b2c;
  --board-white: #f2f1ed;
  --board-black-stroke: rgba(255, 255, 255, 0.45);
  --board-white-stroke: rgba(0, 0, 0, 0.3);
  --board-win: var(--colors-primary-300);
}

.board-labels {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.board-label {
  position: absolute;
  transform: translate(-50%, -50%);
  font-weight: 400;
  white-space: nowrap;
}
</style>
