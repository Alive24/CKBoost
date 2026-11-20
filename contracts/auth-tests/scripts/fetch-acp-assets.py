#!/usr/bin/env python3
"""Download pinned official Nervos ACP VM fixtures; verify before writing.

Only Python's standard library is required. This does not build, deploy, sign or
broadcast anything. Run with --output-dir pointing to an empty fixture directory.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ACP_URL = (
    "https://raw.githubusercontent.com/nervosnetwork/ckb-sdk-rust/"
    "1fbf3d4c9b35ef90bdb9e6621a8d26edde6325ce/src/test-data/anyone_can_pay"
)
CRATE_URL = "https://crates.io/api/v1/crates/ckb-system-scripts/0.5.4/download"
CRATE_SHA256 = "fa5c59063142de7a68cfad4449c6b3863563856219a2925dfb8c5f019ec2aa47"
ASSETS = {
    "anyone_can_pay": {
        "size": 66048,
        "sha256": "5eca558b873dcf54e589fa2135a7a0a13defcfd87469cac7dfc6a38cbf57720a",
        "ckb_data_hash": "cd69ba816f7471e59110058aa37387c362ed9a240cd178f7bb1ecee386cb31e6",
        "source": ACP_URL,
    },
    "secp256k1_data": {
        "size": 1048576,
        "sha256": "52d7d0a8a553038718865c68194ca467c94bb4accd78b0416f7e5f09c986f3a3",
        "ckb_data_hash": "9799bee251b975b82c45a02154ce28cec89c5853ecc14d12b7b8cccfc19e0af4",
        "source": CRATE_URL,
        "archive_member": "ckb-system-scripts-0.5.4/specs/cells/secp256k1_data",
    },
    "secp256k1_blake160_sighash_all": {
        "size": 52048,
        "sha256": "32acace3ce8cce6beda78410efcc1da711736995d91bfbaa9465dc62db79d02f",
        "ckb_data_hash": "709f3fda12f561cfacf92273c57a98fede188a3f1a59b1f888d113f9cce08649",
        "source": CRATE_URL,
        "archive_member": "ckb-system-scripts-0.5.4/specs/cells/secp256k1_blake160_sighash_all",
    },
}


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "CKBoost-auth-tests/1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(32 * 1024 * 1024 + 1)
    if len(data) > 32 * 1024 * 1024:
        raise ValueError("Official fixture download exceeds the expected size limit")
    return data


def verify(name, data, expected):
    if len(data) != expected["size"]:
        raise ValueError(f"{name}: unexpected size")
    if hashlib.sha256(data).hexdigest() != expected["sha256"]:
        raise ValueError(f"{name}: SHA-256 mismatch")
    digest = hashlib.blake2b(data, digest_size=32, person=b"ckb-default-hash").hexdigest()
    if digest != expected["ckb_data_hash"]:
        raise ValueError(f"{name}: CKB data hash mismatch")


def save(path, data):
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f"Refusing to overwrite a different existing file: {path}")
        return
    # Exclusive creation prevents silently replacing an existing artifact.
    with path.open("xb") as output:
        output.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    data = {"anyone_can_pay": download(ACP_URL)}
    archive = download(CRATE_URL)
    if hashlib.sha256(archive).hexdigest() != CRATE_SHA256:
        raise ValueError("Official ckb-system-scripts crate SHA-256 mismatch")
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as package:
        for name, expected in ASSETS.items():
            member_name = expected.get("archive_member")
            if not member_name:
                continue
            member = package.getmember(member_name)
            if not member.isfile() or member.size != expected["size"]:
                raise ValueError(f"Unexpected archive member: {member_name}")
            stream = package.extractfile(member)
            if stream is None:
                raise ValueError(f"Missing archive content: {member_name}")
            data[name] = stream.read()
    # Check every artifact before creating any output file. Never extract paths.
    for name, expected in ASSETS.items():
        verify(name, data[name], expected)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, content in data.items():
        save(args.output_dir / name, content)
    save(args.output_dir / "ckb-system-scripts-0.5.4.crate", archive)
    manifest = {
        "ckb_data_hash_algorithm": "BLAKE2b-256, personalization ckb-default-hash",
        "archive": {"source": CRATE_URL, "sha256": CRATE_SHA256},
        "assets": [{"file": name, **expected, "ckb_data_hash": "0x" + expected["ckb_data_hash"]}
                   for name, expected in ASSETS.items()],
    }
    save(args.output_dir / "manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())
    print(f"Verified {len(data)} official artifacts in {args.output_dir.resolve()}")


if __name__ == "__main__":
    main()
