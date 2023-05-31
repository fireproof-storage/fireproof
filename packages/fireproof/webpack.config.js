import NodePolyfillPlugin from 'node-polyfill-webpack-plugin'
import { FilerWebpackPlugin } from 'filer/webpack'
// import nodeExternals from "webpack-node-externals";

export default {
  // Other rules...
  // target:"web",
  // externals: [nodeExternals()],
  plugins: [
    new NodePolyfillPlugin(),
    new FilerWebpackPlugin()
  ]
}
