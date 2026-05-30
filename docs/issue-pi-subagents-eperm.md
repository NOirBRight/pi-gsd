# pi-subagents EPERM 导致 Pi 无法启动

## 现象

当一个 Pi 进程正在运行 subagent（异步/后台模式）时，启动第二个 Pi 进程会失败：

```
Error: Failed to load extension "pi-subagents\src\extension\index.ts":
  EPERM: operation not permitted, mkdir 'C:\Users\noirb\AppData\Local\Temp\pi-subagents-user-noirb\async-subagent-results'
```

即使没有 subagent 在运行，如果之前 subagent 运行期间 Windows 从睡眠恢复，该临时目录的 NTFS ACL 可能损坏，导致同样报错且**无法通过常规方式删除**（管理员权限也删不掉，需 elevated takeown + icacls）。

## 根因

### 1. 共享临时目录架构

`pi-subagents` 使用全局共享临时目录存放异步运行状态：

```
%TEMP%\pi-subagents-user-{username}\
  ├── async-subagent-results\   ← 子进程运行结果
  ├── async-subagent-runs\      ← 异步运行状态
  ├── chain-runs\               ← chain 运行产物
  └── artifacts\                ← 调试产物
```

路径定义在 `src/shared/types.ts:678-680`，为模块级 `const`，多个模块引用。

### 2. `ensureAccessibleDir` 无 EPERM 容错

`src/extension/index.ts:89-101`：

```typescript
function ensureAccessibleDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });  // ← EPERM 直接抛出，未 catch
    try {
        fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
        // 只处理 accessSync 失败，不处理 mkdirSync 失败
        fs.rmSync(dirPath, { recursive: true, force: true });
        fs.mkdirSync(dirPath, { recursive: true });
        fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    }
}
```

**两个缺陷**：

- **`mkdirSync` 抛 EPERM 未被捕获**：当目录已存在但 ACL 损坏时，`mkdirSync` 直接抛异常，走不到后面的恢复逻辑
- **`rmSync` 也可能 EPERM**：ACL 损坏时删除同样被拒绝，后续 `mkdirSync` 重试还是 EPERM

异常未被捕获 → 整个 `registerSubagentExtension` 函数失败 → extension 加载失败 → Pi 无法启动。

### 3. Windows ACL 损坏机制

代码注释已承认此问题：

> On Windows with Azure AD/Entra ID, directories created shortly after wake-from-sleep can end up with broken NTFS ACLs (null DACL) when the cloud SID cannot be resolved without network connectivity.

实际观察到的场景：
- Azure AD/Entra ID 加入的机器，睡眠恢复后 cloud SID 无法解析
- NTFS 给目录分配了 null DACL，连创建者本人都被拒绝访问
- `icacls` 报 "拒绝访问"，`takeown` 报 "没有找到文件"
- 必须用管理员权限的 `takeown /f ... /r /d Y` + `icacls /grant ... /t` 修复后才能删除

### 4. ES Module 只读绑定限制

`RESULTS_DIR` 和 `ASYNC_DIR` 是通过 `export const` 导入的 ES module 绑定，在消费模块中是**只读**的，无法重新赋值。这意味着即使 `ensureAccessibleDir` 用 fallback 路径返回成功，也无法将新路径更新到其他引用这些常量的模块（`async-job-tracker.ts`、`result-watcher.ts` 等）。

## 影响范围

| 场景 | 是否受影响 |
|------|-----------|
| 单个 Pi 进程，不使用 subagent | 不受影响 |
| 单个 Pi 进程，使用同步 subagent | 不受影响 |
| 单个 Pi 进程，使用异步 subagent | 可能受影响（睡眠恢复后 ACL 损坏） |
| 一个 Pi 运行异步 subagent 时，启动第二个 Pi | **必定受影响** |
| ACL 损坏后，所有新 Pi 进程 | **必定受影响** |

## 与 @tintinweb/pi-subagents 对比

`@tintinweb/pi-subagents` **不存在此问题**，原因是架构差异：

| 维度 | pi-subagents | @tintinweb/pi-subagents |
|------|-------------|------------------------|
| 异步结果存储 | 全局共享 `%TEMP%\pi-subagents-*\` | 项目本地 `.pi/output/` |
| 进程间通信 | 文件系统 watcher/poll 共享目录 | AgentManager 回调，无共享目录 |
| 临时目录 | 有，且是硬编码 `const` | 无全局共享临时目录 |
| ACL 风险 | 有 | 无 |

但 **两者不能平替**（详见下节）。

## pi-gsd-redux 对 subagent 的依赖

`pi-gsd-redux` **深度绑定 `pi-subagents`（nicobailon）**，无法切换到 tintinweb 版：

1. **工具名** — GSD 所有 prompt guidance 写死 `subagent` 工具名，tintinweb 注册的是 `Agent`
2. **Agent frontmatter** — GSD 使用 `systemPromptMode`、`defaultContext`、`fallbackModels`、`completionGuard` 等字段，tintinweb 不支持
3. **Chain/Parallel 模式** — GSD 的 `gsd-execute-phase` 等 workflow 依赖 `subagent({ chain: [...], parallel: [...] })`，tintinweb 无此功能
4. **Intercom** — GSD 可能使用 `pi-intercom` 与子进程交互，tintinweb 没有

## 修复方案

### 方案 A：向上游 PR（推荐）

修改 `ensureAccessibleDir` 处理 `mkdirSync` 的 EPERM：

- 捕获 `EPERM`/`EACCES`，尝试 `rmSync` + 重建
- 如果删除也失败，使用 pid-scoped fallback 路径（`dirPath + "-" + process.pid`）
- 需要同步修改 `RESULTS_DIR`/`ASYNC_DIR` 的传递方式：改为函数参数或可变容器，绕过 ES module 只读绑定
- 影响文件：`src/extension/index.ts`、`src/shared/types.ts`、以及所有消费 `RESULTS_DIR`/`ASYNC_DIR` 的模块

### 方案 B：本地 monkey-patch（快速 workaround）

在 `pi-gsd-redux` 的 extension 入口中，在 `pi-subagents` 加载前，预先清理/修复临时目录：

- 检测 `async-subagent-results` 等 目录 ACL 是否损坏
- 尝试修复权限或删除重建
- 如果修复失败，创建 pid-scoped 目录并设置环境变量让后续进程使用

### 方案 C：启动前清理脚本（最简 workaround）

提供一个 PowerShell 脚本（或 Pi slash command），在 Pi 启动前自动检测并清理损坏的临时目录：

```powershell
# scripts/repair-pi-subagents-temp.ps1
$base = "$env:TEMP\pi-subagents-user-$env:USERNAME"
if (Test-Path $base) {
    foreach ($dir in "async-subagent-results","async-subagent-runs") {
        $path = Join-Path $base $dir
        try { Get-ChildItem $path -ErrorAction Stop | Out-Null }
        catch { 
            # ACL 损坏，管理员权限修复
            Start-Process pwsh -Verb RunAs -Wait -ArgumentList "-Command", 
                "takeown /f '$path' /r /d Y; icacls '$path' /grant ${env:USERNAME}:F /t; Remove-Item '$path' -Recurse -Force"
        }
    }
}
```

### 方案 D：长期 — 改用项目本地目录

像 `@tintinweb/pi-subagents` 那样，将异步结果存到项目本地路径（如 `.pi/subagent-results/`），从根本上避免全局共享目录的 ACL 问题和多进程冲突。但这需要上游架构重构。

## 临时解决

当前环境已恢复正常（ACL 修复 + 临时目录已清理）。如再次遇到：

```powershell
# 1. 关闭所有 Pi 进程
# 2. 以管理员权限运行：
takeown /f "%TEMP%\pi-subagents-user-noirb\async-subagent-results" /r /d Y
icacls "%TEMP%\pi-subagents-user-noirb\async-subagent-results" /grant %USERNAME%:F /t
Remove-Item -Recurse -Force "%TEMP%\pi-subagents-user-noirb"
# 3. 重新启动 Pi
```

## 上游 Issue 参考

- 仓库：https://github.com/nicobailon/pi-subagents
- 相关代码：`src/extension/index.ts:89-101`（`ensureAccessibleDir`）
- 相关代码：`src/shared/types.ts:679-680`（`RESULTS_DIR` / `ASYNC_DIR` 常量导出）