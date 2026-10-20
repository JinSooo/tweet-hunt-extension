#!/usr/bin/env python3
"""Convert the pinned official client locally; never vendor its private bundle."""

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import struct
import urllib.request
import zipfile


VERSION = "0.4.2"
CRX_SHA256 = "96de11f12dcbb6464b8afde5b7df959d8b00b8095d7b7550eaf457dc16010067"
DOWNLOAD_URL = (
    "https://clients2.google.com/service/update2/crx?response=redirect"
    "&prodversion=150.0.0.0&acceptformat=crx2%2Ccrx3"
    "&x=id%3Dgonmfafjcdkngkbhcpmcphlgfhabkeji%26uc"
)
BACKGROUND = "static/background/index.js"
CHROME_ORIGIN_CHECK = 'e.origin===`chrome-extension://${r}`'
FIREFOX_ORIGIN_CHECK = (
    '(e.protocol===new URL(chrome.runtime.getURL("/")).protocol'
    '&&e.host===new URL(chrome.runtime.getURL("/")).host)'
)
# Firefox's built-in data consent describes the full official client's features.
REQUIRED_DATA = [
    "authenticationInfo",
    "personallyIdentifyingInfo",
    "websiteContent",
    "browsingActivity",
    "personalCommunications",
]


def read_crx(content):
    # Check before unpacking: upstream updates require another compatibility review.
    if hashlib.sha256(content).hexdigest() != CRX_SHA256:
        raise ValueError("Official CRX checksum changed; refusing an unreviewed version.")
    if len(content) < 12 or content[:4] != b"Cr24":
        raise ValueError("Not a CRX file")
    version, header_size = struct.unpack_from("<II", content, 4)
    if version != 3 or 12 + header_size >= len(content):
        raise ValueError("Invalid CRX3 header")
    files = {}
    with zipfile.ZipFile(io.BytesIO(content[12 + header_size:])) as archive:
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            if (path.is_absolute() or ".." in path.parts or "\\" in entry.filename
                    or stat.S_ISLNK(entry.external_attr >> 16)):
                raise ValueError("Unsafe archive entry")
            if not entry.is_dir() and path.parts[0] != "_metadata":
                files[entry.filename] = archive.read(entry)
    return files


def convert(files):
    files = dict(files)
    manifest = json.loads(files["manifest.json"])
    if (manifest.get("version") != VERSION
            or manifest.get("manifest_version") != 3
            or manifest.get("background") != {"service_worker": BACKGROUND}):
        raise ValueError("Unexpected official manifest; review before converting")
    background = files[BACKGROUND].decode("utf-8")
    if background.count(CHROME_ORIGIN_CHECK) != 1:
        raise ValueError("Official sender validation changed; review before converting")

    # Preserve the sender-ID and HTTPS X/Twitter checks, including all API auth.
    files[BACKGROUND] = background.replace(
        CHROME_ORIGIN_CHECK, FIREFOX_ORIGIN_CHECK
    ).encode("utf-8")
    manifest.pop("update_url", None)
    manifest["name"] = "XHunt – Firefox compatibility build"
    manifest["background"] = {"scripts": [BACKGROUND]}
    manifest["host_permissions"] = ["https://x.com/*", "https://kb.xhunt.ai/*"]
    manifest["browser_specific_settings"] = {"gecko": {
        "id": "@xhunt-firefox.jinsooo",
        "strict_min_version": "142.0",
        "data_collection_permissions": {"required": REQUIRED_DATA},
    }}
    files["manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--crx", type=Path, help="Use a previously downloaded official CRX")
    args = parser.parse_args()
    if args.crx:
        content = args.crx.read_bytes()
    else:
        with urllib.request.urlopen(DOWNLOAD_URL, timeout=45) as response:
            content = response.read(20 * 1024 * 1024 + 1)
        if len(content) > 20 * 1024 * 1024:
            raise ValueError("Official download exceeded 20 MiB")
    files = convert(read_crx(content))
    build = Path(__file__).resolve().parent.parent / "build"
    source = build / "firefox-official"
    artifact = build / "firefox-artifacts" / f"xhunt_official_firefox-{VERSION}.zip"
    artifact.parent.mkdir(parents=True, exist_ok=True)
    if source.exists():
        shutil.rmtree(source)
    for name, data in files.items():
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    with zipfile.ZipFile(artifact, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            archive.writestr(zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)), data,
                             compress_type=zipfile.ZIP_DEFLATED)
    print(f"Verified official XHunt {VERSION}; converted for Firefox 142+.")
    print(f"Unsigned package: {artifact}")
    print(f"SHA256: {hashlib.sha256(artifact.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
