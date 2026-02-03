/**
 * Classe -> EventDialing
 * @desc: processamento de eventos DISCAGEM
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');

/**
 * Contrutora da classe de EventDialing
 * @constructor
 */
function EventDialing() {
    local = this;
}

EventDialing.prototype.EventDialingRealTime = EventDialingRealTime;
module.exports = EventDialing;

/**
 * Obtém dados do pbx em tempo real
 * @param $event
 * @returns {Promise|*}
 * @constructor
 */
async function EventDialingRealTime($event) {
    //log realtime
    logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento, 'INICIO', "Processando evento de DISCAGEM!");

    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();

    if(!queue) {
        logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.error, $event.id_cliente, $event.id_ligacao, $event.evento,
            'ERRO', "Fila não encontrada! fila=" + $event.fila + " id_ext_fila=" + $event.id_ext_fila);
        return final_return;
    }
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

    let call_exist = _.find(queue.calls.attendance, {'call_id': $event.id_ligacao});
    if(call_exist) {
        // call_exist != undefined. Só pode ser uma chamada de transferencia, do contrário não há como existir a call
        logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
            'INFO', "Call existe em attendence. Rotina de DISCAGEM NAO executada (TRANSFERENCIA)! Return null | fila=" + $event.fila + " id_ext_fila=" + $event.id_ext_fila + " originador=" + $event.originador + " data=" + $event.data);
        return final_return;
    }

    // Vamos procurar nas chamadas waiting
    call_exist = _.find(queue.calls.waiting, {'call_id': $event.id_ligacao});
    if(call_exist) {
        // call_exist != undefined. Só pode ser uma chamada de transferencia, do contrário não há como existir a call
        logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
            'INFO', "Call existe em Waiting. Rotina de DISCAGEM NAO executada (TRANSFERENCIA)! Return null | fila=" + $event.fila + " id_ext_fila=" + $event.id_ext_fila + " originador=" + $event.originador + " data=" + $event.data);
        return final_return;
    }

    let {
        "callType": aux_call_type,
        "agent": {
            "_": agent,
            "$set": $setAgent,
            //"queues": queues_agent,
            "loggedOff": aux_agent_loggedoff
        },
        "agent2": {
            "_": agent2,
            "$set": $setAgent2,
            // "queues": queues_agent2,
            "loggedOff": aux_agent_loggedoff2
        }
    } = await parseAgents($event);


    let call = {
        "call_id": $event.id_ligacao,
        "queue_name": queue.queue_name,
        "queue": $event.id_ext_fila,
        "user_name": agent && agent.user_name,
        "origin": $event.originador,
        "number": $event.data,
        "input": $event.hora,
        "branch_number": agent && agent.branch_number,
        "branch_mask": agent && agent.branch_mask,
        "channel": $event.data7,
        "agent_name": agent && agent.user_name,
        "waiting_time": $event.hora,
        "transfer": false,
        "transfer_id": null
    };

    if (!agent || !aux_call_type) return final_return;

    if (aux_call_type !== "active") {
        call["ura_time"] = 0;
        call["waiting_time"] = 0;
        call["call_quantity_attempts"] = 0;
        call["number"] = $event.data3; //receptive

        if(aux_call_type === "internal") {
            call["number"] = agent.branch_number;
            call["number_mask"] = agent.branch_mask;
            if(agent2 && agent2.branch_number) {
                call["origin_mask"] = agent2.branch_mask;
                call["origin"] = agent2.branch_number;
            }
        }
    }

    // em caso de receptivo ou interno, verificar se o agente é capaz de receber a ligação antes de mudar seu estado
    // já que no FIMATENDIMENTO essa validação também acontece (fazendo assim, evitamos cenários de trava-
    // mento de estado em "ringing").
    if(aux_call_type === "active" || !(await hasAnotherCall($event, agent, call))) {
        await realtimeAgentReportPbxModel.updateOne({
            "client_id": $event.id_cliente_externo,
            "branch_number": agent.branch_number
        }, {
            "$set": {
                ...$setAgent,
                sip_status_attempt: 0,
                sip_date_of_first_status: null,
                sip_connection_state_date: null
            }
        });
        final_return.agents.push(agent.branch_number);
    }

    // receptivo interno
    if(agent2 && !(await hasAnotherCall($event, agent2, call))) {
        await realtimeAgentReportPbxModel.updateOne({
            "client_id": $event.id_cliente_externo,
            "branch_number": agent2.branch_number
        }, {
            $set: {
                ...$setAgent2,
                sip_status_attempt: 0,
                sip_date_of_first_status: null,
                sip_connection_state_date: null
            }
        }, {safe: true, upsert: false});
        final_return.agents.push(agent2.branch_number);
    }

    switch(aux_call_type) {
        case "active":
            await realtimeQueueReportPbxModel.updateOne({
                "client_id": $event.id_cliente_externo,
                "queue_id": $event.id_ext_fila
            }, {
                "$push": {"calls.waiting": call},
                "$inc": {
                    "resume.active.quantity_dialing": 1,
                    "resume.active.sum_quantity_call": 1
                }
            });
            break;
        case "internal":
            await realtimeQueueReportPbxModel.updateOne({
                "client_id": $event.id_cliente_externo,
                "queue_id": $event.id_ext_fila
            }, {
                "$push": {"calls.waiting": call},
                "$inc": {
                    "resume.active.quantity_dialing": 1,
                    "resume.active.sum_quantity_call": 1,
                    "resume.receptive.quantity_waiting": 1,
                    "resume.receptive.sum_quantity_call": 1
                }
            });
            break;
        case "receptive":
            await realtimeQueueReportPbxModel.updateOne({
                "client_id": $event.id_cliente_externo,
                "queue_id": $event.id_ext_fila
            }, {
                "$push": {"calls.waiting": call},
                "$inc": {
                    "resume.receptive.quantity_waiting": 1,
                    "resume.receptive.sum_quantity_call": 1
                }
            });
            break;
    }

    if(agent.queues && agent.queues.length) {
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

        await promise.each(agent.queues, async function (queue_value) {
            if (!agent.pause_state || queue_value.queue_id.includes('ativo')) {
                final_return.queues.push(queue_value.queue_id);
                return realtimeQueueReportPbxModel.findOneAndUpdate({
                    "client_id": $event.id_cliente_externo,
                    "queue_id": queue_value.queue_id
                }, {
                    "$pull": {"total_available": agent.branch_number}
                }, {"safe": true, "upsert": false}).lean();
            }
        });
    }

    if(final_return.queues.length < 1) final_return.queues.push($event.id_ext_fila);

    return final_return;
}

async function parseAgents($event) {

    let queues_agent = [];
    let queues_agent2 = [];

    let aux_call_type;
    let aux_agent_loggedoff = false;
    let aux_agent_loggedoff2 = false;
    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();
    let $setAgent = {};
    let agent2 = null;
    let $setAgent2 = {};

    if (agent) {
        aux_call_type = 'active';
        aux_agent_loggedoff = false;

        $setAgent.call_id = agent.call_id = $event.id_ligacao;
        $setAgent.state = agent.state = 'occupied';
        $setAgent.in_call = agent.in_call = true;
        $setAgent.call_queue = agent.call_queue = $event.id_ext_fila;
        $setAgent.phone_origin = agent.phone_origin = $event.data;

        if($event.id_ext_fila.includes("ativo")){
            $setAgent.active_sum_total_calls = agent.active_sum_total_calls ? agent.active_sum_total_calls + 1 : 1;
        }
        // // Fazendo a busca do agent2 caso seja uma fila -ramal
        agent2 = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.data}).lean();
        if (agent2 !== undefined && agent2 !== null) {
            aux_call_type = 'internal';
            // if (agent2.login_state == true || agent2.login_state == 'true') {
            //     // if (!agent2.queues || agent2.queues.includes("" + $event.id_ext_fila)) {
            //     //     $setAgent2.queues = agent2.queues += $event.id_ext_fila + ";";
            //     // }
            // } else {
            //     aux_agent_loggedoff2 = true;
            // }
            aux_agent_loggedoff2 = false;
            $setAgent2.call_id = agent2.call_id = $event.id_ligacao;
            $setAgent2.state = agent2.state = 'ringing';
            $setAgent2.in_call = agent2.in_call = true;
            $setAgent2.call_queue = agent2.call_queue = $event.id_ext_fila;

            $setAgent.phone_origin = agent.phone_origin = agent2.branch_mask;
            $setAgent2.phone_origin = agent2.phone_origin = agent.branch_mask;
        }
    } else {
        aux_call_type = 'receptive';
        agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.data}).lean();
        if (agent) {
            aux_agent_loggedoff = false;
            $setAgent.call_id = agent.call_id = $event.id_ligacao;
            $setAgent.state = agent.state = 'ringing';
            $setAgent.in_call = agent.in_call = true;
            $setAgent.call_queue = agent.call_queue = $event.id_ext_fila;
            $setAgent.phone_origin = agent.phone_origin = $event.data;
        }
    }

    return {
        "callType": aux_call_type,
        "agent": {
            "_": agent,
            "$set": $setAgent,
            "queues": queues_agent,
            "loggedOff": aux_agent_loggedoff
        },
        "agent2": {
            "_": agent2,
            "$set": $setAgent2,
            "queues": queues_agent2,
            "loggedOff": aux_agent_loggedoff2
        }
    };
}

async function hasAnotherCall($event, agent, currentCall) {

    let calls = await realtimeQueueReportPbxModel.findOne({
        'client_id': $event.id_cliente_externo,
        $or:[{
            $and: [
                {'calls.attendance.call_id': {$ne: currentCall.call_id}},
                {$or:[
                        {'calls.attendance.branch_number': agent.branch_number},
                        {'calls.attendance.number': agent.branch_number},
                        {'calls.attendance.origin': agent.branch_number}
                    ]}
            ]
        },
            {
                $and: [
                    {'calls.waiting.call_id': {$ne: currentCall.call_id}},
                    {$or:[
                            {'calls.waiting.branch_number': agent.branch_number},
                            {'calls.waiting.number': agent.branch_number},
                            {'calls.waiting.origin': agent.branch_number}
                        ]}
                ]
            }
        ]
    }).lean();

    if(calls) return !!calls;
    else return false;
}
