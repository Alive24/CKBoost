# Campaign authorization regression tests

This standalone test crate exercises the actual registered campaign recipes and
freshly built CKB-VM scripts. It avoids the unrelated legacy VM suite's permissive
placeholder assertions. These are local source tests: they do not demonstrate
that the current public network has these fixes. No script deployment, migration,
live wallet signature, or transaction broadcast is part of these commands.
Claim/recycle entry points are unchanged by this authorization work.

## Checkout and tools

Use this directory layout. `WORK_ROOT` is your chosen work directory; it is not
your home directory or a requirement to use a specific account name.

```text
$WORK_ROOT/
  CKBoost/
  ckb_deterministic/
    ckb_deterministic/
  auth-test-assets/
```

The path dependency comes from the project author's
[ckb_deterministic repository](https://github.com/Alive24/ckb_deterministic), fixed
to commit `9d3c3ebbab44dc32c05c2727e68e5530618cb435` for this test run:

```sh
export WORK_ROOT=/absolute/path/to/work
git clone https://github.com/Alive24/ckb_deterministic.git "$WORK_ROOT/ckb_deterministic"
git -C "$WORK_ROOT/ckb_deterministic" checkout 9d3c3ebbab44dc32c05c2727e68e5530618cb435
rustup target add riscv64imac-unknown-none-elf
```

Install `moleculec` and its `moleculec-rust` backend on `PATH`. The original
checked-in generated files identify Molecule 0.9.1. Prefer that version when
reproducing them. The verified local tool was the `moleculec` 0.9.2 CLI; its build
scripts produce formatting/header differences in generated files. Review the
generated diff and restore only that regeneration noise after tests, preserving
any intentional schema edits. Do not commit a schema/codec change merely to run
these tests. For example, install an isolated compatible CLI:

```sh
cargo install moleculec --version 0.9.2 --locked --root "$WORK_ROOT/rust-tools"
export PATH="$WORK_ROOT/rust-tools/bin:$PATH"
```

Native tests use the host C toolchain. RISC-V builds additionally need a C
compiler accepting the RISC-V flags used by `ckb-std`; a suitable LLVM Clang can
be selected with `TARGET_CC=/absolute/path/to/clang`. The verified macOS setup
used Zig 0.14.1 as the Clang frontend, via this small local `riscv-clang` wrapper:

```python
#!/usr/bin/env python3
import os, sys
args = []
for arg in sys.argv[1:]:
    if arg == "--target=riscv64":
        arg = "--target=riscv64-freestanding"
    elif arg.startswith("-march="):
        arg = "-mcpu=baseline+m+c+zba+zbb+zbc+zbs"
    args.append(arg)
os.execv(os.environ["CKBOOST_ZIG"], ["zig", "cc"] + args)
```

Make the wrapper executable and set `CKBOOST_ZIG` to your installed Zig binary.
This is one compiler setup, not a required modification to the contracts.
`CARGO_HOME`, `RUSTUP_HOME` and Zig's cache can be isolated under `WORK_ROOT` when
needed; ensure the isolated Rust toolchain already has the target installed.
Do not point them at an empty toolchain directory and expect offline builds.

## Native registered-rule tests

From the CKBoost repository:

```sh
cd "$WORK_ROOT/CKBoost"
env RUSTFLAGS='-C debug-assertions=no' \
  cargo test --locked --manifest-path contracts/auth-tests/Cargo.toml \
    --test campaign_recipe
```

The updated source run has **17 passing native tests**. They cover real registered
role/settings/review predicates: admin and authorized Organizer creation;
verified owner editing and revocation; input-admin grants; staff/owner separation;
immutable script/protocol links; legacy Endorser metadata; forbidden approval and
counter edits through settings; stable deletion of unused published quest IDs;
and rejection of deleting used quests. Current policy permits protocol Admins,
currently whitelisted Organizers who own the authoritative INPUT campaign lock,
and that INPUT campaign's assigned reviewers to approve submissions. Organizer
revocation, foreign ownership, forged endorsement metadata and OUTPUT-only
reviewer assignments are rejected. Admins and the current Organizer owner may
assign/remove reviewers only through the separate settings operation; a review
transaction cannot also change reviewer assignments.

The current Organizer-owner policy was verified against both new release
candidates in `work/testnet-release/permissions-v2/`: **9 VM groups and 5 real ACP
groups passed**, in addition to the 17 native tests. That directory's manifest
pins both executable hashes, compiler inputs and source fingerprint. Earlier
seven-group VM results predate this policy. No public-chain upgrade is implied by
these local results. Native synthetic contexts intentionally
omit the syscall-backed `settings_actor_capacity_spend` and
`reviewer_capacity_spend` predicates. Their actual input/output capacity and lock
behavior is covered by the complete VM/real ACP tests below. Native passing
alone is not evidence for resistance to unsigned ACP deposits.

The debug-assertions flag is needed by the existing native fixture dependency;
do not treat it as a requirement to disable on-chain authorization. The final
RISC-V contract build below did not add that flag.

## Build the actual VM binaries

From `contracts/`, build the changed campaign and protocol-lock scripts. With a
compatible LLVM compiler, set `TARGET_CC` to it. This was the verified Zig setup
(adjust your actual tool/cache paths):

```sh
cd "$WORK_ROOT/CKBoost/contracts"
env PATH="$WORK_ROOT/rust-tools/bin:$PATH" \
  CARGO_HOME="$WORK_ROOT/cargo-home" \
  RUSTUP_HOME="$WORK_ROOT/rustup" \
  TARGET_CC="$WORK_ROOT/rust-tools/bin/riscv-clang" \
  ZIG_GLOBAL_CACHE_DIR="$WORK_ROOT/zig-cache" \
  cargo build -p ckboost-campaign-type -p ckboost-protocol-lock \
    --target riscv64imac-unknown-none-elf --locked
export CKBOOST_AUTH_BIN_DIR="$WORK_ROOT/CKBoost/contracts/target/riscv64imac-unknown-none-elf/debug"
```

There was no extra `RUSTFLAGS` on that final binary build. `CKBOOST_AUTH_BIN_DIR`
must contain both freshly built executable files; a stale directory can hide a
source regression. These test commands execute the files in that directory,
not deployed scripts fetched from the network.

## Complete transaction VM tests

```sh
cd "$WORK_ROOT/CKBoost"
env RUSTFLAGS='-C debug-assertions=no' \
  CKBOOST_AUTH_BIN_DIR="$CKBOOST_AUTH_BIN_DIR" \
  cargo test --locked --manifest-path contracts/auth-tests/Cargo.toml \
    --features vm-tests --test vm_authorization
```

The latest run against the `permissions-v2` release scripts has **9 passing VM test groups**.
They run actual campaign-type and protocol-lock binaries with registered recipe
witnesses, real Molecule data and complete input/output transactions. They cover
Organizer/admin actions, revoked/foreign owners, Organizer-owner/staff/admin
review, input-only reviewer assignment, legacy Endorser metadata, separate
settings and review operations, input-admin authorization, safe published quest
deletion, and creation counters. Their ordinary wallet fixtures use always-success locks;
the independent real-lock suite below covers signature-sensitive ACP behavior.

## Download verified official ACP fixtures

No external Python dependencies are required. The script downloads immutable
official Nervos artifacts, checks file size, SHA-256 and CKB data hash, extracts
only explicitly named regular archive members, and writes a source manifest.
It refuses to overwrite differing existing files and performs no compilation,
deployment, signing or broadcast.

```sh
cd "$WORK_ROOT/CKBoost"
python3 contracts/auth-tests/scripts/fetch-acp-assets.py \
  --output-dir "$WORK_ROOT/auth-test-assets"
export CKBOOST_ACP_ASSET_DIR="$WORK_ROOT/auth-test-assets"
```

ACP comes from
[nervosnetwork/ckb-sdk-rust commit 1fbf3d4c](https://github.com/nervosnetwork/ckb-sdk-rust/blob/1fbf3d4c9b35ef90bdb9e6621a8d26edde6325ce/src/test-data/anyone_can_pay).
The secp lookup table and optional SighashAll binary are unchanged members of
[official ckb-system-scripts 0.5.4](https://crates.io/crates/ckb-system-scripts/0.5.4).

| File | Bytes | SHA-256 | CKB data hash |
| --- | ---: | --- | --- |
| `anyone_can_pay` | 66048 | `5eca558b873dcf54e589fa2135a7a0a13defcfd87469cac7dfc6a38cbf57720a` | `cd69ba816f7471e59110058aa37387c362ed9a240cd178f7bb1ecee386cb31e6` |
| `secp256k1_data` | 1048576 | `52d7d0a8a553038718865c68194ca467c94bb4accd78b0416f7e5f09c986f3a3` | `9799bee251b975b82c45a02154ce28cec89c5853ecc14d12b7b8cccfc19e0af4` |
| `secp256k1_blake160_sighash_all` | 52048 | `32acace3ce8cce6beda78410efcc1da711736995d91bfbaa9465dc62db79d02f` | `709f3fda12f561cfacf92273c57a98fede188a3f1a59b1f888d113f9cce08649` |

The archive SHA-256 is
`fa5c59063142de7a68cfad4449c6b3863563856219a2925dfb8c5f019ec2aa47`.
CKB data hash uses BLAKE2b-256 with personalization `ckb-default-hash`. These are
data hashes of fixture binaries, not claims about current deployment Type IDs.
The optional SighashAll binary is retained for reproducibility; ACP tests need
only `anyone_can_pay` and `secp256k1_data`.

## Real ACP signature and authorization tests

```sh
cd "$WORK_ROOT/CKBoost"
env RUSTFLAGS='-C debug-assertions=no' \
  CKBOOST_AUTH_BIN_DIR="$CKBOOST_AUTH_BIN_DIR" \
  CKBOOST_ACP_ASSET_DIR="$CKBOOST_ACP_ASSET_DIR" \
  cargo test --locked --manifest-path contracts/auth-tests/Cargo.toml \
    --features vm-tests --test acp_authorization
```

The `permissions-v2` release scripts passed **5/5 groups in 0.16 seconds**:

1. The real ACP lock accepts unsigned 1000→1001 CKB deposit and signed 1000→999
   CKB spend, while rejecting unsigned net spend.
2. Complete campaign approvals using unsigned ACP deposits are rejected for
   both assigned staff and platform admin roles by the actual campaign scripts.
3. Complete signed ACP net-spending approvals pass for both staff and admin.
4. Unsigned net spending is rejected by the actual ACP lock even when the
   campaign's stricter capacity condition would otherwise be met.
5. An Organizer owner who is neither Admin nor assigned staff can review only
   with a real signed ACP net spend. Unsigned deposits, equal balances and
   unsigned net spends are rejected.

Fixtures use a synthetic `[1; 32]` test secret and its compressed-public-key
Blake160 as 20-byte ACP args, with no minimum increment extension. No real wallet
key is read. The SighashAll helper preserves other WitnessArgs fields, hashes all
same-lock group witnesses and every extra witness after the input count, and
puts the recoverable 65-byte signature only in the group's first lock witness.
An independent always-success sponsor covers deposit and positive transaction
fee; pool claims/recycling are not exercised or changed by this suite.

Before the new scripts were rebuilt, the real ACP controls and signed approvals
passed but the unsigned staff deposit approval incorrectly passed too. The
regression then correctly failed, demonstrating the old source behavior. After
rebuilding, those original four groups passed; the current fifth group adds the
Organizer-only case. Keep that distinction when reporting results:
checked-in source and passing local binaries do not imply a deployed upgrade.

## Current Points and Claimable Pool VM tests

The `permissions-v2` candidates passed **7 additional VM test groups** with the
unchanged public Points TypeID `fcb4b762…2189a5e` and Claimable Pool TypeID
`458cacb1…8346cb6`. Each full TypeID script, byte length and CKB data hash is
checked before execution. Both an authorized Organizer owner and an assigned
Reviewer mint exactly one earned Point to a pool without any Admin input.
Foreign or revoked actors, output-only assignments, missing rewards and excess
minting are rejected. The paired claim test executes the real Pool and Points
binaries: C receives one Point, the recycler remainder is preserved, and a
redirected claimant output is rejected.

```sh
env RUSTFLAGS='-C debug-assertions=no' \
  CKBOOST_AUTH_BIN_DIR="$WORK_ROOT/testnet-release/permissions-v2" \
  cargo test --locked --manifest-path contracts/auth-tests/Cargo.toml \
    --features vm-tests --test points_review_authorization
```

This directory must also contain `dependency-public/points-type.elf` and
`dependency-public/claimable-pool.elf`; pinned public read evidence is stored
beside them. These review/claim wallets are synthetic always-success fixtures;
the separate ACP suite checks real wallet signatures. This local VM result
does not claim a public-chain upgrade or a real-wallet acceptance transaction.
