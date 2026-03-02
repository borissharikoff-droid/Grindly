import fs from 'node:fs'

const IMAGE_MAP = {
  neon_visor: 'neon_visor_bw_user.png',
  hacker_jacket: 'hacker_jacket_bw_user.png',
  zen_beanie: 'zen_beanie_bw_user.png',
  pixel_shades: 'pixel_shades_bw_user.png',
  cozy_sweater: 'cozy_sweater_bw_user.png',
  phantom_cloak: 'phantom_cloak_bw_user.png',
  beat_headphones: 'beat_headphones_bw_user.png',
  scholar_cape: 'scholar_cape_bw_user.png',
  social_ring: 'social_ring_bw_user.png',
  void_aura: 'void_aura_bw_user.png',
  paper_crown: 'paper_crown_bw_user.png',
  plain_tee: 'plain_tee_bw_user.png',
  worn_bracelet: 'worn_bracelet_bw_user.png',
  soft_glow: 'soft_glow_bw_user.png',
  canvas_cap: 'canvas_cap_bw_user.png',
  sprint_cap: 'sprint_cap_bw_user.png',
  task_vest: 'task_vest_bw_user.png',
  code_wraps: 'code_wraps_bw_user.png',
  signal_pin: 'signal_pin_bw_user.png',
  study_halo: 'study_halo_bw_user.png',
  sketch_hood: 'sketch_hood_bw_user.png',
  chrono_visor: 'chrono_visor_bw_user.png',
  pulse_coat: 'pulse_coat_bw_user.png',
  sonic_loop: 'sonic_loop_bw_user.png',
  teamlink_band: 'teamlink_band_bw_user.png',
  aurora_field: 'aurora_field_bw_user.png',
  singularity_helm: 'singularity_helm_bw_user.png',
  zero_day_jacket: 'zero_day_jacket_bw_user.png',
  mythic_monocle: 'mythic_monocle_bw_user.png',
  eclipse_mantle: 'eclipse_mantle_bw_user.png',
}

const targetFile = 'src/renderer/lib/loot.ts'
let source = fs.readFileSync(targetFile, 'utf8')

for (const [key, fileName] of Object.entries(IMAGE_MAP)) {
  const encoded = fs.readFileSync(`public/loot/${fileName}`).toString('base64')
  const dataUri = `data:image/png;base64,${encoded}`
  const pattern = new RegExp(`(${key}:\\s*')([^']*)(')`)
  source = source.replace(pattern, `$1${dataUri}$3`)
}

fs.writeFileSync(targetFile, source)
console.log('Updated inline loot images.')
