#![cfg(feature = "vm-tests")]
use ckb_deterministic::generated::{
    Bytes as RecipeBytes, RecipeArgument, RecipeArgumentVec, TransactionRecipe,
};
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{TransactionBuilder, TransactionView},
        packed::*,
        prelude::*,
    },
    context::Context,
};
use ckboost_shared::{type_id::calculate_type_id, types as mol};
use molecule::prelude::{Builder, Entity};

fn binary(name: &str) -> Bytes {
    std::fs::read(
        std::path::Path::new(
            &std::env::var("CKBOOST_AUTH_BIN_DIR")
                .expect("set CKBOOST_AUTH_BIN_DIR to the freshly built binaries"),
        )
        .join(name),
    )
    .expect("fresh contract binary")
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
fn string(text: &str) -> mol::String {
    mol::String::from(text.as_bytes().to_vec())
}
fn inline(data: Vec<u8>) -> RecipeArgument {
    RecipeArgument::new_builder()
        .arg_type(0u8)
        .data(RecipeBytes::from(data))
        .build()
}
fn witness(method: &str, review: bool) -> Bytes {
    let output = RecipeArgument::new_builder()
        .arg_type(2u8)
        .data(RecipeBytes::from(0u32.to_le_bytes().to_vec()))
        .build();
    let mut args = vec![output];
    if review {
        args.push(inline(0u32.to_le_bytes().to_vec()));
        args.push(inline(
            mol::Byte32Vec::from(vec![b32(&[77; 32])])
                .as_slice()
                .to_vec(),
        ));
    }
    let recipe = TransactionRecipe::new_builder()
        .method_path(RecipeBytes::from(method.as_bytes().to_vec()))
        .arguments(RecipeArgumentVec::from(args))
        .build();
    WitnessArgs::new_builder()
        .output_type(Some(Bytes::from(recipe.as_slice().to_vec())).pack())
        .build()
        .as_bytes()
}
struct Setup {
    context: Context,
    campaign_type: Script,
    campaign_lock: Script,
    protocol_dep: CellDep,
    owner: Script,
    other: Script,
    admin: Script,
    staff: Script,
    metadata_owner: Vec<u8>,
    used_quest: bool,
}
fn make_setup(organizer: bool, legacy_metadata: bool) -> Setup {
    let mut context = Context::default();
    let campaign_code = context.deploy_cell(binary("ckboost-campaign-type"));
    let lock_code = context.deploy_cell(binary("ckboost-protocol-lock"));
    let always = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let wallet = |context: &mut Context, value: u8| {
        context
            .build_script(&always, Bytes::from(vec![value]))
            .unwrap()
    };
    let owner = wallet(&mut context, 1);
    let other = wallet(&mut context, 2);
    let admin = wallet(&mut context, 3);
    let staff = wallet(&mut context, 4);
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
    let hashes = mol::ScriptCodeHashes::new_builder()
        .ckb_boost_protocol_type_code_hash(b32(protocol_type.code_hash().as_slice()))
        .ckb_boost_campaign_type_code_hash(b32(campaign_type.code_hash().as_slice()))
        .ckb_boost_protocol_lock_code_hash(b32(campaign_lock.code_hash().as_slice()))
        .build();
    let endorsers = if organizer {
        vec![owner.calc_script_hash(), other.calc_script_hash()]
    } else {
        vec![other.calc_script_hash()]
    };
    let protocol = mol::ProtocolData::new_builder()
        .protocol_config(
            mol::ProtocolConfig::new_builder()
                .script_code_hashes(hashes)
                .admin_lock_hash_vec(mol::Byte32Vec::from(vec![b32(admin
                    .calc_script_hash()
                    .as_slice())]))
                .build(),
        )
        .endorsers_whitelist(mol::EndorserInfoVec::from(
            endorsers
                .into_iter()
                .map(|hash| {
                    mol::EndorserInfo::new_builder()
                        .endorser_lock_hash(b32(hash.as_slice()))
                        .build()
                })
                .collect::<Vec<_>>(),
        ))
        .build();
    let protocol_lock = context
        .build_script(
            &lock_code,
            connection(
                admin.calc_script_hash().as_slice(),
                protocol_hash.as_slice(),
            ),
        )
        .unwrap();
    let protocol_cell = context.create_cell(
        CellOutput::new_builder()
            .capacity(100_000_000_000u64.pack())
            .lock(protocol_lock)
            .type_(Some(protocol_type).pack())
            .build(),
        Bytes::from(protocol.as_slice().to_vec()),
    );
    let metadata_owner = if legacy_metadata {
        other.calc_script_hash()
    } else {
        owner.calc_script_hash()
    }
    .as_slice()
    .to_vec();
    Setup {
        context,
        campaign_type,
        campaign_lock,
        protocol_dep: CellDep::new_builder()
            .out_point(protocol_cell)
            .dep_type(0u8.into())
            .build(),
        owner,
        other,
        admin,
        staff,
        metadata_owner,
        used_quest: false,
    }
}
fn data(setup: &Setup) -> mol::CampaignData {
    let primary = if setup.used_quest {
        mol::QuestData::default()
            .as_builder()
            .accepted_submission_user_type_ids(mol::Byte32Vec::from(vec![b32(&[77; 32])]))
            .completion_count(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
            .build()
    } else {
        mol::QuestData::default()
    };
    let secondary = mol::QuestData::default()
        .as_builder()
        .quest_id(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
        .build();
    mol::CampaignData::new_builder()
        .endorser_lock_hash(b32(&setup.metadata_owner))
        .staff_lock_hash_vec(mol::Byte32Vec::from(vec![b32(setup
            .staff
            .calc_script_hash()
            .as_slice())]))
        .metadata(
            mol::CampaignMetadata::new_builder()
                .title(string("Campaign"))
                .short_description(string("Summary"))
                .long_description(string("Description"))
                .build(),
        )
        .quests(mol::QuestDataVec::from(vec![primary, secondary]))
        .total_completions(
            mol::Uint32::from_slice(&(u32::from(setup.used_quest)).to_le_bytes()).unwrap(),
        )
        .build()
}
fn transaction(setup: &mut Setup, actor: &Script, creation: bool, review: bool) -> TransactionView {
    let current = data(setup);
    let wallet_cell = setup.context.create_cell(
        CellOutput::new_builder()
            .capacity(100_000_000_000u64.pack())
            .lock(actor.clone())
            .build(),
        Bytes::new(),
    );
    let wallet_input = CellInput::new_builder()
        .previous_output(wallet_cell)
        .build();
    let mut inputs = vec![wallet_input.clone()];
    if creation {
        let id = calculate_type_id(wallet_input.as_slice(), 0);
        setup.campaign_type = setup
            .campaign_type
            .clone()
            .as_builder()
            .args(
                connection(
                    &id,
                    setup
                        .campaign_lock
                        .args()
                        .raw_data()
                        .as_ref()
                        .get(44..76)
                        .unwrap(),
                )
                .pack(),
            )
            .build();
    } else {
        let old = setup.context.create_cell(
            CellOutput::new_builder()
                .capacity(100_000_000_000u64.pack())
                .lock(setup.campaign_lock.clone())
                .type_(Some(setup.campaign_type.clone()).pack())
                .build(),
            Bytes::from(current.as_slice().to_vec()),
        );
        inputs.push(CellInput::new_builder().previous_output(old).build());
    }
    let secondary = current.quests().get(1).unwrap();
    let next = if review {
        let quest = current
            .quests()
            .get(0)
            .unwrap()
            .as_builder()
            .accepted_submission_user_type_ids(mol::Byte32Vec::from(vec![b32(&[77; 32])]))
            .completion_count(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
            .build();
        current.clone()
            .as_builder()
            .quests(mol::QuestDataVec::from(vec![
                quest,
                current.quests().get(1).unwrap(),
            ]))
            .total_completions(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
            .build()
    } else {
        current
    };
    let output = CellOutput::new_builder()
        .capacity(100_000_000_000u64.pack())
        .lock(setup.campaign_lock.clone())
        .type_(Some(setup.campaign_type.clone()).pack())
        .build();
    let mut witnesses = vec![Bytes::new().pack(); inputs.len().saturating_sub(1)];
    witnesses.push(
        witness(
            if review {
                "CKBoostCampaign.approve_completion"
            } else {
                "CKBoostCampaign.update_campaign"
            },
            review,
        )
        .pack(),
    );
    setup.context.complete_tx(
        TransactionBuilder::default()
            .inputs(inputs)
            .output(output)
            .output_data(Bytes::from(next.as_slice().to_vec()).pack())
            .cell_dep(setup.protocol_dep.clone())
            .witnesses(witnesses)
            .build(),
    )
}

#[test]
fn vm_organizer_creates_and_edits_but_visitor_staff_and_other_organizer_do_not_edit() {
    for (creation, actor, allowed) in [
        (true, 0, true),
        (false, 0, true),
        (false, 1, true),
        (false, 2, false),
        (false, 3, false),
    ] {
        let mut setup = make_setup(true, false);
        let signer = [
            setup.owner.clone(),
            setup.admin.clone(),
            setup.other.clone(),
            setup.staff.clone(),
        ][actor]
            .clone();
        let tx = transaction(&mut setup, &signer, creation, false);
        let result = setup.context.verify_tx(&tx, 200_000_000);
        assert_eq!(
            result.is_ok(),
            allowed,
            "creation={creation},actor={actor}: {result:?}"
        );
    }
}
#[test]
fn vm_revoked_organizer_and_legacy_metadata_are_handled_by_actual_owner() {
    let mut setup = make_setup(false, false);
    let owner = setup.owner.clone();
    let tx = transaction(&mut setup, &owner, false, false);
    assert!(setup.context.verify_tx(&tx, 200_000_000).is_err());
    for (actor, allowed) in [(0, true), (1, true), (2, false)] {
        let mut setup = make_setup(true, true);
        let signer = [
            setup.owner.clone(),
            setup.admin.clone(),
            setup.other.clone(),
        ][actor]
            .clone();
        let tx = transaction(&mut setup, &signer, false, false);
        let result = setup.context.verify_tx(&tx, 200_000_000);
        assert_eq!(result.is_ok(), allowed, "legacy actor={actor}: {result:?}");
    }
}
#[test]
fn vm_submission_review_allows_admin_owned_organizer_and_assigned_staff() {
    for (actor, allowed) in [(0, true), (1, true), (2, false), (3, true)] {
        let mut setup = make_setup(true, false);
        let signer = [
            setup.owner.clone(),
            setup.admin.clone(),
            setup.other.clone(),
            setup.staff.clone(),
        ][actor]
            .clone();
        let tx = transaction(&mut setup, &signer, false, true);
        let result = setup.context.verify_tx(&tx, 200_000_000);
        assert_eq!(result.is_ok(), allowed, "review actor={actor}: {result:?}");
    }

    // An unassigned wallet cannot authorize itself by adding its hash to the
    // desired output. Only the consumed campaign's assignments grant review.
    let mut setup = make_setup(true, false);
    let other = setup.other.clone();
    let tx = transaction(&mut setup, &other, false, true);
    let current = mol::CampaignData::from_slice(&tx.outputs_data().get(0).unwrap().raw_data()).unwrap();
    let forged = current.as_builder().staff_lock_hash_vec(mol::Byte32Vec::from(vec![b32(other.calc_script_hash().as_slice())])).build();
    let tx = tx.as_advanced_builder().set_outputs_data(vec![Bytes::from(forged.as_slice().to_vec()).pack()]).build();
    assert!(setup.context.verify_tx(&tx, 200_000_000).is_err());
}

#[test]
fn vm_revoked_organizer_cannot_review_and_metadata_does_not_grant_ownership() {
    let mut revoked = make_setup(false, false);
    let owner = revoked.owner.clone();
    let tx = transaction(&mut revoked, &owner, false, true);
    assert!(revoked.context.verify_tx(&tx, 200_000_000).is_err());
    for (actor, allowed) in [(0, true), (1, true), (2, false)] {
        let mut setup = make_setup(true, true);
        let signer = [setup.owner.clone(), setup.admin.clone(), setup.other.clone()][actor].clone();
        let tx = transaction(&mut setup, &signer, false, true);
        assert_eq!(setup.context.verify_tx(&tx, 200_000_000).is_ok(), allowed, "legacy review actor={actor}");
    }
}

#[test]
fn vm_only_admin_or_current_organizer_owner_can_assign_campaign_reviewers() {
    for (actor, allowed) in [(0, true), (1, true), (2, false), (3, false)] {
        let mut setup = make_setup(true, false);
        let signer = [setup.owner.clone(), setup.admin.clone(), setup.other.clone(), setup.staff.clone()][actor].clone();
        let tx = transaction(&mut setup, &signer, false, false);
        let current = mol::CampaignData::from_slice(&tx.outputs_data().get(0).unwrap().raw_data()).unwrap();
        let assigned = current.as_builder().staff_lock_hash_vec(mol::Byte32Vec::from(vec![b32(setup.other.calc_script_hash().as_slice())])).build();
        let changed = tx.as_advanced_builder().set_outputs_data(vec![Bytes::from(assigned.as_slice().to_vec()).pack()]).build();
        assert_eq!(setup.context.verify_tx(&changed, 200_000_000).is_ok(), allowed, "assign reviewer actor={actor}");
    }
}

#[test]
fn vm_settings_cannot_bypass_review_and_review_cannot_change_staff() {
    for review in [false, true] {
        let mut setup = make_setup(true, false);
        let actor = if review {
            setup.staff.clone()
        } else {
            setup.owner.clone()
        };
        let tx = transaction(&mut setup, &actor, false, review);
        assert!(
            setup.context.verify_tx(&tx, 200_000_000).is_ok(),
            "legitimate control must pass"
        );
        let current =
            mol::CampaignData::from_slice(&tx.outputs_data().get(0).unwrap().raw_data()).unwrap();
        let changed = if review {
            current.clone()
                .as_builder()
                .staff_lock_hash_vec(mol::Byte32Vec::from(vec![b32(setup
                    .other
                    .calc_script_hash()
                    .as_slice())]))
                .build()
        } else {
            let quest = current
                .quests()
                .get(0)
                .unwrap()
                .as_builder()
                .accepted_submission_user_type_ids(mol::Byte32Vec::from(vec![b32(&[77; 32])]))
                .build();
            current.clone()
                .as_builder()
                .quests(mol::QuestDataVec::from(vec![quest]))
                .build()
        };
        let attack = tx
            .as_advanced_builder()
            .set_outputs_data(vec![Bytes::from(changed.as_slice().to_vec()).pack()])
            .build();
        assert!(setup.context.verify_tx(&attack, 200_000_000).is_err());
    }
}

#[test]
fn vm_organizer_grant_uses_input_admins_even_when_output_replaces_them() {
    for (actor, allowed) in [(0, true), (1, false)] {
        let mut setup = make_setup(true, false);
        let signer = if actor == 0 {
            setup.admin.clone()
        } else {
            setup.other.clone()
        };
        let outpoint = setup.protocol_dep.out_point();
        let (previous, bytes) = setup.context.get_cell(&outpoint).unwrap();
        let before = mol::ProtocolData::from_slice(&bytes).unwrap();
        let hashes = before
            .protocol_config()
            .script_code_hashes()
            .as_builder()
            .ckb_boost_campaign_type_code_hash(b32(&[88; 32]))
            .ckb_boost_protocol_lock_code_hash(b32(&[89; 32]))
            .build();
        let config = before
            .protocol_config()
            .as_builder()
            .script_code_hashes(hashes)
            .admin_lock_hash_vec(mol::Byte32Vec::from(vec![b32(setup
                .other
                .calc_script_hash()
                .as_slice())]))
            .build();
        let after = before
            .as_builder()
            .protocol_config(config)
            .endorsers_whitelist(mol::EndorserInfoVec::from(vec![
                mol::EndorserInfo::new_builder()
                    .endorser_lock_hash(b32(setup.other.calc_script_hash().as_slice()))
                    .build(),
            ]))
            .build();
        let wallet = setup.context.create_cell(
            CellOutput::new_builder()
                .capacity(100_000_000_000u64.pack())
                .lock(signer)
                .build(),
            Bytes::new(),
        );
        let tx = setup.context.complete_tx(
            TransactionBuilder::default()
                .inputs(vec![
                    CellInput::new_builder().previous_output(wallet).build(),
                    CellInput::new_builder().previous_output(outpoint).build(),
                ])
                .output(previous)
                .output_data(Bytes::from(after.as_slice().to_vec()).pack())
                .witnesses(vec![
                    Bytes::new().pack(),
                    witness("CKBoostProtocol.update_protocol", false).pack(),
                ])
                .build(),
        );
        let result = setup.context.verify_tx(&tx, 200_000_000);
        assert_eq!(result.is_ok(), allowed, "grant actor={actor}: {result:?}");
    }
}

#[test]
fn vm_unused_published_quest_can_be_deleted_but_an_approved_quest_cannot() {
    for used in [false, true] {
        let mut setup = make_setup(true, false);
        setup.used_quest = used;
        let owner = setup.owner.clone();
        let tx = transaction(&mut setup, &owner, false, false);
        assert!(setup.context.verify_tx(&tx, 200_000_000).is_ok());
        let current =
            mol::CampaignData::from_slice(&tx.outputs_data().get(0).unwrap().raw_data()).unwrap();
        let next = current.clone()
            .as_builder()
            .quests(mol::QuestDataVec::from(vec![current
                .quests()
                .get(1)
                .unwrap()]))
            .build();
        let changed = tx
            .as_advanced_builder()
            .set_outputs_data(vec![Bytes::from(next.as_slice().to_vec()).pack()])
            .build();
        let result = setup.context.verify_tx(&changed, 200_000_000);
        assert_eq!(result.is_ok(), !used, "used={used}: {result:?}");
    }
}

#[test]
fn vm_new_campaign_cannot_claim_existing_participants_or_completions() {
    for participants in [true, false] {
        let mut setup = make_setup(true, false);
        let owner = setup.owner.clone();
        let tx = transaction(&mut setup, &owner, true, false);
        assert!(setup.context.verify_tx(&tx, 200_000_000).is_ok());
        let current =
            mol::CampaignData::from_slice(&tx.outputs_data().get(0).unwrap().raw_data()).unwrap();
        let one = mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap();
        let next = if participants {
            current.clone().as_builder().participants_count(one).build()
        } else {
            current.clone().as_builder().total_completions(one).build()
        };
        let changed = tx
            .as_advanced_builder()
            .set_outputs_data(vec![Bytes::from(next.as_slice().to_vec()).pack()])
            .build();
        assert!(setup.context.verify_tx(&changed, 200_000_000).is_err());
    }
}
