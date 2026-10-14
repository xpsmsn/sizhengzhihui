// AI生成
// First-party site API (/api/site/*). Not a public API: it may evolve with the website,
// but it is served from the same public read layer as v1, RSS and MCP.
import type { CategoryKey, ChannelKey } from "./taxonomy.ts";

export interface SourceRef {
  /** The name readers see (publication/rules.ts publicSourceName), as is every source name here. */
  name: string;
}

export interface MediaView {
  kind: "image" | "video";
  url: string;
  /** Full image for an on-demand viewer; list previews stay small. */
  fullUrl?: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  poster: string | null;
  srcSet?: string;
}

export interface XPostView {
  authorName: string;
  handle: string;
  avatarUrl: string | null;
  avatarSrcSet?: string;
  text: string;
  translation: string | null;
  /** translation: Chinese translation of the quoted post, when it is in another language. */
  quoted: { authorName: string; handle: string; text: string; url: string; translation: string | null } | null;
  media: MediaView[];
}

export interface StoryRef {
  publicId: string;
  title: string;
}

/** What every site answer about an article carries; a card and a page each add the X post in their own form. */
export interface ItemSummary {
  id: string;
  title: string;
  originalTitle: string | null;
  summary: string | null;
  reason: string | null;
  source: SourceRef;
  links: { original: string };
  publishedAt: string | null;
  discoveredAt: string;
  timelineAt: string;
  category: CategoryKey | null;
  tags: string[];
  score: number | null;
  selected: boolean;
  channel: "news" | "x";
  story: StoryRef | null;
}

/** The fields rendered by a site feed card; full original text lives in the item detail. */
export interface FeedItemSummary extends Pick<ItemSummary, "id" | "title" | "summary" | "reason" | "source" | "publishedAt" | "timelineAt" | "category" | "tags" | "score" | "selected" | "channel"> {
  x: (Pick<XPostView, "authorName" | "handle" | "avatarUrl" | "avatarSrcSet" | "media"> & {
    quoted: Omit<NonNullable<XPostView["quoted"]>, "url"> | null;
  }) | null;
  /**
   * A selected report whose fact is represented by another report (全部动态 and search): that report,
   * so the card can say "同一新闻，精选展示《…》" instead of claiming a seat of its own.
   */
  sameEvent?: { id: string; title: string } | null;
}

export interface GroupInfo {
  factId: string;
  /** Other public sources reporting this same news fact, under the current filters. */
  additionalSourceCount: number;
  /** Distinct public reports of this fact. */
  reportCount: number;
}

export interface TimelineCard {
  key: string;
  anchorAt: string;
  item: FeedItemSummary;
  group: GroupInfo | null;
}

export interface HotStripEntry {
  rank: number;
  title: string;
  heat: number;
  trend: "up" | "down" | "flat" | "new" | "unknown";
  storyPublicId: string | null;
  itemId: string | null;
  participants: HotParticipant[];
  participantCount: number;
}

export interface TimelineFilters {
  channel: ChannelKey;
  category: CategoryKey | null;
  tag: string | null;
}

export interface TimelineResponse {
  filters: TimelineFilters;
  cards: TimelineCard[];
  nextCursor: string | null;
  hot: HotStripEntry[] | null;
  dayCounts: Record<string, number>;
  /** Selected reports per website category, under the same channel/tag filters (not the category filter): the tab row shows a category only while it has content. */
  categoryCounts: Record<string, number>;
}

export interface PoolResponse {
  filters: TimelineFilters & { q: string | null; tab: "time" | "relevance" };
  items: FeedItemSummary[];
  page: number;
  pageCount: number;
  total: number;
  todayCount: number;
  freshness: string;
  /** Listed reports per website category, under the same channel/tag filters (not the category filter): the tab row shows a category only while it has content. */
  categoryCounts: Record<string, number>;
}

/** 政策解读：为高分条目生成的原创解读（展示在 /daily 页）。 */
export interface InsightView {
  articleId: string;
  title: string;
  sourceName: string;
  score: number;
  /** 一句话速览；旧解读可能为空，列表退回到 background。 */
  tldr: string;
  /** 背景，列表与详情都用。 */
  background: string;
  /** 要点条数（列表只显示数量，详情展开）。 */
  pointCount: number;
  generatedAt: string;
}

export interface InsightsResponse {
  items: InsightView[];
}

/** 解读详情的一张配图：取自条目原文的正文图片，经图片代理签名。 */
export interface InsightCover {
  url: string;
  srcSet?: string;
  width: number | null;
  height: number | null;
}

/** 同一事件的其他公开报道，供解读详情页"相关阅读"。 */
export interface InsightRelated {
  id: string;
  title: string;
  sourceName: string;
  originalUrl: string;
}

/** 同一事件（fact）下的报道，按时间升序，供解读详情页“事件时间轴”。 */
export interface InsightTimelineItem {
  id: string;
  title: string;
  sourceName: string;
  /** 报道时间（ISO）；北京时区由前端格式化。 */
  date: string;
  /** 是否为当前解读所依据的代表条目。 */
  current: boolean;
}

export interface InsightDetail extends InsightView {
  keyPoints: string[];
  /** 意义与影响；旧解读可能为空。 */
  significance: string;
  /** 原文一句关键表述；旧解读或材料没有合适表述时为空。 */
  quote: string;
  implications: string;
  /** 2–3 个供辅导员思考的问题；旧解读可能为空。 */
  questions: string[];
  /** 原文配图，可为空。 */
  cover: InsightCover | null;
  /** 同一事件的其他报道，可为空。 */
  related: InsightRelated[];
  /** 同一事件下按时间升序排列的报道（含本篇），用于“事件时间轴”；无事件归并时为空。 */
  timeline: InsightTimelineItem[];
  /** 原文链接（外部来源），可能为空。 */
  originalUrl: string;
}

export interface OutlineEntry {
  id: string;
  text: string;
  level: number;
}

/**
 * An article page (/api/site/items/:id) in one language: Chinese (the article itself or its translation)
 * unless …/original asks for the original. Only the body shown is sent, with its outline.
 */
export interface SiteItemDetail extends ItemSummary {
  /** The post with all its media; its text is the body. */
  x: Omit<XPostView, "text" | "translation"> | null;
  /** Selected, but its fact's seat is held by this report: marked 同新闻, without a reason of its own. */
  sameEvent?: { id: string; title: string } | null;
  readingMode: "full" | "summary-only";
  author: string | null;
  /** Whitelisted HTML of the language shown; the other one is null. */
  body: { zh: string | null; original: string | null; zhKind: "translation" | "original" | null; complete: boolean } | null;
  outline: OutlineEntry[];
  relatedStories: StoryRef[];
  /** The topics the report belongs to. */
  topics: TopicLink[];
  indexable: boolean;
  markdownAvailable: boolean;
  group: GroupInfo | null;
  hasTranslation: boolean;
  bodyLanguage: "zh" | "original";
}

/** A fact's public reports under the list's filters: what "另有 N 家信源报道" opens. */
export interface GroupReport {
  id: string;
  title: string;
  source: SourceRef;
  timelineAt: string;
  originalUrl: string;
}

export interface GroupReportsResponse {
  factId: string;
  reports: GroupReport[];
}

// Hot ranking and stories

/** Home and hot-ranking faces show the same maximum number of editorial participants. */
export const HOT_FACE_LIMIT = 6;

export interface HotParticipant {
  name: string;
  kind: "editorial" | "signal";
  /** Only visible faces carry images: the source's icon or its latest collected X avatar (proxied). */
  iconUrl?: string | null;
  iconSrcSet?: string;
}


export interface HotEntryView {
  rank: number;
  story: StoryRef;
  heat: number;
  trend: "up" | "down" | "flat" | "new" | "unknown";
  trendPct: number | null;
  badges: Array<"surge" | "new" | "rising">;
  participantCount: number;
  sourceCount: number;
  sourceNames: string[];
  participants: HotParticipant[];
  /** Hourly heat over the 24 hours up to the ranking, oldest first; null where no comparable snapshot exists. */
  spark: Array<number | null>;
  /** A card excerpt of the story's AI digest, else its fact statement; full text is on the event page. */
  summary: string | null;
  /** The latest development, one line. */
  latest: string | null;
  /** A picture from the story's public reports (the representative first), for the leading cards. */
  cover: { url: string; srcSet?: string; width: number | null; height: number | null } | null;
  /** Article ID for direct linking when the entry has no story (近期关注 mode). */
  itemId: string | null;
}

export interface HotResponse {
  computedAt: string | null;
  windowHours: number;
  entries: HotEntryView[];
}

export interface HeatPoint {
  hour: string;
  heat: number;
  participants: number;
}

export interface StoryReportView {
  id: string;
  title: string;
  summary: string | null;
  source: SourceRef & { firstParty: boolean };
  publishedAt: string;
  selected: boolean;
}

export interface StoryFactView {
  factId: string;
  title: string;
  firstReportAt: string;
  reportCount: number;
  representative: StoryReportView;
}

export interface StoryDetail {
  publicId: string;
  title: string;
  status: "active" | "watching" | "settled";
  reportCount: number;
  sourceCount: number;
  firstReportAt: string | null;
  latestAt: string | null;
  digest: string | null;
  digestUpdatedAt: string | null;
  /** The story's own factual summary, when it has one. */
  summary: string | null;
  /** Without a digest or summary: the summary of the report the story started from. */
  excerpt: { text: string; sourceName: string } | null;
  latest: string | null;
  /** The current public report supplying latest; never inferred from an independently generated digest. */
  latestReport: { id: string } | null;
  whyHot: {
    participants48h: number;
    newParticipants6h: number;
    recentReports24h: number;
    observationComplete: boolean;
    rank: number | null;
  };
  developments: StoryFactView[];
  officialReports: StoryReportView[];
  timeline: StoryReportView[];
  heat: HeatPoint[];
  related: Array<StoryRef & { relation: "storyline" | "related" }>;
  /** The topics its reports belong to, most reports first. */
  topics: TopicLink[];
}

// Reports (daily / weekly / monthly)

export type ReportKind = "daily" | "weekly" | "monthly";

export interface ReportCitation {
  itemId: string | null;
  title: string;
  summary: string | null;
  sourceName: string;
  sourceUrl: string;
  sourceIconUrl: string | null;
  sourceIconSrcSet?: string;
  firstParty: boolean;
  /** When the cited report was published, if it is still in the database. */
  publishedAt: string | null;
  /** False once the item was withdrawn; the citation then shows as removed. */
  available: boolean;
  /** A daily entry: other sources that reported the event by the issue's cutoff. */
  otherSources?: number;
  /** A daily entry's other developments of the event, or reports of the launch merged into it (titles only). */
  related?: ReportCitation[];
  /** A daily entry whose event an earlier daily covered: that issue's date. */
  followUp?: string;
}

export interface ReportDetail {
  kind: ReportKind;
  key: string;
  /** The issue's place among the existing issues of its kind, oldest first ("第 N 期"). */
  issueNumber: number;
  title: string;
  generatedAt: string;
  lead: { title: string; leadParagraph: string } | null;
  /** The still-public item the front page leads with (its headline links there). */
  leadItemId: string | null;
  overview: string | null;
  highlights: ReportCitation[];
  /** As edited: daily categories, weekly and monthly themes. */
  sections: Array<{ label: string; summary: string | null; items: ReportCitation[] }>;
  flashes: ReportCitation[];
  /**
   * The front page's picture: from the lead item (a daily's lead, a weekly or monthly's first highlight),
   * else from another public report of that event. Captioned with the story when it is not the lead's own.
   */
  cover: { url: string; srcSet?: string; width: number | null; height: number | null; caption: string | null } | null;
  metrics: Record<string, number>;
  readingMinutes: number;
  prev: string | null;
  next: string | null;
}

export interface ReportIndexEntry {
  key: string;
  issueNumber: number;
  title: string | null;
  count: number;
}

export interface ReportIndexResponse {
  kind: ReportKind;
  items: ReportIndexEntry[];
}

/** The latest report page: its archive selector and the report in one request. */
export interface ReportLatestPage {
  index: ReportNavigationEntry[];
  report: ReportDetail | null;
}

/** A report's archive selector, or one month of the daily archive. */
export interface ReportNavigationResponse {
  items: ReportNavigationEntry[];
}

/** Site-wide facts for the web shell: the changelog red-dot anchor. */
export interface SiteMeta {
  changelogVersion: string;
}

/** One entry of the site's changelog (site/changelog.json), newest first. */
export interface ChangelogRelease {
  date: string;
  time: string;
  kind: "更新" | "优化" | "公告" | "下线";
  title: string;
  body: string[];
  /** A notice readers must act on: drawn in the warning red so it cannot be skimmed past. */
  urgent?: true;
  /** A major release's long form, drawn by the site's own drawing when it ships one; its shape is the site's. */
  feature?: unknown;
}

export interface ChangelogResponse {
  latestVersion: string;
  releases: ChangelogRelease[];
}

/**
 * The about page's contact codes (uploaded in the admin or shipped with the site; null when there is
 * none) and the maker's avatar through the image proxy.
 */
export interface SiteContact {
  wechatQr: string | null;
  feishuQr: string | null;
  makerAvatar: string | null;
}

/** Figures and samples for the about page (site-only; not part of v1). */
export interface SiteStats {
  /** Sources collected from now. */
  sources: number;
  /** Enabled sources by kind: x_search, rss, web_list, mp_account, json_list. */
  sourceKinds: Record<string, number>;
  /** Everything collected and not withdrawn, heat-only sources included. */
  items: number;
  selected: number;
  dailies: number;
  /** The last 24 hours: items found (heat-only sources included), and items that made 精选 (by their place on the timeline). */
  day: { collected: number; selected: number };
  /** Enabled sources in a daily shuffle, for the about page's river: one line per source. */
  sampleSources: Array<{ name: string; kind: string; heatOnly: boolean }>;
  /** The latest 精选, newest first. */
  latest: Array<{ id: string; title: string; source: string }>;
}

export interface StoryFollowup {
  factId: string;
  representative: { id: string; title: string; source: { name: string }; timelineAt: string };
}
export interface StoryFollowupsResponse { items: StoryFollowup[]; more: boolean }

/**
 * A starred item as the site can show it now (/api/site/items/availability, keyed by id). Stars keep the
 * source name of the day they were saved; a public item also brings the name shown today.
 */
export interface ItemAvailability {
  status: "public" | "summary-only" | "unavailable";
  sourceName?: string;
}

/** An issue in the archive and the calendar, numbered in its whole series; closed daily months omit their titles. */
export interface ReportNavigationEntry { key: string; issueNumber: number; title?: string | null; count?: number }

// Topics

export type TopicGroupKey = "company" | "field" | "genre";

export interface TopicGroup {
  key: TopicGroupKey;
  name: string;
  blurb: string;
}

export interface TopicLink {
  slug: string;
  name: string;
}

/** A mark drawn beside a name: its logo, or a monogram when there is none. */
export interface Brand {
  /** Site-relative logo path, or null when only a monogram is available. */
  src: string | null;
  monogram: string;
  /** Raster marks get a light backing plate in dark mode. */
  raster: boolean;
}

export interface TopicSummary extends TopicLink {
  group: TopicGroupKey;
  definition: string;
  /** Companies: their logo mark where the site has one, else their initial. */
  brand: Brand | null;
  /** Selected reports, one per fact (as v1 and RSS count the selected set). */
  total: number;
  /** Of those, in the last 30 days. */
  recent: number;
  /** Enough content to be listed and indexed. */
  indexable: boolean;
  /** The newest selected report. */
  latest: { title: string; at: string } | null;
}

export interface TopicsResponse {
  groups: TopicGroup[];
  topics: TopicSummary[];
}

/** Phone search only needs links, not the topic pages or full hot ranking. */
export interface SearchSuggestions {
  topics: Array<TopicLink & { group: TopicGroupKey }>;
  hot: Array<{ rank: number; title: string; to: string }>;
}

export interface TopicPage {
  topic: TopicSummary & { groupName: string; /** Every listed report, selected or not. */ poolTotal: number };
  /** The site's modules' parts of the page, under their names; each module's web part draws its own. */
  modules: Record<string, unknown>;
  items: FeedItemSummary[];
  page: number;
  pageCount: number;
  pageSize: number;
}
