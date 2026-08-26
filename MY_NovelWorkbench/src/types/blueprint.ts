/**
 * 蓝图领域类型再导出（实现已下沉 @shared/blueprint，供主进程与渲染进程共用）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1：类型下沉 shared 层，此处保留再导出以兼容既有导入路径
 */

export * from '@shared/blueprint'
