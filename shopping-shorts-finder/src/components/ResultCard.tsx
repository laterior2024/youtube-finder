import type { ResultItem } from '../types';
import { LEVEL_INFO } from '../lib/shopping';
import { trendLabel } from '../lib/trend';
import { ago, duration, num, percent, times, videoUrl } from '../lib/format';

/** 영상 한 개 카드 */
export default function ResultCard({ item, rank }: { item: ResultItem; rank: number }) {
  const { video: v, channel, shopping, trend } = item;
  const t = trendLabel(trend.score);
  const lv = LEVEL_INFO[shopping.level];
  const url = videoUrl(item);
  const isShorts = v.format === 'shorts';

  return (
    <article className={`flex flex-col overflow-hidden rounded-2xl border bg-[#151922] ${shopping.level === 'no' ? 'border-white/5 opacity-60' : 'border-white/10'}`}>
      <a href={url} target="_blank" rel="noreferrer" className="relative block bg-black">
        <img src={v.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
        <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-0.5 text-xs font-bold">#{rank}</span>
        <span className={`absolute right-2 top-2 rounded-md px-2 py-0.5 text-xs font-bold ${isShorts ? 'bg-red-500 text-white' : 'bg-sky-500 text-white'}`}>
          {isShorts ? '📱 숏폼' : '🎬 롱폼'}
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs">{duration(v.durationSec)}</span>
      </a>

      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        {/* 떡상 점수 */}
        <div className={`flex items-center justify-between rounded-xl bg-gradient-to-r ${t.color} px-3 py-2 text-white`}>
          <span className="font-bold">
            {t.emoji} {t.label}
          </span>
          <span className="text-xl font-black">
            {trend.score}
            <span className="text-xs font-semibold opacity-80">점</span>
          </span>
        </div>

        <div>
          <a href={url} target="_blank" rel="noreferrer" className="line-clamp-2 font-semibold leading-snug hover:underline" title={v.title}>
            {v.title}
          </a>
          <p className="mt-1 truncate text-sm text-white/60">
            <a href={`https://www.youtube.com/channel/${v.channelId}`} target="_blank" rel="noreferrer" className="hover:underline">
              {v.channelTitle}
            </a>
            {' · '}구독자 {channel?.subs ? num(channel.subs) : '숨김'}
            {' · '}
            {ago(trend.ageHours)}
          </p>
        </div>

        {/* 숫자들 */}
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="👀 조회수" value={num(v.views)} />
          <Stat label="⚡ 하루 평균" value={`${num(trend.viewsPerDay)}회`} hot={trend.viewsPerDay >= 10000} />
          <Stat label="👥 구독자 대비" value={times(trend.subRatio)} hot={(trend.subRatio ?? 0) >= 3} hint="조회수 ÷ 구독자 수" />
          <Stat label="📊 채널 평소 대비" value={times(trend.channelRatio)} hot={(trend.channelRatio ?? 0) >= 3} hint={trend.channelMedian ? `이 채널 평소 조회수 약 ${num(trend.channelMedian)}회` : '비교할 영상이 부족해요'} />
          <Stat label="❤️ 반응률" value={percent(trend.engagement)} hot={(trend.engagement ?? 0) >= 0.05} hint="(좋아요+댓글) ÷ 조회수" />
          <Stat
            label="⏱️ 지난 확인 후"
            value={trend.growthPerHour === null ? '첫 확인' : `+${num(trend.growthPerHour)}/시간`}
            hot={(trend.growthPerHour ?? 0) >= 1000}
            hint={trend.growthSinceHours ? `${Math.round(trend.growthSinceHours)}시간 전 기록과 비교` : '다음에 다시 검색하면 늘어난 속도를 보여줘요'}
          />
        </dl>

        {/* 쇼핑 판별 근거 */}
        <details className="mt-auto rounded-xl bg-white/5 p-2 text-sm">
          <summary className="flex cursor-pointer items-center justify-between gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${lv.color}`}>
              🛒 {lv.label} {shopping.score}점
            </span>
            <span className="truncate text-xs text-white/50">{shopping.shops.length ? shopping.shops.join('·') : '왜 쇼핑 영상일까?'}</span>
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-white/75">
            {shopping.reasons.length === 0 && <li>쇼핑 단서를 찾지 못했어요.</li>}
            {shopping.reasons.map((r, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{r.label}</span>
                <span className={r.points < 0 ? 'text-red-300' : 'text-emerald-300'}>
                  {r.points > 0 ? '+' : ''}
                  {r.points}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </article>
  );
}

function Stat({ label, value, hot, hint }: { label: string; value: string; hot?: boolean; hint?: string }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${hot ? 'bg-orange-500/15 ring-1 ring-orange-500/40' : 'bg-white/5'}`} title={hint}>
      <dt className="text-[11px] text-white/55">{label}</dt>
      <dd className={`font-bold ${hot ? 'text-orange-300' : ''}`}>
        {value}
        {hot && ' 🔥'}
      </dd>
    </div>
  );
}
