/**
 * Classe -> EventEndAttendance
 * @desc: processamento de eventos de fim atendimento
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const { hasAnotherCall } = require(path + '/library/HasAnotherCall');
const UpdateStatusAgent = require("../../../library/UpdateStatusAgent");

/**
 * Contrutora da classe de EventEndAttendance
 * @constructor
 */
function EventEndAttendance() {
    local = this;
}

EventEndAttendance.prototype.EventEndAttendanceRealTime = EventEndAttendanceRealTime;
module.exports = EventEndAttendance;

/**
 * Obtém dados do pbx em tempo real
 * @param $event
 * @returns {Promise|*}
 * @constructor
 */
async function EventEndAttendanceRealTime($event) {
    /*
    São 6 tipos de chamadas:
        1 - Não Atendidas
            1.1 - Não Atendida ativa (fila -ativo)
            1.2 - Não Atendida interna (fila -ramal e originador.length == 6)
            1.3 - Não Atendida receptiva
        2 - Atendidas
            2.1 - Atendida Ativa (fila -ativo)
            2.2 - Atendida interna (fila -ramal e originador.length == 6)
            2.3 - Atendida receptiva
     */
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();

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
    let call = _.find(queue.calls.attendance, {'call_id': $event.id_ligacao});

    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.data9}).lean();
    let agent2 = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean(); // ligação interna

    if (!call) return handleUnattendedCall($event, queue, call, agent, agent2, final_return);

    return handleAttendedCall($event, queue, call, agent, agent2, final_return);
}

async function handleUnattendedCall($event, queue, call, agent, agent2, final_return) {

    // 1 - Não atendida
    call = _.find(queue.calls.waiting, {'call_id': $event.id_ligacao});

    // ERRO não localizada como atendida ou não atendida
    if(!call) {
        console.log("PROCESSAMENTO DA CALL ID: " + $event.id_ligacao + " SUSPENSO POR NÃO ENCONTRA-LA NA FILA EM WAITING OU ATTENDANCE!");
        return final_return;
    }

    let {
        "callType": aux_call_type,
        "agent": {
            "queues": queues_agent,
            "$set": $setAgent,
            "loggedOff": aux_agent_loggedoff,
            "paused": aux_agent_paused
        },
        "agent2": {
            "queues": queues_agent2,
            "$set": $setAgent2,
            "loggedOff": aux_agent_loggedoff2,
            "paused": aux_agent_paused2
        }
    } = await parseUnattendedCall($event, queue, call, agent, agent2);

    let {
        "agentIsTransfered": call_transfer_agent,
        "agent2IsTransfered": call_transfer_agent2
    } = await parseAgentTransfer($event, queue, call, agent, agent2);
    if(agent && !call_transfer_agent && !(await hasAnotherCall($event, agent, call))) {
        final_return.agents.push(agent.branch_number);

        await realtimeAgentReportPbxModel.updateOne({
            "client_id": $event.id_cliente_externo,
            "branch_number": agent.branch_number
        }, {
            "$set": $setAgent
        });

        await promise.map(agent.queues, async function (queue_value) {
            if(agent.pause_state && $event.id_ext_fila.includes("ativo") && !queue_value.queue_id.includes("ativo")) return null;
            final_return.queues.push(queue_value.queue_id);
            return realtimeQueueReportPbxModel.findOneAndUpdate({
                    "client_id": $event.id_cliente_externo,
                    "queue_id": queue_value.queue_id
                },
                {"$addToSet": {"total_available": agent.branch_number}},
                {"safe": true, "upsert": false}).lean();
        });
    }

    if(agent2 && !call_transfer_agent2 && !(await hasAnotherCall($event, agent2, call))) {
        final_return.agents.push(agent2.branch_number);

        await realtimeAgentReportPbxModel.updateOne({
            "client_id": $event.id_cliente_externo,
            "branch_number": agent2.branch_number
        }, {
            "$set": $setAgent2
        });

        let add_queue = false;
        if(final_return.queues.length < 1) add_queue = true;
        await promise.map(agent2.queues, async function (queue_value) {
            if(add_queue) final_return.queues.push(queue_value.queue_id);
            else{
                let find_queue = _.find(final_return.queues, queue_value.queue_id);
                if (!find_queue) final_return.queues.push(queue_value.queue_id);
            }
            return realtimeQueueReportPbxModel.findOneAndUpdate({
                    "client_id": $event.id_cliente_externo,
                    "queue_id": queue_value.queue_id
                },
                {"$addToSet": {"total_available": agent2.branch_number}},
                {"safe": true, "upsert": false}).lean();
        });
    }

    switch(aux_call_type) {
        case "active":
            await realtimeQueueReportPbxModel.updateOne({
                "client_id": $event.id_cliente_externo,
                "queue_id": $event.id_ext_fila
            }, {
                // "$set": {"resume.active.max_time_waiting": queue.resume.active.max_time_waiting},
                "$inc": {
                    "resume.active.quantity_dialing": -1,
                    "resume.active.total_abandoned": 1,
                }
            });
            await realtimeAgentReportPbxModel.updateOne({
                    'client_id': $event.id_cliente_externo,
                    'branch_number': $event.data9
                },
                {
                    "$inc": {
                        "active_sum_time_waiting": $event.data2
                    }
                });
            break;
        case "receptive":
            await realtimeQueueReportPbxModel.updateOne({
                "client_id": $event.id_cliente_externo,
                "queue_id": $event.id_ext_fila
            }, {
                "$set": {
                    "resume.receptive.max_time_waiting": queue.resume.receptive.max_time_waiting
                },
                "$inc": {
                    "resume.receptive.quantity_waiting": -1,
                    "resume.receptive.total_abandoned": 1,
                    ["calls.receptive.waiting_frequency." + ($event.data2 || 0)]: 1
                }
            });
            break;
        case "internal":
            await realtimeQueueReportPbxModel.updateOne({
                "client_id": $event.id_cliente_externo,
                "queue_id": $event.id_ext_fila
            }, {
                "$set": {
                    // "resume.active.max_time_waiting": queue.resume.active.max_time_waiting,
                    "resume.receptive.max_time_waiting": queue.resume.receptive.max_time_waiting
                },
                "$inc": {
                    "resume.active.quantity_dialing": -1,
                    "resume.active.total_abandoned": 1,
                    "resume.receptive.quantity_waiting": -1,
                    "resume.receptive.total_abandoned": 1,
                    ["calls.receptive.waiting_frequency." + ($event.data2 || 0)]: 1
                }
            });
            break;
    }

    await realtimeQueueReportPbxModel.updateOne({
        "client_id": $event.id_cliente_externo,
        "queue_id": $event.id_ext_fila
    }, {
        "$pull": {"calls.waiting": {"call_id": $event.id_ligacao}}
    });

    let find_queue = _.find(final_return.queues, $event.id_ext_fila);
    if (!find_queue) final_return.queues.push($event.id_ext_fila);

    if (agent && !call_transfer_agent) {
        const inCall = await hasAnotherCall($event, agent, { call_id: $event.id_ligacao }, true);
        await UpdateStatusAgent.setAgentStateConditionallyInCall(agent.branch_number, $event.id_cliente_externo, inCall)
    }
    if (agent2 && !call_transfer_agent2) {
        const inCall = await hasAnotherCall($event, agent2, { call_id: $event.id_ligacao }, true);
        await UpdateStatusAgent.setAgentStateConditionallyInCall(agent2.branch_number, $event.id_cliente_externo, inCall)
    }

    return final_return;
}

function parseUnattendedCall($event, queue, call, agent, agent2) {

    let aux_call_type;

    let queues_agent = []
        , aux_agent_loggedoff = false
        , aux_agent_paused = false
        , $setAgent = {};

    let queues_agent2 = []
        , aux_agent_loggedoff2 = false
        , aux_agent_paused2 = false
        , $setAgent2 = {};

    if ($event.id_ext_fila.includes("ramal") || $event.id_ext_fila.includes("ativo")) {

        aux_call_type = "active";

        // 1.1 Não atendida ativo ou 1.2 Não atendida interna, mas vamos verificar isso olhando para o originador
        if(call.transfer == true || call.transfer == 'true') {
            // Toda chamada transferida está na fila receptiva
            aux_call_type = 'receptive';
        } else if ($event.id_ext_fila.indexOf("ramal") > -1) {
            // A chamada com fila -ramal é receptiva ou interna, para ser interna deve existir o agent2
            aux_call_type = 'receptive';
        }

        if (queue.resume.active.max_time_waiting < $event.data2) {
            queue.resume.active.max_time_waiting = $event.data2 ? parseInt($event.data2) : 0;
        }

        if (agent) {
            if (agent.login_state == true || agent.login_state == 'true') {
                if (agent.pause_state == true || agent.pause_state == 'true') {
                    // $setAgent.state = agent.state = 'pause';
                }
                else {
                    // $setAgent.state = agent.state = 'free';
                }
            } else {
                // $setAgent.state = agent.state = 'desconnected';
                aux_agent_loggedoff = true;
            }
            $setAgent.lazy_time = agent.lazy_time = new Date();
            $setAgent.duration_time_date = agent.duration_time_date = undefined;
            $setAgent.quantity_call = ++agent.quantity_call;
            $setAgent.duration_time = agent.duration_time = $event.data3;
            $setAgent.last_call = agent.last_call = new Date();
            $setAgent.in_call = agent.in_call = false;
            $setAgent.duration_time_date = agent.duration_time_date = undefined;
            $setAgent.sum_time_attendance = agent.sum_time_attendance += +$event.data3;
            $setAgent.sum_time_waiting = agent.sum_time_waiting += +$event.data2;
            $setAgent.tma = agent.tma = 0;
            $setAgent.tme = agent.tme = 0;

            if(agent.quantity_call && !isNaN(agent.quantity_call)) {
                $setAgent.tma = agent.tma = agent.sum_time_attendance / agent.quantity_call;
                $setAgent.tme = agent.tme = agent.sum_time_waiting / agent.quantity_call;
            }
        }

        if (agent2) {
            if (agent) aux_call_type = 'internal';

            $setAgent2.in_call = agent2.in_call = false;

            if (agent2.login_state == true || agent2.login_state == 'true') {
                if (agent2.pause_state == true || agent2.pause_state == 'true') {
                    // $setAgent2.state = agent2.state = 'pause';
                } else{
                    // $setAgent2.state = agent2.state = 'free';
                }
            } else {
                // Call waiting, não atendida, portanto se o login_state == false o ramal está deslogado

                // $setAgent2.state = agent2.state = 'desconnected';
                //$setAgent2.lazy_time = agent2.lazy_time = undefined;
                aux_agent_loggedoff2 = true;
            }
            $setAgent2.lazy_time = agent2.lazy_time = new Date();
            $setAgent2.last_call = agent2.last_call = new Date();
            $setAgent2.duration_time_date = agent2.duration_time_date = undefined;
            $setAgent2.quantity_call = ++agent2.quantity_call;
            $setAgent2.duration_time = agent2.duration_time = $event.data3;
            $setAgent2.last_call = agent2.last_call = new Date();
            $setAgent2.in_call = agent2.in_call = false;
            $setAgent2.duration_time_date = agent2.duration_time_date = undefined;
            $setAgent2.sum_time_attendance = agent2.sum_time_attendance += +$event.data3;
            $setAgent2.sum_time_waiting = agent2.sum_time_waiting += +$event.data2;
            $setAgent2.tma = agent2.tma = 0;
            $setAgent2.tme = agent2.tme = 0;
            if(agent2.quantity_call && !isNaN(agent2.quantity_call)) {
                $setAgent2.tma = agent2.tma = agent2.sum_time_attendance / agent2.quantity_call;
                $setAgent2.tme = agent2.tme = agent2.sum_time_waiting / agent2.quantity_call;
            }
        }
    } else {
        // 1.3 - Não atendida Receptiva
        aux_call_type = 'receptive';

        if (queue.resume.receptive.max_time_waiting < $event.data2) {
            queue.resume.receptive.max_time_waiting = $event.data2 ? parseInt($event.data2) : 0;
        }

        if (agent) {
            if (agent.login_state == true || agent.login_state == 'true') {
                if (agent.pause_state == true || agent.pause_state == 'true') {
                    // $setAgent.state = agent.state = 'pause';
                }
                else {
                    // $setAgent.state = agent.state = 'free';
                }
            } else {
                // $setAgent.state = agent.state = 'desconnected';
                aux_agent_loggedoff = true;
            }
            $setAgent.lazy_time = agent.lazy_time = new Date();
            $setAgent.last_call = agent.last_call = new Date();
            $setAgent.duration_time_date = agent.duration_time_date = undefined;
            $setAgent.quantity_call = ++agent.quantity_call;
            $setAgent.in_call = agent.in_call = false;
            $setAgent.sum_time_waiting = agent.sum_time_waiting += Number($event.data2);
            $setAgent.tme = agent.tme = 0;
            if(agent.quantity_call && !isNaN(agent.quantity_call)) {
                $setAgent.tme = agent.tme = agent.sum_time_waiting / agent.quantity_call;
            }

            if (agent2) {

                aux_call_type = 'internal';

                if (agent2.login_state == true || agent2.login_state == 'true') {
                    if (agent2.pause_state == true || agent2.pause_state == 'true') {
                        // $setAgent2.state = agent2.state = 'pause';
                    }
                    else {
                        // $setAgent2.state = agent2.state = 'free';
                    }
                } else {
                    // $setAgent2.state = agent2.state = 'desconnected';
                    aux_agent_loggedoff2 = true;
                }
                $setAgent2.lazy_time = agent2.lazy_time = new Date();
                $setAgent2.last_call = agent2.last_call = new Date();
                $setAgent2.duration_time_date = agent2.duration_time_date = undefined;
                $setAgent2.quantity_call = ++agent2.quantity_call;
                $setAgent2.in_call = agent2.in_call=false;
                $setAgent2.sum_time_waiting = agent2.sum_time_waiting += Number($event.data2);
                $setAgent2.tme = agent2.tme = 0;
                if(agent2.quantity_call && !isNaN(agent2.quantity_call)) {
                    $setAgent2.tme = agent2.tme = agent2.sum_time_waiting / agent2.quantity_call;
                }
            }
        }
    }

    return {
        "callType": aux_call_type,
        "agent": {
            "_": agent,
            "queues": queues_agent,
            "$set": $setAgent,
            "loggedOff": aux_agent_loggedoff,
            "paused": aux_agent_paused
        },
        "agent2": {
            "_": agent2,
            "queues": queues_agent2,
            "$set": $setAgent2,
            "loggedOff": aux_agent_loggedoff2,
            "paused": aux_agent_paused2
        }
    };
}

async function handleAttendedCall($event, queue, call, agent, agent2, final_return) {

    // 2 - Chamada Atendida
    // Inicio da tratativa da chamada atendida (sempre que houver agent2 retirar duas vezes de total_available)
    let {
        "callType": aux_call_type,
        "agent": {
            "queues": queues_agent,
            "$set": $setAgent,
            "loggedOff": aux_agent_loggedoff,
            "paused": aux_agent_paused
        },
        "agent2": {
            "queues": queues_agent2,
            "$set": $setAgent2,
            "loggedOff": aux_agent_loggedoff2,
            "paused": aux_agent_paused2
        }
    } = await parseAttendedCall($event, queue, call, agent, agent2);

    let {
        "agentIsTransfered": call_transfer_agent,
        "agent2IsTransfered": call_transfer_agent2
    } = await parseAgentTransfer($event, queue, call, agent, agent2);

    if(agent && !call_transfer_agent && !(await hasAnotherCall($event, agent, call))) {
        final_return.agents.push(agent.branch_number);

        let result = await realtimeAgentReportPbxModel.findOneAndUpdate({
                "client_id": $event.id_cliente_externo,
                "branch_number": agent.branch_number
            },
            {"$set": $setAgent},
            {"safe": true, "upsert": false}).lean();

        await promise.map(agent.queues, async function (queue_value) {
            if(agent.pause_state && $event.id_ext_fila.includes("ativo") && !queue_value.queue_id.includes("ativo")) return null;
            final_return.queues.push(queue_value.queue_id);
            return realtimeQueueReportPbxModel.findOneAndUpdate({
                "client_id": $event.id_cliente_externo,
                "queue_id": queue_value.queue_id
            }, {
                "$addToSet": {"total_available": agent.branch_number}
            }, {"safe": true, "upsert": false}).lean();
        });
    }

    if(agent2 && !call_transfer_agent2 && !(await hasAnotherCall($event, agent2, call))) {
        final_return.agents.push(agent2.branch_number);
        let result = await realtimeAgentReportPbxModel.findOneAndUpdate({
                "client_id": $event.id_cliente_externo,
                "branch_number": agent2.branch_number
            },
            {"$set": $setAgent2},
            {"safe": true, "upsert": false}).lean();

        let add_queue = false;
        if(final_return.queues.length < 1) add_queue = true;
        await promise.map(agent2.queues, async function (queue_value) {
            if(add_queue) final_return.queues.push(queue_value.queue_id);
            else{
                let find_queue = _.find(final_return.queues, queue_value.queue_id);
                if (!find_queue) final_return.queues.push(queue_value.queue_id);
            }
            return realtimeQueueReportPbxModel.findOneAndUpdate({
                "client_id": $event.id_cliente_externo,
                "queue_id": queue_value.queue_id
            }, {
                "$addToSet": {"total_available": agent2.branch_number}
            }, {"safe": true, "upsert": false}).lean();
        });
    }

    if(["internal", "receptive"].includes(aux_call_type)
        && (Number($event.data3) < 0 || Number($event.data3) > 86400)) {
        $event.data3 = 0;
    }

    switch(aux_call_type) {
        // 2.1 - Chamada atendida ativa, contabilizar -1 em quantity_attendance
        case "active": {
            await realtimeQueueReportPbxModel.updateOne({
                "client_id": $event.id_cliente_externo,
                "queue_id": $event.id_ext_fila
            }, {
                "$set": {
                    "resume.active.max_time_call": queue.resume.active.max_time_call,
                },
                "$inc": {
                    "resume.active.quantity_attendance": -1,
                    "resume.active.sum_time_attendance": Number($event.data3),
                    ["calls.active.duration_frequency." + ($event.data3 || 0)]: 1
                }
            });

            await realtimeAgentReportPbxModel.updateOne({
                'client_id': $event.id_cliente_externo,
                'branch_number': $event.data9,
                $or: [
                    {
                        $and: [
                            {'active_sum_time_attendance': {$lt: +($event.data1)}}, {'active_sum_time_attendance': {$exists: true}}
                        ]
                    },
                    {'active_sum_time_attendance': {$exists: false} }
                ]
            }, {
                "$set": {
                    "active_sum_time_attendance": $event.data1
                }
            });
            break;
        }
        // 2.2 - Chamada atendida entre ramal, contabilizar -2 em quantity_attendance (1 no active e 1 no receptive)
        case "internal": {
            await realtimeQueueReportPbxModel.updateOne({
                "client_id": $event.id_cliente_externo,
                "queue_id": $event.id_ext_fila
            }, {
                "$set": {
                    "resume.receptive.max_time_call": queue.resume.active.max_time_call,
                    "resume.active.max_time_call": queue.resume.active.max_time_call,
                },
                "$inc": {
                    "resume.active.quantity_attendance": -1,
                    "resume.active.sum_time_attendance": Number($event.data3),
                    "resume.receptive.quantity_attendance": -1,
                    "resume.receptive.sum_time_attendance": Number($event.data3),
                    ["calls.active.duration_frequency." + ($event.data3 || 0)]: 1,
                    ["calls.receptive.duration_frequency." + ($event.data3 || 0)]: 1,
                }
            });
            break;
        }
        // 2.3 - chamada atendida receptiva
        case "receptive": {
            await realtimeQueueReportPbxModel.updateOne({
                "client_id": $event.id_cliente_externo,
                "queue_id": $event.id_ext_fila
            }, {
                "$set": {
                    "resume.receptive.max_time_call": queue.resume.receptive.max_time_call
                },
                "$inc": {
                    "resume.receptive.quantity_attendance": -1,
                    "resume.receptive.sum_time_attendance": Number($event.data3),
                    ["calls.receptive.duration_frequency." + ($event.data3 || 0)]: 1
                }
            });

            break;
        }
    }

    await realtimeQueueReportPbxModel.updateOne({
        "client_id": $event.id_cliente_externo,
        "queue_id": $event.id_ext_fila
    }, {
        "$pull": {"calls.attendance": {"call_id": $event.id_ligacao}}
    });

    let find_queue = _.find(final_return.queues, $event.id_ext_fila);
    if (!find_queue) final_return.queues.push($event.id_ext_fila);

    if (agent && !call_transfer_agent) {
        const inCall = await hasAnotherCall($event, agent, { call_id: $event.id_ligacao }, true);
        await UpdateStatusAgent.setAgentStateConditionallyInCall(agent.branch_number, $event.id_cliente_externo, inCall)
    }
    if (agent2 && !call_transfer_agent2) {
        const inCall = await hasAnotherCall($event, agent2, { call_id: $event.id_ligacao }, true);
        await UpdateStatusAgent.setAgentStateConditionallyInCall(agent2.branch_number, $event.id_cliente_externo, inCall)
    }

    return final_return;
}

async function parseAttendedCall($event, queue, call, agent, agent2) {

    // Presumimos fila = ativo ou ramal, e não é transferência
    let aux_call_type;

    let queues_agent = []
        , aux_agent_loggedoff = false
        , aux_agent_paused = false
        , $setAgent = {};

    let queues_agent2 = []
        , aux_agent_loggedoff2 = false
        , aux_agent_paused2 = false
        , $setAgent2 = {};

    //Verificando se a chamada está presente na fila Ativa ou Receptiva
    if ($event.id_ext_fila.includes("ramal") || $event.id_ext_fila.includes("ativo")) {

        aux_call_type = "active";

        if($event.id_ext_fila.includes("ramal")) {
            aux_call_type = 'receptive';

            if(agent && agent2) aux_call_type = 'internal';
        }
        // 2.1 ou 2.2 Atendida ramal ou ativa
        if(call.transfer == true || call.transfer == 'true') {
            // Toda chamada transderida está na fila receptiva

            // A chamada com fila -ramal é receptiva ou interna, para ser interna deve existir o agent2
            aux_call_type = 'receptive';
        }

        //variavel de maximo de tempo de chamada
        if (queue.resume.active.max_time_call < Number($event.data3)) {
            queue.resume.active.max_time_call = Number($event.data3);
        }

        if (agent) {
            if (agent.login_state == true || agent.login_state == 'true') {
                if (agent.pause_state == true || agent.pause_state == 'true') {
                    // $setAgent.state = agent.state = 'pause';
                    $setAgent.lazy_time = agent.lazy_time = undefined;
                } else {
                    // $setAgent.state = agent.state = 'free';
                    $setAgent.lazy_time = agent.lazy_time = new Date();
                }
            } else {
                aux_agent_loggedoff = true;

                // $setAgent.state = agent.state = 'desconnected';
                $setAgent.logout = agent.logout = new Date();
                $setAgent.lazy_time = agent.lazy_time = undefined;
            }
            $setAgent.quantity_call = ++agent.quantity_call;
            $setAgent.duration_time = agent.duration_time = $event.data3;
            $setAgent.last_call = agent.last_call = new Date();
            $setAgent.in_call = agent.in_call = false;
            $setAgent.duration_time_date = agent.duration_time_date = undefined;
            $setAgent.sum_time_attendance = agent.sum_time_attendance += Number($event.data3);
            $setAgent.sum_time_waiting = agent.sum_time_waiting += Number($event.data2);
            $setAgent.tma = agent.tma = 0;
            $setAgent.tme = agent.tme = 0;
            if(agent.quantity_call&& !isNaN(agent.quantity_call)) {
                $setAgent.tma = agent.tma = agent.sum_time_attendance / agent.quantity_call;
                $setAgent.tme = agent.tme = agent.sum_time_waiting / agent.quantity_call;
            }
        }

    }  else {
        // 2.3 - Atendida Receptivo
        aux_call_type = 'receptive';
        if (queue.resume.receptive.max_time_call < Number($event.data3)) {
            queue.resume.receptive.max_time_call = Number($event.data3);
        }

        if (agent) {
            if (agent.login_state == true || agent.login_state == 'true') {
                if (agent.pause_state == true || agent.pause_state == 'true') {
                    // $setAgent.state = agent.state = 'pause';
                    $setAgent.lazy_time = agent.lazy_time = undefined;
                } else {
                    // $setAgent.state = agent.state = 'free';
                    $setAgent.lazy_time = agent.lazy_time = new Date();
                    $setAgent.last_call = agent.last_call = new Date();
                    $setAgent.duration_time_date = agent.duration_time_date = undefined;
                }
            } else {
                aux_agent_loggedoff = true;

                // $setAgent.state = agent.state = 'desconnected';
                $setAgent.logout = agent.logout = new Date();
                $setAgent.lazy_time = agent.lazy_time = undefined;
            }

            $setAgent.quantity_call = ++agent.quantity_call;
            $setAgent.duration_time = agent.duration_time = $event.data3;
            $setAgent.last_call = agent.last_call = new Date();
            $setAgent.in_call = agent.in_call = false;
            $setAgent.duration_time_date = agent.duration_time_date = undefined;
            $setAgent.sum_time_attendance = agent.sum_time_attendance += Number($event.data3);
            $setAgent.sum_time_waiting = agent.sum_time_waiting += Number($event.data2);
            $setAgent.tma = agent.tma = 0;
            $setAgent.tme = agent.tme = 0;

            if(agent.quantity_call&& !isNaN(agent.quantity_call)) {
                $setAgent.tma = agent.tma = agent.sum_time_attendance / agent.quantity_call;
                $setAgent.tme = agent.tme = agent.sum_time_waiting / agent.quantity_call;
            }
        }
    }

    if (agent2) {

        $setAgent2.in_call = agent2.in_call = false;

        if (agent2.login_state == true || agent2.login_state == 'true') {
            if (agent2.pause_state == true || agent2.pause_state == 'true') {
                // $setAgent2.state = agent2.state = 'pause';
                $setAgent2.lazy_time = agent2.lazy_time = undefined;
            } else {
                // $setAgent2.state = agent2.state = 'free';
                $setAgent2.lazy_time = agent2.lazy_time = new Date();
                $setAgent2.last_call = agent2.last_call = new Date();
                $setAgent2.duration_time_date = agent2.duration_time_date = undefined;
            }

            if(agent2.quantity_call && !isNaN(agent2.quantity_call)) {
                $setAgent2.tma = agent2.tma = agent2.sum_time_attendance / agent2.quantity_call;
                $setAgent2.tme = agent2.tme = agent2.sum_time_waiting / agent2.quantity_call;
            }
        } else {

            // $setAgent2.state = agent2.state = 'desconnected';
            $setAgent2.lazy_time = agent2.lazy_time = undefined;
            aux_agent_loggedoff2 = true;

        }
        $setAgent2.quantity_call = ++agent2.quantity_call;
        $setAgent2.duration_time = agent2.duration_time = $event.data3;
        $setAgent2.lazy_time = agent2.lazy_time = new Date();
        $setAgent2.last_call = agent2.last_call = new Date();
        $setAgent2.duration_time_date = agent2.duration_time_date = undefined;
        $setAgent2.sum_time_attendance = agent2.sum_time_attendance += Number($event.data3);
        $setAgent2.sum_time_waiting = agent2.sum_time_waiting += Number($event.data2);
        $setAgent2.tma = agent2.tma = 0;
        $setAgent2.tme = agent2.tme = 0;
        if(agent2.quantity_call && !isNaN(agent2.quantity_call)) {
            $setAgent2.tma = agent2.tma = agent2.sum_time_attendance / agent2.quantity_call;
            $setAgent2.tme = agent2.tme = agent2.sum_time_waiting / agent2.quantity_call;
        }
    }

    return {
        "callType": aux_call_type,
        "agent": {
            "_": agent,
            "queues": queues_agent,
            "$set": $setAgent,
            "loggedOff": aux_agent_loggedoff,
            "paused": aux_agent_paused
        },
        "agent2": {
            "_": agent2,
            "queues": queues_agent2,
            "$set": $setAgent2,
            "loggedOff": aux_agent_loggedoff2,
            "paused": aux_agent_paused2
        }
    };
}

async function parseAgentTransfer($event, queue, call, agent, agent2) {

    let call_transfer_agent = false;
    let call_transfer_agent2 = false;
    if(call.transfer && call.transfer_id) {
        // consultar o call.transfer_id em todas as filas e se localizado verificar quem está nesta outra ligação (agent ou agent2)
        let transferedCall = await realtimeQueueReportPbxModel.findOne({
            'client_id': $event.id_cliente_externo,
            $or:[
                {'calls.attendance.call_id': call.transfer_id},
                {'calls.waiting.call_id': call.transfer_id}
            ]
        }).lean();
        if(transferedCall){

            let transferedNumbers = [transferedCall.branch_number, transferedCall.origin];

            if(agent && transferedNumbers.includes(agent.branch_number)) { //telefone do originador
                call_transfer_agent = true;
            }

            if(agent2 && transferedNumbers.includes(agent2.branch_number)) {
                call_transfer_agent2 = true;
            }
        }
    }

    return {
        "agentIsTransfered": call_transfer_agent,
        "agent2IsTransfered": call_transfer_agent2
    };
}
