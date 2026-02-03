/**
 * Classe -> EventEnterUra
 * @desc: processamento de evento ENTRAURA
 */

//imports
var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeIVRReportPbxModel = require(path + '/model/pbx/report/RealtimeIVRReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');

/**
 * Contrutora da classe de EventEnterUra
 * @constructor
 */
function EventEnterUra() {
    local = this;
}

EventEnterUra.prototype.EventEnterUraRealTime = EventEnterUraRealTime;
module.exports = EventEnterUra;

/**
 * Obtém dados do pbx em tempo real
 * @param $client
 * @returns {Promise|*}
 * @constructor
 */
async function EventEnterUraRealTime($event) {
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };
    let ivr = await realtimeIVRReportPbxModel.findOneAndUpdate(
        {
            'client_id': $event.id_cliente_externo,
        },
        {
            "$inc": {'quantity_ura': 1}
        },
        {safe: true, upsert: false}
    ).lean();
    let call = _.find(ivr.calls.ura, {"call_id": $event.id_ligacao});
    if (!call) {
        await realtimeIVRReportPbxModel.updateOne(
            {
                'client_id': $event.id_cliente_externo
            },
            {
                "$push": {
                    'calls.ura': {
                        "call_id": $event.id_ligacao,
                        "end_ura": false,
                        "transfer_ura": false
                    }
                }
            });
        if ($event.data5 && ($event.data5 == 'true' || $event.data5 == true)){
            let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();
            if (agent) {
                let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_cliente + "-ramal"}).lean();
                if(!queue) {
                    logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.error, $event.id_cliente, $event.id_ligacao, $event.evento,
                        'ERRO', "Fila não encontrada! fila=" + $event.fila + " id_ext_fila=" + $event.id_ext_fila);
                    final_return.ivr = true;
                    return final_return;
                }
                let call_exist = _.find(queue.calls.attendance, {'call_id': $event.id_ligacao});
                if(call_exist) {
                    // call_exist != undefined. Só pode ser uma chamada de transferencia, do contrário não há como existir a call
                    logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
                        'INFO', "Call existe em attendence. Rotina de DISCAGEM NAO executada (TRANSFERENCIA)! Return null | fila=" + $event.fila + " id_ext_fila=" + $event.id_ext_fila + " originador=" + $event.originador + " data=" + $event.data);
                    final_return.ivr = true;
                    return final_return;
                }
                // Vamos procurar nas chamadas waiting
                call_exist = _.find(queue.calls.waiting, {'call_id': $event.id_ligacao});
                if(call_exist) {
                    // call_exist != undefined. Só pode ser uma chamada de transferencia, do contrário não há como existir a call
                    logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
                        'INFO', "Call existe em Waiting. Rotina de DISCAGEM NAO executada (TRANSFERENCIA)! Return null | fila=" + $event.fila + " id_ext_fila=" + $event.id_ext_fila + " originador=" + $event.originador + " data=" + $event.data);
                    final_return.ivr = true;
                    return final_return;
                }

                let call = {
                    "call_id": $event.id_ligacao,
                    "queue_name": queue.queue_name,
                    "queue": queue.queue_id,
                    // "user_name": agent && agent.user_name,
                    "origin": agent.branch_number,
                    "origin_mask": agent.branch_mask,
                    "number": $event.data2,
                    "number_mask": $event.data2,
                    "input": $event.hora,
                    // "branch_number": agent && agent.branch_number,
                    // "branch_mask": agent && agent.branch_mask,
                    // "channel": $event.data7,
                    "agent_name": $event.data2,
                    "waiting_time": $event.hora,
                    "transfer": false,
                    "transfer_id": null
                };
                await realtimeQueueReportPbxModel.updateOne({
                    "client_id": $event.id_cliente_externo,
                    "queue_id": queue.queue_id
                }, {
                    "$push": {"calls.waiting": call},
                    "$inc": {
                        "resume.active.quantity_dialing": 1,
                        "resume.active.sum_quantity_call": 1
                    }
                });
                final_return.queues.push(queue.queue_id);

                let $setAgent = {};
                $setAgent.call_id = agent.call_id = $event.id_ligacao;
                $setAgent.state = agent.state = 'occupied';
                $setAgent.in_call = agent.in_call = true;
                $setAgent.call_queue = agent.call_queue = queue.queue_id;
                $setAgent.phone_origin = agent.phone_origin = $event.data2;
                await realtimeAgentReportPbxModel.updateOne({
                    "client_id": $event.id_cliente_externo,
                    "branch_number": agent.branch_number
                }, {
                    "$set": $setAgent
                });
                final_return.agents.push(agent.branch_number);
            }
        }
    }
    else {
        await realtimeIVRReportPbxModel.updateOne(
            {
                'client_id': $event.id_cliente_externo,
                'calls.ura.call_id': $event.id_ligacao
            },
            {
                "$set": {"calls.ura.$.end_ura": false}
            });
    }
    final_return.ivr = true;
    return final_return;
}
