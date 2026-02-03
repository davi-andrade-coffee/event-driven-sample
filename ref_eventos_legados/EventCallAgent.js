/**
 * Classe -> EventCallAgent
 * @desc: processamento de eventos CHAMAAGENTE
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const GetSettingsRealtimeByClientId = require(path + '/business/pbx/client/SettingsRealtimeClientPbxBL/GetSettingsRealtimeByClientId');
const { hasAnotherCall } = require(path + '/library/HasAnotherCall');
const UpdateStatusAgent = require('../../../library/UpdateStatusAgent');

/**
 * Contrutora da classe de EventCallAgent
 * @constructor
 */
function EventCallAgent() {
    local = this;
}

EventCallAgent.prototype.EventCallAgentRealTime = EventCallAgentRealTime;
module.exports = EventCallAgent;

/**
 * Processa evento de Chama Agente do realtime
 * @param $event
 * @returns {*}
 * @constructor
 */
async function EventCallAgentRealTime($event) {
    //log realtime
    /* logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
         'INICIO', "Processando evento de CHAMAAGENTE! branch_number=data2=" + $event.data2);*/

    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();
    if (!queue) return final_return;
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

    let call = _.find(queue.calls.waiting, {'call_id': $event.id_ligacao});
    if (!call) {
        call = _.find(queue.calls.attendance, {'call_id': $event.id_ligacao});
        if (call) {
            // Houve envio de evento atendimento errado, removendo o que foi inserido para o agente anterior
            //Se chegou aqui é porque teve um atendimento inválido
            //É preciso "desfazer" o atendimento inválido
            let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': call.branch_number}).lean();
            // FUTURO: Fazer validaçao do usuário em state logout para retira-lo da fila uma vez que o logout nao atuou
            if (agent) {
                let inCall = await hasAnotherCall($event, agent, call, true);
                final_return.agents.push(agent.branch_number);
                if (!inCall) {
                    let queues_agent_aux = [];

                    if (agent.active_pause_state == true || agent.active_pause_state == 'true') queues_agent_aux.push($event.id_ext_fila);
                    else queues_agent_aux = [...agent.queues.map(function (e) {
                        return e.queue_id
                    })];

                    const $set = {
                        in_call: false
                    }
                    if (agent.login_state == true || agent.login_state == 'true' &&
                        agent.pause_state == false || agent.pause_state == 'false'
                    ) {
                        final_return.queues.push(...queues_agent_aux);
                        await realtimeQueueReportPbxModel.updateOne(
                            {
                                'client_id': $event.id_cliente_externo,
                                'queue_id': {$in: queues_agent_aux}
                            },
                            {
                                $addToSet: {
                                    'total_available': agent.branch_number
                                }
                            },
                            {safe: true, upsert: false}).lean();
                    } else {
                        $set.call_queue = undefined
                    }
                    await realtimeAgentReportPbxModel.updateOne({
                        'client_id': $event.id_cliente_externo,
                        'branch_number': agent.branch_number
                    }, {$set});
                    await UpdateStatusAgent.setAgentState(agent.branch_number, $event.id_cliente_externo);
                }
                else {
                    await realtimeAgentReportPbxModel.updateOne(
                        {
                            'client_id': $event.id_cliente_externo,
                            'branch_number': agent.branch_number
                        },
                        {
                            $set: {
                                'last_queue': inCall.queue_name,
                                'call_id': inCall.call_id,
                                'lazy_time': undefined,
                                'phone_origin': inCall.origin,
                                'call_queue': inCall.id_ext_queue,
                            }
                        });
                }
            }

            let realtimeSettings = await GetSettingsRealtimeByClientId($event.id_cliente_externo);
            if (call.waiting_time <= realtimeSettings.time_sla_attendance) {
                /*logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
                    'SALVAR', "Chamada dentro do SLA, ENTAO DECREMENTA o quantity_attendance_seconds " + call.waiting_time + " <= " + result.time_sla_attendance);
                logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
                    'SALVAR', "DECREMENTADO quantity_attendance_seconds -1 para retornar ao normal");*/
                await realtimeQueueReportPbxModel.updateOne({
                    'client_id': $event.id_cliente_externo,
                    'queue_id': $event.id_ext_fila
                }, {
                    $inc: {
                        'resume.receptive.quantity_attendance_seconds': -1
                    }
                });
            }
            console.log("REMOVENDO LIGAÇÃO DA FILA EM ATENDIDA E DEVOLVENDO PARA AGUARDANDO: " + $event.id_ligacao + " CALL: " + JSON.stringify(call, null, 4));
            await realtimeQueueReportPbxModel.updateOne(
                {
                    'client_id': $event.id_cliente_externo,
                    'queue_id': $event.id_ext_fila
                }, {
                    $pull: {
                        'calls.attendance': {call_id: call.call_id}
                    },
                    $push: {
                        'calls.waiting': call
                    },
                    $inc: {
                        'resume.receptive.quantity_waiting': 1,
                        'resume.receptive.sum_quantity_attendance': -1,
                        'resume.receptive.quantity_attendance': -1,
                        'resume.receptive.sum_time_waiting_attendance': -call.waiting_time
                    }
                });
        }
        else {
            /* logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.error, $event.id_cliente, $event.id_ligacao, $event.evento,
                 'ERRO', "Chamada receptiva NAO encontrada em espera, não vamos mais criar a call! CHAMAAGENTE sem ENTRAFILA!!!");*/
            // CHAMADA NÃO LOCALIZADA EM ESPERA OU ATENDIMENTO, CRIANDO EM ESPERA
            // Criando a Call
            call = {
                call_id: $event.id_ligacao,
                queue_name: queue.queue_name,
                queue: $event.id_ext_fila,
                number: $event.data3,
                origin: $event.originador,
                input: $event.hora,
                ura_time: $event.data2,
                waiting_time: $event.hora,
                channel: $event.data7
            };
            console.log("CRIANDO LIGAÇÃO DA FILA EM AGUARDANDO: " + $event.id_ligacao + " CALL: " + JSON.stringify(call, null, 4));
            await realtimeQueueReportPbxModel.updateOne({
                'client_id': $event.id_cliente_externo,
                'queue_id': $event.id_ext_fila
            }, {
                $push: {
                    'calls.waiting': call
                }
            });
        }
    }

    // Inicio normal de um chamaagente
    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.data2}).lean();
    if (agent) {
        final_return.agents.push($event.data2);
        console.log("ATUALIZANDO AGENTE " + $event.data2 + " CALL ID: " + $event.id_ligacao);
        await realtimeAgentReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'branch_number': $event.data2
        }, {
            $set: {
                'state': 'ringing',
                'call_queue': $event.id_ext_fila,
                'in_call': true,
                sip_status_attempt: 0,
                sip_date_of_first_status: null,
                sip_connection_state_date: null
            }
        });

        await realtimeQueueReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila,
            'calls.waiting.call_id': $event.id_ligacao
        },{
            $set: {
                'calls.waiting.$.branch_number': agent.branch_number,
                'calls.waiting.$.agent_name': agent.user_name
            }
        });
    }
    else {
        await realtimeQueueReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila,
            'calls.waiting.call_id': $event.id_ligacao
        },{
            $set: {'calls.waiting.$.branch_number': $event.data2}
        });
    }

    final_return.queues.push($event.id_ext_fila);
    return final_return;
}
