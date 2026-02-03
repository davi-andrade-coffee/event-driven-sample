
const path = require('app-root-path');
let eventTypes = require(path + '/business/pbx/report/EventTypes');
const realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
const realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const socketPbxBL = require(path + '/business/pbx/SocketPbxBL');
const { hasAnotherCall } = require(path + '/library/HasAnotherCall');

const updateAgentStatusAfterRemovingCall = async (branch_number, client_id, call_id) => {
    const socket_pbx_bl = new socketPbxBL();

    const agentIsOnCall = await hasAnotherCall({id_cliente_externo: client_id}, {branch_number}, {call_id});
    if (agentIsOnCall) return;

    const agent = await realtimeAgentReportPbxModel.findOne({'client_id': client_id, 'branch_number': branch_number}).lean();

    const $setAgent = {}
    if (agent.login_state === 'true' || agent.login_state === true) {
        if (agent.pause_state === true || agent.pause_state === 'true') {
            $setAgent.state = 'pause';
            $setAgent.lazy_time = undefined;
        } else {
            $setAgent.state = 'free';
            $setAgent.lazy_time = new Date();
        }
    } else {
        $setAgent.state = agent.state = 'desconnected';
        $setAgent.logout = agent.logout = new Date();
        $setAgent.lazy_time = agent.lazy_time = undefined;
    }

    await realtimeAgentReportPbxModel.updateOne({
        "client_id": client_id,
        "branch_number": agent.branch_number
    }, {
        "$set": $setAgent
    });
    socket_pbx_bl.ReportRealtimeEvent(client_id, { queues: [], agents: [branch_number], client_id: client_id });
}

const removeQueueCallsReport = async (queue_id, call_id, client_id) => {
    let socket_pbx_bl = new socketPbxBL();
    await realtimeQueueReportPbxModel
        .updateOne({ queue_id, client_id }, {
            "$pull": {"calls.waiting": {"call_id": call_id}}
        });
    await realtimeQueueReportPbxModel
        .updateOne({ queue_id, client_id }, {
            "$pull": {"calls.attendance": {"call_id": call_id}}
        });
    socket_pbx_bl.ReportRealtimeEvent(client_id, { queues: [queue_id], agents: [], client_id });
};

const eventValidator = async (queue_id, call_id, client_id, branch_number) => {
    setTimeout(() => {
        removeQueueCallsReport(queue_id, call_id, client_id)
        updateAgentStatusAfterRemovingCall(branch_number, client_id, call_id)
    }, global.eventValidateTimeout || 1000 * 60 * 60 * 2)
};


module.exports = {eventValidator};
