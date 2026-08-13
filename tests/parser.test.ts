import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAwesome } from '../scripts/sync-registry.mjs'

describe('parseAwesome', () => {
  const md = readFileSync(join(__dirname, 'fixtures', 'awesome-sample.md'), 'utf8')

  it('解析分类与仓库链接', () => {
    const entries = parseAwesome(md)
    expect(entries.length).toBe(5)
    expect(entries[0]).toMatchObject({ fullName: 'a/dsh-skin', category: 'web-ui' })
    expect(entries[2]).toMatchObject({ fullName: 'c/dsh-tui', category: 'terminal' })
  })

  it('一行多个仓库链接都能解析', () => {
    const entries = parseAwesome(md)
    const multi = entries.filter((e) => e.category === 'fun')
    expect(multi.map((e) => e.fullName)).toEqual(['x/one', 'y/two'])
  })

  it('离开 Community plugins 章节后停止解析', () => {
    const entries = parseAwesome(md + '\n## Other\n\n- [nope/nope](https://github.com/nope/nope) — x\n')
    expect(entries.find((e) => e.fullName === 'nope/nope')).toBeUndefined()
  })
})
