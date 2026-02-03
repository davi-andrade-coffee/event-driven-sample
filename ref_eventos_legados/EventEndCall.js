/**
 * Classe -> EventEndCall
 * @desc: processamento de histórico e relatório de ligações.
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
 * Contrutora da classe de transações
 * @constructor
 */
function EventEndCall() {
    local = this;
}

EventEndCall.prototype.EventEndCallRealTime = EventEndCallRealTime;
module.exports = EventEndCall;

/**
 * Obtém dados do pbx em tempo real
 * @param $event
 * @returns {Promise|*}
 * @constructor
 */
async function EventEndCallRealTime($event) {
    //log realtime
    logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
        'INICIO', "Processando evento de FIMCHAMADA!");
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    const query_branch_number_change_status = {
        "client_id": '',
        "branch_number": ''
    }
    if ($event.fila && $event.fila !== '') {
        var queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();
        if (queue) {
            console.log($event.id_ligacao + " - Achou a fila");
            var call = _.find(queue.calls.waiting, {'call_id': $event.id_ligacao});
            if (call) {
                console.log($event.id_ligacao + " - Achou a call na espera");
                // Não pode existir fimchamada para um fila ativo, apenas para ramal e em caso de transferência. As tratativas para este caso estão
                if (!queue.queue_id.includes("ativo")) {
                    // Fila receptiva
                    if (queue.resume.receptive.max_time_waiting < $event.data2) {
                        queue.resume.receptive.max_time_waiting = $event.data2 ? parseInt($event.data2) : 0;
                    }

                    let realtime_settings = await GetSettingsRealtimeByClientId($event.id_cliente_externo);

                    if (!call.callback) {
                        if (realtime_settings) {
                            if (Number($event.data2) <= realtime_settings.time_sla_attendance) {
                                await realtimeQueueReportPbxModel.updateOne({
                                    'client_id': $event.id_cliente_externo,
                                    'queue_id': queue.queue_id
                                }, {
                                    $set: {
                                        'resume.receptive.max_time_waiting': queue.resume.receptive.max_time_waiting
                                    },
                                    $inc: {
                                        'resume.receptive.quantity_waiting': -1,
                                        'resume.receptive.sum_time_waiting_abandoned': Number($event.data2),
                                        'resume.receptive.total_abandoned': 1,
                                        'resume.receptive.sla_abandoned': 1
                                    }
                                });
                            }
                            else{
                                await realtimeQueueReportPbxModel.updateOne({
                                    'client_id': $event.id_cliente_externo,
                                    'queue_id': queue.queue_id
                                }, {
                                    $set: {
                                        'resume.receptive.max_time_waiting': queue.resume.receptive.max_time_waiting
                                    },
                                    $inc: {
                                        'resume.receptive.quantity_waiting': -1,
                                        'resume.receptive.sum_time_waiting_abandoned': Number($event.data2),
                                        'resume.receptive.total_abandoned': 1
                                    }
                                });
                            }
                        }
                        else{
                            await realtimeQueueReportPbxModel.updateOne({
                                'client_id': $event.id_cliente_externo,
                                'queue_id': queue.queue_id
                            }, {
                                $set: {
                                    'resume.receptive.max_time_waiting': queue.resume.receptive.max_time_waiting
                                },
                                $inc: {
                                    'resume.receptive.quantity_waiting': -1,
                                    'resume.receptive.sum_time_waiting_abandoned': Number($event.data2),
                                    'resume.receptive.total_abandoned': 1
                                }
                            });
                        }
                    }
                    console.log($event.id_ligacao + " - remove a chamada");
                    await realtimeQueueReportPbxModel.updateOne({
                        'client_id': $event.id_cliente_externo,
                        'queue_id': queue.queue_id
                    }, {
                        $pull: {
                            'calls.waiting': {call_id: $event.id_ligacao}
                        }
                    });

                    final_return.queues.push(queue.queue_id);

                    if (!call.callback &&
                        $event.data3 && $event.data3 !== '' && Number($event.data3) == 0 &&
                        $event.data2 && $event.data2 !== '' && Number($event.data2) > 0 && Number($event.data3) < 86401) {
                        await realtimeQueueReportPbxModel.updateOne(
                            {
                                'client_id': $event.id_cliente_externo,
                                'queue_id': queue.queue_id
                            },
                            {
                                $inc: {
                                    'resume.receptive.quantity_waiting_abandoned': 1
                                }
                            });
                    }

                    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();
                    if (agent) {
                        let inCall = await hasAnotherCall($event, agent, call, true);

                        console.log($event.id_ligacao + " - achou agente como originador");
                        let $setAgent = {};
                        $setAgent.lazy_time = agent.lazy_time = new Date();
                        $setAgent.last_call = agent.last_call = new Date();
                        $setAgent.duration_time_date = agent.duration_time_date = undefined;
                        $setAgent.quantity_call = ++agent.quantity_call;
                        $setAgent.in_call = agent.in_call = false;
                        $setAgent.sum_time_waiting = agent.sum_time_waiting += Number($event.data2);
                        $setAgent.tme = agent.tme = 0;

                        if (agent.login_state == true || agent.login_state == 'true') {
                            if (agent.pause_state == true || agent.pause_state == 'true') {
                                // $setAgent.state = agent.state = inCall ? 'occupied' : 'pause';
                                $setAgent.in_call = agent.in_call = !!inCall;
                                $setAgent.lazy_time = agent.lazy_time = undefined
                                $setAgent.last_call = agent.last_call = inCall ? inCall.duration_time : new Date();
                            }
                            else {
                                // $setAgent.state = agent.state = inCall ? 'occupied' : 'free';
                                $setAgent.in_call = agent.in_call = !!inCall;
                                $setAgent.lazy_time = agent.lazy_time = inCall ? undefined : new Date();
                                $setAgent.last_call = agent.last_call = inCall ? inCall.duration_time : new Date();
                                $setAgent.duration_time_date = agent.duration_time_date = inCall ? inCall.duration_time : undefined;
                            }
                        } else {
                            $setAgent.in_call = agent.in_call = !!inCall;
                            // $setAgent.state = agent.state = inCall ? 'occupied' : 'desconnected';
                        }
                        if(agent.quantity_call && !isNaN(agent.quantity_call)) {
                            $setAgent.tme = agent.tme = agent.sum_time_waiting / agent.quantity_call;
                        }

                        query_branch_number_change_status.client_id = $event.id_cliente_externo
                        query_branch_number_change_status.branch_number = agent.branch_number
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
                if(Number($event.data3) < 0 || Number($event.data3) > 86400) {
                    $event.data3 = 0;
                }
                if(Number($event.data3) > 0) {
                    call = _.find(queue.calls.attendance, {'call_id': $event.id_ligacao});
                    if (call) {
                        // 2 - Chamada Atendida Sem fim atendimento ou processamento errado
                        // Inicio da tratativa da chamada atendida (sempre que houver agent2 retirar duas vezes de total_available)
                        if (queue.resume.receptive.max_time_call < Number($event.data3)) {
                            queue.resume.receptive.max_time_call = Number($event.data3);
                        }
                        var queues_agent = null;
                        var aux_agent_loggedoff = false;
                        var aux_agent_paused = false;
                        let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': call.branch_number}).lean();
                        if (agent) {
                            let agent_aux = {};
                            // var queues_agent_aux = agent.registered_queues.substring(0, agent.registered_queues.length - 1);
                            // queues_agent = queues_agent_aux.split(';');
                            queues_agent = agent.queues;
                            let inCall = await hasAnotherCall($event, agent, call, true);

                            agent_aux.quantity_call = agent.quantity_call + 1;
                            agent_aux.duration_time = Number($event.data3);
                            agent_aux.last_call = new Date();
                            agent_aux.in_call = false;
                            agent_aux.duration_time_date = undefined;
                            agent_aux.sum_time_attendance = agent.sum_time_attendance + Number($event.data3);
                            agent_aux.sum_time_waiting = agent.sum_time_waiting + Number($event.data2);
                            agent_aux.tma = 0;
                            agent_aux.tme = 0;

                            if (agent.login_state == true || agent.login_state == 'true') {
                                if (agent.pause_state == false || agent.pause_state == 'false') {
                                    // agent_aux.state = inCall ? 'occupied' : 'free';
                                    agent_aux.duration_time_date = inCall ? inCall.duration_time : undefined;
                                    agent_aux.lazy_time = inCall ? undefined : new Date();
                                    agent_aux.in_call = !!inCall;
                                    agent_aux.last_call = inCall ? inCall.duration_time : new Date();
                                    //agent_aux.duration_time_date = undefined;
                                } else {
                                    // agent_aux.state = inCall ? 'occupied' : 'pause';
                                    agent_aux.lazy_time = undefined;
                                    agent_aux.in_call = !!inCall;
                                    agent_aux.last_call = inCall ? inCall.duration_time : new Date();
                                }
                            } else {
                                //if (agent.queues.indexOf(String(queue.queue_id)) > -1) {
                                //     agent_aux.queues = agent.queues.replace(queue.queue_id + ";", "");
                                //     agent_aux.state = inCall ? 'occupied' : 'desconnected'
                                agent_aux.in_call = !!inCall;
                                agent_aux.logout = new Date();
                                agent_aux.lazy_time = undefined;
                                /*  logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
                                      'INFO', "Status do agente " + $event.data9 + " alterado para desconnected! - state=" + agent.state);*/
                                aux_agent_loggedoff = true;
                                // }
                            }

                            if (agent.quantity_call && !isNaN(agent.quantity_call)) {
                                agent_aux.tma = agent_aux.sum_time_attendance / agent_aux.quantity_call;
                                agent_aux.tme = agent_aux.sum_time_waiting / agent_aux.quantity_call;
                                if (isNaN(agent_aux.tma)) agent_aux.tma = 0;
                                if (isNaN(agent_aux.tme)) agent_aux.tme = 0;
                            }

                            query_branch_number_change_status.client_id = $event.id_cliente_externo
                            query_branch_number_change_status.branch_number = agent.branch_number

                            await realtimeAgentReportPbxModel.updateOne(
                                {
                                    'client_id': $event.id_cliente_externo,
                                    'branch_number': agent.branch_number
                                },
                                {
                                    $set: agent_aux
                                });
                            final_return.agents.push(agent.branch_number);
                            if (Number($event.data3) < 0 || Number($event.data3) > 86400) {
                                $event.data3 = 0;
                            }
                            await realtimeQueueReportPbxModel.updateOne(
                                {
                                    'client_id': $event.id_cliente_externo,
                                    'queue_id': queue.queue_id
                                },
                                {
                                    $set: {
                                        'resume.receptive.max_time_call': queue.resume.receptive.max_time_call
                                    },
                                    $inc: {
                                        'resume.receptive.quantity_attendance': -1,
                                        'resume.receptive.sum_time_attendance': Number($event.data3),
                                        ["calls.receptive.sum_time_attendance." + $event.data3]: 1
                                    }
                                });
                            if (agent) {
                                await promise.each(queues_agent, function (queue_value) {
                                    return promise.try(promiseSave)
                                        .catch(promiseErrorResult);

                                    function promiseSave() {
                                        final_return.queues.push(queue_value);
                                        return realtimeQueueReportPbxModel.findOneAndUpdate(
                                            {
                                                'client_id': $event.id_cliente_externo,
                                                'queue_id': queue_value.queue_id
                                            },
                                            {
                                                $addToSet: {
                                                    'total_available': agent.branch_number
                                                }
                                            },
                                            {
                                                safe: true, upsert: false
                                            }).lean();
                                    }

                                    function promiseErrorResult(ex) {
                                        /*   logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.error, $event.id_cliente, $event.id_ligacao, $event.evento,
                                               'promiseErrorResult', 'Processing error in the module');*/
                                        throw ex;
                                    }
                                });
                            }
                            else {
                                final_return.queues.push(queue.queue_id);
                            }
                            await realtimeQueueReportPbxModel.updateOne(
                                {
                                    'client_id': $event.id_cliente_externo,
                                    'queue_id': queue.queue_id
                                },
                                {
                                    $pull: {
                                        'calls.attendance': {call_id: $event.id_ligacao}
                                    }
                                });
                        }
                    }
                }
            }
        }
    }
    else {
        // Buscando chamada interna para remoção
        let queueRamal = await realtimeQueueReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_cliente + "-ramal",
            'calls.waiting.call_id': $event.id_ligacao
        }, {
            $inc: {
                "resume.active.quantity_dialing": -1
            },
            $pull: {
                'calls.waiting': {call_id: $event.id_ligacao}
            }
        });
        if (queueRamal) {
            final_return.queues.push($event.id_cliente + "-ramal");
            let agent = await realtimeAgentReportPbxModel.findOne({
                'client_id': $event.id_cliente_externo,
                'branch_number': $event.originador
            }).lean();
            if (agent) {
                console.log($event.id_ligacao + " - achou agente como originador");
                let inCall = await hasAnotherCall($event, agent, { call_id: $event.id_ligacao }, true);
                let $setAgent = {};
                $setAgent.lazy_time = agent.lazy_time = new Date();
                $setAgent.last_call = agent.last_call = new Date();
                $setAgent.duration_time_date = agent.duration_time_date = undefined;
                $setAgent.quantity_call = ++agent.quantity_call;
                $setAgent.in_call = agent.in_call = false;
                $setAgent.sum_time_waiting = agent.sum_time_waiting += Number($event.data2);
                $setAgent.tme = agent.tme = 0;
                if (agent.login_state == true || agent.login_state == 'true') {
                    if (agent.pause_state == true || agent.pause_state == 'true') {
                        // $setAgent.state = agent.state = inCall ? 'occupied' : 'pause';
                        $setAgent.in_call = agent.in_call = !!inCall;
                        $setAgent.lazy_time = agent.lazy_time = undefined
                        $setAgent.last_call = agent.last_call = inCall ? inCall.duration_time : new Date();
                    }
                    else {
                        // $setAgent.state = agent.state = inCall ? 'occupied' : 'free';
                        $setAgent.in_call = agent.in_call = !!inCall;
                        $setAgent.lazy_time = agent.lazy_time = inCall ? undefined : new Date();
                        $setAgent.last_call = agent.last_call = inCall ? inCall.duration_time : new Date();
                        $setAgent.duration_time_date = agent.duration_time_date = inCall ? inCall.duration_time : undefined;
                    }
                } else {
                    $setAgent.in_call = agent.in_call = !!inCall;
                    // $setAgent.state = agent.state = inCall ? 'occupied' : 'desconnected';
                }
                if (agent.quantity_call && !isNaN(agent.quantity_call)) {
                    $setAgent.tme = agent.tme = agent.sum_time_waiting / agent.quantity_call;
                }

                query_branch_number_change_status.client_id = $event.id_cliente_externo
                query_branch_number_change_status.branch_number = agent.branch_number

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
    await realtimeIVRReportPbxModel.updateOne(
        {
            'client_id': $event.id_cliente_externo,
            'calls.ura': {
                $elemMatch: {
                    call_id: $event.id_ligacao,
                    end_ura: false
                }
            }
        },
        {
            $set: {
                'calls.ura.$.end_ura': true
            },
            $inc: {
                'quantity_ura': -1
            }
        });
    await realtimeIVRReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo
    }, {
        $pull: {
            'calls.ura': {call_id: $event.id_ligacao}
        }
    });

    if (query_branch_number_change_status.branch_number) {
        const inCall = await hasAnotherCall($event, {branch_number: query_branch_number_change_status.branch_number}, { call_id: $event.id_ligacao }, true);
        await UpdateStatusAgent.setAgentStateConditionallyInCall(query_branch_number_change_status.branch_number, query_branch_number_change_status.client_id, inCall)
    }

    final_return.ivr = true;
    return final_return;
}
