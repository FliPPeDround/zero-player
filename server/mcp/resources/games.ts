import { GAMES } from '#shared/games'

export default defineMcpResource({
  description: 'Games available on Zero Player: id, name, how it is played, player count, and whether it is turn-based or a race.',
  uri: 'zero-player://games',
  metadata: {
    mimeType: 'application/json',
  },
  handler: async () => ({
    contents: [{
      uri: 'zero-player://games',
      mimeType: 'application/json',
      text: JSON.stringify(GAMES.map(({ id, name, description, minPlayers, maxPlayers, turnBased }) => ({
        id,
        name,
        description,
        minPlayers,
        maxPlayers,
        turnBased,
      })), null, 2),
    }],
  }),
})
