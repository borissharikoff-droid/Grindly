import { describe, expect, it } from 'vitest'
import { getUpdateReadyMode } from '../renderer/components/UpdateBanner'

describe('getUpdateReadyMode', () => {
  it('returns download-link on darwin', () => {
    expect(getUpdateReadyMode('darwin')).toBe('download-link')
  })

  it('returns countdown on win32', () => {
    expect(getUpdateReadyMode('win32')).toBe('countdown')
  })

  it('returns countdown on linux', () => {
    expect(getUpdateReadyMode('linux')).toBe('countdown')
  })

  it('returns countdown when platform is unknown/empty', () => {
    expect(getUpdateReadyMode('')).toBe('countdown')
  })
})
