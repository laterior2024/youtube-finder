"""capcut_draft.py 테스트. 실행: python -m unittest test_capcut_draft.py"""

import json
import shutil
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
        self.assertEqual(content["id"], "OLD-ID")  # 타임라인 id는 그대로
        first = json.loads(content["materials"]["texts"][0]["content"])
        self.assertEqual(first["text"], "이거 미쳤다 ㄷㄷ")
        self.assertEqual(first["styles"], [{"range": [0, 9], "size": 8}])
        self.assertEqual(content["materials"]["texts"][0]["recognize_text"], "이거 미쳤다 ㄷㄷ")
        self.assertIn("[3초 컷]", content["materials"]["texts"][1]["content"])

        meta = json.loads((new_dir / "draft_meta_info.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["draft_name"], "새 영상")
        self.assertNotIn(meta["draft_id"], ("OLD-ID", ""))

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

    def test_clone_skips_lock_and_backup_files(self):
        template = make_draft(self.root)
        (template / ".locked").write_text("x")
        (template / "draft_content.json.backup-20260101").write_text("x")
        new_dir = cd.clone_draft(template, "복사본", [])
        self.assertFalse((new_dir / ".locked").exists())
        self.assertFalse((new_dir / "draft_content.json.backup-20260101").exists())

    def test_diagnose_lists_files_and_ids(self):
        draft = make_draft(self.root)
        (draft / "Timelines").mkdir()
        (draft / "Timelines" / "project.json").write_text('{"main_timeline_id": "OLD-ID"}')
        (draft / "Timelines" / "broken.json").write_text("U2FsdGVk")
        rows = {r["path"]: r for r in cd.diagnose(draft)}
        self.assertEqual(rows["draft_meta_info.json"]["keys"]["draft_id"], "OLD-ID")
        self.assertEqual(rows["Timelines/project.json"]["keys"], {"main_timeline_id": "OLD-ID"})
        self.assertIn("암호화", rows["Timelines/broken.json"]["status"])
        self.assertEqual(cd.main(["--projects-dir", str(self.root), "diagnose", "틀"]), 0)

    def _add_timelines(self, draft: Path, timeline_id: str = "OLD-ID") -> Path:
        folder = draft / "Timelines" / timeline_id
        folder.mkdir(parents=True)
        shutil.copy2(draft / "draft_content.json", folder / "draft_content.json")
        (draft / "Timelines" / "project.json").write_text(
            json.dumps({"id": "PROJ", "main_timeline_id": timeline_id}), encoding="utf-8")
        return folder / "draft_content.json"

    def test_clone_updates_timeline_copy_too(self):
        template = make_draft(self.root)
        self._add_timelines(template)
        new_dir = cd.clone_draft(template, "새 영상", ["바뀜"])
        root = json.loads((new_dir / "draft_content.json").read_text(encoding="utf-8"))
        copy = json.loads((new_dir / "Timelines" / "OLD-ID" / "draft_content.json").read_text(encoding="utf-8"))
        self.assertEqual(root, copy)
        self.assertEqual(root["id"], "OLD-ID")

    def test_repair_realigns_timeline_id(self):
        # 예전 clone 이 만든 상태를 흉내 내요: id가 바뀌어 Timelines 폴더와 어긋남
        draft = make_draft(self.root)
        copy_path = self._add_timelines(draft)
        for path in (draft / "draft_content.json", copy_path):
            data = json.loads(path.read_text(encoding="utf-8"))
            data["id"] = "WRONG-ID"
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        meta_path = draft / "draft_meta_info.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["draft_id"] = "WRONG-ID"
        meta_path.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        (draft / ".locked").write_text("")

        fixes = cd.repair_draft(draft)

        self.assertEqual(len(fixes), 3)
        for path in (draft / "draft_content.json", copy_path):
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["id"], "OLD-ID")
        new_meta = json.loads(meta_path.read_text(encoding="utf-8"))
        self.assertNotIn(new_meta["draft_id"], ("WRONG-ID", "OLD-ID"))
        self.assertFalse((draft / ".locked").exists())
        self.assertEqual(cd.repair_draft(draft), [])

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
