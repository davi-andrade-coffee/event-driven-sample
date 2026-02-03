/**
 * Classe -> EventAttendance
 * @desc: processamento de eventos ATENDIMENTO
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeIVRReportPbxModel = require(path + '/model/pbx/report/RealtimeIVRReportPbxModel');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const GetSettingsRealtimeByClientId = require(path + '/business/pbx/client/SettingsRealtimeClientPbxBL/GetSettingsRealtimeByClientId');
const { hasAnotherCall } = require(path + '/library/HasAnotherCall');
const UpdateStatusAgent = require('../../../library/UpdateStatusAgent');

/**
 * Contrutora da classe de EventAttendance
 * @constructor
 */
function EventAttendance() {
    local = this;
}

EventAttendance.prototype.EventAttendanceRealTime = EventAttendanceRealTime;
module.exports = EventAttendance;

/**
 * Processa evento de atendimento do realtime.
 * @param $event
 * @returns {*}
 * @constructor
 */
async function EventAttendanceRealTime($event) {
    //log realtime

    let final_return = {
        "client_id": $event.id_cliente_externo,
        "queues": [],
        "agents": [],
        "ivr": false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}, { 'calls': 1, 'queue_name': 1, 'resume': 1}).lean();

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
    final_return.queues.push($event.id_ext_fila);

    let call = _.find(queue.calls.waiting, {'call_id': $event.id_ligacao});
    if(!call) {
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
                        await realtimeQueueReportPbxModel.findOneAndUpdate(
                            {
                                'client_id': $event.id_cliente_externo,
                                'queue_id': {$in: queues_agent_aux}
                            },
                            {
                                "$addToSet": {
                                    'total_available': agent.branch_number
                                }
                            },
                            {safe: true, upsert: false});
                    } else {
                        $set.call_queue = undefined
                    }

                    await realtimeAgentReportPbxModel.updateOne({
                        'client_id': $event.id_cliente_externo,
                        'branch_number': agent.branch_number
                    }, { $set });
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
                ura_time: $event.data2 || 0,
                waiting_time: $event.data1
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

    /*
     São 3 tipos de ligacao:
     1 - Ativo
     2 - Interno
     3 - Receptivo
     4 - transferencia (OBS)
     */
    // O ramal que está fazendo uma ligação ativa é o $event.data
    // O ramal que está recebendo uma ligação é o $event.data
    // O ramal que está fazendo uma chamada entre ramais é $event.originador
    let aux_call_type = 'receptive';
    if ($event.id_ext_fila.includes("ativo") && (call.transfer == false || call.transfer == 'false')) aux_call_type = 'active';

    let agent = await realtimeAgentReportPbxModel.findOne({"branch_number": $event.data, "client_id": $event.id_cliente_externo}).lean();
    if(!agent) return final_return;

    let $setAgent = {};
    let $setAgent2 = {};

    final_return.agents.push($event.data);

    // let queues_agent = agent.registered_queues
    //     .substring(0, agent.registered_queues.length - 1)
    //     .split(';');
    let queues_agent = agent.queues;

    // Criando a call para ser inserida em attendence
    let call_attendance = {
        call_id: call.call_id,
        queue_name: call.queue_name,
        number: call.number,
        number_mask: call.number_mask,
        origin: call.origin,
        origin_mask: call.origin_mask,
        input: call.input,
        ura_time: $event.data2 || 0,
        waiting_time: $event.data1,
        agent_name: agent.user_name,
        branch_number: $event.data,
        branch_mask: agent.branch_mask,
        channel: $event.data7,
        queue: $event.id_ext_fila,
        id_ext_queue: $event.id_ext_fila,
        last_queue: $event.fila
    };
    call_attendance.duration_time  = $setAgent.duration_time_date = agent.duration_time_date = new Date();
    if (call.transfer == true || call.transfer == 'true') {
        call_attendance.transfer = true;
        call_attendance.transfer_id = call.transfer_id;
    }

    // Setar o agente como ocupado para o caso de chamadas receptivas e internas
    if (aux_call_type !== 'active') {
        agent.last_queue = $setAgent.last_queue = queue.queue_name;
        agent.call_id = $setAgent.call_id = $event.id_ligacao;
        agent.state = $setAgent.state = 'occupied';
        agent.lazy_time = $setAgent.lazy_time = undefined;
        agent.phone_origin = $setAgent.phone_origin = $event.originador;
        call_attendance.last_max_time_waiting = queue.resume.receptive.max_time_waiting;
        if (queue.resume.receptive.max_time_waiting < ($event.data1)) queue.resume.receptive.max_time_waiting = $event.data1;
    }

    //buscando se $event.originador é o segundo agente
    let agent2 = await realtimeAgentReportPbxModel.findOne({
        "branch_number": $event.originador,
        "client_id": $event.id_cliente_externo
    }).lean();

    if (agent2) {
        agent2.last_queue = $setAgent2.last_queue = queue.queue_name;
        agent2.call_id = $setAgent2.call_id = $event.id_ligacao;
        agent2.state = $setAgent2.state = 'occupied';
        agent2.lazy_time = $setAgent2.lazy_time = undefined;
        agent2.phone_origin = $setAgent2.phone_origin = agent.branch_mask;

        final_return.agents.push($event.originador);
        aux_call_type = 'internal';
        agent.phone_origin = $setAgent.phone_origin = agent2.branch_mask;
    }

    await realtimeAgentReportPbxModel.updateOne({
        "client_id": $event.id_cliente_externo,
        "branch_number": agent.branch_number
    }, {
        "$set": $setAgent
    });

    if(agent2) await realtimeAgentReportPbxModel.updateOne({
        "client_id": $event.id_cliente_externo,
        "branch_number": agent2.branch_number
    }, {
        "$set": $setAgent2
    });

    if(aux_call_type !== "active") await (async () => {

        let result = await realtimeAgentReportPbxModel.findOneAndUpdate({
            "client_id": $event.id_cliente_externo,
            "branch_number": agent.branch_number
        }, {"$inc": {"quantity_attendance": 1}
        }, {"safe": true, "upsert": false});

        if(!result) return;

        result = await GetSettingsRealtimeByClientId($event.id_cliente_externo);

        if(!result || +$event.data1 > result.time_sla_attendance) return;

        result = await realtimeQueueReportPbxModel.findOneAndUpdate({
            "client_id": $event.id_cliente_externo,
            "queue_id": $event.id_ext_fila
        }, {"$inc": {"resume.receptive.quantity_attendance_seconds": 1}
        }, {"safe": true, "upsert": false});

        if(!result) return;

        return await promise.map(queues_agent, async function (queue_value) {
            final_return.queues.push(queue_value.queue_id);
            return realtimeQueueReportPbxModel.findOneAndUpdate({
                "client_id": $event.id_cliente_externo,
                "queue_id": queue_value.queue_id
            }, {"$pull": {"total_available": agent.branch_number}
            }, { "safe": true, "upsert": false });
        });
    })();

    if(aux_call_type !== "internal" && agent2) {
        await realtimeAgentReportPbxModel.updateOne({
            "client_id": $event.id_cliente_externo,
            "branch_number": agent2.branch_number
        }, {"$inc": {"quantity_attendance": 1}
        });
    }

    if (aux_call_type === "internal" && agent2) {
        await realtimeQueueReportPbxModel.updateOne({
            "client_id": $event.id_cliente_externo,
            "queue_id": $event.id_ext_fila
        }, {
            "$set": {
                "resume.receptive.max_time_waiting": queue.resume.receptive.max_time_waiting
            },
            "$inc": {
                "resume.active.quantity_dialing": -1,
                "resume.active.quantity_attendance": 1,
                "resume.active.sum_quantity_attendance": 1,
                "resume.receptive.quantity_waiting": -1,
                "resume.receptive.sum_quantity_attendance": 1,
                "resume.receptive.quantity_attendance": 1,
                "resume.receptive.sum_time_waiting_attendance": +$event.data1
            }
        });
    }

    if (aux_call_type === "receptive") {
        await realtimeQueueReportPbxModel.updateOne({
            "client_id": $event.id_cliente_externo,
            "queue_id": $event.id_ext_fila
        }, {
            "$set": {
                "resume.receptive.max_time_waiting": queue.resume.receptive.max_time_waiting
            },
            "$inc": {
                "resume.receptive.quantity_waiting": -1,
                "resume.receptive.sum_quantity_attendance": 1,
                "resume.receptive.quantity_attendance": 1,
                "resume.receptive.sum_time_waiting_attendance": +$event.data1
            }
        });
    }

    if (aux_call_type === "active") {

        await realtimeQueueReportPbxModel.updateOne({
            "client_id": $event.id_cliente_externo,
            "queue_id": $event.id_ext_fila
        }, {
            "$inc": {
                "resume.active.quantity_dialing": -1,
                "resume.active.quantity_attendance": 1,
                "resume.active.sum_quantity_attendance": 1
            }
        });

        await realtimeAgentReportPbxModel.updateOne({
                "branch_number": $event.data,
                "client_id": $event.id_cliente_externo
            },
            {
                "$inc": {
                    "active_sum_calls_attendance": 1,
                    "active_sum_time_waiting": + $event.data1
                }
            });

    }

    await realtimeQueueReportPbxModel.updateOne({
        "client_id": $event.id_cliente_externo,
        "queue_id": $event.id_ext_fila
    }, {
        "$pull": { "calls.waiting": { "call_id": $event.id_ligacao }}
    });

    await realtimeQueueReportPbxModel.updateOne({
        "client_id": $event.id_cliente_externo,
        "queue_id": $event.id_ext_fila
    }, {
        "$push": { "calls.attendance": call_attendance }
    });

    return final_return;
}
