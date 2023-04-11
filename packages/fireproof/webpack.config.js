import NodePolyfillPlugin from 'node-polyfill-webpack-plugin'

export default {
  // Other rules...
  plugins: [
    new NodePolyfillPlugin()
  ]
}
