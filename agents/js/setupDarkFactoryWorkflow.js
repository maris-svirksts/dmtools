/**
 * Setup Dark Factory Workflow
 *
 * Configures a target Jira project with the Dark Factory workflow by:
 *   1. Copying issue types from source project (default: MYTUBE)
 *   2. Syncing workflow statuses from source project (Backlog, In Development, In Testing, etc.)
 *   3. Creating an "Intake" Epic ticket as the entry point for new work
 *
 * Usage: run via jsrunner job, e.g.:
 *   ./dmtools.sh run agents/setup_dark_factory_workflow.json
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.jobParams - Job-level parameters
 * @param {string} params.jobParams.targetProjectKey - Key of the project to configure (required)
 * @param {string} [params.jobParams.sourceProjectKey=MYTUBE] - Key of the source project to copy from
 */
function action(params) {
    const jobParams = params.jobParams || {};
    const targetProjectKey = jobParams.targetProjectKey;
    const sourceProjectKey = jobParams.sourceProjectKey || 'MYTUBE';

    if (!targetProjectKey) {
        throw new Error('jobParams.targetProjectKey is required');
    }

    console.log('🚀 Setting up Dark Factory workflow');
    console.log('   Source : ' + sourceProjectKey);
    console.log('   Target : ' + targetProjectKey);

    const result = {
        success: false,
        sourceProject: sourceProjectKey,
        targetProject: targetProjectKey,
        steps: {}
    };

    // ── Step 1: Copy issue types ──────────────────────────────────────────────
    console.log('\n📌 Step 1: Copying issue types from ' + sourceProjectKey + ' to ' + targetProjectKey + '...');
    try {
        const raw = jira_copy_project_structure({
            sourceProjectKey: sourceProjectKey,
            targetProjectKey: targetProjectKey
        });
        const issueTypesResult = JSON.parse(raw);
        const issueTypes = issueTypesResult.issueTypes || [];
        const created = issueTypes.filter(function(t) { return t.status === 'created'; }).length;
        const exists  = issueTypes.filter(function(t) { return t.status === 'exists';  }).length;
        console.log('   ✅ Issue types — created: ' + created + ', already existed: ' + exists);
        result.steps.issueTypes = { created: created, alreadyExisted: exists, details: issueTypes };
    } catch (e) {
        console.error('   ❌ Failed to copy issue types: ' + e);
        result.steps.issueTypes = { error: String(e) };
        // Non-fatal — continue to workflow sync
    }

    // ── Step 2: Sync workflow statuses ────────────────────────────────────────
    console.log('\n🔄 Step 2: Syncing workflow statuses from ' + sourceProjectKey + ' to ' + targetProjectKey + '...');
    try {
        const raw = jira_sync_project_workflow({
            sourceProjectKey: sourceProjectKey,
            targetProjectKey: targetProjectKey
        });
        const workflowResult = JSON.parse(raw);
        console.log('   ✅ Workflow synced — ' + workflowResult.statusesSynced + ' statuses active, ' +
                    workflowResult.removedStatuses + ' removed');
        result.steps.workflow = {
            statusesSynced: workflowResult.statusesSynced,
            removedStatuses: workflowResult.removedStatuses,
            workflowId: workflowResult.workflowId
        };
    } catch (e) {
        console.error('   ❌ Failed to sync workflow: ' + e);
        result.steps.workflow = { error: String(e) };
        // Non-fatal — continue to ticket creation
    }

    // ── Step 3: Create "Intake" Epic ──────────────────────────────────────────
    console.log('\n🎯 Step 3: Creating Intake Epic in ' + targetProjectKey + '...');
    try {
        const intakeKey = jira_create_ticket_basic({
            project: targetProjectKey,
            issueType: 'Epic',
            summary: 'Intake',
            description: 'Dark factory intake epic — entry point for all incoming requests and new work items.'
        });
        console.log('   ✅ Created Epic: ' + intakeKey);
        result.steps.intakeEpic = { key: intakeKey };
    } catch (e) {
        console.error('   ❌ Failed to create Intake Epic: ' + e);
        result.steps.intakeEpic = { error: String(e) };
    }

    result.success = !result.steps.workflow.error && !result.steps.intakeEpic.error;

    console.log('\n' + (result.success ? '✅ Dark Factory workflow setup complete!' : '⚠️  Setup finished with errors — see steps above'));
    return result;
}
