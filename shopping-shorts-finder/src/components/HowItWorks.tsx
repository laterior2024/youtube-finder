/** 📖 점수 보는 법 */
export default function HowItWorks() {
  return (
    <details className="rounded-2xl border border-white/10 bg-[#151922] p-4 text-sm leading-relaxed">
      <summary className="cursor-pointer font-bold">📖 점수는 이렇게 매겨요 (눌러서 보기)</summary>

      <h3 className="mt-4 font-bold text-emerald-300">🛒 쇼핑 점수 — "이게 쇼핑 영상이 맞나?"</h3>
      <p className="mt-1 text-white/70">유튜브에는 "쇼핑" 카테고리가 없어요. 그래서 사람이 설명란을 보고 판단하듯이 단서를 찾아 점수를 더해요.</p>
      <table className="mt-2 w-full text-left text-xs">
        <tbody className="[&_td]:border-b [&_td]:border-white/5 [&_td]:py-1.5">
          <tr><td>🔗 설명란에 쿠팡·네이버·알리·테무·아마존 등 쇼핑 링크</td><td className="text-right text-emerald-300">+40</td></tr>
          <tr><td>📢 "쿠팡 파트너스 활동의 일환으로…" 같은 수수료 문구</td><td className="text-right text-emerald-300">+40</td></tr>
          <tr><td>💰 유튜브 "유료 광고 포함" 표시 / 협찬 문구</td><td className="text-right text-emerald-300">+20~30</td></tr>
          <tr><td>🏷️ 제목·태그에 추천템·내돈내산·언박싱·하울 등</td><td className="text-right text-emerald-300">최대 +45</td></tr>
          <tr><td>🛍️ 설명란에 "구매 링크", "할인 코드" 같은 말</td><td className="text-right text-emerald-300">+15</td></tr>
          <tr><td>🚫 음악·게임·뉴스 분야, 뮤비·직캠 같은 말</td><td className="text-right text-red-300">−20~30</td></tr>
        </tbody>
      </table>
      <p className="mt-2 text-white/70">
        <b className="text-emerald-300">50점↑ 쇼핑 확실</b> · <b className="text-sky-300">30점↑ 쇼핑 같음</b> · <b className="text-amber-300">15점↑ 애매함</b> · 그 아래는 쇼핑 아님
      </p>

      <h3 className="mt-5 font-bold text-orange-300">🚀 떡상 점수 — "지금 뜨고 있나?"</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-white/75">
        <li><b>⚡ 하루 평균 조회수 (35%)</b> — 올린 뒤 하루에 몇 번 보였나. 1만 회 넘으면 🔥</li>
        <li><b>📊 채널 평소 대비 (25%)</b> — 이 채널 다른 영상들의 가운데 조회수보다 몇 배인가. 3배 넘으면 🔥 (이 채널에서 유독 터진 영상!)</li>
        <li><b>👥 구독자 대비 (20%)</b> — 조회수가 구독자의 몇 배인가. 3배 넘으면 🔥 (구독자 밖으로 퍼지는 중!)</li>
        <li><b>🆕 신선도 (10%)</b> — 최근에 올린 영상일수록 높아요.</li>
        <li><b>❤️ 반응률 (10%)</b> — (좋아요+댓글) ÷ 조회수. 5% 넘으면 🔥</li>
      </ul>
      <p className="mt-2 text-white/70">
        <b>75점↑ 🚀 지금 떡상 중</b> · <b>55점↑ 🔥 뜨는 중</b> · <b>35점↑ 📈 괜찮음</b> · 그 아래 😐 평범
      </p>
      <p className="mt-2 text-white/70">
        <b>⏱️ 지난 확인 후</b>: 같은 영상을 30분 이상 지나서 다시 검색하면, 그 사이 <b>시간당 몇 회씩 늘었는지</b> 보여줘요. 지금 이 순간 오르는 중인지 알 수 있는 가장 정확한 숫자예요. 아침·저녁으로 한 번씩 검색해 보세요.
      </p>

      <h3 className="mt-5 font-bold">📱 숏폼 / 🎬 롱폼</h3>
      <p className="mt-1 text-white/70">유튜브 쇼츠는 3분까지 올릴 수 있어요. 그래서 <b>3분 이하는 숏폼</b>, 넘으면 <b>롱폼</b>으로 나눠요.</p>
    </details>
  );
}
