import { GAMES } from '#shared/games'

export default defineMcpResource({
  description: 'Catalog of games available on Zero Player',
  uri: 'zero-player://games',
  metadata: {
    mimeType: 'application/json',
  },
  handler: async () => ({
    contents: [{
      uri: 'zero-player://games',
      mimeType: 'application/json',
      text: JSON.stringify(GAMES, null, 2),
    }],
  }),
})
