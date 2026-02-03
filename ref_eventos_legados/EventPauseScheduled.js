/**
 * Classe -> EventPauseScheduled
 * @desc: processamento de evento de PAUSAAGENDADA
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
var socketPbxBL = require(path + '/business/pbx/SocketPbxBL');
const realtimeActions = require(path + '/business/pbx/report/RealtimeActions');

/**
 * Contrutora da classe de EventPauseScheduled
 * @constructor
 */
function EventPauseScheduled() {
    local = this;
}

EventPauseScheduled.prototype.EventPauseScheduledRealTime = EventPauseScheduledRealTime;
module.exports = EventPauseScheduled;

/**
 * Processa evento de pausa agenda no realtime.
 * @param $event
 * @returns {Promise|Promise.<TResult>|*}
 * @constructor
 */
async function EventPauseScheduledRealTime($event) {

    let final_return = {
        "client_id": $event.id_cliente_externo,
        "queues": [],
        "agents": [],
        "ivr": false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();
    if(!queue) queue = await realtimeActions.createQueue($event);

    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();
    if (!agent) return final_return;
    let agent_aux = {
        sip_connection_state_date: null,
        sip_status_attempt: 0,
        sip_date_of_first_status: null,
    };

    if(agent && ("" + $event.sequence_id) === "1" && agent.login_state === true && agent.pause_state === false) {
        agent_aux.schedule_pause_state = true;
        if(agent.schedule_paused_queues && agent.schedule_paused_queues.length > 0)
            if(agent.login > agent.schedule_paused_queues[0].pause_date) agent.schedule_paused_queues = [];

        final_return.agents.push($event.originador);
    }

    agent_aux.schedule_paused_queues = [...agent.schedule_paused_queues];
    agent_aux.schedule_paused_queues.push({"queue_id": $event.id_ext_fila, "pause_date": new Date()});
    await realtimeAgentReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': $event.originador
    }, {
        "$set": agent_aux
    });

    if (queue && !Array.isArray(queue.total_available)){
        await realtimeQueueReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila
        }, {
            "$set": {
                "total_available": []
            }
        });
    }
    if (queue && !Array.isArray(queue.total_logged)){
        await realtimeQueueReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila
        }, {
            "$set": {
                "total_logged": []
            }
        });
    }
    if (queue && !Array.isArray(queue.total_pause)) {
        await realtimeQueueReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila
        }, {
            "$set": {
                "total_pause": []
            }
        });
    }
    if (queue && !Array.isArray(queue.total_pause_scheduled)) {
        await realtimeQueueReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila
        }, {
            "$set": {
                "total_pause_scheduled": []
            }
        });
    }

    await realtimeQueueReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila
        }, {"$addToSet": {'total_pause_scheduled': agent.branch_number}});
    final_return.queues.push($event.id_ext_fila);

    if ($event.last_sequence === true || $event.last_sequence == "true") final_return.agents.push($event.originador);

    return final_return;
}
