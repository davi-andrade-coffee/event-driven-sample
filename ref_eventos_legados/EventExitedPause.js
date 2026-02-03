/**
 * Classe -> EventExitedPause
 * @desc: processamento de enventos de SAIUPAUSA
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
 * Contrutora da classe de EventExitedPause
 * @constructor
 */
function EventExitedPause() {
    local = this;
}

EventExitedPause.prototype.EventExitedPauseRealTime = EventExitedPauseRealTime;
module.exports = EventExitedPause;

/**
 * Obtém dados do pbx em tempo real
 * @param $client
 * @returns {Promise|*}
 * @constructor
 */
async function EventExitedPauseRealTime($event) {
    //log realtime
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();
    if(!queue) return final_return;

    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();
    if (!agent) return final_return;

    let agent_aux = {
        sip_connection_state_date: null,
        sip_status_attempt: 0,
        sip_date_of_first_status: null,
    };

    let update_status_branch = false;
    if(
        agent.login_state === true && agent.pause_state === true &&
        ($event.data4 === false || $event.data4 === "false") && ("" + $event.sequence_id) === "1") {
        var aux_lazy_time = new Date();
        var aux_time_total_pause = 0;
        if (agent.time_total_pause) {
            aux_time_total_pause = agent.time_total_pause;
        }
        if (agent.pause && agent.login && (new Date(agent.pause)).getTime() > (new Date(agent.login)).getTime()) {
            console.log(new Date(agent.pause) + " type off: " + typeof new Date(agent.pause));
            aux_time_total_pause += Number($event.id_ligacao) - ((new Date(agent.pause)).getTime() / 1000);
        }
        update_status_branch = true;
        // if (agent.state !== 'ringing' && agent.state !== 'occupied') agent_aux.state = 'free';
        agent_aux.pause_state = false;
        agent_aux.active_pause_state = false;
        agent_aux.schedule_pause_state = false;
        agent_aux.lazy_time = aux_lazy_time;
        agent_aux.time_total_pause = aux_time_total_pause;
        agent_aux.pause = undefined;
        agent_aux.reason_pause = undefined;
    }

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
    }, {
        "$addToSet": {
            'total_available': agent.branch_number
        },
        "$pull": {
            'total_pause': agent.branch_number
        }
    });
    final_return.queues.push($event.id_ext_fila);

    await realtimeAgentReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': $event.originador
    }, {
        "$set": agent_aux,
        "$pull": {"paused_queues": {"queue_id": $event.id_ext_fila}}
    });

    if(update_status_branch) {
        await UpdateStatusAgent.updateAgentStateUnlessBlacklisted(
            $event.originador,
            $event.id_cliente_externo,
            'free',
            ['ringing', 'occupied']
        )
    }
    if ((("" + $event.sequence_id) === "1")) final_return.agents.push($event.originador);

    return final_return;
}
