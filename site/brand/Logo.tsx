// AI生成
// 站点的字标和圆环标记：页面用 Wordmark 画站名（size 是高度，单位像素），RingMark 是小标记，转起来就是加载动画。
// 字标走展示字体（霞鹜文楷 Bold）：楷体笔画舒展，去黑体负字距；星标为朱砂五角星，与徽章图标主星同形。
import { SITE } from "../site.ts";

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return (
    <span className={`inline-flex items-center font-display font-bold leading-none tracking-[0.01em] ${className}`} style={{ fontSize: Math.round(size * 0.92) }} aria-label={title} role="img">
      <span aria-hidden="true" className="mr-[0.3em] inline-flex items-center">
        <svg viewBox="0 0 24 24" style={{ width: "0.92em", height: "0.92em" }} aria-hidden="true">
          <path d="M12 1.8l2.8 7.3 7.8.4-6.2 4.7 2.1 7.6L12 17.4l-6.5 4.4 2.1-7.6L1.4 9.5l7.8-.4Z" fill="var(--accent)"/>
        </svg>
      </span>
      <span aria-hidden="true">{SITE.name}</span>
    </span>
  );
}

/** A ring with a dot; spinning, it is the loader. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="42 15" />
      </g>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}
