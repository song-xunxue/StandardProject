/**
 * 应用图标生成器（M5 打包）：零依赖生成 build/icon.ico
 * 256x256 PNG（深色渐变 + 蓝紫斜向书页折角）封装进 ICO 容器（Vista+ 支持 PNG 条目）
 * npm run gen:icon 调用；想换正式美术图标时直接覆盖 build/icon.ico 即可
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5 初版
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 256
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'build', 'icon.ico')

// ---- 1. 像素绘制（RGBA）：深色基底 + 对角渐变 + 书页折角 + 蓝紫点缀 ----
const px = new Uint8Array(SIZE * SIZE * 4)
const setPx = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  // 简单 alpha 合成（新像素盖旧像素）
  const na = a / 255
  px[i] = Math.round(r * na + px[i] * (1 - na))
  px[i + 1] = Math.round(g * na + px[i + 1] * (1 - na))
  px[i + 2] = Math.round(b * na + px[i + 2] * (1 - na))
  px[i + 3] = Math.max(px[i + 3], a)
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const radius = 46
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // 圆角矩形裁剪（超出圆角半径的角落留透明）
    const cx = clamp(x, radius, SIZE - 1 - radius)
    const cy = clamp(y, radius, SIZE - 1 - radius)
    const dist = Math.hypot(x - cx, y - cy)
    if (dist > radius) continue
    // 基底：左上深蓝 → 右下深紫对角渐变（与工作台色板同族）
    const t = (x + y) / (2 * SIZE)
    const r = Math.round(28 + t * 26)
    const g = Math.round(30 + t * 18)
    const b = Math.round(44 + t * 66)
    // 圆角边缘 1px 抗锯齿
    const alpha = dist > radius - 1.2 ? Math.round(255 * (radius - dist) / 1.2) : 255
    setPx(x, y, r, g, b, clamp(alpha, 0, 255))
  }
}
// 书页主体（白色偏灰的双页开卷轮廓）
const pageL = { x0: 52, x1: 124, y0: 62, y1: 190 } // 左页
const pageR = { x0: 132, x1: 204, y0: 62, y1: 190 } // 右页
for (const [page, shade] of [[pageL, 232], [pageR, 218]]) {
  for (let y = page.y0; y <= page.y1; y++) {
    for (let x = page.x0; x <= page.x1; x++) {
      // 页缘圆角
      const pr = 8
      const pcx = clamp(x, page.x0 + pr, page.x1 - pr)
      const pcy = clamp(y, page.y0 + pr, page.y1 - pr)
      if (Math.hypot(x - pcx, y - pcy) > pr) continue
      setPx(x, y, shade, shade, shade + 4)
    }
  }
}
// 左页文字行（蓝色横线，模拟正文）
for (let line = 0; line < 7; line++) {
  const ly = 78 + line * 16
  const lw = line === 6 ? 44 : 56
  for (let x = pageL.x0 + 10; x < pageL.x0 + 10 + lw; x++) {
    for (let y = ly; y < ly + 5; y++) setPx(x, y, 108, 158, 248)
  }
}
// 右页文字行（紫色横线）
for (let line = 0; line < 7; line++) {
  const ly = 78 + line * 16
  const lw = line === 6 ? 36 : 52
  for (let x = pageR.x0 + 8; x < pageR.x0 + 8 + lw; x++) {
    for (let y = ly; y < ly + 5; y++) setPx(x, y, 200, 162, 240)
  }
}
// 书脊（中缝强调线）
for (let y = 58; y <= 194; y++) {
  for (let x = 126; x <= 130; x++) setPx(x, y, 70, 76, 96)
}

// ---- 2. PNG 编码（无第三方依赖：手写 PNG 容器 + zlib deflate） ----
const crc32Table = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crc32Table[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length)
  return out
}
// 扫描线：每行前置 filter byte 0（None）
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  Buffer.from(px.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // 位深
ihdr[9] = 6 // 颜色类型 RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

// ---- 3. ICO 容器（PNG 条目，Vista+ 原生支持） ----
const ico = Buffer.alloc(22 + png.length)
ico.writeUInt16LE(0, 0) // reserved
ico.writeUInt16LE(1, 2) // type: icon
ico.writeUInt16LE(1, 4) // count
const entry = ico.subarray(6, 22)
entry[0] = 0 // width 256 → 0
entry[1] = 0 // height 256 → 0
entry[2] = 0 // palette
entry[3] = 0 // reserved
ico.writeUInt16LE(1, 10) // color planes
ico.writeUInt16LE(32, 12) // bits per pixel
ico.writeUInt32LE(png.length, 14)
ico.writeUInt32LE(22, 18) // data offset
png.copy(ico, 22)

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, ico)
console.log(`已生成 ${target}（${SIZE}x${SIZE} PNG-in-ICO，${ico.length} 字节）`)
