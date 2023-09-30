/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { build } from 'esbuild'
import { createBuildSettings } from './settings.js'

async function buildProject() {
  const buildConfigs = createBuildSettings()

  for (const config of buildConfigs) {
    console.log('Building', config.outfile)
    build(config).catch(() => {
      console.log('Error', config.outfile)
    })
  }
}

buildProject().catch((err) => {
  console.error(err)
  process.exit(1)
})
