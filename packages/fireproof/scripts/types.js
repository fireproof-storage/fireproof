import fs from 'fs'
import path from 'path'
// import { createBuildSettings } from './settings.js' // import your build settings

// Get the entry points from your build settings
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
// const entryPoints = ['database', 'index', 'types']// createBuildSettings({}).map(config => path.basename(config.entryPoints[0], '.ts'))

function generateIndexFile() {
  const typesDir = path.resolve('dist/types')
  const srcTypesPath = path.resolve('src/types.d.ts')
  const typeIndexPath = path.resolve('dist/types/fireproof.d.ts')

  // Read the contents of src/types.d.ts
  const srcTypesContent = fs.readFileSync(srcTypesPath, 'utf8')

  // Write the contents to dist/types/types.d.ts
  fs.writeFileSync(path.join(typesDir, 'types.d.ts'), srcTypesContent, 'utf8')

  const toAppend = '\nexport * from \'./types\';\n'
  const typeIndexContent = fs.readFileSync(typeIndexPath, 'utf8')
  fs.writeFileSync(typeIndexPath, typeIndexContent + toAppend, 'utf8')
}

// Call this function as part of your build process
generateIndexFile()
