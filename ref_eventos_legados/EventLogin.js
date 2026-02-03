/**
 * Classe -> EventLogin
 * @desc: processamento de evento de LOGIN
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
var clientRealtimePbxModel = require(path + '/model/pbx/client/ClientRealtimePbxModel');
const realtimeActions = require(path + '/business/pbx/report/RealtimeActions');
const UpdateStatusAgent = require('../../../library/UpdateStatusAgent');

/**
 * Contrutora da classe de EventLogin
 * @constructor
 */
function EventLogin() {
    local = this;
}

EventLogin.prototype.EventLoginRealTime = EventLoginRealTime;
module.exports = EventLogin;

/**
 * Obtém dados do pbx em tempo real
 * @param $client
 * @returns {Promise|*}
 * @constructor
 */
async function EventLoginRealTime($event) {
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();

    if(!queue) queue = await realtimeActions.createQueue($event);

    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();

    if(!agent) agent = await realtimeActions.createAgent($event);

    let agent_aux = {};
    let update_status_branch = false;
    if (($event.data4 === false || $event.data4 === "false") && ("" + $event.sequence_id) === "1" && agent.login_state === false) {
        agent_aux.logout = undefined;
        agent_aux.login = new Date();
        agent_aux.login_state = true;
        agent_aux.lazy_time = new Date();
        update_status_branch = true;
        // if (agent.state !== 'ringing' && agent.state !== 'occupied') agent_aux.state = 'free';
        agent_aux.in_call = false;
        agent_aux.sip_connection_state_date = null;
        agent_aux.sip_date_of_first_status = null;
        agent_aux.sip_status_attempt = 0;
        if(agent.queues && agent.queues.length > 0){
            //Possivel erro de evento, correto seria ver pelo tempo do evento vs limpeza para saber se faz as adições ou não.
            let clean = await clientRealtimePbxModel.findOne({'client_id': $event.id_cliente_externo}).lean();
            if(clean.last_clear > agent.queues[0].login_date) agent_aux.queues = [{
                "queues": {
                    "queue_id": $event.id_ext_fila,
                    "login_date": new Date()
                }
            }];
        }
    }

    await realtimeAgentReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': $event.originador
    }, {
        "$set": agent_aux,
        ...(() => {
            if (agent_aux.paused_queues) return {}; return {"$push": {
                    "queues": {
                        "queue_id": $event.id_ext_fila,
                        "login_date": new Date()
                    }}};
        })()
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
        'queue_id': $event.id_ext_fila,
    }, {
        "$addToSet": {
            'total_available': agent.branch_number,
            'total_logged': agent.branch_number
        }
    });

    if (update_status_branch) {
        await UpdateStatusAgent.updateAgentStateUnlessBlacklisted($event.originador, $event.id_cliente_externo, 'free',['ringing', 'occupied'])
    }

    final_return.queues.push($event.id_ext_fila);

    if (("" + $event.sequence_id) === "1") final_return.agents.push($event.originador);

    return final_return;
}
