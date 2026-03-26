/**
 * Setup Dark Factory Workflow (Standalone)
 *
 * Configures a target Jira project with the Dark Factory workflow without
 * depending on any source project. All issue types and statuses are hardcoded.
 *
 * What it does:
 *   1. Creates issue types (Epic, Task, Story, Bug, Subtask, Test Case) if missing
 *   2. Sets up 20-status workflow matching the Dark Factory process
 *   3. Creates an "Intake" Epic ticket as the entry point for new work
 *
 * Usage:
 *   ./dmtools.sh run agents/setup_dark_factory_workflow_standalone.json
 *
 * @param {Object} params
 * @param {string} params.jobParams.targetProjectKey - Key of the project to configure (required)
 */
function action(params) {
    var jobParams = params.jobParams || {};
    var targetProjectKey = jobParams.targetProjectKey;

    if (!targetProjectKey) {
        throw new Error('jobParams.targetProjectKey is required');
    }

    console.log('🚀 Setting up Dark Factory workflow (standalone)');
    console.log('   Target : ' + targetProjectKey);

    // ── Hardcoded Dark Factory issue types ────────────────────────────────────
    var ISSUE_TYPES = [
        { name: 'Epic',      type: 'standard', description: 'Large body of work that can be broken down into stories or tasks.' },
        { name: 'Story',     type: 'standard', description: 'A requirement expressed from the user\'s perspective.' },
        { name: 'Task',      type: 'standard', description: 'A small piece of work.' },
        { name: 'Bug',       type: 'standard', description: 'A problem that needs fixing.' },
        { name: 'Subtask',   type: 'subtask',  description: 'Subtasks track small pieces of work that are part of a larger task.' },
        { name: 'Test Case', type: 'standard', description: 'A test case describing steps to verify functionality.' }
    ];

    // ── Hardcoded Dark Factory statuses (20 statuses) ─────────────────────────
    var STATUS_DEFINITIONS = JSON.stringify([
        { name: 'Backlog',                category: 'TODO'        },
        { name: 'Refinement',             category: 'TODO'        },
        { name: 'Ready For Development',  category: 'TODO'        },
        { name: 'BA Analysis',            category: 'TODO'        },
        { name: 'Solution Architecture',  category: 'TODO'        },
        { name: 'In Review',              category: 'TODO'        },
        { name: 'Bug To Fix',             category: 'TODO'        },
        { name: 'PO Review',              category: 'TODO'        },
        { name: 'Blocked',                category: 'TODO'        },
        { name: 'In Development',         category: 'IN_PROGRESS' },
        { name: 'In Testing',             category: 'IN_PROGRESS' },
        { name: 'In Review - Passed',     category: 'IN_PROGRESS' },
        { name: 'In Review - Failed',     category: 'IN_PROGRESS' },
        { name: 'In Rework',              category: 'IN_PROGRESS' },
        { name: 'Re-run',                 category: 'IN_PROGRESS' },
        { name: 'Merged',                 category: 'IN_PROGRESS' },
        { name: 'Ready For Testing',      category: 'IN_PROGRESS' },
        { name: 'Failed',                 category: 'IN_PROGRESS' },
        { name: 'Passed',                 category: 'DONE'        },
        { name: 'Done',                   category: 'DONE'        }
    ]);

    var result = {
        success: false,
        targetProject: targetProjectKey,
        steps: {}
    };

    // ── Step 1: Get target project details ────────────────────────────────────
    console.log('\n🔍 Step 1: Reading target project details...');
    var projectDetails;
    try {
        var raw = jira_get_project_details({ projectKey: targetProjectKey });
        projectDetails = typeof raw === 'string' ? JSON.parse(raw) : raw;
        console.log('   ✅ Project: ' + projectDetails.name + ' (id=' + projectDetails.id + ')');
    } catch (e) {
        throw new Error('Cannot read project ' + targetProjectKey + ': ' + e);
    }

    // ── Step 2: Create missing issue types ────────────────────────────────────
    console.log('\n📌 Step 2: Creating issue types...');

    var issueTypeResults = [];
    for (var i = 0; i < ISSUE_TYPES.length; i++) {
        var it = ISSUE_TYPES[i];
        try {
            var raw = jira_create_project_issue_type({
                projectKey: targetProjectKey,
                name: it.name,
                type: it.type,
                description: it.description
            });
            var res = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (res.status === 'created') {
                console.log('   ✅ Created: ' + it.name + ' (id=' + res.id + ')');
            } else {
                console.log('   ⏭  ' + it.name + ' — already exists');
            }
            issueTypeResults.push(res);
        } catch (e) {
            console.error('   ❌ Failed: ' + it.name + ' — ' + e);
            issueTypeResults.push({ name: it.name, status: 'failed', error: String(e) });
        }
    }
    var created_count = issueTypeResults.filter(function(r) { return r.status === 'created'; }).length;
    var exists_count  = issueTypeResults.filter(function(r) { return r.status === 'exists';  }).length;
    console.log('   Summary: ' + created_count + ' created, ' + exists_count + ' already existed');
    result.steps.issueTypes = { created: created_count, alreadyExisted: exists_count, details: issueTypeResults };

    // ── Step 3: Setup workflow with hardcoded statuses ────────────────────────
    console.log('\n🔄 Step 3: Setting up workflow statuses...');
    try {
        var wfRaw = jira_setup_project_workflow({
            projectKey: targetProjectKey,
            statusDefinitions: STATUS_DEFINITIONS
        });
        var wfResult = typeof wfRaw === 'string' ? JSON.parse(wfRaw) : wfRaw;
        console.log('   ✅ Workflow ready — ' + wfResult.statusesSynced + ' statuses active, ' +
                    wfResult.statusesCreated + ' newly created, ' + wfResult.removedStatuses + ' removed');
        result.steps.workflow = {
            statusesSynced: wfResult.statusesSynced,
            statusesCreated: wfResult.statusesCreated,
            removedStatuses: wfResult.removedStatuses,
            workflowId: wfResult.workflowId
        };
    } catch (e) {
        console.error('   ❌ Workflow setup failed: ' + e);
        result.steps.workflow = { error: String(e) };
    }

    // ── Step 4: Create "Intake" Epic ──────────────────────────────────────────
    console.log('\n🎯 Step 4: Creating Intake Epic...');
    try {
        var epicRaw = jira_create_ticket_basic({
            project: targetProjectKey,
            issueType: 'Epic',
            summary: 'Intake',
            description: 'Dark factory intake epic — entry point for all incoming requests and new work items.'
        });
        var epicResult = typeof epicRaw === 'string' ? JSON.parse(epicRaw) : epicRaw;
        var epicKey = epicResult.key || epicRaw;
        console.log('   ✅ Created Epic: ' + epicKey);
        result.steps.intakeEpic = { key: epicKey };
    } catch (e) {
        console.error('   ❌ Failed to create Intake Epic: ' + e);
        result.steps.intakeEpic = { error: String(e) };
    }

    result.success = !result.steps.workflow.error && !result.steps.intakeEpic.error;

    console.log('\n' + (result.success ? '✅ Dark Factory workflow setup complete!' : '⚠️  Setup finished with errors'));
    return result;
}
