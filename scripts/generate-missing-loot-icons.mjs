import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const OUT_DIRS = [path.resolve('public/loot'), path.resolve('dist/renderer/loot')]
for (const outDir of OUT_DIRS) fs.mkdirSync(outDir, { recursive: true })

// 32x32, centered, clear silhouettes. Legendary = most detail/wow, common = simple but readable.
const ICONS = {
  // Epic — stronger sci-fi visor silhouette
  'neon_visor_bw_user.png': `
    <rect x="3" y="9" width="26" height="2"/>
    <rect x="4" y="11" width="10" height="8"/>
    <rect x="18" y="11" width="10" height="8"/>
    <rect x="14" y="12" width="4" height="3"/>
    <rect x="5" y="19" width="9" height="2"/>
    <rect x="18" y="19" width="9" height="2"/>
    <rect x="2" y="10" width="2" height="2"/>
    <rect x="28" y="10" width="2" height="2"/>
    <rect x="7" y="12" width="2" height="1"/>
    <rect x="23" y="12" width="2" height="1"/>
  `,
  // Legendary — clear cyber jacket with collar/zip/pockets
  'hacker_jacket_bw_user.png': `
    <rect x="11" y="2" width="10" height="2"/>
    <rect x="9" y="4" width="14" height="2"/>
    <rect x="7" y="6" width="18" height="2"/>
    <rect x="5" y="8" width="22" height="2"/>
    <rect x="4" y="10" width="4" height="16"/>
    <rect x="24" y="10" width="4" height="16"/>
    <rect x="8" y="10" width="16" height="2"/>
    <rect x="9" y="12" width="14" height="2"/>
    <rect x="10" y="14" width="12" height="2"/>
    <rect x="11" y="16" width="10" height="8"/>
    <rect x="14" y="9" width="4" height="15"/>
    <rect x="15" y="6" width="2" height="3"/>
    <rect x="10" y="17" width="3" height="5"/>
    <rect x="19" y="17" width="3" height="5"/>
    <rect x="5" y="24" width="3" height="3"/>
    <rect x="24" y="24" width="3" height="3"/>
    <rect x="11" y="24" width="10" height="2"/>
    <rect x="12" y="10" width="2" height="3"/>
    <rect x="18" y="10" width="2" height="3"/>
  `,
  // Rare — beanie with pompom + knit bands
  'zen_beanie_bw_user.png': `
    <rect x="14" y="2" width="4" height="3"/>
    <rect x="12" y="5" width="8" height="2"/>
    <rect x="10" y="7" width="12" height="2"/>
    <rect x="8" y="9" width="16" height="2"/>
    <rect x="7" y="11" width="18" height="2"/>
    <rect x="6" y="13" width="20" height="7"/>
    <rect x="7" y="20" width="18" height="2"/>
    <rect x="8" y="22" width="16" height="3"/>
    <rect x="9" y="25" width="14" height="2"/>
    <rect x="10" y="15" width="12" height="1"/>
    <rect x="10" y="17" width="12" height="1"/>
    <rect x="11" y="19" width="10" height="1"/>
  `,
  // Rare — iconic pixel shades (deal-with-it shape)
  'pixel_shades_bw_user.png': `
    <rect x="2" y="11" width="12" height="3"/>
    <rect x="18" y="11" width="12" height="3"/>
    <rect x="14" y="13" width="4" height="2"/>
    <rect x="2" y="14" width="3" height="8"/>
    <rect x="11" y="14" width="3" height="8"/>
    <rect x="18" y="14" width="3" height="8"/>
    <rect x="27" y="14" width="3" height="8"/>
    <rect x="5" y="22" width="7" height="2"/>
    <rect x="20" y="22" width="7" height="2"/>
    <rect x="6" y="10" width="3" height="1"/>
    <rect x="23" y="10" width="3" height="1"/>
  `,
  // Common — simple but readable sweater
  'cozy_sweater_bw_user.png': `
    <rect x="12" y="6" width="8" height="2"/>
    <rect x="10" y="8" width="12" height="2"/>
    <rect x="8" y="10" width="16" height="2"/>
    <rect x="6" y="12" width="4" height="12"/>
    <rect x="22" y="12" width="4" height="12"/>
    <rect x="10" y="12" width="12" height="12"/>
    <rect x="9" y="24" width="14" height="3"/>
    <rect x="14" y="10" width="4" height="2"/>
    <rect x="11" y="16" width="10" height="1"/>
    <rect x="11" y="19" width="10" height="1"/>
  `,
  // Legendary — dramatic cloak with hood + torn tails
  'phantom_cloak_bw_user.png': `
    <rect x="13" y="2" width="6" height="4"/>
    <rect x="10" y="6" width="12" height="2"/>
    <rect x="8" y="8" width="16" height="2"/>
    <rect x="6" y="10" width="20" height="2"/>
    <rect x="4" y="12" width="24" height="2"/>
    <rect x="3" y="14" width="26" height="2"/>
    <rect x="2" y="16" width="28" height="2"/>
    <rect x="2" y="18" width="28" height="2"/>
    <rect x="3" y="20" width="26" height="2"/>
    <rect x="4" y="22" width="24" height="2"/>
    <rect x="3" y="24" width="8" height="5"/>
    <rect x="12" y="24" width="8" height="5"/>
    <rect x="21" y="24" width="8" height="5"/>
    <rect x="14" y="10" width="4" height="6"/>
    <rect x="8" y="12" width="2" height="2"/>
    <rect x="22" y="12" width="2" height="2"/>
  `,
  // Epic — premium over-ear headphones
  'beat_headphones_bw_user.png': `
    <rect x="5" y="7" width="22" height="3"/>
    <rect x="4" y="10" width="3" height="12"/>
    <rect x="25" y="10" width="3" height="12"/>
    <rect x="7" y="10" width="18" height="2"/>
    <rect x="5" y="20" width="7" height="10"/>
    <rect x="20" y="20" width="7" height="10"/>
    <rect x="7" y="22" width="3" height="6"/>
    <rect x="22" y="22" width="3" height="6"/>
    <rect x="12" y="20" width="8" height="2"/>
    <rect x="14" y="22" width="4" height="2"/>
    <rect x="16" y="24" width="1" height="4"/>
    <rect x="17" y="27" width="3" height="1"/>
  `,
  // Rare — academic cape with clasp + fold lines
  'scholar_cape_bw_user.png': `
    <rect x="11" y="4" width="10" height="2"/>
    <rect x="9" y="6" width="14" height="2"/>
    <rect x="7" y="8" width="18" height="2"/>
    <rect x="6" y="10" width="20" height="2"/>
    <rect x="5" y="12" width="3" height="14"/>
    <rect x="24" y="12" width="3" height="14"/>
    <rect x="8" y="12" width="16" height="12"/>
    <rect x="9" y="24" width="14" height="2"/>
    <rect x="11" y="26" width="10" height="2"/>
    <rect x="14" y="10" width="4" height="2"/>
    <rect x="13" y="16" width="6" height="1"/>
    <rect x="13" y="19" width="6" height="1"/>
    <rect x="15" y="12" width="2" height="2"/>
  `,
  // Epic — ring with clear gem and thick band
  'social_ring_bw_user.png': `
    <rect x="10" y="6" width="12" height="2"/>
    <rect x="8" y="8" width="2" height="16"/>
    <rect x="22" y="8" width="2" height="16"/>
    <rect x="10" y="24" width="12" height="2"/>
    <rect x="12" y="26" width="8" height="2"/>
    <rect x="13" y="10" width="6" height="2"/>
    <rect x="12" y="12" width="8" height="2"/>
    <rect x="13" y="14" width="6" height="4"/>
    <rect x="12" y="18" width="8" height="2"/>
    <rect x="13" y="20" width="6" height="2"/>
    <rect x="14" y="15" width="4" height="2"/>
    <rect x="15" y="9" width="2" height="1"/>
  `,
  // Legendary — vortex aura with spikes and core
  'void_aura_bw_user.png': `
    <rect x="15" y="2" width="2" height="4"/>
    <rect x="13" y="6" width="6" height="2"/>
    <rect x="11" y="8" width="10" height="2"/>
    <rect x="9" y="10" width="14" height="2"/>
    <rect x="7" y="12" width="18" height="2"/>
    <rect x="6" y="14" width="20" height="2"/>
    <rect x="7" y="16" width="18" height="2"/>
    <rect x="9" y="18" width="14" height="2"/>
    <rect x="11" y="20" width="10" height="2"/>
    <rect x="13" y="22" width="6" height="2"/>
    <rect x="15" y="24" width="2" height="4"/>
    <rect x="2" y="15" width="4" height="2"/>
    <rect x="26" y="15" width="4" height="2"/>
    <rect x="12" y="13" width="2" height="2"/>
    <rect x="18" y="13" width="2" height="2"/>
    <rect x="15" y="15" width="2" height="3"/>
    <rect x="5" y="11" width="2" height="2"/>
    <rect x="25" y="11" width="2" height="2"/>
    <rect x="5" y="19" width="2" height="2"/>
    <rect x="25" y="19" width="2" height="2"/>
  `,
  'paper_crown_bw_user.png': `
    <rect x="10" y="9" width="12" height="2"/>
    <rect x="9" y="11" width="2" height="8"/>
    <rect x="21" y="11" width="2" height="8"/>
    <rect x="11" y="11" width="10" height="2"/>
    <rect x="11" y="17" width="10" height="2"/>
    <rect x="12" y="13" width="2" height="4"/>
    <rect x="16" y="13" width="2" height="4"/>
    <rect x="19" y="13" width="2" height="4"/>
  `,
  'plain_tee_bw_user.png': `
    <rect x="12" y="7" width="8" height="2"/>
    <rect x="10" y="9" width="12" height="2"/>
    <rect x="7" y="11" width="5" height="10"/>
    <rect x="20" y="11" width="5" height="10"/>
    <rect x="12" y="11" width="8" height="10"/>
    <rect x="10" y="21" width="12" height="3"/>
    <rect x="14" y="9" width="4" height="2"/>
  `,
  'worn_bracelet_bw_user.png': `
    <rect x="10" y="10" width="12" height="2"/>
    <rect x="8" y="12" width="2" height="8"/>
    <rect x="22" y="12" width="2" height="8"/>
    <rect x="10" y="20" width="12" height="2"/>
    <rect x="14" y="13" width="4" height="4"/>
    <rect x="16" y="17" width="1" height="2"/>
  `,
  'soft_glow_bw_user.png': `
    <rect x="14" y="6" width="4" height="2"/>
    <rect x="12" y="8" width="8" height="2"/>
    <rect x="10" y="10" width="12" height="2"/>
    <rect x="8" y="12" width="16" height="2"/>
    <rect x="10" y="14" width="12" height="2"/>
    <rect x="12" y="16" width="8" height="2"/>
    <rect x="14" y="18" width="4" height="2"/>
    <rect x="7" y="11" width="2" height="2"/>
    <rect x="23" y="11" width="2" height="2"/>
  `,
  'canvas_cap_bw_user.png': `
    <rect x="10" y="8" width="12" height="2"/>
    <rect x="8" y="10" width="16" height="2"/>
    <rect x="7" y="12" width="18" height="7"/>
    <rect x="8" y="19" width="16" height="2"/>
    <rect x="9" y="21" width="8" height="2"/>
    <rect x="17" y="21" width="7" height="2"/>
  `,
  'sprint_cap_bw_user.png': `
    <rect x="11" y="7" width="10" height="2"/>
    <rect x="9" y="9" width="14" height="2"/>
    <rect x="8" y="11" width="16" height="6"/>
    <rect x="9" y="17" width="12" height="2"/>
    <rect x="10" y="19" width="6" height="2"/>
    <rect x="16" y="19" width="8" height="2"/>
    <rect x="14" y="12" width="2" height="4"/>
  `,
  'task_vest_bw_user.png': `
    <rect x="11" y="6" width="10" height="2"/>
    <rect x="9" y="8" width="14" height="2"/>
    <rect x="7" y="10" width="4" height="14"/>
    <rect x="21" y="10" width="4" height="14"/>
    <rect x="11" y="10" width="10" height="14"/>
    <rect x="14" y="10" width="4" height="14"/>
    <rect x="12" y="15" width="2" height="4"/>
    <rect x="18" y="15" width="2" height="4"/>
  `,
  'code_wraps_bw_user.png': `
    <rect x="9" y="8" width="14" height="2"/>
    <rect x="7" y="10" width="16" height="2"/>
    <rect x="6" y="12" width="2" height="10"/>
    <rect x="22" y="12" width="2" height="10"/>
    <rect x="8" y="12" width="14" height="10"/>
    <rect x="10" y="22" width="10" height="2"/>
    <rect x="10" y="14" width="10" height="1"/>
    <rect x="10" y="17" width="10" height="1"/>
    <rect x="10" y="20" width="10" height="1"/>
  `,
  'signal_pin_bw_user.png': `
    <rect x="15" y="8" width="2" height="10"/>
    <rect x="12" y="10" width="2" height="2"/>
    <rect x="18" y="10" width="2" height="2"/>
    <rect x="10" y="12" width="2" height="2"/>
    <rect x="20" y="12" width="2" height="2"/>
    <rect x="8" y="14" width="2" height="2"/>
    <rect x="22" y="14" width="2" height="2"/>
    <rect x="14" y="18" width="4" height="4"/>
    <rect x="15" y="22" width="2" height="3"/>
  `,
  'study_halo_bw_user.png': `
    <rect x="10" y="6" width="12" height="2"/>
    <rect x="8" y="8" width="16" height="2"/>
    <rect x="10" y="10" width="12" height="2"/>
    <rect x="12" y="12" width="8" height="10"/>
    <rect x="11" y="22" width="10" height="2"/>
    <rect x="9" y="24" width="14" height="2"/>
    <rect x="14" y="14" width="4" height="6"/>
  `,
  'sketch_hood_bw_user.png': `
    <rect x="11" y="5" width="10" height="2"/>
    <rect x="9" y="7" width="14" height="2"/>
    <rect x="8" y="9" width="16" height="2"/>
    <rect x="6" y="11" width="4" height="13"/>
    <rect x="22" y="11" width="4" height="13"/>
    <rect x="10" y="11" width="12" height="13"/>
    <rect x="11" y="24" width="10" height="2"/>
    <rect x="13" y="14" width="2" height="2"/>
    <rect x="17" y="14" width="2" height="2"/>
  `,
  'chrono_visor_bw_user.png': `
    <rect x="4" y="9" width="24" height="2"/>
    <rect x="5" y="11" width="9" height="8"/>
    <rect x="18" y="11" width="9" height="8"/>
    <rect x="14" y="12" width="4" height="3"/>
    <rect x="6" y="19" width="8" height="2"/>
    <rect x="18" y="19" width="8" height="2"/>
    <rect x="15" y="14" width="2" height="4"/>
  `,
  'pulse_coat_bw_user.png': `
    <rect x="10" y="3" width="12" height="2"/>
    <rect x="8" y="5" width="16" height="2"/>
    <rect x="6" y="7" width="20" height="2"/>
    <rect x="5" y="9" width="22" height="2"/>
    <rect x="4" y="11" width="4" height="15"/>
    <rect x="24" y="11" width="4" height="15"/>
    <rect x="8" y="11" width="16" height="2"/>
    <rect x="9" y="13" width="14" height="2"/>
    <rect x="10" y="15" width="12" height="11"/>
    <rect x="14" y="11" width="4" height="15"/>
    <rect x="12" y="18" width="2" height="4"/>
    <rect x="18" y="18" width="2" height="4"/>
  `,
  'sonic_loop_bw_user.png': `
    <rect x="12" y="7" width="8" height="2"/>
    <rect x="10" y="9" width="12" height="2"/>
    <rect x="8" y="11" width="2" height="11"/>
    <rect x="22" y="11" width="2" height="11"/>
    <rect x="10" y="22" width="12" height="2"/>
    <rect x="12" y="24" width="8" height="2"/>
    <rect x="14" y="13" width="4" height="6"/>
    <rect x="13" y="19" width="6" height="2"/>
  `,
  'teamlink_band_bw_user.png': `
    <rect x="9" y="9" width="6" height="6"/>
    <rect x="17" y="9" width="6" height="6"/>
    <rect x="13" y="11" width="6" height="2"/>
    <rect x="10" y="15" width="4" height="6"/>
    <rect x="18" y="15" width="4" height="6"/>
    <rect x="12" y="21" width="8" height="2"/>
    <rect x="14" y="23" width="4" height="2"/>
  `,
  'aurora_field_bw_user.png': `
    <rect x="15" y="5" width="2" height="2"/>
    <rect x="12" y="7" width="8" height="2"/>
    <rect x="10" y="9" width="12" height="2"/>
    <rect x="8" y="11" width="16" height="2"/>
    <rect x="10" y="13" width="12" height="2"/>
    <rect x="12" y="15" width="8" height="2"/>
    <rect x="14" y="17" width="4" height="2"/>
    <rect x="7" y="10" width="2" height="2"/>
    <rect x="23" y="10" width="2" height="2"/>
    <rect x="11" y="18" width="2" height="2"/>
    <rect x="19" y="18" width="2" height="2"/>
  `,
  'singularity_helm_bw_user.png': `
    <rect x="11" y="4" width="10" height="2"/>
    <rect x="9" y="6" width="14" height="2"/>
    <rect x="7" y="8" width="18" height="2"/>
    <rect x="6" y="10" width="20" height="10"/>
    <rect x="7" y="20" width="18" height="2"/>
    <rect x="10" y="22" width="12" height="2"/>
    <rect x="12" y="12" width="8" height="4"/>
    <rect x="14" y="16" width="4" height="2"/>
    <rect x="13" y="10" width="2" height="2"/>
    <rect x="17" y="10" width="2" height="2"/>
  `,
  'zero_day_jacket_bw_user.png': `
    <rect x="10" y="2" width="12" height="2"/>
    <rect x="8" y="4" width="16" height="2"/>
    <rect x="6" y="6" width="20" height="2"/>
    <rect x="4" y="8" width="24" height="2"/>
    <rect x="3" y="10" width="4" height="17"/>
    <rect x="25" y="10" width="4" height="17"/>
    <rect x="7" y="10" width="18" height="2"/>
    <rect x="8" y="12" width="16" height="2"/>
    <rect x="9" y="14" width="14" height="13"/>
    <rect x="13" y="10" width="6" height="17"/>
    <rect x="12" y="18" width="2" height="5"/>
    <rect x="18" y="18" width="2" height="5"/>
    <rect x="10" y="24" width="3" height="3"/>
    <rect x="19" y="24" width="3" height="3"/>
  `,
  'mythic_monocle_bw_user.png': `
    <rect x="10" y="8" width="12" height="2"/>
    <rect x="8" y="10" width="2" height="12"/>
    <rect x="22" y="10" width="2" height="12"/>
    <rect x="10" y="22" width="12" height="2"/>
    <rect x="12" y="24" width="8" height="2"/>
    <rect x="14" y="12" width="4" height="6"/>
    <rect x="13" y="18" width="6" height="2"/>
    <rect x="21" y="12" width="5" height="1"/>
  `,
  'eclipse_mantle_bw_user.png': `
    <rect x="14" y="3" width="4" height="3"/>
    <rect x="11" y="6" width="10" height="2"/>
    <rect x="9" y="8" width="14" height="2"/>
    <rect x="7" y="10" width="18" height="2"/>
    <rect x="6" y="12" width="20" height="2"/>
    <rect x="5" y="14" width="22" height="2"/>
    <rect x="6" y="16" width="20" height="2"/>
    <rect x="7" y="18" width="18" height="2"/>
    <rect x="8" y="20" width="16" height="2"/>
    <rect x="7" y="22" width="5" height="6"/>
    <rect x="13" y="22" width="6" height="6"/>
    <rect x="20" y="22" width="5" height="6"/>
    <rect x="14" y="11" width="4" height="5"/>
    <rect x="9" y="12" width="2" height="2"/>
    <rect x="21" y="12" width="2" height="2"/>
  `,
}

async function generateIcon(fileName, body) {
  const width = 32
  const height = 32
  const buffer = Buffer.alloc(width * height * 4, 0)
  const rectRegex = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\s*\/>/g
  let match = rectRegex.exec(body)
  while (match) {
    const x = Number(match[1])
    const y = Number(match[2])
    const w = Number(match[3])
    const h = Number(match[4])
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
        const i = (yy * width + xx) * 4
        buffer[i] = 255
        buffer[i + 1] = 255
        buffer[i + 2] = 255
        buffer[i + 3] = 255
      }
    }
    match = rectRegex.exec(body)
  }
  const png = await sharp(buffer, { raw: { width, height, channels: 4 } })
    .png({
      palette: false,
      compressionLevel: 6,
      adaptiveFiltering: false,
      effort: 7,
    })
    .toBuffer()
  for (const outDir of OUT_DIRS) {
    await sharp(png).toFile(path.join(outDir, fileName))
  }
}

async function main() {
  for (const [fileName, body] of Object.entries(ICONS)) {
    await generateIcon(fileName, body)
    console.log(`generated ${fileName}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
