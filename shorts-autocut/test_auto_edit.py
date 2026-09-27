"""auto_edit.py 테스트. 실행: python -m unittest test_auto_edit.py"""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import auto_edit as ae
import auto_subtitle as au
import capcut_draft as cd
import silence_cut as sc
from test_silence_cut import make_capcut_like_draft

FORMULA = {
    "이름": "감동사연_반전엔딩형", "한줄요약": "결말부터 보여주고 사연을 푼다",
    "훅": {"규칙": "가장 감정적인 장면 먼저"},
    "구조": [{"구간": "훅", "비율": 0.2, "규칙": "결말"}, {"구간": "전개", "비율": 0.6, "규칙": "사연"},
             {"구간": "참여유도", "비율": 0.2, "규칙": "질문"}],
    "자막": {"한줄최대글자수": 8, "강조규칙": "감정 단어"},
    "말투": "담담하게", "속도감": "빠름", "컷": {"평균장면길이초": 2.0},
    "길이": {"최소": 8, "최대": 35, "목표": 10},
}


class PureTest(unittest.TestCase):
    def test_clean_clips_clamps_trims_overlap_and_drops_short(self):
        raw = [
            {"시작": 8, "끝": 11, "역할": "훅"},
            {"시작": -1, "끝": 3, "역할": "배경"},
            {"시작": 10, "끝": 13, "역할": "전개"},     # 8~11 과 겹침 → 11~13
            {"시작": 9, "끝": 10.5},                   # 전부 겹침 → 버림
            {"시작": 20, "끝": 20.3},                   # 너무 짧음 → 버림
            {"시작": "x", "끝": 5}, "쓰레기",
            {"시작": 14, "끝": 99},                     # 길이 넘음 → 15 까지
        ]
        clips = ae.clean_clips(raw, 15.0)
        self.assertEqual([(c["시작"], c["끝"]) for c in clips], [(8, 11), (0, 3), (11, 13), (14, 15)])
        self.assertEqual(clips[0]["역할"], "훅")

    def test_fit_length_trims_from_the_end_and_keeps_hook(self):
        clips = [{"시작": 0, "끝": 20}, {"시작": 30, "끝": 40}, {"시작": 50, "끝": 60}]
        fitted = ae.fit_length(clips, 35)
        self.assertAlmostEqual(sum(c["끝"] - c["시작"] for c in fitted), 35)
        self.assertEqual(fitted[0], {"시작": 0, "끝": 20})

    def test_fit_length_drops_tiny_leftover(self):
        fitted = ae.fit_length([{"시작": 0, "끝": 34.8}, {"시작": 50, "끝": 51}], 35)
        self.assertEqual(len(fitted), 1)

    def test_split_by_sound_keeps_clip_order(self):
        clips = [{"시작": 10, "끝": 14}, {"시작": 0, "끝": 3}]
        keep = [(0, 2), (2.5, 11), (12, 20)]
        self.assertEqual(ae.split_by_sound(clips, keep), [(10, 11), (12, 14), (0, 2), (2.5, 3)])

    def test_title_lines(self):
        lines = ae.title_lines({"훅제목": "아무도 몰랐던 진실", "참여유도": "여러분이라면?"}, 20.0)
        self.assertEqual([(l.start, l.end, l.text) for l in lines],
                         [(0.0, 3.0, "아무도 몰랐던 진실"), (17.5, 20.0, "여러분이라면?")])
        self.assertEqual(ae.title_lines({"훅제목": "", "참여유도": ""}, 20.0), [])

    def test_section_plan_and_style(self):
        rows = ae.section_plan(FORMULA, 10)
        self.assertEqual(rows[0], "- 훅: 0.0~2.0초 — 결말")
        self.assertEqual(ae.caption_style(FORMULA), (8, "담담하게 / 감정 단어"))
        self.assertEqual(ae.target_seconds(FORMULA, None), 10.0)
        self.assertEqual(ae.target_seconds(FORMULA, 60), 35.0)

    def test_broken_formula_file_points_to_line(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "공식.json"
            path.write_text('{\n "이름": "a"\n "훅": {}\n}', encoding="utf-8")
            with self.assertRaisesRegex(sc.CutError, "3번째 줄"):
                ae.load_formula(path)


class EndToEndTest(unittest.TestCase):
    def setUp(self):
        try:
            self.ffmpeg = sc.find_ffmpeg()
        except sc.CutError:
            self.skipTest("ffmpeg 없음")
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.video = self.root / "원본.mp4"
        # 4초마다 색이 바뀌는 16초 영상, 6~8초는 조용해요.
        inputs, labels = [], ""
        for i, c in enumerate(("red", "blue", "green", "yellow")):
            inputs += ["-f", "lavfi", "-i", f"color=c={c}:s=320x568:r=15:d=4"]
            labels += f"[{i}:v]"
        inputs += ["-f", "lavfi", "-i", "sine=frequency=500:duration=16"]
        subprocess.run([
            self.ffmpeg, "-y", "-loglevel", "error", *inputs,
            "-filter_complex", f"{labels}concat=n=4:v=1:a=0[v];[4:a]volume=enable='between(t,6,8)':volume=0[a]",
            "-map", "[v]", "-map", "[a]", "-shortest", "-pix_fmt", "yuv420p", str(self.video),
        ], check=True)
        (self.root / "원본.transcript.json").write_text(json.dumps({
            "model": "small", "language_arg": None, "language": "en",
            "segments": [{"start": 1.0, "end": 3.0, "text": "Nobody knew"},
                         {"start": 12.5, "end": 15.5, "text": "Then she came back"}],
        }), encoding="utf-8")
        (self.root / "공식.json").write_text(json.dumps(FORMULA, ensure_ascii=False), encoding="utf-8")
        template = make_capcut_like_draft(self.root)
        # 자막에 위치(clip) 정보가 있는 틀
        path = template / "draft_content.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for seg in data["tracks"][1]["segments"]:
            seg["clip"] = {"transform": {"x": 0, "y": -0.7}, "scale": {"x": 1, "y": 1}}
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()

    def run_main(self, *extra):
        return ae.main([str(self.video), "--template", "틀", "--projects-dir", str(self.root),
                        "--name", "편집", "--api-key", "k", *extra])

    def test_full_flow_then_rebuild_from_plan(self):
        edit_answer = json.dumps({
            "훅제목": "아무도 몰랐던 결말", "참여유도": "여러분이라면?",
            "구간": [{"시작": 12, "끝": 16, "역할": "훅", "이유": "결말"},
                     {"시작": 0, "끝": 8, "역할": "배경", "이유": "시작"}],
        }, ensure_ascii=False)
        caption_answer = json.dumps([{"id": 1, "lines": ["그녀가 돌아왔다"]},
                                     {"id": 2, "lines": ["아무도 몰랐다"]}], ensure_ascii=False)
        with mock.patch.object(au, "generate", return_value=edit_answer) as gen, \
             mock.patch.object(au, "call_gemini", return_value=caption_answer) as cap:
            self.assertEqual(self.run_main("--formula", "공식.json"), 0)
        self.assertEqual(gen.call_count, 1)
        self.assertIn("감동사연_반전엔딩형", gen.call_args[0][0][1]["text"])
        self.assertIn("Nobody knew", gen.call_args[0][0][1]["text"])
        self.assertIn("8자 이하", cap.call_args[0][0])

        info = cd.summarize(self.root / "편집")
        video_segs = info["tracks"][0]["segments"]
        # 12~16초(훅) 가 먼저, 그다음 0~8초에서 무음(6~8초)이 빠져요.
        self.assertAlmostEqual(video_segs[0]["duration"] / cd.MICROSECONDS, 4.0, delta=0.05)
        self.assertAlmostEqual(info["duration"] / cd.MICROSECONDS, 10.1, delta=0.3)
        self.assertEqual(info["texts"][:2], ["그녀가 돌아왔다", "아무도 몰랐다"])
        self.assertIn("아무도 몰랐던 결말", info["texts"])

        draft = cd.load_json(self.root / "편집" / "draft_content.json")
        text_tracks = [t for t in draft["tracks"] if t["type"] == "text"]
        self.assertEqual(len(text_tracks), 2)
        self.assertEqual(text_tracks[1]["segments"][0]["clip"]["transform"]["y"], 0.6)
        self.assertEqual(text_tracks[0]["segments"][0]["clip"]["transform"]["y"], -0.7)
        self.assertNotEqual(text_tracks[0].get("id"), text_tracks[1]["id"])

        # 저장된 계획을 메모장으로 고쳤다고 치고, Gemini 없이 다시 만들어요.
        plan_path = self.root / "편집.plan.json"
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        plan["훅제목"] = "내가 고친 제목"
        plan_path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
        with mock.patch.object(au, "generate") as gen, mock.patch.object(au, "call_gemini") as cap:
            code = ae.main([str(self.video), "--template", "틀", "--projects-dir", str(self.root),
                            "--plan", str(plan_path), "--name", "편집2"])
        self.assertEqual(code, 0)
        gen.assert_not_called()
        cap.assert_not_called()
        self.assertIn("내가 고친 제목", cd.summarize(self.root / "편집2")["texts"])

    def test_dry_run_saves_plan_only(self):
        answer = json.dumps({"훅제목": "제목", "참여유도": "", "구간": [{"시작": 0, "끝": 10}]})
        with mock.patch.object(au, "generate", return_value=answer), \
             mock.patch.object(au, "call_gemini", return_value="[]"):
            self.assertEqual(self.run_main("--formula", "공식.json", "--dry-run"), 0)
        self.assertTrue((self.root / "편집.plan.json").exists())
        self.assertFalse((self.root / "편집").exists())

    def test_requires_formula_or_plan(self):
        self.assertEqual(self.run_main(), 1)


if __name__ == "__main__":
    unittest.main()
