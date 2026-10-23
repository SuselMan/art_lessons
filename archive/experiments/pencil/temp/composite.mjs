import sharp from 'sharp'
const KEYS = ['coarse-scan', 'medium-scan', 'fine-scan', 'coarse-proc']
const CROP = 480
for (const kind of ['blank', 'stroke']) {
  const tiles = await Promise.all(KEYS.map(async k => {
    const img = sharp(`shots/${k}-${kind}.png`)
    const m = await img.metadata()
    const left = Math.round((m.width - CROP) * (kind === 'blank' ? 0.5 : 0.45))
    const top = Math.round((m.height - CROP) * (kind === 'blank' ? 0.5 : 0.42))
    return img.extract({ left, top, width: CROP, height: CROP }).toBuffer()
  }))
  await sharp({ create: { width: CROP * 2 + 8, height: CROP * 2 + 8, channels: 3, background: '#202020' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 2) * (CROP + 8), top: Math.floor(i / 2) * (CROP + 8) })))
    .png().toFile(`canvas-${kind}.png`)
  console.log(`canvas-${kind}.png`)
}
