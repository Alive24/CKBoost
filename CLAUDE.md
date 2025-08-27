# Task Master AI - Claude Code Integration Guide

## Essential Commands

### Core Workflow Commands

```bash
# Project Setup
task-master init                                    # Initialize Task Master in current project
task-master parse-prd .taskmaster/docs/prd.txt      # Generate tasks from PRD document
task-master models --setup                        # Configure AI models interactively

# Daily Development Workflow
task-master list                                   # Show all tasks with status
task-master next                                   # Get next available task to work on
task-master show <id>                             # View detailed task information (e.g., task-master show 1.2)
task-master set-status --id=<id> --status=done    # Mark task complete

# Task Management
task-master add-task --prompt="description" --research        # Add new task with AI assistance
task-master expand --id=<id> --research --force              # Break task into subtasks
task-master update-task --id=<id> --prompt="changes"         # Update specific task
task-master update --from=<id> --prompt="changes"            # Update multiple tasks from ID onwards
task-master update-subtask --id=<id> --prompt="notes"        # Add implementation notes to subtask

# Analysis & Planning
task-master analyze-complexity --research          # Analyze task complexity
task-master complexity-report                      # View complexity analysis
task-master expand --all --research               # Expand all eligible tasks

# Dependencies & Organization
task-master add-dependency --id=<id> --depends-on=<id>       # Add task dependency
task-master move --from=<id> --to=<id>                       # Reorganize task hierarchy
task-master validate-dependencies                            # Check for dependency issues
task-master generate                                         # Update task markdown files (usually auto-called)
```

## Key Files & Project Structure

### Core Files

- `.taskmaster/tasks/tasks.json` - Main task data file (auto-managed)
- `.taskmaster/config.json` - AI model configuration (use `task-master models` to modify)
- `.taskmaster/docs/prd.txt` - Product Requirements Document for parsing
- `.taskmaster/tasks/*.txt` - Individual task files (auto-generated from tasks.json)
- `.env` - API keys for CLI usage

### Claude Code Integration Files

- `CLAUDE.md` - Auto-loaded context for Claude Code (this file)
- `.claude/settings.json` - Claude Code tool allowlist and preferences
- `.claude/commands/` - Custom slash commands for repeated workflows
- `.mcp.json` - MCP server configuration (project-specific)

### Directory Structure

```
project/
├── .taskmaster/
│   ├── tasks/              # Task files directory
│   │   ├── tasks.json      # Main task database
│   │   ├── task-1.md      # Individual task files
│   │   └── task-2.md
│   ├── docs/              # Documentation directory
│   │   ├── prd.txt        # Product requirements
│   ├── reports/           # Analysis reports directory
│   │   └── task-complexity-report.json
│   ├── templates/         # Template files
│   │   └── example_prd.txt  # Example PRD template
│   └── config.json        # AI models & settings
├── .claude/
│   ├── settings.json      # Claude Code configuration
│   └── commands/         # Custom slash commands
├── .env                  # API keys
├── .mcp.json            # MCP configuration
└── CLAUDE.md            # This file - auto-loaded by Claude Code
```

## MCP Integration

Task Master provides an MCP server that Claude Code can connect to. Configure in `.mcp.json`:

```json
{
  "mcpServers": {
    "task-master-ai": {
      "command": "npx",
      "args": ["-y", "--package=task-master-ai", "task-master-ai"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here",
        "PERPLEXITY_API_KEY": "your_key_here",
        "OPENAI_API_KEY": "OPENAI_API_KEY_HERE",
        "GOOGLE_API_KEY": "GOOGLE_API_KEY_HERE",
        "XAI_API_KEY": "XAI_API_KEY_HERE",
        "OPENROUTER_API_KEY": "OPENROUTER_API_KEY_HERE",
        "MISTRAL_API_KEY": "MISTRAL_API_KEY_HERE",
        "AZURE_OPENAI_API_KEY": "AZURE_OPENAI_API_KEY_HERE",
        "OLLAMA_API_KEY": "OLLAMA_API_KEY_HERE"
      }
    }
  }
}
```

### Essential MCP Tools

```javascript
help; // = shows available taskmaster commands
// Project setup
initialize_project; // = task-master init
parse_prd; // = task-master parse-prd

// Daily workflow
get_tasks; // = task-master list
next_task; // = task-master next
get_task; // = task-master show <id>
set_task_status; // = task-master set-status

// Task management
add_task; // = task-master add-task
expand_task; // = task-master expand
update_task; // = task-master update-task
update_subtask; // = task-master update-subtask
update; // = task-master update

// Analysis
analyze_project_complexity; // = task-master analyze-complexity
complexity_report; // = task-master complexity-report
```

## Claude Code Workflow Integration

### Standard Development Workflow

#### 1. Project Initialization

```bash
# Initialize Task Master
task-master init

# Create or obtain PRD, then parse it
task-master parse-prd .taskmaster/docs/prd.txt

# Analyze complexity and expand tasks
task-master analyze-complexity --research
task-master expand --all --research
```

If tasks already exist, another PRD can be parsed (with new information only!) using parse-prd with --append flag. This will add the generated tasks to the existing list of tasks..

#### 2. Daily Development Loop

```bash
# Start each session
task-master next                           # Find next available task
task-master show <id>                     # Review task details

# During implementation, check in code context into the tasks and subtasks
task-master update-subtask --id=<id> --prompt="implementation notes..."

# Complete tasks
task-master set-status --id=<id> --status=done
```

#### 3. Multi-Claude Workflows

For complex projects, use multiple Claude Code sessions:

```bash
# Terminal 1: Main implementation
cd project && claude

# Terminal 2: Testing and validation
cd project-test-worktree && claude

# Terminal 3: Documentation updates
cd project-docs-worktree && claude
```

### Custom Slash Commands

Create `.claude/commands/taskmaster-next.md`:

```markdown
Find the next available Task Master task and show its details.

Steps:

1. Run `task-master next` to get the next task
2. If a task is available, run `task-master show <id>` for full details
3. Provide a summary of what needs to be implemented
4. Suggest the first implementation step
```

Create `.claude/commands/taskmaster-complete.md`:

```markdown
Complete a Task Master task: $ARGUMENTS

Steps:

1. Review the current task with `task-master show $ARGUMENTS`
2. Verify all implementation is complete
3. Run any tests related to this task
4. Mark as complete: `task-master set-status --id=$ARGUMENTS --status=done`
5. Show the next available task with `task-master next`
```

## Tool Allowlist Recommendations

Add to `.claude/settings.json`:

```json
{
  "allowedTools": [
    "Edit",
    "Bash(task-master *)",
    "Bash(git commit:*)",
    "Bash(git add:*)",
    "Bash(npm run *)",
    "mcp__task_master_ai__*"
  ]
}
```

## Configuration & Setup

### API Keys Required

At least **one** of these API keys must be configured:

- `ANTHROPIC_API_KEY` (Claude models) - **Recommended**
- `PERPLEXITY_API_KEY` (Research features) - **Highly recommended**
- `OPENAI_API_KEY` (GPT models)
- `GOOGLE_API_KEY` (Gemini models)
- `MISTRAL_API_KEY` (Mistral models)
- `OPENROUTER_API_KEY` (Multiple models)
- `XAI_API_KEY` (Grok models)

An API key is required for any provider used across any of the 3 roles defined in the `models` command.

### Model Configuration

```bash
# Interactive setup (recommended)
task-master models --setup

# Set specific models
task-master models --set-main claude-3-5-sonnet-20241022
task-master models --set-research perplexity-llama-3.1-sonar-large-128k-online
task-master models --set-fallback gpt-4o-mini
```

## Task Structure & IDs

### Task ID Format

- Main tasks: `1`, `2`, `3`, etc.
- Subtasks: `1.1`, `1.2`, `2.1`, etc.
- Sub-subtasks: `1.1.1`, `1.1.2`, etc.

### Task Status Values

- `pending` - Ready to work on
- `in-progress` - Currently being worked on
- `done` - Completed and verified
- `deferred` - Postponed
- `cancelled` - No longer needed
- `blocked` - Waiting on external factors

### Task Fields

```json
{
  "id": "1.2",
  "title": "Implement user authentication",
  "description": "Set up JWT-based auth system",
  "status": "pending",
  "priority": "high",
  "dependencies": ["1.1"],
  "details": "Use bcrypt for hashing, JWT for tokens...",
  "testStrategy": "Unit tests for auth functions, integration tests for login flow",
  "subtasks": []
}
```

## Claude Code Best Practices with Task Master

### Context Management

- Use `/clear` between different tasks to maintain focus
- This CLAUDE.md file is automatically loaded for context
- Use `task-master show <id>` to pull specific task context when needed

### Iterative Implementation

1. `task-master show <subtask-id>` - Understand requirements
2. Explore codebase and plan implementation
3. `task-master update-subtask --id=<id> --prompt="detailed plan"` - Log plan
4. `task-master set-status --id=<id> --status=in-progress` - Start work
5. Implement code following logged plan
6. `task-master update-subtask --id=<id> --prompt="what worked/didn't work"` - Log progress
7. `task-master set-status --id=<id> --status=done` - Complete task

### Complex Workflows with Checklists

For large migrations or multi-step processes:

1. Create a markdown PRD file describing the new changes: `touch task-migration-checklist.md` (prds can be .txt or .md)
2. Use Taskmaster to parse the new prd with `task-master parse-prd --append` (also available in MCP)
3. Use Taskmaster to expand the newly generated tasks into subtasks. Consdier using `analyze-complexity` with the correct --to and --from IDs (the new ids) to identify the ideal subtask amounts for each task. Then expand them.
4. Work through items systematically, checking them off as completed
5. Use `task-master update-subtask` to log progress on each task/subtask and/or updating/researching them before/during implementation if getting stuck

### Git Integration

Task Master works well with `gh` CLI:

```bash
# Create PR for completed task
gh pr create --title "Complete task 1.2: User authentication" --body "Implements JWT auth system as specified in task 1.2"

# Reference task in commits
git commit -m "feat: implement JWT auth (task 1.2)"
```

### Parallel Development with Git Worktrees

```bash
# Create worktrees for parallel task development
git worktree add ../project-auth feature/auth-system
git worktree add ../project-api feature/api-refactor

# Run Claude Code in each worktree
cd ../project-auth && claude    # Terminal 1: Auth work
cd ../project-api && claude     # Terminal 2: API work
```

## Troubleshooting

### AI Commands Failing

```bash
# Check API keys are configured
cat .env                           # For CLI usage

# Verify model configuration
task-master models

# Test with different model
task-master models --set-fallback gpt-4o-mini
```

### MCP Connection Issues

- Check `.mcp.json` configuration
- Verify Node.js installation
- Use `--mcp-debug` flag when starting Claude Code
- Use CLI as fallback if MCP unavailable

### Task File Sync Issues

```bash
# Regenerate task files from tasks.json
task-master generate

# Fix dependency issues
task-master fix-dependencies
```

DO NOT RE-INITIALIZE. That will not do anything beyond re-adding the same Taskmaster core files.

## Important Notes

### AI-Powered Operations

These commands make AI calls and may take up to a minute:

- `parse_prd` / `task-master parse-prd`
- `analyze_project_complexity` / `task-master analyze-complexity`
- `expand_task` / `task-master expand`
- `expand_all` / `task-master expand --all`
- `add_task` / `task-master add-task`
- `update` / `task-master update`
- `update_task` / `task-master update-task`
- `update_subtask` / `task-master update-subtask`

### File Management

- Never manually edit `tasks.json` - use commands instead
- Never manually edit `.taskmaster/config.json` - use `task-master models`
- Task markdown files in `tasks/` are auto-generated
- Run `task-master generate` after manual changes to tasks.json

### Claude Code Session Management

- Use `/clear` frequently to maintain focused context
- Create custom slash commands for repeated Task Master workflows
- Configure tool allowlist to streamline permissions
- Use headless mode for automation: `claude -p "task-master next"`

### Multi-Task Updates

- Use `update --from=<id>` to update multiple future tasks
- Use `update-task --id=<id>` for single task updates
- Use `update-subtask --id=<id>` for implementation logging

### Research Mode

- Add `--research` flag for research-based AI enhancement
- Requires a research model API key like Perplexity (`PERPLEXITY_API_KEY`) in environment
- Provides more informed task creation and updates
- Recommended for complex technical tasks

---

_This guide ensures Claude Code has immediate access to Task Master's essential functionality for agentic development workflows._


## PRD-First Development Mandate\*\*

- **PRD is Always the Foundation**: No development work begins without a completed, high-quality PRD
- **PRD-Driven Discussions**: All technical discussions, feature planning, and implementation decisions must reference the PRD
- **Quality Gate**: PRD completion and approval is the mandatory first milestone before any coding begins
- **Single Source of Truth**: The PRD serves as the definitive reference for project scope, features, and technical approach

### PRD Template Structure

- PRD files should be store at docs/project-name.prd.txt
- Always use the standardized template format shown below
- Maintain strict separation between `<context>` and `<PRD>` sections
- Follow the exact section order and formatting specified

### Complete PRD Template

```markdown
<context>
# Overview
[Provide a high-level overview of your product here. Explain what problem it solves, who it's for, and why it's valuable.]

# Core Features

[List and describe the main features of your product. For each feature, include:

- What it does
- Why it's important
- How it works at a high level]

# User Experience

[Describe the user journey and experience. Include:

- User personas
- Key user flows
- UI/UX considerations]
  </context>
  <PRD>

# Technical Architecture

[Outline the technical implementation details:

- System components
- Data models
- APIs and integrations
- Infrastructure requirements]

# Development Roadmap

[Break down the development process into phases:

- MVP requirements
- Future enhancements
- Do not think about timelines whatsoever -- all that matters is scope and detailing exactly what needs to be build in each phase so it can later be cut up into tasks]

# Logical Dependency Chain

[Define the logical order of development:

- Which features need to be built first (foundation)
- Getting as quickly as possible to something usable/visible front end that works
- Properly pacing and scoping each feature so it is atomic but can also be built upon and improved as development approaches]

# Risks and Mitigations

[Identify potential risks and how they'll be addressed:

- Technical challenges
- Figuring out the MVP that we can build upon
- Resource constraints]

# Appendix

[Include any additional information:

- Research findings
- Technical specifications]
  </PRD>
```

### Mandatory PRD Development Workflow

- **Step 1: Product Design Discussion** - Collaborative exploration and vision refinement
- **Step 2: PRD Consolidation** - Create comprehensive PRD using template above
- **Step 3: PRD Quality Review** - Validate completeness and quality against checklist
- **Step 4: PRD Approval** - Formal sign-off before any development begins
- **Step 5: PRD-Driven Development** - All subsequent work references and builds upon the PRD

### PRD Quality Requirements

- **High-Quality Standard**: PRD must be comprehensive, detailed, and complete before development
- **No Shortcuts**: Never begin development with incomplete or draft PRDs
- **Stakeholder Alignment**: PRD must represent shared understanding among all project stakeholders
- **Technical Clarity**: Architecture and implementation approach must be clearly defined
- **Actionable Detail**: Features must be detailed enough to generate specific development tasks

### Product Design Discussion Phase

- **Start with Context Building**: Begin all product discussions by exploring the Overview, Core Features, and User Experience sections
- **Collaborative Exploration**: Engage in iterative discussions to refine product vision before technical planning
- **Key Discussion Areas**:
  - Problem definition and target audience identification
  - Feature prioritization and value proposition
  - User journey mapping and experience design
  - Market research and competitive analysis
- **Documentation Practice**: Take detailed notes during discussions but avoid premature PRD creation
- **Completion Criteria**: Discussion phase is complete only when all stakeholders have shared understanding

### PRD Consolidation Requirements

- **Template Adherence**: Use the exact template format shown above
- **Context Section (User-Facing)**:
  - `# Overview`: Clear problem statement, target audience, and value proposition
  - `# Core Features`: Detailed feature descriptions with importance and high-level functionality
  - `# User Experience`: User personas, key flows, and UI/UX considerations
- **PRD Section (Implementation-Focused)**:

  - `# Technical Architecture`: System components, data models, APIs, infrastructure
  - `# Development Roadmap`: Phase-based breakdown focused on scope, not timelines
  - `# Logical Dependency Chain`: Foundation-first approach with atomic, buildable features
  - `# Risks and Mitigations`: Technical challenges, MVP strategy, resource planning
  - `# Appendix`: Research findings and technical specifications

### Development Roadmap Guidelines

- **Scope-Focused Planning**: Emphasize feature scope and requirements over timeline estimates
- **No Timeline Estimates**: As stated in template - "Do not think about timelines whatsoever"
- **MVP-First Approach**: Define minimum viable product that delivers core value
- **Atomic Feature Design**: Each feature should be complete, testable, and buildable in isolation
- **Task-Ready Breakdown**: Detail features to the level where they can be converted into development tasks

### Logical Dependency Chain Requirements

- **Foundation-First**: Identify and prioritize infrastructure and core system components
- **Rapid Feedback Loop**: Prioritize getting a usable frontend working as quickly as possible
- **Atomic Development**: Ensure each feature can be built independently while supporting future enhancements
- **Build-Upon Strategy**: Design features to be incrementally improved as development progresses
- **Dependency Visualization**: Clearly identify which features must be completed before others can begin

### PRD-Driven Development Enforcement

- **All Code References PRD**: Every development decision should trace back to PRD specifications
- **Feature Scope Control**: No features outside PRD scope without formal PRD updates
- **Change Management**: PRD modifications require formal review and re-approval
- **Progress Tracking**: Development progress measured against PRD milestones and dependency chain
- **Documentation Alignment**: All technical documentation must align with PRD specifications

### File Organization Standards

- **Naming Convention**: Use descriptive names like `user-authentication.prd.txt` or `dashboard-analytics.prd.txt`
- **Location**: Store PRDs in a dedicated `docs/` directory or similar documentation folder
- **Version Control**: Include PRDs in version control for collaborative editing and history tracking
- **Accessibility**: PRD must be easily accessible to all team members throughout development

### Quality Assurance Checklist

```markdown
✅ Context section completed with all three required subsections
✅ PRD section includes all six required subsections  
✅ Development roadmap focuses on scope over timelines
✅ Logical dependency chain prioritizes foundation and rapid frontend
✅ Technical architecture aligns with identified features
✅ Risks and mitigations address MVP strategy
✅ Format exactly matches template above
✅ Features are broken down to task-convertible level
✅ All stakeholders have reviewed and approved PRD
✅ PRD provides sufficient detail for development team
```

### PRD Completion Gates

- **Completeness Gate**: All nine sections must be fully populated with substantive content
- **Quality Gate**: Content must meet high standard for clarity, detail, and actionability
- **Stakeholder Gate**: All relevant stakeholders must review and approve PRD
- **Technical Gate**: Development team must confirm PRD provides sufficient technical guidance
- **Ready Gate**: PRD must enable immediate task extraction and development planning

### Cross-Tool Compatibility

- **Tool-Agnostic Format**: PRDs should be readable and usable by any project management system
- **Plain Text Structure**: Use markdown-compatible formatting for maximum compatibility
- **Task Extraction Ready**: Write features at a granularity that allows any tool to convert them into actionable tasks
- **Documentation Standards**: Follow consistent formatting that works across different development workflows

### Mandatory Workflow Pattern

```markdown
1. **Product Design Discussion Phase** (REQUIRED FIRST)

   - Collaborative brainstorming and vision refinement
   - User research and competitive analysis
   - Feature prioritization and value mapping
   - Complete stakeholder alignment

2. **PRD Consolidation Phase** (REQUIRED SECOND)

   - Use template format above exactly
   - Complete all required sections with high quality
   - Focus on scope and atomic features
   - Pass all quality gates

3. **PRD Approval Phase** (REQUIRED THIRD)

   - Formal review by all stakeholders
   - Technical validation by development team
   - Final approval before any coding begins

4. **PRD-Driven Development Phase** (ONLY AFTER PRD COMPLETE)
   - Extract tasks from completed PRD
   - Set up project tracking referencing PRD
   - Begin implementation following dependency chain
   - All decisions reference PRD as source of truth
```

### Anti-Patterns to Avoid

```markdown
- ❌ Starting any development work before PRD completion and approval
- ❌ Creating PRDs without the product design discussion phase
- ❌ Accepting incomplete or low-quality PRDs as "good enough"
- ❌ Making feature decisions that aren't grounded in the PRD
- ❌ Modifying scope without formal PRD updates
- ❌ Including timeline estimates in the development roadmap
- ❌ Skipping the logical dependency chain analysis
- ❌ Creating features that cannot be built atomically
- ❌ Proceeding with unclear or ambiguous PRD sections
```


## Quest Submission System Architecture (In Progress)

### Overview
The quest submission system enables users to submit quest completions to their own UserData cells, with campaign admins approving submissions by adding user type_ids to the quest's `accepted_submission_user_type_ids` field.

### Key Components

#### Contract Layer (ckboost-user-type)
- **SSRI Methods**: `submit_quest`, `verify_submit_quest` 
- **UserData Cell**: Stores user verification data and submission records
- **ConnectedTypeID**: Links user cells to protocol with type_id for O(1) lookups
- **Validation Recipes**: Ensures proper user cell updates and submission data integrity

#### dApp Infrastructure
- **user-cells.ts**: Cell fetching and type_id extraction utilities
- **user-service.ts**: Business logic for submissions and user data management
- **user-provider.tsx**: React context for User SSRI instance and state
- **SSRI User Class**: TypeScript interface for contract interactions

#### Data Flow
1. User submits quest completion → Updates UserData cell with submission record
2. Submission includes: campaign_type_hash, quest_id, timestamp, content
3. Admin reviews submissions → Fetches user submissions by type_id
4. Admin approves → Updates campaign cell's quest.accepted_submission_user_type_ids
5. User verification → Check if user type_id is in accepted list

### Implementation Status
- ✅ Schema updated: `accepted_submission_lock_hashes` → `accepted_submission_user_type_ids`
- 🔄 Contract framework: Implementing SSRI methods in ckboost-user-type
- 🔄 dApp framework: Creating user services and providers
- ⏳ UI Integration: Adding submission tabs to campaign pages
- ⏳ Admin approval: Implementing type_id based approval workflow

## CKB dApp / Smart Contract Development Guidelines

### Core Development Principles
- **Visual Prototyping First**: Use v0.dev for visual prototyping and start from the corresponding code downloaded.
    - Use @ckb-ccc/connector-react as the global wallet connector
- **Smart Contract Design Second**: With visual prototype indicator the businesses, build cell data structure design and transaction Skeleton.
- **Test-driven Design Third**: With transaction skeletons, we should start to build integration tests to set the expected behaviors and boundaries for the whole project.

### Critical Type System Guidelines

- **USE GENERATED TYPES**: Always use types generated from Molecule schema - NEVER create duplicate type definitions
  - Import from `ckboost_shared::types` in contracts (e.g., `UserData`, `CampaignData`, `ConnectedTypeID`)
  - Import from `ssri-ckboost` package in dApp (includes both exact types and `Like` types for flexibility)
  - Generated types ensure binary compatibility and prevent serialization errors
- **ConnectedTypeID Pattern**: Campaign and user cells (NOT protocol) use ConnectedTypeID args containing:
  - `type_id`: Unique identifier for O(1) cell lookups (32 bytes)
  - `connected_key`: Protocol type hash for validation (32 bytes)
- **Type Script Args**: Always validate and parse args as ConnectedTypeID for campaign/user cells, standard type_id for protocol cell

### SSRI Method Patterns

#### SSRI Architecture Understanding
SSRI (Smart contract State Rent Interface) separates transaction building from validation:

1. **SSRI Methods (Off-chain in SSRI-VM)**:
   - Methods like `create_campaign`, `submit_quest`, `update_user`
   - Run in SSRI-VM to help dApp build valid transactions
   - Accept `Option<Transaction>` to enable composition
   - Return complete `Transaction` objects with proper inputs/outputs
   - Do NOT perform validation - only construct transactions
   - Located in `src/modules.rs` files implementing the SSRI trait

2. **Verify Methods (On-chain in Contract)**:
   - Methods like `verify_create_campaign`, `verify_submit_quest`, `verify_update_user`
   - Run on-chain in the actual contract (Type Script)
   - Validate the transaction according to business rules defined in recipes
   - Use Recipe Pattern for validation rules (`src/recipes.rs`)
   - Called from `src/fallback.rs` when matching method paths
   - Return success/error based on validation

#### Key Points:
- **Transaction Building**: SSRI methods build transactions off-chain in SSRI-VM
- **Validation**: Verify methods validate transactions on-chain in contracts
- **Separation of Concerns**: Building (off-chain) vs Validation (on-chain)
- **Recipe Pattern**: Validation rules defined in recipes are used by verify methods
- **No Double Validation**: SSRI methods don't validate because validation happens on-chain


### dApp Service Layer Architecture
- **Cell Fetching Pattern**: Create dedicated `*-cells.ts` files for each cell type:
  - `fetchByTypeId()`: O(1) lookup using type_id from ConnectedTypeID
  - `fetchByTypeHash()`: Fallback O(n) search when type_id unknown
  - `extractTypeId()`: Helper to get type_id from cell's ConnectedTypeID args
- **Service Layer**: Create `*-service.ts` for business logic:
  - Encapsulate SSRI trait calls
  - Handle transaction building and signing
  - Manage state updates and error handling
- **Provider Pattern**: Use React Context providers for global state:
  - Manage SSRI trait instances
  - Cache cell data with appropriate invalidation
  - Provide hooks for component consumption

### Cell Data Structure Design
Follow established patterns for common Cell structures:

**CKBoost Cell Pattern with ConnectedTypeID**:
```yaml
data:
    <molecule_encoded_data>  # UserData or CampaignData
type:
    code_hash: ckboost-*-type contract
    args: <ConnectedTypeID>
      type_id: <32 bytes>  # Unique identifier for O(1) lookup
      connected_key: <32 bytes>  # Protocol reference
lock:
    code: <owner lock>
    args: <owner lock args>
    rules: <standard lock rules>
```

### Custom Cell Data Structures with Molecule Schema
For custom Cell data structures, use Molecule Schema format. Always use the shared schema definitions:

```mol
# Import shared definitions - DO NOT DUPLICATE
import blockchain;

# Use existing types for consistency
table UserData {
    verification_data: UserVerificationData,
    total_points_earned: Uint32,
    last_activity_timestamp: Uint64,
    submission_records: UserSubmissionRecordVec,
}
```
If defining multiple schema, share the base definitions.

Also use build.rs to ensure identical generated content.

Example: 
```rust
use std::process::Command;
use std::fs;

fn main() {
    let output = Command::new("sh")
        .arg("-c")
        .arg("cd ../../ && moleculec --language rust --schema-file schemas/ckboost.mol")
        .output()
        .expect("failed to execute process");

    if !output.status.success() {
        panic!("moleculec failed: {}", String::from_utf8_lossy(&output.stderr));
    }

    fs::write("src/generated/ckboost.rs", &output.stdout).expect("Unable to write file");
} 
```

### Error Handling Best Practices

- **Contract Errors**: Use the shared `Error` enum from `ckboost_shared::Error`
- **dApp Errors**: Provide meaningful error messages with context for debugging
- **Type Validation**: Always validate ConnectedTypeID parsing before using type_id
- **Transaction Failures**: Handle both signing failures and on-chain execution errors
- **Cell Not Found**: Implement graceful fallbacks when cells don't exist yet

### Testing Strategy

- **Contract Tests**: Use the existing test framework in contracts/tests
- **Integration Tests**: Test complete transaction flows with mock cells
- **Type Compatibility**: Always test Molecule serialization/deserialization roundtrips
- **O(1) Lookups**: Verify type_id based fetching works correctly
- **Edge Cases**: Test with empty submissions, duplicate submissions, invalid type_ids

### Transaction Skeleton/Recipe Design Pattern
When designing transactions, use this YAML template structure:

```yaml
Inputs:
  input-cell:
    lock: <lock-script-name>
      args: <args explanation>
      rules: <Lock Script validation requirements in list>
    type: <type-script-name>
      args: <ConnectedTypeID with type_id and connected_key>
      rules: <Type Script validation requirements in list>
    data: <Molecule-encoded data structure>
    capacity: <required Occupied Capacity if not specified>

Outputs:
  output-cell:
    lock: <lock-script-name>
      args: <args explanation>
      rules: <Lock Script validation requirements in list>
    type: <type-script-name>  
      args: <ConnectedTypeID - same as input for updates>
      rules: <Type Script validation requirements in list>
    data: <Updated Molecule-encoded data>

HeaderDeps:
  header-dep:
    <required relationship between HeaderDep and Cell>

CellDeps:
  dep-alias:
    <required relationship between dependent Cells>

Witnesses:
  0: <Transaction recipe with SSRI method name>
```

We can simplify in prototyping phase (omit common witnesses, code CellDeps, change cells) but validate in actual implementation.

## Architecture

We would try our best use serverless architecture by doing the following:

- Host dApp on Netlify, and use Netlify Function to serve as public API triggerable manually or with Cloudflare workers
- Store almost all data on chain, and use local storage or Neon serverless database for cases that it can optimize performance or user experience, but all data fundamentally relevant to business should be stored on chain. Design CRUD process based on the features of blockchain, e.g: You don't need to store complete history if a reference to a transaction is enough.

### Typical folder structure

- **contracts**: As created by scaffold template
- **dapp**: As downloaded from v0.dev
- **docs**: Include transaction skeletons (recipes), external docs, and PRD file.

### Code Generations

Molecule generates code for Molecule Schema. Don't edit the generated code, but use it as a reference. If implementing, do it in other files.
- Please use make build to build