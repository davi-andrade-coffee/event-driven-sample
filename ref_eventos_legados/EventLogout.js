/**
 * Classe -> EventLogout
 * @desc: processamento de evento de LOGOUT
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
 * Contrutora da classe de EventLogout
 * @constructor
 */
function EventLogout() {
    local = this;
}

EventLogout.prototype.EventLogoutRealTime = EventLogoutRealTime;
module.exports = EventLogout;

/**
 * Processa evento de logout do realtime.
 * @param $event
 * @param result
 * @returns {*}
 * @constructor
 */
async function EventLogoutRealTime($event) {
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();

    if(!queue) queue = await realtimeActions.createQueue($event);

    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();

    if (!agent) agent = await realtimeActions.createAgent($event);
    if (!agent) agent = { branch_number: $event.originador }; // caso o operador tenha sido deletedo do admin, ele não existirá no realtime e no pbx.clients
    if ($event.last_sequence === true || $event.last_sequence == "true") final_return.agents.push($event.originador);

    let agent_aux = {};
    let update_status_branch = false;
    if (agent.login_state === true &&
        ($event.data4 === false || $event.data4 === "false") &&
        ($event.last_sequence === true || $event.last_sequence == "true")) {
        // if (agent.state !== 'ringing' && agent.state !== 'occupied') agent_aux.state = 'desconnected';
        update_status_branch = true
        agent_aux.logout = new Date();
        agent_aux.lazy_time = undefined;
        agent_aux.login_state = false;
        agent_aux.pause_state = false;
        agent_aux.active_pause_state = false;
        agent_aux.reason_pause = null;

        // ramal recebeu logout estando em pausa
        if (agent.pause_state === true) {
            let aux_time_total_pause = 0;
            if (agent.time_total_pause) {
                aux_time_total_pause = agent.time_total_pause;
            }
            if (agent.pause && agent.login && (new Date(agent.pause)).getTime() > (new Date(agent.login)).getTime()) {
                console.log(new Date(agent.pause) + " type off: " + typeof new Date(agent.pause));
                // iremos considerar o tempo do evento de LOGOUT
                aux_time_total_pause += Number($event.id_ligacao) - ((new Date(agent.pause)).getTime() / 1000);
            }

            agent_aux.time_total_pause = aux_time_total_pause;
            agent_aux.paused_queues = [];
            agent_aux.pause_state = false;
            agent_aux.active_pause_state = false;
            agent_aux.schedule_pause_state = false;
            agent_aux.pause = undefined;
            agent_aux.reason_pause = undefined;
        }
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
        "$pull": {
            'total_available': agent.branch_number,
            'total_logged': agent.branch_number,
            'total_pause': agent.branch_number
        }
    });

    await realtimeAgentReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': $event.originador
    }, {
        "$set": agent_aux,
        "$pull": {"queues": {"queue_id": $event.id_ext_fila}}
    });

    if (update_status_branch) {
        await UpdateStatusAgent.updateAgentStateUnlessBlacklisted($event.originador, $event.id_cliente_externo, 'desconnected', ['ringing', 'occupied'])
    }

    final_return.queues.push($event.id_ext_fila);
    return final_return;
}
