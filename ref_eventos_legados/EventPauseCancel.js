/**
 * Classe -> EventPauseCancel
 * @desc: processamento de evento de cancelamento de pausa
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const realtimeActions = require(path + '/business/pbx/report/RealtimeActions');

/**
 * Contrutora da classe de EventPauseCancel
 * @constructor
 */
function EventPauseCancel() {
    local = this;
}

EventPauseCancel.prototype.EventPauseCancelRealTime = EventPauseCancelRealTime;
module.exports = EventPauseCancel;

/**
 * Processa evento de pausa cancelada no realtime.
 * @param $event
 * @returns {*}
 * @constructor
 */
async function EventPauseCancelRealTime($event) {

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
        }, {"$pull": {'total_pause_scheduled': agent.branch_number}});
    final_return.queues.push($event.id_ext_fila);

    const $setAux = {};
    if(agent && ("" + $event.sequence_id) === "1" && agent.login_state === true && agent.pause_state === false) {
        $setAux.schedule_pause_state = false;
        $setAux.sip_connection_state_date = null;
        $setAux.sip_date_of_first_status = null;
        $setAux.sip_status_attempt = 0;
    }

    await realtimeAgentReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': $event.originador
    }, {
        "$set": $setAux,
        "$pull": {"schedule_paused_queues": {"queue_id": $event.id_ext_fila}}
    });
    if ($event.last_sequence === true || $event.last_sequence == "true") final_return.agents.push($event.originador);

    return final_return;
}
