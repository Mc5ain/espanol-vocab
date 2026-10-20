# Español 专业西语词汇 · 网页版

面向西班牙语专业学生的离线优先网页应用，包含 353 个 A1–C1 词条、DELE B1/B2/C1 分级学习、SM-2 间隔复习、双向选择题和动词变位训练。

## 功能

- 首页学习进度、待复习量和分类掌握度
- DELE B1、B2、C1 目标级别切换，默认 B2
- 环境、健康、工作经济、教育科技、住房城市、媒体社会、艺术文化、学术调查主题
- 翻卡学习，翻面后直接进入下一张，SM-2 自动安排复习
- 左右滑动区分“还不熟/记住了”，并支持撤销上一张
- 待复习专项队列和键盘快捷键
- 西班牙语浏览器语音朗读
- 小测与词库条目也可直接朗读
- 名词阴阳性、语域和固定搭配展示
- 西班牙语与中文双向四选一
- 现在时、简单过去时、现在虚拟式变位训练
- 353 个词条的搜索、分类和 CEFR 等级筛选
- 搜索可忽略西班牙语重音符号
- 学习记录持久保存在浏览器 `localStorage`
- 学习记录支持 JSON 导出与导入
- PWA 离线缓存，可添加到手机主屏幕

## 本地运行

```bash
npm run build
npm run serve
```

打开 `http://localhost:4173/`。

## 数据构建

词条源文件位于 `src/data/`：

- `words.js`：A1–A2 基础词
- `professional.js`：B1–C1 专业词
- `conjugations.js`：12 个动词的三种时态变位

运行下面命令会生成浏览器使用的 `assets/data.js`：

```bash
npm run build
```

## 部署

本项目是纯静态站点，可直接部署到 GitHub Pages。仓库默认分支为 `main`，Pages 使用根目录。

## 来源与许可

SM-2 算法改编自 MIT 授权的 `VienDinhCom/supermemo`：

- https://github.com/VienDinhCom/supermemo
- Copyright (c) 2020 Vien Dinh

完整许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

词条、例句、界面和学习流程为本项目编写。

词表依据公开 DELE 能力主题自主整理，不是 Instituto Cervantes 官方发布词表。
