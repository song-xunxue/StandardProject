/**
 * 内置情节结构模板（v2-F5）：三幕 / 英雄之旅 / 救猫咪（精简版）
 * 节点为中文占位标题（插入后可编辑改型），全部 text 类型——避免 8 层嵌套限制与
 * 子图复杂性；骨架连线按叙事推进用箭头（因果/顺序），支线用直线
 * 首次使用时由 resourceService 种子写入全局资源库（可删可改，与用户模板同层）
 *
 * 作者: 李文煜
 * 日期: 2026-09-01
 *
 * 2026-09-01
 * 变更说明：
 *   1. v2-F5 初版（Plottr 30+ 模板获客品类的最小起步）
 */

import type { ResourceTemplate } from './types'

type StructNode = { type: 'text'; title: string; tags: string[]; prompt: string; summary: string }
type StructEdge = { from: number; to: number; type: 'arrow' | 'line' | 'dashed' }

const n = (title: string, tags: string[], summary: string, prompt = ''): StructNode => ({
  type: 'text',
  title,
  tags,
  summary,
  prompt
})

/** 三幕结构（古典戏剧） */
const threeAct = {
  nodes: [
    n('第一幕·建立', ['大纲'], '介绍世界、主角与日常；激励事件打破平衡'),
    n('第一幕转折', ['伏笔'], '主角被迫做出选择，进入新世界'),
    n('第二幕·对抗', ['大纲'], '冲突升级、结盟与挫折交替，中点逆转'),
    n('低谷时刻', ['伏笔'], '一切似乎失败，主角失去最重要的东西'),
    n('第三幕·解决', ['大纲'], '主角蜕变归来，最终对决与收束')
  ] as StructNode[],
  edges: [
    { from: 0, to: 1, type: 'arrow' },
    { from: 1, to: 2, type: 'arrow' },
    { from: 2, to: 3, type: 'arrow' },
    { from: 3, to: 4, type: 'arrow' }
  ] as StructEdge[]
}

/** 英雄之旅（坎贝尔十二步精简为八步） */
const heroJourney = {
  nodes: [
    n('平凡世界', ['世界观'], '主角的日常与未满足的渴望'),
    n('冒险召唤', ['大纲'], '事件或人物召唤主角离开舒适区'),
    n('拒绝召唤', ['伏笔'], '恐惧与犹豫，展现主角的缺陷'),
    n('遇见导师', ['设定'], '获得指引、装备或信念'),
    n('跨越门槛', ['大纲'], '真正进入非凡世界，不可回头'),
    n('试炼与盟友', ['大纲'], '考验、敌人、伙伴与接近最深洞穴'),
    n('磨难重生', ['伏笔'], '生死考验，死而复活获得恩赐'),
    n('携恩赐归返', ['大纲'], '踏上归途、复活与带着万灵药回归')
  ] as StructNode[],
  edges: [
    { from: 0, to: 1, type: 'arrow' },
    { from: 1, to: 2, type: 'arrow' },
    { from: 2, to: 3, type: 'arrow' },
    { from: 3, to: 4, type: 'arrow' },
    { from: 4, to: 5, type: 'arrow' },
    { from: 5, to: 6, type: 'arrow' },
    { from: 6, to: 7, type: 'arrow' },
    { from: 0, to: 7, type: 'dashed' }
  ] as StructEdge[]
}

/** 救猫咪节拍表（Blake Snyder 十五拍精简为九拍） */
const saveTheCat = {
  nodes: [
    n('开场画面', ['大纲'], '基调与世界的第一印象'),
    n('主题呈现', ['伏笔'], '暗示主角需要学的功课'),
    n('铺垫', ['大纲'], '展示主角生活、六件事立体化'),
    n('催化剂', ['大纲'], '打破日常的事件，故事真正开始'),
    n('争论', ['设定'], '主角犹豫：要不要踏上旅程'),
    n('B 故事', ['设定'], '副线（常是爱情/友情），承载主题'),
    n('趣味与游戏', ['大纲'], '承诺观众的大场面与期待满足'),
    n('中点', ['伏笔'], '假胜利或假失败，赌注抬高'),
    n('坏蛋逼近', ['大纲'], '反派发力，内部矛盾爆发'),
    n('一无所有', ['伏笔'], '最低谷，旧世界死亡'),
    n('结局', ['大纲'], '用新自我解决问题，主题完成')
  ] as StructNode[],
  edges: [
    { from: 0, to: 1, type: 'line' },
    { from: 0, to: 2, type: 'arrow' },
    { from: 1, to: 10, type: 'dashed' },
    { from: 2, to: 3, type: 'arrow' },
    { from: 3, to: 4, type: 'arrow' },
    { from: 4, to: 6, type: 'arrow' },
    { from: 5, to: 10, type: 'dashed' },
    { from: 6, to: 7, type: 'arrow' },
    { from: 7, to: 8, type: 'arrow' },
    { from: 8, to: 9, type: 'arrow' },
    { from: 9, to: 10, type: 'arrow' }
  ] as StructEdge[]
}

/** 内置结构模板清单（种子写入用） */
export const BUILTIN_STRUCTURE_TEMPLATES: ResourceTemplate[] = [
  { kind: 'structure', name: '三幕结构', payload: threeAct },
  { kind: 'structure', name: '英雄之旅', payload: heroJourney },
  { kind: 'structure', name: '救猫咪节拍表', payload: saveTheCat }
]
