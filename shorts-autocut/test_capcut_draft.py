"""capcut_draft.py 테스트. 실행: python -m unittest test_capcut_draft.py"""

import json
import tempfile
import unittest
from pathlib import Path

import capcut_draft as cd


def make_draft(root: Path, name: str = "틀", encrypted: bool = False) -> Path:
    """CapCut 초안과 같은 모양의 가짜 프로젝트를 만들어요."""
    draft_dir = root / name
    draft_dir.mkdir()
    if encrypted:
        (draft_dir / "draft_content.json").write_text("U2FsdGVkX1+abc==", encoding="utf-8")
        return draft_dir
    new_style = {"text": "원래 자막", "styles": [{"range": [0, 5], "size": 8}, {"range": [5, 5], "size": 10}]}
    content = {
        "id": "OLD-ID",
        "version": 360000,
        "duration": 5_000_000,
        "canvas_config": {"width": 1080, "height": 1920},
        "last_modified_platform": {"app_version": "4.0.0"},
        "materials": {
            "texts": [
                {"id": "t1", "content": json.dumps(new_style, ensure_ascii=False), "recognize_text": "원래 자막"},
                {"id": "t2", "content": "<font id=\"\" path=\"x\">[옛날 자막]</font>"},
            ],
            "videos": [{"id": "v1", "path": "C:/video.mp4"}],
        },
        "tracks": [
            {"type": "video", "segments": [{"material_id": "v1", "target_timerange": {"start": 0, "duration": 5_000_000}}]},
            {"type": "text", "segments": [{"material_id": "t1", "target_timerange": {"start": 1_000_000, "duration": 2_000_000}}]},
        ],
    }
    (draft_dir / "draft_content.json").write_text(json.dumps(content, ensure_ascii=False), encoding="utf-8")
    meta = {"draft_name": name, "draft_id": "OLD-ID", "draft_fold_path": str(draft_dir), "draft_root_path": str(root)}
    (draft_dir / "draft_meta_info.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return draft_dir


class CapcutDraftTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_summarize_reads_tracks_and_texts(self):
        info = cd.summarize(make_draft(self.root))
        self.assertEqual(info["texts"], ["원래 자막", "옛날 자막"])
        self.assertEqual([t["type"] for t in info["tracks"]], ["video", "text"])
        self.assertEqual(info["canvas"], "1080x1920")

    def test_clone_replaces_texts_and_keeps_style(self):
        template = make_draft(self.root)
        new_dir = cd.clone_draft(template, "새 영상", ["이거 미쳤다 ㄷㄷ", "3초 컷"])

        content = json.loads((new_dir / "draft_content.json").read_text(encoding="utf-8"))
        self.assertNotEqual(content["id"], "OLD-ID")
        first = json.loads(content["materials"]["texts"][0]["content"])
        self.assertEqual(first["text"], "이거 미쳤다 ㄷㄷ")
        self.assertEqual(first["styles"], [{"range": [0, 9], "size": 8}])
        self.assertEqual(content["materials"]["texts"][0]["recognize_text"], "이거 미쳤다 ㄷㄷ")
        self.assertIn("[3초 컷]", content["materials"]["texts"][1]["content"])

        meta = json.loads((new_dir / "draft_meta_info.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["draft_name"], "새 영상")
        self.assertEqual(meta["draft_id"], content["id"])

        # 틀은 그대로여야 해요.
        self.assertEqual(cd.summarize(template)["texts"], ["원래 자막", "옛날 자막"])

    def test_clone_refuses_existing_name(self):
        template = make_draft(self.root)
        make_draft(self.root, "있는 이름")
        with self.assertRaises(cd.DraftError):
            cd.clone_draft(template, "있는 이름", ["x"])

    def test_clone_cleans_up_on_failure(self):
        template = make_draft(self.root)
        with self.assertRaises(cd.DraftError):
            cd.clone_draft(template, "너무 많음", ["1", "2", "3"])
        self.assertFalse((self.root / "너무 많음").exists())

    def test_encrypted_draft_gives_clear_error(self):
        with self.assertRaisesRegex(cd.DraftError, "암호화"):
            cd.summarize(make_draft(self.root, encrypted=True))

    def test_edit_in_place_makes_backup(self):
        draft = make_draft(self.root)
        backup = cd.edit_in_place(draft, ["바뀐 자막"])
        self.assertTrue(backup.exists())
        self.assertEqual(cd.summarize(draft)["texts"][0], "바뀐 자막")

    def test_cli_find_and_inspect(self):
        make_draft(self.root)
        self.assertEqual(cd.main(["--projects-dir", str(self.root), "find"]), 0)
        self.assertEqual(cd.main(["--projects-dir", str(self.root), "inspect", "틀"]), 0)
        self.assertEqual(cd.main(["--projects-dir", str(self.root), "inspect", "없는것"]), 1)


if __name__ == "__main__":
    unittest.main()
