/**
 * Classe -> EventBlock
 * @desc: processamento de evento de RECUSA
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const UpdateStatusAgent = require('../../../library/UpdateStatusAgent');

/**
 * Contrutora da classe de EventBlock
 * @constructor
 */
function EventBlock() {
    local = this;
}

EventBlock.prototype.EventBlockRealtime = EventBlockRealtime;
module.exports = EventBlock;

/**
 * Trata evento de bloqueio para o realtime.
 * @param $event
 * @returns {Promise.<TResult>}
 * @constructor
 */
async function EventBlockRealtime($event) {

    let final_return = {
        "client_id": $event.id_cliente_externo,
        "queues": [$event.id_ext_fila],
        "agents": [],
        "ivr": false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({
        "queue_id": $event.id_ext_fila,
        "client_id": $event.id_cliente_externo
    }).lean();
    if (!queue) return final_return;

    let agent = await realtimeAgentReportPbxModel.findOne({
        "client_id": $event.id_cliente_externo,
        "branch_number": $event.originador
    }).lean();
    if (!agent) return $event.id_cliente_externo;

    let $setAgent = {};
    final_return.agents.push($event.originador);

    agent.in_call = $setAgent.in_call = false;
    await realtimeAgentReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': agent.branch_number
    }, {
        "$set": $setAgent
    });

    await UpdateStatusAgent.setAgentState(agent.branch_number, $event.id_cliente_externo)

    return final_return;
}
