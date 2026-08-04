import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";

const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 24;
const BAR_GAP_RATIO = 0.25;
const BAR_RADIUS = 3;

const BUCKET_OPTIONS = [
  { value: "day" as const, label: "Day", days: 90 },
  { value: "week" as const, label: "Week", days: 182 },
];

function roundedTopBarPath(x: number, y: number, width: number, height: number, radius: number): string {
  if (height <= 0) return "";
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
}

function formatDate(date: string, bucket: "day" | "week"): string {
  const d = new Date(date);
  const short = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return bucket === "week" ? `Week of ${short}` : short;
}

export default function VolumeChart({ mailboxId }: { mailboxId: string }) {
  const [bucket, setBucket] = useState<"day" | "week">("day");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const activeBucket = BUCKET_OPTIONS.find((b) => b.value === bucket)!;

  const volumeQuery = useQuery({
    queryKey: ["insightsVolume", mailboxId, bucket],
    queryFn: () => api.insightsVolume(mailboxId, bucket, activeBucket.days),
  });

  const items = volumeQuery.data?.items ?? [];
  const maxCount = Math.max(1, ...items.map((i) => i.count));
  const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const barSlot = items.length > 0 ? CHART_WIDTH / items.length : 0;
  const barWidth = barSlot * (1 - BAR_GAP_RATIO);
  const tickStep = Math.max(1, Math.ceil(items.length / 6));

  return (
    <div className="viz-root rounded-lg border border-border bg-background p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground dark:text-slate-50">Message volume</h3>
        <div className="flex rounded-md border border-border p-0.5 dark:border-slate-700">
          {BUCKET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setBucket(opt.value);
                setHoverIndex(null);
              }}
              className={`cursor-pointer rounded px-2 py-0.5 text-xs font-medium transition-colors duration-150 ${
                bucket === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-slate-500 hover:text-foreground dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-3">
        {volumeQuery.isLoading ? (
          <div className="h-[180px] animate-pulse rounded bg-muted dark:bg-slate-800" />
        ) : items.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-slate-400 dark:text-slate-500">
            No data yet — run a sync to scan your mailbox.
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="w-full"
              role="img"
              aria-label="Message volume over time"
            >
              <line
                x1={0}
                y1={PADDING_TOP + plotHeight}
                x2={CHART_WIDTH}
                y2={PADDING_TOP + plotHeight}
                stroke="var(--viz-baseline)"
                strokeWidth={1}
              />
              {items.map((item, i) => {
                const barHeight = (item.count / maxCount) * plotHeight;
                const x = i * barSlot + (barSlot - barWidth) / 2;
                const y = PADDING_TOP + plotHeight - barHeight;
                return (
                  <g key={item.date}>
                    <path
                      d={roundedTopBarPath(x, y, barWidth, barHeight, BAR_RADIUS)}
                      fill="var(--viz-series-1)"
                      opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.45}
                    />
                    <rect
                      x={i * barSlot}
                      y={PADDING_TOP}
                      width={barSlot}
                      height={plotHeight}
                      fill="transparent"
                      onMouseEnter={() => setHoverIndex(i)}
                      onMouseLeave={() => setHoverIndex((cur) => (cur === i ? null : cur))}
                    />
                    {i % tickStep === 0 && (
                      <text
                        x={i * barSlot + barSlot / 2}
                        y={CHART_HEIGHT - 6}
                        textAnchor="middle"
                        fontSize={9}
                        fill="var(--viz-ink-muted)"
                      >
                        {formatDate(item.date, bucket)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {hoverIndex !== null && items[hoverIndex] && (
              <div
                className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-background px-2 py-1 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800"
                style={{ left: `${((hoverIndex + 0.5) / items.length) * 100}%` }}
              >
                <div className="font-medium text-foreground dark:text-slate-100">
                  {items[hoverIndex].count} messages
                </div>
                <div className="text-slate-400 dark:text-slate-500">{formatDate(items[hoverIndex].date, bucket)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
