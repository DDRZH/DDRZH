---
version: "1.0"
last_updated: "2026-07-17"
---

# 架构概览

## 页面层

- `index.html`：DDRZH 营销首页的语义结构与内容。
- `styles.css`：首页及相关静态页面的视觉、响应式布局与交互动效。
- `script.js`：导航、首屏 Canvas、项目咨询向导、GDPR 提示与案例预览交互。
- `i18n.js`：基于页面文本和属性的中英文切换；新增可见文案应补充对应词条。

## 服务层

- `server.cjs`：Express 本地服务，统一挂载在 `/ddrzh/`，并提供静态文件和 AI Clone API 路由。
- `functions/ren-clone-handler.js`：AI Clone 的服务端请求处理。

## 当前任务约束

- 首页调整应保持 `index.html`、`styles.css` 与 `i18n.js` 的文案和响应式行为一致。
- `ai-clone-case.html` 是 Cyber Clone 深度案例页；首页 CTA 可直接指向该页面。
