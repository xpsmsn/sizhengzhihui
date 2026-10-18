<p align="center">
  <b>思政智汇</b><br>
  面向高校辅导员的思政热点聚合站
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center">
  自动盯住思政领域信源，精选值得看的内容；出现重要政策、讲话时自动写一段解读，每周出一份综述。
</p>

<p align="center">
  <a href="#这是什么">这是什么</a> ·
  <a href="#它做什么">它做什么</a> ·
  <a href="#部署">部署</a> ·
  <a href="#配置">配置</a> ·
  <a href="#目录结构">目录结构</a> ·
  <a href="#文档">文档</a>
</p>

<br>

## 这是什么

**思政智汇**是一个面向**高校辅导员**的思政行业热点聚合站。它从一批思政领域信源里收资料，用大模型预筛、独立打两次分，挑出真正值得看的，写成中文标题与摘要；把不同来源说的同一件事聚成一个事件；遇到重要政策、讲话时自动生成一段**原创解读**（时区与高校双视角），每周出一份综述。

它在开源的 [AIHOT](https://github.com/KKKKhazix/AIHOT) 框架上构建：换上了思政的信源、分类与评分标准，并做了若干面向本场景的改造（详见 [本次改造记录](docs/discussions/2026-10-11-本次改造记录.md)）。

> 本项目是使用者自己的部署，不使用 AIHOT 的名字与 Logo。

## 它做什么

| | |
|---|---|
| **信源** | 思政网（政策文件、高校动态、大学教育）、教育部、中国政府网、育人号等；分级设置入选门槛，抓取频率按产出自动调整 |
| **精选** | 预筛 → 同一标准独立打两次分 → 按信源分级的门槛入选；同一条新闻只占一条 |
| **事件归组** | 不同来源报道的同一件事聚成一个事件，后续进展挂在同一事件下，事件页有综述 |
| **近期关注** | 首页热条，展示最近 14 天的精选（按评分降序） |
| **政策解读** | 出现评分 **82 分以上**的政策、讲话时，自动生成一段原创解读：**背景 / 要点 / 对辅导员工作的启示**。同事件取最高分合并成一篇；只输出再表达、附原文链接，规避版权 |
| **周报 / 月报** | 每周一、每月 1 日出刊，从精选集直接汇编，模型只写总述与栏目导读 |
| **给 Agent 用** | RSS（精选、全部、全文、周报、月报）、公开 API `/api/v1`、MCP、`llms.txt` |

## 部署

面向 **NAS（1Panel + Docker Compose）** 部署，使用 NAS 上已有的 PostgreSQL，不启动内置数据库容器。

```bash
# 首次
git clone https://github.com/xpsmsn/sizhengzhihui.git
cd sizhengzhihui
# 按 .env.example 准备 .env（站点地址、数据库、模型、管理员密码）
docker compose up -d --build
```

- 站点：`http://<NAS-IP>:3000`，后台 `/admin`（密码在 `.env` 的 `ADMIN_PASSWORD`）。
- 四个服务：`setup`（迁移建表，跑完即退）、`api`、`worker`、`web`。

**日常更新**（改了 `industry/`、`site/`、后台代码后）：

```bash
# 本地
scp <改动的文件> <user>@<NAS>:/volume2/docker/aihot/sizhengzhihui/<同一路径>
# NAS
cd /volume2/docker/aihot/sizhengzhihui && docker compose up -d --build
```

详见 [部署](docs/deploy.md)。

## 配置

| 位置 | 作用 |
|------|------|
| `.env` | 站点地址 `SITE_URL`、数据库 `DATABASE_URL`、模型 `LLM_*`、管理员密码 `ADMIN_PASSWORD`（**不入版本控制**）|
| `site/site.ts` | 站名、文案、出刊时间 `EDITION_TIMES`、报告与页面的说法 |
| `industry/taxonomy.ts` | 分类、标签、机构（**收录范围就改这里**）|
| `industry/sources.json` | 首次启动导入的信源（之后在后台「信源」页维护）|
| `industry/prompts/` | 精选标准、写作要求、**政策解读 `insight.md`** |
| `industry/selection.ts` | 入选门槛（T1 60 / T1_5 65 / T2 76）|

## 目录结构

```
apps/        api（接口）· web（站点，React Router SSR）· worker（采集/处理/出刊/定时任务）
packages/    backend（引擎）· contracts（类型）
industry/    分类、信源、提示词、门槛（行业 KnowHow 都在这）
site/        站名文案、品牌、根目录固定文件、更新日志
database/    迁移
scripts/     运维脚本（迁移、评估、一次性工具）
docs/        文档
```

## 运维脚本

| 脚本 | 用途 |
|------|------|
| `scripts/reanalyze.ts` | 改规则后批量重评估存量文章（试算 / `--run`）|
| `scripts/refill-publication-dates.ts` | 为空日期 / 午夜日期文章回填精确发布日期（试算 / `--apply`）|
| `scripts/recount-timeline-dates.ts` | 按发布时间重算历史条目的时间线归日与排序（试算 / `--apply`，可选 `--fix-shifted` 修复被丢弃的 +8 小时错位日期）|
| `scripts/clear-daily-reports.ts` | 清除已取消的日报数据 |

## 文档

| 文档 | 内容 |
|------|------|
| [本次改造记录](docs/discussions/2026-10-11-本次改造记录.md) | 收录放宽、界面分类、时区、报告模块重构、信源日期等全部改动 |
| [报告模块重构方案](docs/discussions/2026-10-09-报告模块重构方案.md) | 取消日报 → 政策解读的设计 |
| [放宽收录范围方案](docs/discussions/2026-10-09-放宽收录范围方案.md) / [部署指南](docs/discussions/2026-10-09-放宽收录范围-部署指南.md) | 分类与收录范围扩展 |
| [把它改成你的行业](docs/customize.md) | 站名、分类、主题、信源、提示词、门槛 |
| [信源](docs/sources.md) | 六种信源怎么配，分级与全文，抓取频率 |
| [精选与校准](docs/selection.md) | 一条资料怎么变成精选，怎么用样本校准 |
| [事件归组](docs/grouping.md) · [综述评测](docs/story-digest-evaluation.md) | 事件关系判断与评测 |
| [部署](docs/deploy.md) · [架构](docs/architecture.md) | 部署运维与架构 |

技术栈：Node.js 24 · TypeScript · React Router（SSR）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose。

## 来源与许可

- 基于开源项目 **AIHOT** 构建，感谢原作者。**AIHOT 的名字与 Logo 不在本项目的许可范围内**。
- 本仓库代码使用 [MIT 许可证](LICENSE)；字体等第三方资源见 [NOTICE](NOTICE)。
- 信源与「什么算重要」的取舍，由本站使用者决定。
