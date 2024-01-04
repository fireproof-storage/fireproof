import { spawn } from 'child_process'
const args = process.argv.slice(2)

let command = 'mocha test/*.js'

if (args.length > 0) {
  command += ` --grep '${args.join(' ')}'`
}

const mocha = spawn(command, { stdio: 'inherit', shell: true })

mocha.on('close', (code) => {
  process.exit(code)
})
