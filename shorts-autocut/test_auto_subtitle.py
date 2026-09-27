"""auto_subtitle.py 테스트. 실행: python -m unittest test_auto_subtitle.py"""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import auto_subtitle as au
import capcut_draft as cd
import silence_cut as sc
from test_silence_cut import make_capcut_like_draft


class TimingTest(unittest.TestCase):
    RANGES = [(0.0, 2.0), (4.0, 7.0)]  # 2~4초를 잘라냄

    def test_inside_first_range(self):
        self.assertEqual(au.map_interval(0.5, 1.5, self.RANGES), (0.5, 1.5))

    def test_after_cut_shifts_left(self):
        self.assertEqual(au.map_interval(4.5, 6.0, self.RANGES), (2.5, 4.0))

    def test_spanning_cut_joins(self):
        self.assertEqual(au.map_interval(1.0, 5.0, self.RANGES), (1.0, 3.0))

    def test_fully_removed(self):
        self.assertIsNone(au.map_interval(2.2, 3.8, self.RANGES))

    def test_map_segments_drops_removed_and_keeps_ids(self):
        segs = [{"start": 0.1, "end": 1.0, "text": "a"}, {"start": 2.5, "end": 3.5, "text": "b"},
                {"start": 4.0, "end": 5.0, "text": "c"}]
        self.assertEqual([m["id"] for m in au.map_segments(segs, self.RANGES)], [1, 3])


class TextTest(unittest.TestCase):
    def test_split_text(self):
        self.assertEqual(au.split_text("this is a very handy kitchen tool", 12),
                         ["this is a", "very handy", "kitchen tool"])

    def test_spread_lines_by_length(self):
        lines = au.spread_lines(1.0, 4.0, ["가나", "다라마바"])
        self.assertEqual([(l.start, l.end) for l in lines], [(1.0, 2.0), (2.0, 4.0)])

    def test_parse_rewrite_accepts_fences(self):
        answer = '```json\n[{"id": 1, "lines": ["이거 미쳤다", ""]}, {"id": 2, "lines": []}]\n```'
        self.assertEqual(au.parse_rewrite(answer), {1: ["이거 미쳤다"], 2: []})

    def test_make_lines_falls_back_to_original(self):
        items = [{"id": 1, "start": 0, "end": 1, "text": "hello"}, {"id": 2, "start": 1, "end": 2, "text": "uh"}]
        lines = au.make_lines(items, {2: []}, 12)
        self.assertEqual([l.text for l in lines], ["hello"])

    def test_srt(self):
        srt = au.to_srt([au.Line(0.0, 1.25, "첫 줄"), au.Line(61.5, 63.0, "둘째")])
        self.assertIn("1\n00:00:00,000 --> 00:00:01,250\n첫 줄\n", srt)
        self.assertIn("2\n00:01:01,500 --> 00:01:03,000\n둘째\n", srt)

    def test_prompt_contains_rules_and_items(self):
        prompt = au.build_prompt([{"id": 1, "start": 0, "end": 1.5, "text": "Wow"}], 10, "반말")
        self.assertIn('"text": "Wow"', prompt)
        self.assertIn("10자 이하", prompt)
        self.assertIn("반말", prompt)


class CaptionDraftTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_apply_captions_replaces_template_texts(self):
        template = make_capcut_like_draft(self.root)
        draft = cd.load_json(template / "draft_content.json")
        au.apply_captions(draft, [au.Line(0, 1.5, "이거 미쳤다"), au.Line(1.5, 3, "3초 컷")])

        segs = draft["tracks"][1]["segments"]
        self.assertEqual([s["target_timerange"] for s in segs],
                         [{"start": 0, "duration": 1_500_000}, {"start": 1_500_000, "duration": 1_500_000}])
        texts = {m["id"]: cd.read_text(m) for m in draft["materials"]["texts"]}
        self.assertEqual([texts[s["material_id"]] for s in segs], ["이거 미쳤다", "3초 컷"])
        self.assertEqual(len(texts), 2)  # 틀의 옛 자막 재료는 지워져요
        # 자막마다 애니메이션 재료를 따로 가져요.
        anim_ids = {s["extra_material_refs"][0] for s in segs}
        self.assertEqual(len(anim_ids), 2)
        self.assertEqual({a["id"] for a in draft["materials"]["material_animations"]}, anim_ids)


class EndToEndTest(unittest.TestCase):
    """ffmpeg 로 만든 영상 + 저장된 받아쓰기 결과 + 가짜 Gemini 답으로 전체 흐름을 확인해요."""

    def setUp(self):
        try:
            self.ffmpeg = sc.find_ffmpeg()
        except sc.CutError:
            self.skipTest("ffmpeg 없음")
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.video = self.root / "원본.mp4"
        subprocess.run([
            self.ffmpeg, "-y", "-loglevel", "error",
            "-f", "lavfi", "-i", "testsrc=size=320x568:rate=15:duration=6",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
            "-af", "volume=enable='between(t,2,4)':volume=0",
            "-shortest", str(self.video),
        ], check=True)
        # Whisper 대신 저장된 결과를 둬요.
        (self.root / "원본.transcript.json").write_text(json.dumps({
            "model": "small", "language_arg": None, "language": "en",
            "segments": [{"start": 0.2, "end": 1.8, "text": "This is amazing"},
                         {"start": 2.3, "end": 3.7, "text": "(silence)"},
                         {"start": 4.2, "end": 5.8, "text": "It cuts in three seconds"}],
        }), encoding="utf-8")
        make_capcut_like_draft(self.root)

    def tearDown(self):
        self._tmp.cleanup()

    def run_main(self, *extra):
        return au.main([str(self.video), "--template", "틀", "--name", "결과",
                        "--projects-dir", str(self.root), *extra])

    def test_with_mocked_gemini(self):
        reply = json.dumps([{"id": 1, "lines": ["이거 진짜 미쳤다"]},
                            {"id": 3, "lines": ["3초면", "끝"]}], ensure_ascii=False)
        with mock.patch.object(au, "call_gemini", return_value=reply) as called:
            self.assertEqual(self.run_main("--api-key", "test"), 0)
        self.assertIn("It cuts in three seconds", called.call_args[0][0])

        info = cd.summarize(self.root / "결과")
        self.assertEqual(info["texts"], ["이거 진짜 미쳤다", "3초면", "끝"])
        self.assertEqual(len(info["tracks"][0]["segments"]), 2)  # 영상 조각 2개
        text_starts = [s["start"] / cd.MICROSECONDS for s in info["tracks"][1]["segments"]]
        self.assertAlmostEqual(text_starts[0], 0.2, delta=0.05)
        # 4.2초 → 앞 조각(0~2.1초) 뒤에 이어지고, 여유 0.1초를 남긴 3.9초부터라서 약 2.4초
        self.assertAlmostEqual(text_starts[1], 2.4, delta=0.15)
        self.assertTrue((self.root / "결과.srt").exists())

    def test_no_translate_dry_run_makes_only_srt(self):
        self.assertEqual(self.run_main("--no-translate", "--dry-run"), 0)
        self.assertFalse((self.root / "결과").exists())
        srt = (self.root / "결과.srt").read_text(encoding="utf-8")
        self.assertIn("This is\n", srt)  # 12자 넘는 문장은 나눠져요
        self.assertIn("amazing", srt)
        self.assertNotIn("(silence)", srt)  # 잘려 나간 구간의 말은 빠져요

    def test_missing_api_key_is_clear(self):
        with mock.patch.dict("os.environ", {}, clear=True), \
             mock.patch.object(au, "KEY_FILE", self.root / "없음.txt"):
            self.assertEqual(self.run_main(), 1)


if __name__ == "__main__":
    unittest.main()
