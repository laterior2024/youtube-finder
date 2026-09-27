"""analyze_sample.py 테스트. 실행: python -m unittest test_analyze_sample.py"""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import analyze_sample as an
import auto_subtitle as au
import silence_cut as sc

SAMPLE_ANSWER = {
    "제품": "접이식 매트", "카테고리": "생활",
    "훅": {"종류": "문제제기", "설명": "엎지른 소스", "첫자막": "이거 어떻게 치워"},
    "구조": [{"구간": "훅", "시작": 0, "끝": 1, "내용": "문제"}],
    "자막": {"위치": "하단", "글자색": "흰색", "강조색": "노랑", "테두리": True, "배경박스": False,
            "한줄평균글자수": 9, "강조방식": "숫자", "폰트느낌": "굵은고딕"},
    "효과음": [{"초": 1.0, "종류": "pop", "언제": "자막 뜰 때"}],
    "전환": {"주로": "그냥컷", "특징": ""}, "음악": {"있음": True, "분위기": "경쾌", "템포": "빠름"},
    "말소리": {"종류": "원어", "말투": "상황극"}, "속도감": "빠름", "구매유도": "고정댓글", "성공이유": ["a"],
}
FORMULA_ANSWER = {
    "이름": "상황극_문제해결형", "한줄요약": "부부 상황극으로 문제→해결",
    "훅": {"규칙": "사고 장면 먼저", "첫자막_예시": ["이거 어떻게 치워"]},
    "구조": [{"구간": "훅", "비율": 1, "규칙": "사고"}, {"구간": "시연", "비율": 3, "규칙": "해결"}],
    "자막": {"위치": "하단"}, "효과음": {"규칙": [{"언제": "자막", "종류": "pop", "빈도": "매번"}]},
    "전환": {"기본": "그냥컷", "규칙": ""}, "음악": {}, "말투": "반말", "속도감": "빠름",
    "구매유도": "고정댓글", "나만의공식_제안": ["x", "y", "z"],
}


def make_clip(ffmpeg: str, path: Path, colors=("red", "blue", "green", "yellow"), seconds=1.5):
    """색이 바뀌는(=컷이 있는) 짧은 영상을 만들어요."""
    inputs, labels = [], ""
    for i, c in enumerate(colors):
        inputs += ["-f", "lavfi", "-i", f"color=c={c}:s=320x568:r=15:d={seconds}"]
        labels += f"[{i}:v]"
    inputs += ["-f", "lavfi", "-i", f"sine=frequency=500:duration={seconds * len(colors)}"]
    subprocess.run([
        ffmpeg, "-y", "-loglevel", "error", *inputs,
        "-filter_complex", f"{labels}concat=n={len(colors)}:v=1:a=0[v]",
        "-map", "[v]", "-map", f"{len(colors)}:a", "-shortest", "-pix_fmt", "yuv420p", str(path),
    ], check=True)


class PureTest(unittest.TestCase):
    def test_parse_scene_cuts(self):
        log = "[Parsed_showinfo_1] n:0 pts:22 pts_time:1.5 duration\n[Parsed_showinfo_1] n:1 pts_time:3.0 x"
        self.assertEqual(an.parse_scene_cuts(log), [1.5, 3.0])

    def test_summarize_measures(self):
        stats = an.summarize_measures([
            {"길이초": 20, "평균장면길이초": 1.0, "첫3초컷수": 2, "무음비율": 0.1},
            {"길이초": 30, "평균장면길이초": 2.0, "첫3초컷수": 1, "무음비율": 0.0},
        ])
        self.assertEqual(stats["평균길이초"], 25)
        self.assertEqual(stats["길이범위초"], [20, 30])
        self.assertEqual(stats["평균장면길이초"], 1.5)

    def test_target_length_is_clamped_to_shorts_range(self):
        self.assertEqual(an.target_length(50), 35.0)
        self.assertEqual(an.target_length(4), 8.0)
        self.assertEqual(an.target_length(22.34), 22.3)

    def test_normalize_structure(self):
        parts = an.normalize_structure([{"구간": "훅", "비율": 1}, {"구간": "시연", "비율": 3}, "쓰레기"])
        self.assertEqual([p["비율"] for p in parts], [0.25, 0.75])


class EndToEndTest(unittest.TestCase):
    def setUp(self):
        try:
            self.ffmpeg = sc.find_ffmpeg()
        except sc.CutError:
            self.skipTest("ffmpeg 없음")
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.v1, self.v2 = self.root / "샘플1.mp4", self.root / "샘플2.mp4"
        make_clip(self.ffmpeg, self.v1)
        make_clip(self.ffmpeg, self.v2, colors=("white", "black"), seconds=3)

    def tearDown(self):
        self._tmp.cleanup()

    def test_measure_finds_cuts(self):
        m = an.measure(self.v1)
        self.assertAlmostEqual(m["길이초"], 6.0, delta=0.2)
        self.assertEqual(m["컷수"], 3)
        self.assertEqual(m["첫3초컷수"], 1)
        self.assertAlmostEqual(m["평균장면길이초"], 1.5, delta=0.1)
        self.assertTrue(m["세로영상"])

    def test_no_ai_makes_default_formula(self):
        code = an.main([str(self.v1), str(self.v2), "--no-ai", "--out", "공식.json"])
        self.assertEqual(code, 0)
        formula = json.loads((self.root / "공식.json").read_text(encoding="utf-8"))
        self.assertEqual(formula["샘플"], ["샘플1.mp4", "샘플2.mp4"])
        self.assertEqual(formula["길이"]["목표"], 8.0)  # 평균 6초 → 쇼츠 최소 8초로 맞춤
        self.assertAlmostEqual(sum(p["비율"] for p in formula["구조"]), 1.0, delta=0.02)
        self.assertTrue((self.root / "샘플1.analysis.json").exists())

    def test_with_mocked_gemini_and_cache(self):
        answers = [json.dumps(SAMPLE_ANSWER, ensure_ascii=False)] * 2 + [json.dumps(FORMULA_ANSWER, ensure_ascii=False)]
        with mock.patch.object(au, "generate", side_effect=answers) as gen:
            self.assertEqual(an.main([str(self.v1), str(self.v2), "--api-key", "k", "--out", "공식.json"]), 0)
        self.assertEqual(gen.call_count, 3)
        first_parts = gen.call_args_list[0][0][0]
        self.assertIn("inline_data", first_parts[0])  # 작은 영상은 바로 실어 보내요

        formula = json.loads((self.root / "공식.json").read_text(encoding="utf-8"))
        self.assertEqual(formula["이름"], "상황극_문제해결형")
        self.assertEqual([p["비율"] for p in formula["구조"]], [0.25, 0.75])
        self.assertIn("측정값", formula)

        # 두 번째 실행: 샘플 분석은 저장된 걸 쓰고, 공식 만들기만 다시 해요.
        with mock.patch.object(au, "generate", return_value=json.dumps(FORMULA_ANSWER)) as gen:
            self.assertEqual(an.main([str(self.v1), str(self.v2), "--api-key", "k"]), 0)
        self.assertEqual(gen.call_count, 1)

        # 컷 민감도만 바꾸면 다시 재기만 하고, 샘플 분석(Gemini)은 다시 하지 않아요.
        with mock.patch.object(au, "generate", return_value=json.dumps(FORMULA_ANSWER)) as gen:
            self.assertEqual(an.main([str(self.v1), str(self.v2), "--api-key", "k", "--scene-threshold", "0.15"]), 0)
        self.assertEqual(gen.call_count, 1)
        saved = json.loads((self.root / "샘플1.analysis.json").read_text(encoding="utf-8"))
        self.assertEqual(saved["측정"]["장면민감도"], 0.15)
        self.assertEqual(saved["AI분석"]["제품"], "접이식 매트")


if __name__ == "__main__":
    unittest.main()
