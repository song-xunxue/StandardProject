/**
 * 压力测试样本生成器（M2 验收：100 节点画布拖拽不掉帧；M5 验收：10 万字冷启动索引 < 5s）
 * 用法：node scripts/gen-stress-blueprint.mjs <小说目录> [节点数=100] [--chapters 章数] [--words 每章字数]
 *   - 默认生成 blueprints/压力测试.blueprint.json：网格布局节点 + 确定性伪随机边（LCG 固定种子）
 *   - --chapters N：额外生成 chapters/第XX章.md 压力章节（frontmatter + 填充正文，
 *     每章正文约 --words 字，默认 2000）——用于冷启动索引/编辑器加载性能实测
 * 生成后在工作台文件树中打开该蓝图/章节做观察
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 初版
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5：新增 --chapters/--words 长章节生成（10 万字小说样本），
 *      供冷启动索引（syncIndex）与章节编辑器加载性能实测
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const novelDir = args[0]
if (!novelDir || novelDir.startsWith('--')) {
  console.error('用法: node scripts/gen-stress-blueprint.mjs <小说目录> [节点数] [--chapters 章数] [--words 每章字数]')
  process.exit(1)
}
const positional = args.filter((a) => !a.startsWith('--'))
const count = Number(positional[1] ?? 100)
const flagValue = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : undefined
}
const chapters = flagValue('chapters')
const wordsPerChapter = flagValue('words') ?? 2000

// LCG 伪随机（固定种子，保证每次生成同一拓扑，便于对比性能）
let seed = 20260826
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const tagPool = ['设定', '伏笔', '大纲', '世界观']
const edgeTypes = ['arrow', 'line', 'dashed']

const nodes = []
for (let i = 0; i < count; i++) {
  const col = i % 10
  const row = Math.floor(i / 10)
  nodes.push({
    id: `n-stress-${i}`,
    // 混入 ref 类型测试 § 前缀渲染；不用 blueprint（子图进入非本测试目标）
    type: i % 5 === 4 ? 'ref' : 'text',
    title: `压力节点 ${i + 1}`,
    tags: i % 3 === 0 ? [tagPool[i % tagPool.length]] : [],
    aliases: [],
    prompt: i % 5 === 0 ? '测试提示词：短句风格' : '',
    summary: i % 7 === 0 ? `节点 ${i + 1} 的摘要卡片内容` : '',
    position: { x: col * 220, y: row * 130 },
    size: { width: 160, height: 50 }
  })
}

const edges = []
let edgeSeq = 0
// 链式箭头边（每行内 i-1 → i）
for (let i = 1; i < count; i++) {
  if (Math.floor(i / 10) === Math.floor((i - 1) / 10)) {
    edges.push({ id: `e-stress-${edgeSeq++}`, from: `n-stress-${i - 1}`, to: `n-stress-${i}`, type: 'arrow' })
  }
}
// 行间随机边补足到 ~1.2 倍节点数
while (edges.length < Math.floor(count * 1.2)) {
  const a = Math.floor(rand() * count)
  const b = Math.floor(rand() * count)
  if (a === b) continue
  edges.push({
    id: `e-stress-${edgeSeq++}`,
    from: `n-stress-${a}`,
    to: `n-stress-${b}`,
    type: edgeTypes[Math.floor(rand() * 3)],
    label: rand() < 0.2 ? '测试连线说明' : undefined
  })
}

const file = { id: 'g-stress', title: '压力测试', nodes, edges }
const target = join(novelDir, 'blueprints', '压力测试.blueprint.json')
writeFileSync(target, JSON.stringify(file, null, 2), 'utf-8')
console.log(`已生成: ${target}`)
console.log(`节点 ${nodes.length} 个, 边 ${edges.length} 条（确定性种子 20260826）`)

// ---- M5：长章节压力样本（冷启动索引 / 编辑器加载实测） ----
if (chapters !== undefined && chapters > 0) {
  // 确定性填充句池（LCG 续用同一随机流，保证内容可复现）
  const sentences = []
  for (let i = 0; i < 64; i++) {
    sentences.push(`他沿着第${i + 1}条长街向前走去，风把灯火吹得明明灭灭，远处的钟声敲了${(i % 12) + 1}下，提示着夜已深了。`)
  }
  let chapterChars = 0
  for (let c = 1; c <= chapters; c++) {
    let body = ''
    while (body.length < wordsPerChapter) body += sentences[Math.floor(rand() * sentences.length)]
    body = body.slice(0, wordsPerChapter)
    chapterChars += body.length
    const cn = String(c).padStart(2, '0')
    const chapterFile = `---\ntitle: 压力第${cn}章\ntags: [${tagPool[c % tagPool.length]}]\naliases: [压力章${cn}]\n---\n\n${body}\n`
    writeFileSync(join(novelDir, 'chapters', `压力第${cn}章.md`), chapterFile, 'utf-8')
  }
  console.log(`已生成压力章节: ${chapters} 章 × ${wordsPerChapter} 字 ≈ ${Math.round(chapterChars / 10000)} 万字`)
}
