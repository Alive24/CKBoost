#![cfg(feature = "vm-tests")]
//! Real ACP locks: receiving capacity is not proof that a privileged actor signed.
//! Binaries are pinned, hash-recorded official artifacts in CKBOOST_ACP_ASSET_DIR.
use ckb_deterministic::generated::{
    Bytes as RecipeBytes, RecipeArgument, RecipeArgumentVec, TransactionRecipe,
};
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_crypto::secp::Privkey,
    ckb_hash::{blake2b_256, new_blake2b},
    ckb_script::{ScriptError, TransactionScriptError},
    ckb_types::{
        bytes::Bytes,
        core::{TransactionBuilder, TransactionView},
        packed::*,
        prelude::*,
        H256,
    },
    context::Context,
};
use ckboost_shared::types as mol;
use molecule::prelude::{Builder, Entity};

const CKB: u64 = 100_000_000;
const MAX_CYCLES: u64 = 200_000_000;

fn binary(env: &str, name: &str) -> Bytes {
    std::fs::read(std::path::Path::new(&std::env::var(env).expect(env)).join(name))
        .unwrap_or_else(|err| panic!("{env}/{name}: {err}"))
        .into()
}
fn b32(hash: &[u8]) -> mol::Byte32 {
    mol::Byte32::from_slice(hash).unwrap()
}
fn connection(owner: &[u8], protocol: &[u8]) -> Bytes {
    mol::ConnectedTypeID::new_builder()
        .type_id(b32(owner))
        .connected_key(b32(protocol))
        .build()
        .as_bytes()
        .to_vec()
        .into()
}
fn dep(out_point: OutPoint) -> CellDep {
    CellDep::new_builder().out_point(out_point).build()
}
fn output(lock: &Script, capacity: u64) -> CellOutput {
    CellOutput::new_builder()
        .capacity((capacity * CKB).pack())
        .lock(lock.clone())
        .build()
}
fn input(context: &mut Context, lock: &Script, capacity: u64) -> CellInput {
    let out_point = context.create_cell(output(lock, capacity), Bytes::new());
    CellInput::new_builder().previous_output(out_point).build()
}
fn review_witness() -> Bytes {
    let inline = |data: Vec<u8>| {
        RecipeArgument::new_builder()
            .arg_type(0u8)
            .data(RecipeBytes::from(data))
            .build()
    };
    let recipe = TransactionRecipe::new_builder()
        .method_path(RecipeBytes::from(
            b"CKBoostCampaign.approve_completion".to_vec(),
        ))
        .arguments(RecipeArgumentVec::from(vec![
            RecipeArgument::new_builder()
                .arg_type(2u8)
                .data(RecipeBytes::from(0u32.to_le_bytes().to_vec()))
                .build(),
            inline(0u32.to_le_bytes().to_vec()),
            inline(
                mol::Byte32Vec::from(vec![b32(&[77; 32])])
                    .as_slice()
                    .to_vec(),
            ),
        ]))
        .build();
    WitnessArgs::new_builder()
        .output_type(Some(Bytes::from(recipe.as_slice().to_vec())).pack())
        .build()
        .as_bytes()
}

/// Standard SighashAll; preserves input/output-type fields and covers extra witnesses.
/// The caller supplies all same-lock input indices, in ascending input order.
fn sign_group(tx: TransactionView, key: &Privkey, indices: &[usize]) -> TransactionView {
    let first = indices[0];
    let mut witnesses: Vec<Bytes> = tx.witnesses().into_iter().map(|w| w.raw_data()).collect();
    witnesses.resize(witnesses.len().max(tx.inputs().len()), Bytes::new());
    let original = if witnesses[first].is_empty() {
        WitnessArgs::default()
    } else {
        WitnessArgs::from_slice(&witnesses[first]).expect("WitnessArgs")
    };
    let zeroed = original
        .clone()
        .as_builder()
        .lock(Some(Bytes::from(vec![0; 65])).pack())
        .build()
        .as_bytes();
    let mut hasher = new_blake2b();
    hasher.update(tx.hash().as_slice());
    hasher.update(&(zeroed.len() as u64).to_le_bytes());
    hasher.update(&zeroed);
    for index in indices
        .iter()
        .skip(1)
        .copied()
        .chain(tx.inputs().len()..witnesses.len())
    {
        let witness = &witnesses[index];
        hasher.update(&(witness.len() as u64).to_le_bytes());
        hasher.update(witness);
    }
    let mut message = [0u8; 32];
    hasher.finalize(&mut message);
    let signature = key
        .sign_recoverable(&H256::from(message))
        .expect("test signature");
    witnesses[first] = original
        .as_builder()
        .lock(Some(Bytes::from(signature.serialize())).pack())
        .build()
        .as_bytes();
    tx.as_advanced_builder()
        .set_witnesses(witnesses.into_iter().map(|w| w.pack()).collect())
        .build()
}

struct Setup {
    context: Context,
    key: Privkey,
    actor: Script,
    sponsor: Script,
    campaign_type: Script,
    campaign_lock: Script,
    protocol_dep: CellDep,
    secp_dep: CellDep,
    data: mol::CampaignData,
}
fn setup(admin: bool) -> Setup {
    setup_actor(admin, false)
}
fn setup_actor(admin: bool, organizer_owner: bool) -> Setup {
    let mut context = Context::default();
    context.set_capture_debug(true);
    let acp_code = context.deploy_cell(binary("CKBOOST_ACP_ASSET_DIR", "anyone_can_pay"));
    let secp_dep = dep(context.deploy_cell(binary("CKBOOST_ACP_ASSET_DIR", "secp256k1_data")));
    let always = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let campaign_code =
        context.deploy_cell(binary("CKBOOST_AUTH_BIN_DIR", "ckboost-campaign-type"));
    let lock_code = context.deploy_cell(binary("CKBOOST_AUTH_BIN_DIR", "ckboost-protocol-lock"));
    let key = Privkey::from_slice(&[1; 32]); // Synthetic fixture key; never a live wallet.
    let pubkey = key.pubkey().unwrap().serialize();
    assert_eq!(pubkey.len(), 33);
    // Twenty-byte ACP args: no minimum-capacity or UDT increment extension.
    let actor = context
        .build_script(
            &acp_code,
            Bytes::copy_from_slice(&blake2b_256(pubkey)[..20]),
        )
        .unwrap();
    let sponsor = context.build_script(&always, Bytes::from(vec![2])).unwrap();
    let owner = if organizer_owner { actor.clone() } else { context.build_script(&always, Bytes::from(vec![3])).unwrap() };
    let other_admin = context.build_script(&always, Bytes::from(vec![4])).unwrap();
    let protocol_type = context
        .build_script(&always, Bytes::from(vec![10; 32]))
        .unwrap();
    let protocol_hash = protocol_type.calc_script_hash();
    let campaign_type = context
        .build_script(
            &campaign_code,
            connection(&[66; 32], protocol_hash.as_slice()),
        )
        .unwrap();
    let campaign_lock = context
        .build_script(
            &lock_code,
            connection(
                owner.calc_script_hash().as_slice(),
                protocol_hash.as_slice(),
            ),
        )
        .unwrap();
    let admin_hash = if admin {
        actor.calc_script_hash()
    } else {
        other_admin.calc_script_hash()
    };
    let protocol = mol::ProtocolData::new_builder()
        .protocol_config(
            mol::ProtocolConfig::new_builder()
                .script_code_hashes(
                    mol::ScriptCodeHashes::new_builder()
                        .ckb_boost_protocol_type_code_hash(b32(protocol_type
                            .code_hash()
                            .as_slice()))
                        .ckb_boost_campaign_type_code_hash(b32(campaign_type
                            .code_hash()
                            .as_slice()))
                        .ckb_boost_protocol_lock_code_hash(b32(campaign_lock
                            .code_hash()
                            .as_slice()))
                        .build(),
                )
                .admin_lock_hash_vec(mol::Byte32Vec::from(vec![b32(admin_hash.as_slice())]))
                .build(),
        )
        .endorsers_whitelist(mol::EndorserInfoVec::from(if organizer_owner {
            vec![mol::EndorserInfo::new_builder().endorser_lock_hash(b32(actor.calc_script_hash().as_slice())).build()]
        } else { vec![] }))
        .build();
    let protocol_lock = context
        .build_script(
            &lock_code,
            connection(admin_hash.as_slice(), protocol_hash.as_slice()),
        )
        .unwrap();
    let protocol_cell = context.create_cell(
        output(&protocol_lock, 1000)
            .as_builder()
            .type_(Some(protocol_type).pack())
            .build(),
        Bytes::from(protocol.as_slice().to_vec()),
    );
    let text = |value: &str| mol::String::from(value.as_bytes().to_vec());
    let data = mol::CampaignData::new_builder()
        .endorser_lock_hash(b32(owner.calc_script_hash().as_slice()))
        .staff_lock_hash_vec(mol::Byte32Vec::from(if admin || organizer_owner {
            vec![]
        } else {
            vec![b32(actor.calc_script_hash().as_slice())]
        }))
        .metadata(
            mol::CampaignMetadata::new_builder()
                .title(text("Real ACP auth regression"))
                .short_description(text("Synthetic VM fixture"))
                .long_description(text("No live transactions or keys"))
                .build(),
        )
        .quests(mol::QuestDataVec::from(vec![mol::QuestData::default()]))
        .build();
    Setup {
        context,
        key,
        actor,
        sponsor,
        campaign_type,
        campaign_lock,
        protocol_dep: dep(protocol_cell),
        secp_dep,
        data,
    }
}

/// The ACP group is input0; sponsor is input1; campaign recipe is input2.
/// Sponsor's 200→198 CKB change funds a 1 CKB deposit and leaves a positive fee.
fn transaction(setup: &mut Setup, actor_output: u64, review: bool) -> TransactionView {
    let mut inputs = vec![
        input(&mut setup.context, &setup.actor, 1000),
        input(&mut setup.context, &setup.sponsor, 200),
    ];
    let mut outputs = vec![];
    let mut output_data = vec![];
    let mut witnesses = vec![Bytes::new(), Bytes::new()];
    if review {
        let campaign_output = output(&setup.campaign_lock, 1000)
            .as_builder()
            .type_(Some(setup.campaign_type.clone()).pack())
            .build();
        let campaign_cell = setup.context.create_cell(
            campaign_output.clone(),
            Bytes::from(setup.data.as_slice().to_vec()),
        );
        inputs.push(
            CellInput::new_builder()
                .previous_output(campaign_cell)
                .build(),
        );
        let quest = setup
            .data
            .quests()
            .get(0)
            .unwrap()
            .as_builder()
            .accepted_submission_user_type_ids(mol::Byte32Vec::from(vec![b32(&[77; 32])]))
            .completion_count(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
            .build();
        let next = setup
            .data
            .clone()
            .as_builder()
            .quests(mol::QuestDataVec::from(vec![quest]))
            .total_completions(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
            .build();
        outputs.push(campaign_output);
        output_data.push(Bytes::from(next.as_slice().to_vec()).pack());
        witnesses.push(review_witness());
    }
    outputs.push(output(&setup.actor, actor_output));
    outputs.push(output(&setup.sponsor, 198));
    output_data.extend([Bytes::new().pack(), Bytes::new().pack()]);
    setup.context.complete_tx(
        TransactionBuilder::default()
            .inputs(inputs)
            .outputs(outputs)
            .outputs_data(output_data)
            .cell_deps(vec![setup.secp_dep.clone(), setup.protocol_dep.clone()])
            .set_witnesses(witnesses.into_iter().map(|w| w.pack()).collect())
            .build(),
    )
}

#[test]
fn real_acp_lock_accepts_unsigned_deposit_and_signed_spend_but_rejects_unsigned_spend() {
    for (actor_output, signed, allowed) in
        [(1001, false, true), (999, true, true), (999, false, false)]
    {
        let mut setup = setup(false);
        let tx = transaction(&mut setup, actor_output, false);
        let tx = if signed {
            sign_group(tx, &setup.key, &[0])
        } else {
            tx
        };
        let result = setup.context.verify_tx(&tx, MAX_CYCLES);
        assert_eq!(
            result.is_ok(),
            allowed,
            "real ACP baseline output={actor_output},signed={signed}: {result:?}"
        );
        if !allowed {
            let error = result.unwrap_err();
            let failure = error
                .root_cause()
                .downcast_ref::<TransactionScriptError>()
                .expect("script validation failure");
            assert!(
                format!("{}", failure.originating_script()).starts_with("Inputs[0]."),
                "real ACP input0 must reject: {failure:?}"
            );
            assert!(
                matches!(failure.script_error(), ScriptError::ValidationFailure(_, _)),
                "ACP must execute and return failure: {failure:?}"
            );
        }
    }
}

#[test]
fn unsigned_acp_deposit_cannot_impersonate_staff_or_admin_in_complete_review_transaction() {
    for admin in [false, true] {
        let mut setup = setup(admin);
        let tx = transaction(&mut setup, 1001, true);
        let result = setup.context.verify_tx(&tx, MAX_CYCLES);
        assert!(
            result.is_err(),
            "unsigned ACP deposit impersonated admin={admin}: {result:?}"
        );
        let error = result.unwrap_err();
        let failure = error
            .root_cause()
            .downcast_ref::<TransactionScriptError>()
            .expect("campaign script validation failure");
        assert!(
            format!("{}", failure.originating_script()).starts_with("Inputs[2]."),
            "campaign input2 must reject the forged role, not the ACP lock: {failure:?}"
        );
        assert!(
            matches!(failure.script_error(), ScriptError::ValidationFailure(_, _)),
            "campaign must execute and reject: {failure:?}"
        );
    }
}

#[test]
fn signed_acp_net_spend_allows_staff_and_admin_in_complete_review_transaction() {
    for admin in [false, true] {
        let mut setup = setup(admin);
        let tx = transaction(&mut setup, 999, true);
        let tx = sign_group(tx, &setup.key, &[0]);
        let result = setup.context.verify_tx(&tx, MAX_CYCLES);
        assert!(
            result.is_ok(),
            "signed ACP net-spending admin={admin}: {result:?}"
        );
    }
}

#[test]
fn organizer_owner_review_requires_real_acp_signature_and_net_spend_without_admin_or_staff() {
    for (actor_output, signed, allowed) in [(1001, false, false), (1000, false, false), (999, false, false), (999, true, true)] {
        let mut setup = setup_actor(false, true);
        let tx = transaction(&mut setup, actor_output, true);
        let tx = if signed { sign_group(tx, &setup.key, &[0]) } else { tx };
        let result = setup.context.verify_tx(&tx, MAX_CYCLES);
        assert_eq!(result.is_ok(), allowed, "Organizer owner ACP output={actor_output}, signed={signed}: {result:?}");
    }
}

#[test]
fn unsigned_acp_net_spend_fails_real_lock_even_when_privileged_capacity_condition_is_met() {
    let mut setup = setup(false);
    let tx = transaction(&mut setup, 999, true);
    let result = setup.context.verify_tx(&tx, MAX_CYCLES);
    assert!(
        result.is_err(),
        "unsigned net-spend must fail the actual ACP lock"
    );
    let error = result.unwrap_err();
    let failure = error
        .root_cause()
        .downcast_ref::<TransactionScriptError>()
        .expect("real ACP validation failure");
    assert!(
        format!("{}", failure.originating_script()).starts_with("Inputs[0]."),
        "real ACP input0 must reject: {failure:?}"
    );
    assert!(
        matches!(failure.script_error(), ScriptError::ValidationFailure(_, _)),
        "ACP must execute and reject: {failure:?}"
    );
}
