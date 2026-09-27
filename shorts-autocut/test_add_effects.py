"""add_effects.py 테스트. 실행: python -m unittest test_add_effects.py"""

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import add_effects as fx
import capcut_draft as cd
import silence_cut as sc
from test_silence_cut import make_capcut_like_draft

FORMULA = {"효과음": {"규칙": [
    {"언제": "주요 반전 장면", "종류": "쿵(Impact)", "빈도": "매번"},
    {"언제": "화면 전환", "종류": "스우시(Whoosh)", "빈도": "가끔"},
    {"언제": "알 수 없는 때", "종류": "whoosh", "빈도": "매번"},
    {"언제": "자막 뜰 때", "종류": "박수", "빈도": "매번"},
]}}


def draft_with(video_starts, total):
    segs = [{"target_timerange": {"start": int(s * 1e6), "duration": int((e - s) * 1e6)}}
            for s, e in zip(video_starts, video_starts[1:] + [total])]
    return {"duration": int(total * 1e6), "tracks": [{"type": "video", "segments": segs}]}


class PureTest(unittest.TestCase):
    def test_rule_events_and_step(self):
        self.assertEqual(fx.rule_events("주요 반전 장면"), ["cut", "climax"])
        self.assertEqual(fx.rule_events("자막 뜰 때"), ["caption"])
        self.assertEqual(fx.rule_events("???"), [])
        self.assertEqual(fx.rule_step("가끔"), 2)
        self.assertEqual(fx.rule_step("매번"), 1)

    def test_match_files_by_alias(self):
        files = [Path("whoosh_01.wav"), Path("쿵.mp3"), Path("ding.wav")]
        self.assertEqual(fx.match_files("스우시(Whoosh)", files), [Path("whoosh_01.wav")])
        self.assertEqual(fx.match_files("쿵(Impact)", files), [Path("쿵.mp3")])
        self.assertEqual(fx.match_files("팅(Chime)", files), [Path("ding.wav")])
        self.assertEqual(fx.match_files("박수", files), [])

    def test_plan_sfx_respects_gap_step_and_notes(self):
        files = [Path("whoosh.wav"), Path("쿵.wav")]
        durations = {files[0]: 0.5, files[1]: 3.0}
        moments = {"cut": [2.0, 4.0, 4.5, 6.0, 8.0], "climax": [4.0], "caption": [1.0]}
        placements, notes = fx.plan_sfx(FORMULA["효과음"]["규칙"], moments, files, durations, 10.0)
        got = [(p.time, p.file.name) for p in placements]
        # 쿵: 컷+반전 모든 순간(최소 간격 0.8초), whoosh: 남은 자리 중 두 번에 한 번
        self.assertIn((4.0, "쿵.wav"), got)
        self.assertTrue(all(b[0] - a[0] >= 0.8 for a, b in zip(got, got[1:])))
        self.assertEqual(len(notes), 2)  # '알 수 없는 때', '박수' 파일 없음
        self.assertTrue(all(p.duration <= 2.0 for p in placements))

    def test_transition_points_clip_mode_matches_scene_bounds(self):
        draft = draft_with([0, 3, 5, 9], 12)
        timeline = {"장면": [{"시작": 0}, {"시작": 5}, {"시작": 9}]}
        self.assertEqual(fx.transition_points(draft, timeline, "clips"), [1, 2])
        self.assertEqual(fx.transition_points(draft, timeline, "all"), [0, 1, 2])
        self.assertEqual(fx.transition_points(draft, timeline, "none"), [])


class EndToEndTest(unittest.TestCase):
    def setUp(self):
        try:
            self.ffmpeg = sc.find_ffmpeg()
        except sc.CutError:
            self.skipTest("ffmpeg 없음")
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self._cwd = os.getcwd()
        os.chdir(self.root)

        # 효과음 폴더
        sfx = self.root / "효과음"
        sfx.mkdir()
        for name, dur in (("whoosh.wav", 0.4), ("쿵.wav", 1.0)):
            subprocess.run([self.ffmpeg, "-y", "-loglevel", "error", "-f", "lavfi",
                            "-i", f"sine=frequency=800:duration={dur}", str(sfx / name)], check=True)

        # 틀: 오디오 줄 + 전환 재료 추가
        template = make_capcut_like_draft(self.root, "틀")
        path = template / "draft_content.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["materials"]["audios"] = [{"id": "AU-1", "path": "C:/sfx.mp3", "duration": 500000,
                                         "music_id": "M1", "type": "extract_music"}]
        data["materials"]["sound_channel_mappings"] = [{"id": "SCM-A"}]
        data["materials"]["transitions"] = [{"id": "TR-1", "name": "줌", "duration": 466666, "is_overlap": True}]
        data["tracks"][0]["segments"][0]["extra_material_refs"].append("TR-1")
        data["tracks"].append({"type": "audio", "id": "AT", "segments": [{
            "id": "AS", "material_id": "AU-1", "extra_material_refs": ["SCM-A"], "volume": 1.0,
            "source_timerange": {"start": 0, "duration": 500000},
            "target_timerange": {"start": 0, "duration": 500000}}]})
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        (template / "Timelines" / "TL-1" / "draft_content.json").write_text(json.dumps(data, ensure_ascii=False),
                                                                             encoding="utf-8")

        # 5주차 결과처럼: 원본 3조각 (0~4, 6~9, 12~15) → 10초
        video = self.root / "원본.mp4"
        video.write_bytes(b"")
        sc.build_project(template, "편집1", video, [(0, 4), (6, 9), (12, 15)], sc.VideoInfo(16, 320, 568, True))
        (self.root / "편집1.timeline.json").write_text(json.dumps({"장면": [
            {"역할": "훅", "시작": 0, "끝": 4}, {"역할": "반전", "시작": 4, "끝": 7},
            {"역할": "참여유도", "시작": 7, "끝": 10}]}, ensure_ascii=False), encoding="utf-8")
        (self.root / "공식.json").write_text(json.dumps(FORMULA, ensure_ascii=False), encoding="utf-8")

    def tearDown(self):
        os.chdir(self._cwd)
        self._tmp.cleanup()

    def run_main(self, *extra):
        return fx.main(["편집1", "--formula", "공식.json", "--template", "틀",
                        "--projects-dir", str(self.root), *extra])

    def test_week5_project_has_no_transitions_copied_from_template(self):
        draft = cd.load_json(self.root / "편집1" / "draft_content.json")
        refs = [r for s in draft["tracks"][0]["segments"] for r in s["extra_material_refs"]]
        self.assertNotIn("TR-1", refs)
        self.assertEqual(len(draft["tracks"][0]["segments"]), 3)

    def test_adds_sfx_and_transitions_to_copy(self):
        self.assertEqual(self.run_main(), 0)
        draft = cd.load_json(self.root / "편집1_효과" / "draft_content.json")
        copy_file = json.loads((self.root / "편집1_효과" / "Timelines" / "TL-1" / "draft_content.json")
                               .read_text(encoding="utf-8"))
        self.assertEqual(draft, copy_file)

        audio_tracks = [t for t in draft["tracks"] if t["type"] == "audio"]
        self.assertGreaterEqual(len(audio_tracks), 1)
        segs = [s for t in audio_tracks for s in t["segments"]]
        starts = sorted(s["target_timerange"]["start"] / 1e6 for s in segs)
        self.assertIn(4.0, starts)  # 반전 장면 시작 → 쿵
        for t in audio_tracks:  # 같은 줄에서는 겹치지 않아요
            ss = sorted((s["target_timerange"]["start"], s["target_timerange"]["duration"]) for s in t["segments"])
            self.assertTrue(all(a[0] + a[1] <= b[0] for a, b in zip(ss, ss[1:])))
        audios = {a["id"]: a for a in draft["materials"]["audios"]}
        paths = {Path(audios[s["material_id"]]["path"]).name for s in segs}
        self.assertTrue(paths <= {"whoosh.wav", "쿵.wav"})
        self.assertTrue(all(s["volume"] == 0.6 for s in segs))
        mapping_ids = {m["id"] for m in draft["materials"]["sound_channel_mappings"]}
        self.assertTrue(all(set(s["extra_material_refs"]) <= mapping_ids for s in segs))

        # 전환: 이야기 구간이 바뀌는 4초, 7초 → 조각 0, 1 뒤
        video = draft["tracks"][0]["segments"]
        tr_ids = {t["id"] for t in draft["materials"]["transitions"]}
        with_tr = [i for i, s in enumerate(video) if set(s["extra_material_refs"]) & tr_ids]
        self.assertEqual(with_tr, [0, 1])
        self.assertTrue(all(t["duration"] <= 400000 for t in draft["materials"]["transitions"] if t["id"] != "TR-1"))

        # 원래 프로젝트는 그대로
        original = cd.load_json(self.root / "편집1" / "draft_content.json")
        self.assertFalse([t for t in original["tracks"] if t["type"] == "audio"])

    def test_dry_run_and_missing_folder(self):
        self.assertEqual(self.run_main("--dry-run"), 0)
        self.assertFalse((self.root / "편집1_효과").exists())
        self.assertEqual(self.run_main("--sfx", "없는폴더"), 1)

    def test_template_without_audio_gives_clear_error(self):
        path = self.root / "틀" / "draft_content.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["tracks"] = [t for t in data["tracks"] if t["type"] != "audio"]
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        self.assertEqual(self.run_main(), 1)
        self.assertFalse((self.root / "편집1_효과").exists())


if __name__ == "__main__":
    unittest.main()
