/**
 * Classe -> EventRefusal
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
 * Contrutora da classe de EventRefusal
 * @constructor
 */
function EventRefusal() {
    local = this;
}

EventRefusal.prototype.EventRefusalRealTime = EventRefusalRealTime;
module.exports = EventRefusal;

/**
 * Trata evento de recusa para o realtime.
 * @param $event
 * @returns {Promise.<TResult>}
 * @constructor
 */
async function EventRefusalRealTime($event) {
    /* logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
         'INICIO', "Processando evento de RECUSA!");*/
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    var queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();
    var call = null;
    var aux_call_status = 'waiting';

    if(!queue) return final_return;
    if (!Array.isArray(queue.total_available)){
        await realtimeQueueReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila
        }, {
            "$set": {
                "total_available": []
            }
        });
    }
    var agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.data}).lean();
    if(!agent) return final_return;

    var call = _.find(queue.calls.waiting, {'call_id': $event.id_ligacao});
    if (!call) {
        aux_call_status = 'attendance';
        call = _.find(queue.calls.attendance, {'call_id': $event.id_ligacao});
    }

    if(!call) return final_return;

    // let agent_aux = 'free';
    // if ((agent.login_state === true || agent.login_state === 'true') && (agent.pause_state === true || agent.pause_state === 'true')) agent_aux= 'pause';
    //
    // if (agent.login_state === false || agent.login_state === 'false') agent_aux = 'desconnected';

    await realtimeAgentReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': agent.branch_number
    }, {
        $set: {
            'in_call': false,
            sip_connection_state_date: null
        },
        $inc: {
            'quantity_refused': 1
        }
    });
    final_return.agents.push(agent.branch_number);

    if (aux_call_status === 'waiting') {
        let $find = {
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila
        };
        $find[`calls.waiting.call_id`] = $event.id_ligacao;

        let $set = {};
        $set[`calls.waiting.$.agent_name`] = null;
        $set[`calls.waiting.$.branch_number`] = null;

        let $inc = {};
        $inc[`calls.waiting.$.call_quantity_attempts`] = 1;
        $inc[`resume.receptive.quantity_refused_attempts`] = 1;

        await realtimeQueueReportPbxModel.updateOne($find, {
            $set: $set,
            $inc: $inc
        });
        final_return.queues.push($event.id_ext_fila);
    }

    await UpdateStatusAgent.setAgentState(agent.branch_number, $event.id_cliente_externo, $event);
    return final_return;
}
