
/**
 * Classe -> EventPause
 * @desc: processamento de evento de PAUSA
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const realtimeActions = require(path + '/business/pbx/report/RealtimeActions');
const UpdateStatusAgent = require('../../../library/UpdateStatusAgent');

/**
 * Contrutora da classe de EventPause
 * @constructor
 */
function EventPause() {
    local = this;
}

EventPause.prototype.EventPauseRealTime = EventPauseRealTime;
module.exports = EventPause;

/**
 * Processa evento de pausa do realtime.
 * @param $event
 * @returns {Promise|Promise.<TResult>|*}
 * @constructor
 */
async function EventPauseRealTime($event) {
    let final_return = {
        "client_id": $event.id_cliente_externo,
        "queues": [],
        "agents": [],
        "ivr": false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();
    if(!queue) queue = await realtimeActions.createQueue($event);

    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();
    if (!agent) agent = await realtimeActions.createAgent($event);

    let agent_aux = {
        sip_status_attempt: 0,
        sip_date_of_first_status: null,
        sip_connection_state_date: null

    };
    let aux_inc = {};
    let update_status_branch = false;
    aux_inc.quantity_pause = 0;
    if (
        agent.login_state === true && agent.pause_state === false &&
        ($event.data4 === false || $event.data4 === "false") &&
        ((("" + $event.sequence_id) === "1") || ($event.last_sequence === true || $event.last_sequence == "true"))
    ) {
        update_status_branch = true;
        // if (agent.state !== 'ringing' && agent.state !== 'occupied' && agent.state !== 'desconnected') agent_aux.state = 'pause';
        agent_aux.pause_state = true;
        agent_aux.active_pause_state = $event.data1 === '99';
        agent_aux.pause = new Date();
        agent_aux.reason_pause = $event.data1;
        if (("" + $event.sequence_id) === "1") {
            aux_inc.quantity_pause = 1;
            if (agent.paused_queues && agent.paused_queues.length > 0) {
                //Possivel erro de evento, correto seria ver pelo tempo do evento vs limpeza para saber se faz as adições ou não.
                if (agent.login > agent.paused_queues[0].pause_date) agent_aux.paused_queues = [{
                    "queue_id": $event.id_ext_fila,
                    "pause_date": new Date()
                }];
            }
        }
    }

    // agent_aux.paused_queues.push({"queue_id": $event.id_ext_fila, "pause_date": new Date()});
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

    const queryToUpdateQueue = {
        'client_id': $event.id_cliente_externo,
        'queue_id': $event.id_ext_fila
    }

    const valueToUpdateQueue = {
        "$pull": {
            "total_available": agent.branch_number,
        },
        "$addToSet": {
            "total_pause": agent.branch_number,
        }
    }

    const agent_with_schedule_pause = agent.schedule_paused_queues.find((paused) => paused.queue_id === $event.id_ext_fila);
    if (agent_with_schedule_pause) {
        valueToUpdateQueue["$pull"]["total_pause_scheduled"] = agent.branch_number;

        agent_aux.schedule_paused_queues = agent.schedule_paused_queues.filter((paused) => paused.queue_id !== $event.id_ext_fila);
    }
    if (agent.schedule_pause_state || (agent_with_schedule_pause && !agent_aux.schedule_paused_queues.length)) agent_aux.schedule_pause_state = false;

    await realtimeQueueReportPbxModel.updateOne(queryToUpdateQueue, valueToUpdateQueue);

    final_return.queues.push($event.id_ext_fila);
    await realtimeAgentReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': $event.originador
    }, {
        "$set": agent_aux,
        "$inc": aux_inc,
        ...(() => {
            if (agent_aux.paused_queues) return {}; return {"$push": {
                    "paused_queues": {
                        "queue_id": $event.id_ext_fila,
                        "pause_date": new Date()
                    }
                }};
        })()
    });

    if (update_status_branch) {
        await UpdateStatusAgent.updateAgentStateUnlessBlacklisted(
            $event.originador,
            $event.id_cliente_externo,
            'pause',
            ['ringing', 'occupied', 'desconnected']
        )
    }

    if ((("" + $event.sequence_id) === "1") || ($event.last_sequence === true || $event.last_sequence == "true")) final_return.agents.push($event.originador);

    return final_return;
}

