"""silence_cut.py 테스트. 실행: python -m unittest test_silence_cut.py"""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import capcut_draft as cd
import silence_cut as sc

FFMPEG_LOG = """
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:00:12.50, start: 0.000000, bitrate: 900 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080 [SAR 1:1 DAR 16:9], 30 fps
      Side data:
        displaymatrix: rotation of -90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo
[silencedetect @ 0x1] silence_start: 2.1
[silencedetect @ 0x1] silence_end: 3.6 | silence_duration: 1.5
[silencedetect @ 0x1] silence_start: 11.9
"""


def make_capcut_like_draft(root: Path, name: str = "틀") -> Path:
    """새 CapCut 구조(부속 재료, Timelines 폴더)를 흉내 낸 틀."""
    draft_dir = root / name
    draft_dir.mkdir()
    content = {
        "id": "TL-1",
        "duration": 9_730_000,
        "canvas_config": {"width": 1080, "height": 1920},
        "materials": {
            "videos": [{"id": "V-OLD", "path": "C:/old.mp4", "duration": 9_730_000, "width": 1080, "height": 1920}],
            "speeds": [{"id": "SP-1", "speed": 1.0}],
            "canvases": [{"id": "CV-1"}],
            "texts": [{"id": "T1", "content": json.dumps({"text": "1번", "styles": []})}],
            "material_animations": [{"id": "AN-1"}],
        },
        "tracks": [
            {"type": "video", "segments": [{
                "id": "S-OLD", "material_id": "V-OLD", "speed": 1.0, "volume": 1.0,
                "extra_material_refs": ["SP-1", "CV-1"],
                "source_timerange": {"start": 0, "duration": 9_730_000},
                "target_timerange": {"start": 0, "duration": 9_730_000},
            }]},
            {"type": "text", "segments": [
                {"id": f"TS{i}", "material_id": "T1", "extra_material_refs": ["AN-1"],
                 "target_timerange": {"start": i * 3_000_000, "duration": 3_000_000}}
                for i in range(3)
            ]},
        ],
    }
    text = json.dumps(content, ensure_ascii=False)
    (draft_dir / "draft_content.json").write_text(text, encoding="utf-8")
    (draft_dir / "Timelines" / "TL-1").mkdir(parents=True)
    (draft_dir / "Timelines" / "TL-1" / "draft_content.json").write_text(text, encoding="utf-8")
    (draft_dir / "Timelines" / "project.json").write_text('{"main_timeline_id": "TL-1"}', encoding="utf-8")
    (draft_dir / "draft_meta_info.json").write_text('{"draft_name": "틀", "draft_id": "M-1"}', encoding="utf-8")
    return draft_dir


class ParseTest(unittest.TestCase):
    def test_video_info_handles_rotation(self):
        info = sc.parse_video_info(FFMPEG_LOG)
        self.assertAlmostEqual(info.duration, 12.5)
        self.assertEqual((info.width, info.height), (1080, 1920))
        self.assertTrue(info.has_audio)

    def test_silences_include_unfinished_tail(self):
        self.assertEqual(sc.parse_silences(FFMPEG_LOG, 12.5), [(2.1, 3.6), (11.9, 12.5)])

    def test_keep_ranges_pads_merges_and_drops_tiny(self):
        ranges = sc.keep_ranges(10.0, [(2.0, 4.0), (4.1, 6.0), (6.2, 9.9)], padding=0.1, min_keep=0.3)
        # 여유를 붙인 뒤에도 조각은 0.3초 이상이고, 서로 겹치지 않아야 해요.
        self.assertEqual(ranges[0], (0.0, 2.1))
        self.assertTrue(all(e - s >= 0.3 for s, e in ranges))
        self.assertTrue(all(ranges[i][1] < ranges[i + 1][0] for i in range(len(ranges) - 1)))

    def test_keep_ranges_without_silence_keeps_all(self):
        self.assertEqual(sc.keep_ranges(5.0, []), [(0.0, 5.0)])


class ApplyCutsTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_build_project_writes_segments(self):
        template = make_capcut_like_draft(self.root)
        video = self.root / "원본.mp4"
        video.write_bytes(b"")
        info = sc.VideoInfo(12.5, 1080, 1920, True)
        ranges = [(0.0, 2.2), (3.5, 7.0)]

        target = sc.build_project(template, "결과", video, ranges, info)

        root_file = json.loads((target / "draft_content.json").read_text(encoding="utf-8"))
        copy_file = json.loads((target / "Timelines" / "TL-1" / "draft_content.json").read_text(encoding="utf-8"))
        self.assertEqual(root_file, copy_file)

        segs = root_file["tracks"][0]["segments"]
        self.assertEqual([s["source_timerange"] for s in segs],
                         [{"start": 0, "duration": 2_200_000}, {"start": 3_500_000, "duration": 3_500_000}])
        self.assertEqual([s["target_timerange"]["start"] for s in segs], [0, 2_200_000])
        self.assertEqual(root_file["duration"], 5_700_000)

        videos = root_file["materials"]["videos"]
        self.assertEqual(len(videos), 1)
        self.assertTrue(videos[0]["path"].endswith("원본.mp4"))
        self.assertEqual({s["material_id"] for s in segs}, {videos[0]["id"]})

        # 조각마다 부속 재료가 따로 있고, 옛 재료는 사라져요.
        refs = [r for s in segs for r in s["extra_material_refs"]]
        self.assertEqual(len(set(refs)), 4)
        self.assertNotIn("SP-1", refs)
        self.assertEqual(len(root_file["materials"]["speeds"]), 2)
        # 자막은 5.7초 안으로 맞춰지고, 자막이 쓰는 애니메이션 재료는 남아요.
        texts = root_file["tracks"][1]["segments"]
        self.assertEqual([t["target_timerange"]["duration"] for t in texts], [3_000_000, 2_700_000])
        self.assertEqual(root_file["materials"]["material_animations"], [{"id": "AN-1"}])

    def test_template_without_video_track_fails_cleanly(self):
        template = make_capcut_like_draft(self.root)
        data = json.loads((template / "draft_content.json").read_text(encoding="utf-8"))
        data["tracks"] = data["tracks"][1:]
        (template / "draft_content.json").write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaises(sc.CutError):
            sc.build_project(template, "실패", self.root / "x.mp4", [(0, 1)], sc.VideoInfo(1, 0, 0, True))
        self.assertFalse((self.root / "실패").exists())


class FfmpegEndToEndTest(unittest.TestCase):
    """ffmpeg 가 있을 때만: 2~4초가 조용한 6초짜리 영상으로 전체 흐름을 확인해요."""

    def setUp(self):
        try:
            self.ffmpeg = sc.find_ffmpeg()
        except sc.CutError:
            self.skipTest("ffmpeg 없음")
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_real_video(self):
        video = self.root / "sample.mp4"
        subprocess.run([
            self.ffmpeg, "-y", "-loglevel", "error",
            "-f", "lavfi", "-i", "testsrc=size=320x568:rate=15:duration=6",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
            "-af", "volume=enable='between(t,2,4)':volume=0",
            "-shortest", str(video),
        ], check=True)
        make_capcut_like_draft(self.root)

        code = sc.main([str(video), "--template", "틀", "--name", "결과", "--projects-dir", str(self.root)])
        self.assertEqual(code, 0)

        info = cd.summarize(self.root / "결과")
        video_track = info["tracks"][0]
        self.assertEqual(len(video_track["segments"]), 2)
        self.assertAlmostEqual(info["duration"] / cd.MICROSECONDS, 4.2, delta=0.2)


if __name__ == "__main__":
    unittest.main()
