/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as esbuild from 'esbuild'
import fs from 'fs'
import { createBuildSettings } from './settings.js'

const mode = process.env.npm_config_mode

async function analyzeProject() {
  const buildConfigs = createBuildSettings({ minify: true, metafile: true })

  for (const config of buildConfigs) {
    if (!/fireproof/.test(config.outfile)) continue
    try {
      const result = await esbuild.build(config)

      if (mode === 'write') {
        fs.writeFileSync(`build-meta-${result.format}.json`, JSON.stringify(result.metafile))
      } else {
        console.log(await esbuild.analyzeMetafile(result.metafile, {
          verbose: false
        }))
      }
    } catch (err) {
      console.error(err)
    }
  }
}

analyzeProject().catch((err) => {
  console.error(err)
  process.exit(1)
})
