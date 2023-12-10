/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { build } from 'esbuild'
// import { createBuildSettings } from './settings.js'

async function buildProject() {
  const baseConfig = {
    entryPoints: ['src/index.ts'],
    bundle: true,
    sourcemap: true,
    plugins: [],
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-native', 'react-native-fs'],
  };

  const buildConfigs = [
    {
      ...baseConfig,
      outfile: `dist/index.cjs`,
      format: 'cjs',
    },
    {
      ...baseConfig,
      outfile: `dist/index.esm.js`,
      format: 'esm',
    },
    {
      ...baseConfig,
      outfile: `dist/index.native.js`,
      format: 'esm',
      plugins: [
        ...baseConfig.plugins,
      ]
    }
  ];

  for (const config of buildConfigs) {
    console.log('Building', config.outfile)
    build(config).catch((e) => {
      console.log('Error', config.outfile, e)
    })
  }
}

buildProject().catch((err) => {
  console.error(err)
  process.exit(1)
})
