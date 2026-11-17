// AI生成
// 思政智汇的站点模块：把本站独有的两类内容挂进 Agent 与 MCP——
// ① 政策解读（get_insights / get_insight，核心差异化能力，原来只有网页没有接口）；
// ② 主题浏览（list_topics / get_topic，按 4 组 12 主题看动态，供辅导员按工作领域检索）。
// 注册进 SERVER_MODULES 后，MCP 服务器、/api/v1/agent、llms.txt 与 Agent 接入页自动同步，不改框架代码。
import { z } from "zod";
import type { ServerModule } from "@aihot/backend/modules";
import { SITE } from "@aihot/site";
import { config } from "@aihot/backend/config";
import { listInsights, listInsightsByTag, insightDetail } from "@aihot/backend/reports/insights";
import { listTopicSummaries, loadTopicPage } from "@aihot/backend/publication/topics";

const BASE = new URL(config.siteUrl);

const link = (path: string) => `${BASE.origin}${path}`;

/** 政策解读条目 → Agent 可读的一行 Markdown。 */
function insightLine(i: { articleId: string; title: string; sourceName: string; score: number; tldr: string; tags: string[]; generatedAt: string }): string {
  const tags = i.tags.length ? `（标签：${i.tags.join("、")}）` : "";
  return `- [${i.title}](${link(`/daily/${i.articleId}`)}) — ${i.sourceName} · 评分 ${i.score} · ${i.tldr}${tags}`;
}

const INSIGHTS_INPUT = z.strictObject({
  tag: z.string().min(1).max(24).optional().describe("Optional tag to filter insights (e.g. 辅导员, 就业). Omit for all."),
  limit: z.number().int().min(1).max(30).default(10).describe("Maximum number of insights, from 1 to 30."),
});

const INSIGHT_INPUT = z.strictObject({
  article_id: z.string().min(1).max(128).describe("The insight's article ID (publicId), from get_insights items. Never guess it."),
});

const TOPICS_INPUT = z.strictObject({});

const TOPIC_INPUT = z.strictObject({
  slug: z.string().min(1).max(64).describe("Topic slug from list_topics (e.g. fudaoyuan, support-education). Never guess it."),
  page: z.number().int().min(1).max(50).default(1).describe("Page number of the topic's item list, from 1 to 50."),
});

const CACHE = "public, max-age=60";

const module: ServerModule = {
  name: "sizheng",
  agent: {
    abilities: [
      {
        path: "/insights",
        title: "政策解读",
        ask: "想看近期重要政策与讲话的 AI 解读",
        etagPrefix: "agent-insights",
        cacheControl: CACHE,
        answer: async () => {
          const items = await listInsights(10);
          if (!items.length) return "还没有生成政策解读。";
          const head = `${SITE.name} 近期的政策解读（每篇含速览、要点、意义与辅导员启示）：\n\n`;
          return head + items.map(insightLine).join("\n");
        },
        mcp: {
          tool: "get_insights",
          use: "for AI-written interpretations of major policies and speeches",
          description: `Get ${SITE.name}'s AI-written policy interpretations: for each major policy or speech (score ≥ 82) an original structured read (briefing, key points, significance, what it means for student-affairs counselors). Optional tag filter. Use this when the user asks what a policy means or wants interpretation, not raw news.`,
          input: INSIGHTS_INPUT,
          run: async (args) => {
            const { tag, limit } = args as { tag?: string; limit?: number };
            const items = tag ? await listInsightsByTag(tag, limit ?? 10) : await listInsights(limit ?? 10);
            const text = items.length
              ? `${SITE.name} 政策解读${tag ? `（标签：${tag}）` : ""}，共 ${items.length} 篇：\n\n` + items.map(insightLine).join("\n")
              : `没有${tag ? `标签为「${tag}」的` : ""}政策解读。`;
            return { text, structured: { schemaVersion: 1, tag: tag ?? null, count: items.length, items } };
          },
        },
      },
      {
        path: "/insight",
        title: "单篇政策解读",
        ask: "想读某一条解读的完整八个部分",
        etagPrefix: "agent-insight",
        cacheControl: CACHE,
        answer: async () => {
          const items = await listInsights(5);
          if (!items.length) return "还没有生成政策解读。";
          return "单篇解读请带 article_id 查询；最近的解读：\n" + items.map((i) => `- ${i.articleId}：${i.title}`).join("\n");
        },
        mcp: {
          tool: "get_insight",
          use: "for one full interpretation by its article ID",
          description: `Get one full ${SITE.name} policy interpretation by article_id from get_insights: all eight parts (briefing, background, key points, significance, quote, implications for counselors, discussion questions, tags). Only pass IDs returned by get_insights.`,
          input: INSIGHT_INPUT,
          run: async (args) => {
            const { article_id } = args as { article_id: string };
            const d = await insightDetail(article_id);
            if (!d) return { text: `没有这篇文章的解读；只使用 get_insights 返回的 article_id。`, structured: { error: "not_found" } };
            const lines = [
              `# ${d.title}`,
              `来源：${d.sourceName} · 评分 ${d.score} · 生成于 ${d.generatedAt}`,
              d.tldr ? `**速览**：${d.tldr}` : "",
              d.background ? `**背景**：${d.background}` : "",
              (d as { keyPoints?: string[] }).keyPoints?.length ? `**要点**：\n${(d as { keyPoints: string[] }).keyPoints.map((k) => `- ${k}`).join("\n")}` : "",
              (d as { significance?: string }).significance ? `**意义与影响**：${(d as { significance: string }).significance}` : "",
              (d as { quote?: string }).quote ? `**原文金句**：${(d as { quote: string }).quote}` : "",
              (d as { implications?: string }).implications ? `**对辅导员意味着什么**：${(d as { implications: string }).implications}` : "",
              (d as { questions?: string[] }).questions?.length ? `**思考与讨论**：\n${(d as { questions: string[] }).questions.map((q) => `- ${q}`).join("\n")}` : "",
              d.tags.length ? `**标签**：${d.tags.join("、")}` : "",
              `原文：${link(`/daily/${article_id}`)}`,
            ].filter(Boolean);
            return { text: lines.join("\n\n"), structured: { schemaVersion: 1, insight: d } };
          },
        },
      },
      {
        path: "/topics",
        title: "主题总览",
        ask: "想按工作领域（思政主线、学生成长、高校实践、形势热点）浏览",
        etagPrefix: "agent-topics",
        cacheControl: CACHE,
        answer: async () => {
          const res = await listTopicSummaries();
          const head = `${SITE.name} 的主题目录（按组）：\n`;
          const byGroup = res.groups.map((g) => {
            const topics = res.topics.filter((t) => t.group === g.key);
            return `**${g.name}**（${g.blurb}）\n` + topics.map((t) => `- ${t.name}（${t.total} 条，近 30 天 ${t.recent} 条）：${t.definition}`).join("\n");
          });
          return head + byGroup.join("\n\n");
        },
        mcp: {
          tool: "list_topics",
          use: "for the topic directory by work area",
          description: `List ${SITE.name}'s topic directory: 12 topics in 4 groups (思政主线/学生成长/高校实践/形势热点), each with its content counts and definition. Use this to browse by work area; then get_topic for one topic's items.`,
          input: TOPICS_INPUT,
          run: async () => {
            const res = await listTopicSummaries();
            const text = `${SITE.name} 主题目录（${res.groups.length} 组 ${res.topics.length} 个主题）：\n` + res.groups.map((g) =>
              `**${g.name}**：` + res.topics.filter((t) => t.group === g.key).map((t) => `${t.name}(${t.slug}，${t.total} 条)`).join("、"),
            ).join("\n");
            return { text, structured: { schemaVersion: 1, groups: res.groups, topics: res.topics } };
          },
        },
      },
      {
        path: "/topic",
        title: "主题动态",
        ask: "想看某一个主题下的最新条目",
        etagPrefix: "agent-topic",
        cacheControl: CACHE,
        answer: async () => {
          const res = await listTopicSummaries();
          return "单主题请带 slug 查询；可用主题：\n" + res.topics.map((t) => `- ${t.slug}：${t.name}（${t.total} 条）`).join("\n");
        },
        mcp: {
          tool: "get_topic",
          use: "for one topic's latest items by slug",
          description: `Get one ${SITE.name} topic's item list by slug from list_topics (e.g. fudaoyuan for 辅导员, support-education for 帮扶育人): paginated editorial picks under that topic, newest first.`,
          input: TOPIC_INPUT,
          run: async (args) => {
            const { slug, page } = args as { slug: string; page?: number };
            const loaded = await loadTopicPage(slug, page ?? 1);
            if (!loaded) return { text: `没有这个主题；只使用 list_topics 返回的 slug。`, structured: { error: "not_found" } };
            const t = loaded.topic;
            const items = loaded.items.map((i) => `- ${i.title}${i.summary ? ` — ${i.summary}` : ""}`);
            const text = [
              `# ${t.name}（${t.groupName}）`,
              t.definition,
              `精选 ${t.total} 条（近 30 天 ${t.recent} 条），第 ${loaded.page}/${loaded.pageCount} 页：`,
              ...items,
              `页面：${link(`/topics/${slug}`)}`,
            ].join("\n");
            return { text, structured: { schemaVersion: 1, topic: t, page: loaded.page, pageCount: loaded.pageCount, items: loaded.items } };
          },
        },
      },
    ],
  },
};

export default module;
