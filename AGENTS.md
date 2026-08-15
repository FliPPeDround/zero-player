# AGENTS

## Design

When making UI or using components, always check if components from
`@antfu/design` can be reused, before making new components or creating
inline DOM elements.

## MCP architecture (do not change casually)

- MCP tools are clients of the standard REST API: every operation they perform
  goes through `$fetch` to those endpoints. They must not reimplement room
  mutations, login, or game moves by calling server services directly.
- Session-to-room resolution lives in the MCP layer:
  `server/mcp/utils/current-room.ts` maps an MCP session id to the current
  active room id, then tools use that room id with the standard REST routes.
  This resolver is the only direct room-store read allowed from MCP; all
  mutations still go through REST.
- MCP should simulate human operations, not expose raw API parameters.
  Internal ids, raw action shapes, and machine-only fields belong behind REST;
  MCP arguments should be human-meaningful (enums, room choices, coordinates).
- The MCP session id maps to exactly one active room. MCP actions such as
  moves and leave must not ask the model for a `roomId`; the MCP resolver
  supplies it internally.
- Games are known at build time. `create-room` takes a game enum, not a
  free-form `gameId`. Each playable game declares its own `make-<game>-move`
  MCP schema as a static `mcpMoveDefinition` on its engine class and registers
  the tool via `BaseGame.defineMcpMoveTool` in a one-line file under
  `server/mcp/tools/games/`.
- Human game notation is used at the MCP boundary (e.g. `H8` for Gomoku);
  internal engines keep their own representation.
- `leave-room` exits the current room: in a waiting room it gives up the
  seat, and in a running game it marks the match for abandonment after a
  grace period (no winner) — the room is not aborted immediately, and
  rejoining the same room within that window cancels the abandonment. It
  requires the human user's explicit confirmation before leaving. Agents
  must never call it autonomously: they may recommend leaving and present the
  reason, but they must ask the human user and wait for confirmation. On
  clients without inline confirmation prompts, ask the human user in
  conversation first, then call `leave-room` with `confirmed: true` only after
  they explicitly agree.
