import { launch } from 'puppeteer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

void (async () => {
  const browser = await launch({ headless: 'new' })
  const page = await browser.newPage()

  // Add an event listener to echo console messages from the page
  page.on('console', (msg) => {
    console.log('console', msg.args().length)
    for (let i = 0; i < msg.args().length; ++i) {
      console.log(`${i}: ${msg.args()[i].toString()} ${JSON.stringify(msg.args()[i])}`)
    }
  })

  // Get the directory of the current module
  const currentDir = dirname(fileURLToPath(import.meta.url))

  // Construct the absolute path to your iife.html file
  const filePath = join(currentDir, '../test/www/iife.html')
  const url = `file://${filePath}`

  await page.goto(url)

  // Wait for some time to ensure the database operation is complete
  // await page.waitForTimeout(1000)

  // Click the button to run onButtonClick
  await page.click('button')

  // await page.waitForTimeout(1000)
  await page.waitForSelector('li', { timeout: 5000 })

  // Reload the page to trigger initialize
  await page.reload()

  await page.waitForSelector('li')

  // Check if the list contains at least one item
  const result = await page.evaluate(() => {
    const listItems = document.querySelectorAll('ul > li')
    return listItems.length > 0 ? 'success' : 'failure'
  })

  if (result === 'success') {
    console.log('Test passed')
    process.exit(0)
  } else {
    console.log('Test failed')
    process.exit(1)
  }

  await browser.close()
})()
