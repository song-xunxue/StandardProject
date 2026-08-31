/**
 * 蓝图数据模型类型定义（JSON Canvas 扩展，M0 冻结字段）
 * 核心设计：全局节点表 + 全局边表 + 每蓝图一个视图——边引用全局节点 id，
 * 天然支持跨图连线；上级链路 = 沿「节点 → 所在图 → 拥有节点 → 其所在图」回溯
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：蓝图/节点/边/标签的核心类型骨架
 *   2. 审查修订：节点补充 prompt 字段（提示词信息）；NodeType 补充 ref 引用节点
 *   3. M0：节点补充 graphId（所在画布）/ refGraphId（蓝图节点指向的子图）/
 *      aliases（关键词兜底用别名）/ content（text 节点正文）；新增 GraphView 图视图
 *   4. M2：节点补充 refTarget（ref 节点指向的章节/蓝图相对路径）；
 *      新增 MAX_NESTING_DEPTH 蓝图嵌套深度上限常量（ADR-12）
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-F1：节点补充 aiVisibility（AI 上下文可见性三档）——auto 现行为 /
 *      always 常驻注入 / never 永不注入（伏笔防剧透，竞品 novelcrafter/Sudowrite 双验证）
 */

/**
 * 节点类型：
 * - blueprint 蓝图（可进入的子图，refGraphId 指向该子图）
 * - text      纯文本（AI 编辑模式正文，content 承载全文）
 * - ref       引用节点（指向 chapters/ 正文文件或其他蓝图，承载章节归属关系）
 */
export type NodeType = 'blueprint' | 'text' | 'ref'

/** 语义连线类型：箭头=因果/顺序，直线=并列关联，虚线=参考/伏笔（映射表见 PROJECT_PLAN.md ADR-15） */
export type EdgeType = 'arrow' | 'line' | 'dashed'

/**
 * AI 上下文可见性（v2-F1）：节点内容是否参与 AI 组装
 * - auto   现行为（图遍历/关键词兜底决定）
 * - always 常驻注入（未被图遍历选中也进第 3 层，占预算）
 * - never  永不注入（防剧透：伏笔/未登场设定等）
 */
export type AiVisibility = 'auto' | 'always' | 'never'

/** 蓝图嵌套深度上限（ADR-12：route 最长 8 级；在第 8 层中创建蓝图节点时界面提示并阻止） */
export const MAX_NESTING_DEPTH = 8

/**
 * 蓝图节点（全局唯一 id；graphId 声明节点摆放在哪张画布上）
 * id 约定：禁止以 'proxy:' 开头——该前缀保留给画布层生成的跨图代理节点（见 BlueprintCanvas）
 */
export interface BlueprintNode {
  id: string
  type: NodeType
  title: string
  /** 节点所在的画布（蓝图图 id） */
  graphId: string
  /** 仅 type=blueprint：双击进入的子图 id */
  refGraphId?: string
  /** 仅 type=ref：指向的正文/蓝图文件相对路径（chapters/xxx.md 或 blueprints/xxx.blueprint.json） */
  refTarget?: string
  /** 节点标签（设定/伏笔/大纲/世界观等，引用小说级标签库） */
  tags: string[]
  /** 别名：关键词兜底匹配用（正文提及别名也会激活该节点） */
  aliases: string[]
  /** 提示词信息：该节点的写作要求/文风约束等，参与 AI 上下文组装（PRD 术语表） */
  prompt: string
  /** 摘要卡片：50-100 字压缩表示，专用于上级链路注入（与 prompt 是两个概念，见计划书 3.2） */
  summary: string
  /** AI 上下文可见性（v2-F1）：缺省 auto；never 防剧透 / always 常驻注入 */
  aiVisibility?: AiVisibility
  /** 仅 type=text：节点正文全文（PoC 内存版；M3 后持久化到 chapters/） */
  content?: string
  /** 画布坐标与尺寸 */
  position: { x: number; y: number }
  size: { width: number; height: number }
}

/** 蓝图语义连线（from/to 引用全局唯一节点 id，支持跨蓝图引用） */
export interface BlueprintEdge {
  id: string
  from: string
  to: string
  type: EdgeType
  label?: string
}

/**
 * 蓝图图视图：一张画布 = 一份节点摆放清单（节点本体在全局表）
 * ownerNodeId：拥有本图的蓝图节点 id（根图为 null）——上级链路遍历的依据
 */
export interface GraphView {
  id: string
  title: string
  nodeIds: string[]
  ownerNodeId: string | null
}

/** 全局图数据（store 的数据部分；M1 起由文件系统 + SQLite 索引水合） */
export interface GraphData {
  nodes: Record<string, BlueprintNode>
  edges: Record<string, BlueprintEdge>
  graphs: Record<string, GraphView>
}
