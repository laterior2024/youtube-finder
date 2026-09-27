"""app.py 테스트. 실행: python -m unittest test_app.py"""

import json
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

import app


class ServerTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / "원본.mp4").write_bytes(b"")
        (self.root / "샘플1.mp4").write_bytes(b"")
        (self.root / "공식_생활.json").write_text(json.dumps({"이름": "x", "구조": []}), encoding="utf-8")
        (self.root / "원본.transcript.json").write_text("{}", encoding="utf-8")
        (self.root / "api_key.txt").write_text("k", encoding="utf-8")
        (self.root / "효과음").mkdir()
        (self.root / "효과음" / "whoosh.wav").write_bytes(b"")
        self.plan = {"원본": "원본.mp4", "공식": "x", "훅제목": "원래 제목", "참여유도": "",
                     "구간": [{"시작": 1, "끝": 3, "역할": "훅", "이유": ""}],
                     "자막": [{"시작": 0, "끝": 1, "글자": "안녕"}]}
        (self.root / "편집.plan.json").write_text(json.dumps(self.plan, ensure_ascii=False), encoding="utf-8")
        projects = self.root / "projects"
        (projects / "틀_쇼핑쇼츠").mkdir(parents=True)
        (projects / "틀_쇼핑쇼츠" / "draft_content.json").write_text("{}", encoding="utf-8")

        handler = type("H", (app.Handler,), {"folder": self.root, "projects_dir": projects})
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        app.JOB = app.Job()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self._tmp.cleanup()

    def get(self, path):
        with urllib.request.urlopen(self.base + path) as r:
            return r.status, r.read().decode("utf-8")

    def post(self, path, data, origin=None):
        req = urllib.request.Request(self.base + path, data=json.dumps(data).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json", **({"Origin": origin} if origin else {})})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def wait_job(self):
        for _ in range(100):
            job = json.loads(self.get("/api/job")[1])
            if not job["running"]:
                return job
            time.sleep(0.05)
        self.fail("작업이 끝나지 않았어요")

    def test_page_and_state(self):
        code, html = self.get("/")
        self.assertEqual(code, 200)
        self.assertIn("쇼츠 자동 편집기", html)
        state = json.loads(self.get("/api/state")[1])
        self.assertEqual(state["videos"], ["샘플1.mp4", "원본.mp4"])
        self.assertEqual(state["formulas"], ["공식_생활.json"])  # transcript.json 은 공식이 아니에요
        self.assertEqual(state["plans"], ["편집.plan.json"])
        self.assertEqual(state["projects"], ["틀_쇼핑쇼츠"])
        self.assertEqual(state["sfx"], ["whoosh.wav"])
        self.assertTrue(state["has_key"])

    def test_plan_read_and_save(self):
        plan = json.loads(self.get("/api/plan?name=" + urllib.request.quote("편집.plan.json"))[1])
        self.assertEqual(plan["훅제목"], "원래 제목")
        plan["훅제목"] = "고친 제목"
        plan["구간"].append({"시작": "5", "끝": "7.5", "역할": "결말"})
        code, _ = self.post("/api/plan", {"name": "편집.plan.json", "plan": plan})
        self.assertEqual(code, 200)
        saved = json.loads((self.root / "편집.plan.json").read_text(encoding="utf-8"))
        self.assertEqual(saved["훅제목"], "고친 제목")
        self.assertEqual(saved["구간"][1], {"시작": 5.0, "끝": 7.5, "역할": "결말", "이유": ""})
        self.assertEqual(saved["원본"], "원본.mp4")  # 화면에 없는 값은 그대로

        plan["구간"][0]["끝"] = 0.5  # 끝이 시작보다 앞
        self.assertEqual(self.post("/api/plan", {"name": "편집.plan.json", "plan": plan})[0], 400)

    def test_rejects_paths_outside_folder_and_foreign_origin(self):
        for bad in ("../x.plan.json", "a/b.plan.json", "..", "공식_생활.json"):
            code, _ = self.post("/api/plan", {"name": bad, "plan": self.plan})
            self.assertEqual(code, 400, bad)
        code, _ = self.post("/api/run", {"action": "plan", "video": "../../secret.mp4", "formula": "공식_생활.json"})
        self.assertEqual(code, 400)
        code, _ = self.post("/api/run", {"action": "analyze", "samples": ["샘플1.mp4"]}, origin="https://evil.example")
        self.assertEqual(code, 403)

    def test_build_runs_edit_then_effects(self):
        calls = []

        def fake_edit(argv):
            calls.append(("edit", argv))
            print("편집 완료")
            return 0

        def fake_fx(argv):
            calls.append(("fx", argv))
            return 0

        with mock.patch.object(app.auto_edit, "main", fake_edit), mock.patch.object(app.add_effects, "main", fake_fx):
            code, data = self.post("/api/run", {"action": "build", "plan": "편집.plan.json", "name": "",
                                                 "effects": True, "formula": "공식_생활.json", "volume": "0.3",
                                                 "transitions": "all", "template": "틀_쇼핑쇼츠"})
            self.assertEqual(code, 200)
            self.assertEqual(data["result"]["project"], "편집_효과")
            job = self.wait_job()
        self.assertTrue(job["ok"])
        self.assertIn("편집 완료", job["log"])
        self.assertEqual(calls[0], ("edit", ["원본.mp4", "--plan", "편집.plan.json", "--name", "편집",
                                             "--template", "틀_쇼핑쇼츠"]))
        self.assertEqual(calls[1][1][:3], ["편집", "--formula", "공식_생활.json"])
        self.assertIn("0.3", calls[1][1])

    def test_failed_step_stops_the_rest(self):
        fx = mock.Mock(return_value=0)
        with mock.patch.object(app.auto_edit, "main", return_value=1), mock.patch.object(app.add_effects, "main", fx):
            self.post("/api/run", {"action": "build", "plan": "편집.plan.json", "effects": True,
                                   "formula": "공식_생활.json"})
            job = self.wait_job()
        self.assertFalse(job["ok"])
        fx.assert_not_called()

    def test_only_one_job_at_a_time(self):
        gate = threading.Event()
        with mock.patch.object(app.analyze_sample, "main", lambda argv: gate.wait(5) and 0):
            self.assertEqual(self.post("/api/run", {"action": "analyze", "samples": ["샘플1.mp4"]})[0], 200)
            self.assertEqual(self.post("/api/run", {"action": "analyze", "samples": ["샘플1.mp4"]})[0], 409)
            gate.set()
            self.assertTrue(self.wait_job()["ok"])

    def test_plan_action_arguments(self):
        title, steps, result = app.steps_for("plan", {"video": "원본.mp4", "formula": "공식_생활.json",
                                                       "target": "20"}, self.root)
        self.assertEqual(result, {"plan": "원본_편집.plan.json"})
        self.assertEqual(steps[0][2], ["원본.mp4", "--formula", "공식_생활.json", "--name", "원본_편집",
                                       "--template", "틀_쇼핑쇼츠", "--dry-run", "--target", "20.0"])
        with self.assertRaises(ValueError):
            app.steps_for("plan", {"video": "원본.mp4", "formula": "공식_생활.json", "name": "a/b"}, self.root)


if __name__ == "__main__":
    unittest.main()
