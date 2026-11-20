//! Shared campaign settings authorization, called by both the campaign type
//! recipe and the protocol lock. Submission approval is a separate operation.
use crate::{
    cell_collector::CellInfo,
    transaction_context::TransactionContext,
    types::{CampaignData, ConnectedTypeID, ProtocolData},
    Error,
};
use ckb_deterministic::cell_classifier::RuleBasedClassifier;
use ckb_std::ckb_types::packed::Script;
use ckb_std::{
    ckb_constants::Source,
    error::SysError,
    high_level::{load_cell_capacity, load_cell_lock_hash},
};
use molecule::prelude::{Builder, Entity};

fn is_admin(protocol: &ProtocolData, hash: &[u8]) -> bool {
    protocol
        .protocol_config()
        .admin_lock_hash_vec()
        .into_iter()
        .any(|item| item.as_slice() == hash)
}

fn is_organizer(protocol: &ProtocolData, hash: &[u8]) -> bool {
    // verified is profile information, not the authorization switch.
    protocol
        .endorsers_whitelist()
        .into_iter()
        .any(|item| item.endorser_lock_hash().as_slice() == hash)
}

fn connection(script: &Script) -> Result<ConnectedTypeID, Error> {
    let args = script.args().raw_data();
    if args.len() != 76 {
        return Err(Error::InvalidConnectedTypeId);
    }
    ConnectedTypeID::from_slice(&args).map_err(|_| Error::InvalidConnectedTypeId)
}

/// Resolve the exact protocol dependency bound by the campaign's type args.
pub fn campaign_protocol<'a>(
    context: &'a TransactionContext<RuleBasedClassifier>,
    campaign: &CellInfo,
) -> Result<(&'a CellInfo, ProtocolData), Error> {
    let campaign_type = campaign
        .type_script
        .as_ref()
        .ok_or(Error::InvalidCampaignData)?;
    let connected = connection(campaign_type)?;
    let deps = context
        .cell_deps
        .get_custom("protocol")
        .ok_or(Error::ProtocolCellNotFound)?;
    let protocol_cell = deps
        .iter()
        .find(|cell| {
            cell.type_hash.as_ref().map(|hash| hash.as_slice())
                == Some(connected.connected_key().as_slice())
        })
        .ok_or(Error::ProtocolCellNotFound)?;
    let protocol =
        ProtocolData::from_slice(&protocol_cell.data).map_err(|_| Error::InvalidProtocolData)?;
    if protocol
        .protocol_config()
        .script_code_hashes()
        .ckb_boost_campaign_type_code_hash()
        .as_slice()
        != campaign_type.code_hash().as_slice()
    {
        return Err(Error::InvalidCodeHash);
    }
    Ok((protocol_cell, protocol))
}

pub fn validate_campaign_settings(
    context: &TransactionContext<RuleBasedClassifier>,
) -> Result<(), Error> {
    let outputs = context
        .output_cells
        .get_custom("campaign")
        .ok_or(Error::CellCountViolation)?;
    if outputs.len() != 1 {
        return Err(Error::CellCountViolation);
    }
    let output = &outputs[0];
    let (protocol_cell, protocol) = campaign_protocol(context, output)?;
    let output_data =
        CampaignData::from_slice(&output.data).map_err(|_| Error::InvalidCampaignData)?;
    let output_lock = connection(&output.lock)?;
    let protocol_hash = protocol_cell.type_hash.ok_or(Error::ProtocolCellNotFound)?;
    if output.lock.code_hash().as_slice()
        != protocol
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_protocol_lock_code_hash()
            .as_slice()
        || output.lock.hash_type() != protocol_cell.lock.hash_type()
        || output_lock.connected_key().as_slice() != protocol_hash.as_slice()
    {
        return Err(Error::InvalidCampaignCreator);
    }
    let inputs = context.input_cells.get_custom("campaign");
    let input = match inputs {
        Some(cells) if cells.len() == 1 => Some(&cells[0]),
        Some(cells) if !cells.is_empty() => return Err(Error::CellCountViolation),
        _ => None,
    };
    let owner = output_lock.type_id();
    // Settings cannot be used as a second submission-approval endpoint.
    for (index, quest) in output_data.quests().into_iter().enumerate() {
        if output_data
            .quests()
            .into_iter()
            .take(index)
            .any(|previous| previous.quest_id().as_slice() == quest.quest_id().as_slice())
        {
            return Err(Error::InvalidQuestData);
        }
    }
    if let Some(input) = input {
        if input.lock_hash != output.lock_hash || input.type_hash != output.type_hash {
            return Err(Error::CellRelationshipRuleViolation);
        }
        let input_data =
            CampaignData::from_slice(&input.data).map_err(|_| Error::InvalidCampaignData)?;
        if input_data.total_completions().as_slice() != output_data.total_completions().as_slice()
            || input_data.participants_count().as_slice()
                != output_data.participants_count().as_slice()
        {
            return Err(Error::InvalidCampaignState);
        }
        for previous in input_data.quests() {
            let next = output_data
                .quests()
                .into_iter()
                .find(|quest| quest.quest_id().as_slice() == previous.quest_id().as_slice());
            let next = match next {
                Some(next) => next,
                None if previous.accepted_submission_user_type_ids().is_empty()
                    && previous.completion_count().as_slice() == [0u8; 4] =>
                {
                    continue
                }
                None => return Err(Error::InvalidQuestData),
            };
            if next.accepted_submission_user_type_ids().as_slice()
                != previous.accepted_submission_user_type_ids().as_slice()
                || next.completion_count().as_slice() != previous.completion_count().as_slice()
            {
                return Err(Error::InvalidQuestStatus);
            }
        }
        for quest in output_data.quests() {
            if !input_data
                .quests()
                .into_iter()
                .any(|previous| previous.quest_id().as_slice() == quest.quest_id().as_slice())
                && (!quest.accepted_submission_user_type_ids().is_empty()
                    || quest.completion_count().as_slice() != [0u8; 4])
            {
                return Err(Error::InvalidQuestData);
            }
        }
        let input_owner = connection(&input.lock)?.type_id();
        // Legacy endorsement metadata may differ from the actual lock owner.
        // Preserve that metadata; never use it as an ownership credential.
        if input_owner.as_slice() != owner.as_slice()
            || input_data.endorser_lock_hash().as_slice()
                != output_data.endorser_lock_hash().as_slice()
        {
            return Err(Error::InvalidCampaignCreator);
        }
        if context.input_cells.get_simple_ckb().iter().any(|cell| {
            is_admin(&protocol, &cell.lock_hash)
                || (cell.lock_hash.as_slice() == owner.as_slice()
                    && is_organizer(&protocol, &cell.lock_hash))
        }) {
            return Ok(());
        }
    } else if output_data.total_completions().as_slice() != [0u8; 4]
        || output_data.participants_count().as_slice() != [0u8; 4]
    {
        return Err(Error::InvalidCampaignState);
    } else if owner.as_slice() != output_data.endorser_lock_hash().as_slice() {
        return Err(Error::InvalidCampaignCreator);
    } else if output_data.quests().into_iter().any(|quest| {
        !quest.accepted_submission_user_type_ids().is_empty()
            || quest.completion_count().as_slice() != [0u8; 4]
    }) {
        return Err(Error::InvalidQuestData);
    } else if (is_admin(&protocol, owner.as_slice()) || is_organizer(&protocol, owner.as_slice()))
        && context
            .input_cells
            .get_simple_ckb()
            .iter()
            .any(|cell| cell.lock_hash.as_slice() == owner.as_slice())
    {
        return Ok(());
    }
    Err(Error::UnauthorizedOperation)
}

/// An Organizer's review authority comes from the actual INPUT campaign lock,
/// its configured protocol connection, and the current protocol whitelist.
/// Legacy endorsement metadata is deliberately not an ownership credential.
fn is_campaign_organizer_owner(
    protocol_cell: &CellInfo,
    protocol: &ProtocolData,
    campaign: &CellInfo,
    actor_hash: &[u8],
) -> bool {
    if !is_organizer(protocol, actor_hash)
        || campaign.lock.code_hash().as_slice()
            != protocol
                .protocol_config()
                .script_code_hashes()
                .ckb_boost_protocol_lock_code_hash()
                .as_slice()
        || campaign.lock.hash_type() != protocol_cell.lock.hash_type()
    {
        return false;
    }
    let owner = match connection(&campaign.lock) {
        Ok(owner) => owner,
        Err(_) => return false,
    };
    owner.type_id().as_slice() == actor_hash
        && protocol_cell
            .type_hash
            .as_ref()
            .map(|hash| hash.as_slice())
            == Some(owner.connected_key().as_slice())
}

/// Review uses INPUT campaign assignments and ownership. Existing admins may
/// review any campaign; current Organizers may review their own campaign; an
/// assigned reviewer may review only this campaign. OUTPUT assignments cannot
/// authorize the transaction that grants them.
pub fn validate_campaign_review(
    context: &TransactionContext<RuleBasedClassifier>,
) -> Result<(), Error> {
    let arguments = context.recipe.arguments();
    if arguments.len() != 3 {
        return Err(Error::InvalidArgumentCount);
    }
    let quest_argument = arguments.get(1).ok_or(Error::InvalidArgumentCount)?;
    let quest_id = quest_argument.data().raw_data();
    if quest_argument.arg_type().as_slice() != [0] || quest_id.len() != 4 {
        return Err(Error::InvalidArgumentCount);
    }
    let inputs = context
        .input_cells
        .get_custom("campaign")
        .ok_or(Error::CellCountViolation)?;
    let outputs = context
        .output_cells
        .get_custom("campaign")
        .ok_or(Error::CellCountViolation)?;
    if inputs.len() != 1 || outputs.len() != 1 {
        return Err(Error::CellCountViolation);
    }
    let input = &inputs[0];
    let output = &outputs[0];
    let (protocol_cell, protocol) = campaign_protocol(context, input)?;
    let before = CampaignData::from_slice(&input.data).map_err(|_| Error::InvalidCampaignData)?;
    let after = CampaignData::from_slice(&output.data).map_err(|_| Error::InvalidCampaignData)?;
    if !context.input_cells.get_simple_ckb().iter().any(|cell| {
        is_admin(&protocol, &cell.lock_hash)
            || is_campaign_organizer_owner(protocol_cell, &protocol, input, &cell.lock_hash)
            || before
                .staff_lock_hash_vec()
                .into_iter()
                .any(|hash| hash.as_slice() == cell.lock_hash.as_slice())
    }) {
        return Err(Error::UnauthorizedOperation);
    }
    if before.quests().len() != after.quests().len() {
        return Err(Error::InvalidQuestData);
    }
    let mut normalized_quests = alloc::vec::Vec::new();
    for (index, next) in after.quests().into_iter().enumerate() {
        let previous = before.quests().get(index).ok_or(Error::InvalidQuestData)?;
        if previous.quest_id().as_slice() != quest_id.as_ref() {
            if next.as_slice() != previous.as_slice() {
                return Err(Error::InvalidQuestData);
            }
            normalized_quests.push(previous);
            continue;
        }
        let normalized = next
            .as_builder()
            .accepted_submission_user_type_ids(previous.accepted_submission_user_type_ids())
            .completion_count(previous.completion_count())
            .build();
        if normalized.as_slice() != previous.as_slice() {
            return Err(Error::InvalidQuestData);
        }
        normalized_quests.push(previous);
    }
    let normalized = after
        .as_builder()
        .quests(crate::types::QuestDataVec::from(normalized_quests))
        .participants_count(before.participants_count())
        .total_completions(before.total_completions())
        .build();
    if normalized.as_slice() != before.as_slice() {
        return Err(Error::InvalidCampaignState);
    }
    Ok(())
}

/// The existing protocol's admins authorize whitelist/approval changes. Newly
/// added OUTPUT admins cannot authorize the transaction that adds themselves.
pub fn validate_protocol_settings(
    context: &TransactionContext<RuleBasedClassifier>,
    current_lock: &Script,
) -> Result<(), Error> {
    let inputs = context
        .input_cells
        .get_custom("protocol")
        .ok_or(Error::CellCountViolation)?;
    let outputs = context
        .output_cells
        .get_custom("protocol")
        .ok_or(Error::CellCountViolation)?;
    if inputs.len() != 1 || outputs.len() != 1 {
        return Err(Error::CellCountViolation);
    }
    let input = &inputs[0];
    let output = &outputs[0];
    let connection = connection(current_lock)?;
    if input.type_hash != output.type_hash
        || input.lock_hash != output.lock_hash
        || input.lock_hash.as_slice() != current_lock.calc_script_hash().as_slice()
        || input.type_hash.as_ref().map(|hash| hash.as_slice())
            != Some(connection.connected_key().as_slice())
    {
        return Err(Error::CellRelationshipRuleViolation);
    }
    let protocol = ProtocolData::from_slice(&input.data).map_err(|_| Error::InvalidProtocolData)?;
    if context
        .input_cells
        .get_simple_ckb()
        .iter()
        .any(|cell| is_admin(&protocol, &cell.lock_hash))
    {
        return Ok(());
    }
    Err(Error::UnauthorizedOperation)
}

/// ACP deposit branches do not prove control of a privileged actor. Require a
/// strict capacity spend across every input/output in its lock group, including
/// typed cells, in addition to an ordinary empty actor input.
fn actor_spends_capacity(hash: &[u8; 32]) -> Result<bool, Error> {
    fn total(hash: &[u8; 32], source: Source) -> Result<u128, Error> {
        let mut amount = 0u128;
        let mut index = 0;
        loop {
            match load_cell_lock_hash(index, source) {
                Ok(lock) if lock == *hash => {
                    amount = amount
                        .checked_add(u128::from(load_cell_capacity(index, source)?))
                        .ok_or(Error::Overflow)?
                }
                Ok(_) => {}
                Err(SysError::IndexOutOfBound) => break,
                Err(error) => return Err(error.into()),
            }
            index += 1;
        }
        Ok(amount)
    }
    Ok(total(hash, Source::Input)? > total(hash, Source::Output)?)
}

pub fn require_campaign_settings_actor_spend(
    context: &TransactionContext<RuleBasedClassifier>,
) -> Result<(), Error> {
    let output = context
        .output_cells
        .get_custom("campaign")
        .and_then(|cells| cells.first())
        .ok_or(Error::CampaignCellNotFound)?;
    let (_, protocol) = campaign_protocol(context, output)?;
    let owner = connection(&output.lock)?.type_id();
    let editing = context
        .input_cells
        .get_custom("campaign")
        .map(|cells| !cells.is_empty())
        .unwrap_or(false);
    for cell in context.input_cells.get_simple_ckb() {
        if !cell.data.is_empty() {
            continue;
        }
        let eligible = if editing {
            is_admin(&protocol, &cell.lock_hash)
                || (cell.lock_hash.as_slice() == owner.as_slice()
                    && is_organizer(&protocol, &cell.lock_hash))
        } else {
            cell.lock_hash.as_slice() == owner.as_slice()
        };
        if eligible && actor_spends_capacity(&cell.lock_hash)? {
            return Ok(());
        }
    }
    Err(Error::UnauthorizedOperation)
}

pub fn require_campaign_review_actor_spend(
    context: &TransactionContext<RuleBasedClassifier>,
) -> Result<(), Error> {
    let input = context
        .input_cells
        .get_custom("campaign")
        .and_then(|cells| cells.first())
        .ok_or(Error::CampaignCellNotFound)?;
    let (protocol_cell, protocol) = campaign_protocol(context, input)?;
    let campaign = CampaignData::from_slice(&input.data).map_err(|_| Error::InvalidCampaignData)?;
    for cell in context.input_cells.get_simple_ckb() {
        if cell.data.is_empty()
            && (is_admin(&protocol, &cell.lock_hash)
                || is_campaign_organizer_owner(protocol_cell, &protocol, input, &cell.lock_hash)
                || campaign
                    .staff_lock_hash_vec()
                    .into_iter()
                    .any(|hash| hash.as_slice() == cell.lock_hash.as_slice()))
            && actor_spends_capacity(&cell.lock_hash)?
        {
            return Ok(());
        }
    }
    Err(Error::UnauthorizedOperation)
}

pub fn require_protocol_actor_spend(
    context: &TransactionContext<RuleBasedClassifier>,
) -> Result<(), Error> {
    let input = context
        .input_cells
        .get_custom("protocol")
        .and_then(|cells| cells.first())
        .ok_or(Error::ProtocolCellNotFound)?;
    let protocol = ProtocolData::from_slice(&input.data).map_err(|_| Error::InvalidProtocolData)?;
    for cell in context.input_cells.get_simple_ckb() {
        if cell.data.is_empty()
            && is_admin(&protocol, &cell.lock_hash)
            && actor_spends_capacity(&cell.lock_hash)?
        {
            return Ok(());
        }
    }
    Err(Error::UnauthorizedOperation)
}
