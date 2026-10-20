import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import unittest
from unittest.mock import patch
import zipfile


spec = importlib.util.spec_from_file_location(
    "firefox_package", Path(__file__).resolve().parents[2] / "scripts/package-firefox.py"
)
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class FirefoxPackageTests(unittest.TestCase):
    def setUp(self):
        self.files = {
            "manifest.json": json.dumps({
                "version": package.VERSION,
                "manifest_version": 3,
                "background": {"service_worker": package.BACKGROUND},
                "update_url": "https://example.invalid/chrome-only-update",
                "content_scripts": [{"js": ["Main.js"], "matches": ["https://x.com/*"]}],
            }).encode(),
            package.BACKGROUND: ("/* before */" + package.CHROME_ORIGIN_CHECK + "/* after */").encode(),
            "Main.js": b"/* original business client must remain byte-identical */",
            "icon.png": b"icon",
        }

    def test_conversion_preserves_business_files_and_only_patches_compatibility(self):
        original = copy.deepcopy(self.files)
        converted = package.convert(self.files)
        self.assertEqual(self.files, original)
        self.assertEqual(converted["Main.js"], original["Main.js"])
        self.assertEqual(converted["icon.png"], original["icon.png"])
        self.assertEqual(converted[package.BACKGROUND], original[package.BACKGROUND].replace(
            package.CHROME_ORIGIN_CHECK.encode(), package.FIREFOX_ORIGIN_CHECK.encode()))
        manifest = json.loads(converted["manifest.json"])
        self.assertNotIn("update_url", manifest)
        self.assertEqual(manifest["content_scripts"], json.loads(original["manifest.json"])["content_scripts"])
        self.assertEqual(manifest["background"], {"scripts": [package.BACKGROUND]})
        required = manifest["browser_specific_settings"]["gecko"]["data_collection_permissions"]["required"]
        self.assertNotIn("none", required)
        self.assertIn("authenticationInfo", required)
        self.assertIn("personalCommunications", required)

    def test_download_change_is_rejected_before_unpacking(self):
        with self.assertRaisesRegex(ValueError, "checksum changed"):
            package.read_crx(b"unreviewed upstream release")

    def test_changed_manifest_or_sender_check_is_rejected(self):
        manifest = json.loads(self.files["manifest.json"])
        manifest["version"] = "99.0"
        self.files["manifest.json"] = json.dumps(manifest).encode()
        with self.assertRaisesRegex(ValueError, "manifest"):
            package.convert(self.files)
        manifest["version"] = package.VERSION
        self.files["manifest.json"] = json.dumps(manifest).encode()
        self.files[package.BACKGROUND] = b"changed sender implementation"
        with self.assertRaisesRegex(ValueError, "sender validation"):
            package.convert(self.files)

    def test_archive_cannot_write_outside_build_directory(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("../escape.js", b"bad")
        content = b"Cr24" + struct.pack("<II", 3, 0) + stream.getvalue()
        with patch.object(package, "CRX_SHA256", hashlib.sha256(content).hexdigest()):
            with self.assertRaisesRegex(ValueError, "Unsafe archive entry"):
                package.read_crx(content)


if __name__ == "__main__":
    unittest.main()
