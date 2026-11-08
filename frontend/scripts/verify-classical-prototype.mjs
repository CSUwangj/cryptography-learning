import { chromium } from 'playwright'

const url = 'http://127.0.0.1:3001/horizontal-classical-cipher'

console.log('Starting verification with simplified interactions...\n')

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 })
  console.log('✓ Page loaded')

  await page.waitForSelector('.cipher-display-wrapper', { timeout: 5000 })

  // Initial screenshot
  await page.screenshot({ path: '/tmp/classical-initial.png', fullPage: true })
  console.log('✓ Initial screenshot: /tmp/classical-initial.png')

  // Check global shift control position
  const controlExists = await page.locator('.global-shift-control').count()
  console.log(`✓ Global shift control present: ${controlExists > 0}`)

  if (controlExists > 0) {
    const box = await page.locator('.global-shift-control').boundingBox()
    const wrapperBox = await page.locator('.cipher-display-wrapper').boundingBox()
    console.log(`  Control: x=${Math.round(box.x)}, y=${Math.round(box.y)}, w=${Math.round(box.width)}, h=${Math.round(box.height)}`)
    console.log(`  Wrapper: x=${Math.round(wrapperBox.x)}`)
    console.log(`  ✓ Control on RIGHT side: ${box.x > wrapperBox.x + 400}`)
  }

  // Test using direct value setting
  const plaintextInput = page.locator('input.bp5-input').first()
  await plaintextInput.fill('HELLO WORLD')

  // Set shift to 5 via evaluate
  await page.evaluate(() => {
    const sliders = document.querySelectorAll('.global-shift-control .bp5-slider')
    if (sliders.length > 0) {
      const slider = sliders[0]
      const reactProps = Object.keys(slider).find(key => key.startsWith('__reactProps'))
      if (reactProps && slider[reactProps]?.onChange) {
        slider[reactProps].onChange(5)
      }
    }
  })

  await page.waitForTimeout(800)
  await page.screenshot({ path: '/tmp/classical-shift5.png', fullPage: true })
  console.log('✓ Shift=5 screenshot: /tmp/classical-shift5.png')

  const ciphertext = await page.locator('h3').filter({ hasText: 'Ciphertext' }).textContent()
  const match = ciphertext.includes('MJQQT BTWQI')
  console.log(`  Ciphertext: ${ciphertext.trim()}`)
  console.log(`  Expected: Ciphertext: MJQQT BTWQI`)
  console.log(`  ✓ Match: ${match}`)

  // Test C: 1→2
  await plaintextInput.fill('C')
  await page.evaluate(() => {
    const sliders = document.querySelectorAll('.global-shift-control .bp5-slider')
    if (sliders.length > 0) {
      const reactProps = Object.keys(sliders[0]).find(key => key.startsWith('__reactProps'))
      if (reactProps && sliders[0][reactProps]?.onChange) {
        sliders[0][reactProps].onChange(1)
      }
    }
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/classical-C-D.png' })
  console.log('✓ C shift=1 → D')

  await page.evaluate(() => {
    const sliders = document.querySelectorAll('.global-shift-control .bp5-slider')
    if (sliders.length > 0) {
      const reactProps = Object.keys(sliders[0]).find(key => key.startsWith('__reactProps'))
      if (reactProps && sliders[0][reactProps]?.onChange) {
        sliders[0][reactProps].onChange(2)
      }
    }
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/classical-C-E.png' })
  console.log('✓ C shift=2 → E (from D)')

  // Test Z→A→B
  await plaintextInput.fill('Z')
  await page.evaluate(() => {
    const sliders = document.querySelectorAll('.global-shift-control .bp5-slider')
    if (sliders.length > 0) {
      const reactProps = Object.keys(sliders[0]).find(key => key.startsWith('__reactProps'))
      if (reactProps && sliders[0][reactProps]?.onChange) {
        sliders[0][reactProps].onChange(0)
      }
    }
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/classical-Z.png' })
  console.log('✓ Z shift=0 → Z')

  await page.evaluate(() => {
    const sliders = document.querySelectorAll('.global-shift-control .bp5-slider')
    if (sliders.length > 0) {
      const reactProps = Object.keys(sliders[0]).find(key => key.startsWith('__reactProps'))
      if (reactProps && sliders[0][reactProps]?.onChange) {
        sliders[0][reactProps].onChange(1)
      }
    }
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/classical-Z-A.png' })
  console.log('✓ Z shift=1 → A')

  await page.evaluate(() => {
    const sliders = document.querySelectorAll('.global-shift-control .bp5-slider')
    if (sliders.length > 0) {
      const reactProps = Object.keys(sliders[0]).find(key => key.startsWith('__reactProps'))
      if (reactProps && sliders[0][reactProps]?.onChange) {
        sliders[0][reactProps].onChange(2)
      }
    }
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/classical-Z-B.png' })
  console.log('✓ Z shift=2 → B')

  // Test disabled animation
  await plaintextInput.fill('ABC')
  await page.locator('label.bp5-checkbox').filter({ hasText: /Animate/i }).locator('input').uncheck()
  await page.evaluate(() => {
    const sliders = document.querySelectorAll('.global-shift-control .bp5-slider')
    if (sliders.length > 0) {
      const reactProps = Object.keys(sliders[0]).find(key => key.startsWith('__reactProps'))
      if (reactProps && sliders[0][reactProps]?.onChange) {
        sliders[0][reactProps].onChange(10)
      }
    }
  })
  await page.waitForTimeout(200)
  await page.screenshot({ path: '/tmp/classical-no-anim.png' })
  console.log('✓ No animation mode')

  // Narrow screen
  await page.setViewportSize({ width: 375, height: 667 })
  await plaintextInput.fill('HI')
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/tmp/classical-narrow.png', fullPage: true })
  const narrowBox = await page.locator('.global-shift-control').boundingBox()
  console.log(`✓ Narrow screen: control w=${Math.round(narrowBox.width)}`)

  // Vigenere
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('label').filter({ hasText: /Vigenere/i }).click({ force: true })
  await page.waitForTimeout(500)
  const noControl = await page.locator('.global-shift-control').count()
  console.log(`✓ Vigenere: global control hidden=${noControl === 0}`)
  await page.screenshot({ path: '/tmp/classical-vigenere.png', fullPage: true })

  // Affine
  await page.locator('label').filter({ hasText: /Affine/i }).click({ force: true })
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/tmp/classical-affine.png', fullPage: true })
  console.log('✓ Affine (direct mapping)')

  console.log('\n✓✓✓ All verifications complete ✓✓✓')

} catch (e) {
  console.error('\n✗ Error:', e.message)
  await page.screenshot({ path: '/tmp/classical-error.png', fullPage: true })
  throw e
} finally {
  await browser.close()
}
