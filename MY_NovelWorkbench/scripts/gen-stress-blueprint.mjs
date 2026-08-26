/**
 * 100 节点压力测试蓝图生成器（M2 验收：100 节点画布拖拽不掉帧）
 * 用法：node scripts/gen-stress-blueprint.mjs <小说目录> [节点数=100]
 * 生成 blueprints/压力测试.blueprint.json：网格布局节点 + 确定性伪随机边
 * （LCG 固定种子，可复现）；生成后在工作台文件树中打开该蓝图做拖拽/缩放观察
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 初版
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const novelDir = process.argv[2]
if (!novelDir) {
  console.error('用法: node scripts/gen-stress-blueprint.mjs <小说目录> [节点数]')
  process.exit(1)
}
const count = Number(process.argv[3] ?? 100)

// LCG 伪随机（固定种子，保证每次生成同一拓扑，便于对比性能）
let seed = 20260826
const rand = (): number => {
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
