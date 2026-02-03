/**
 * Classe -> EventTransfered
 * @desc: processamento de eventos de TRANSFERENCIA
 **/

var local = null;
var _ = require("lodash");
var path = require("app-root-path");
var promise = require("bluebird");
var logpbx = require(path + "/library/LogPbx");
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');

/**
 * Contrutora da classe de EventTransfered
 * @constructor
 */
function EventTransfered() {
    local = this;
}

EventTransfered.prototype.EventTransferedRealTime = EventTransferedRealTime;
module.exports = EventTransfered;

/**
 * Trata evento de transferencia para realtime.
 * @param $event
 * @returns {Promise|Promise.<TResult>}
 * @constructor
 */
async function EventTransferedRealTime($event) {
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };
    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();

    if(!queue) return final_return;

    // Como o DIALING para uma transferência não faz nada, devemos fazer aqui
    // A call foi finalizada no FIMATENDIMENTO e devemos recria-la em waiting
    // Se o originador é um ramal, devemos seta-lo como ocupado e fazer os devidos incrementos
    // O agente de destino deve ser setado como ringing (data1), já o data foi tratado no FIMATENDIMENTO
    let aux_call_type = "receptive";
    let aux_agent_loggedoff = false;
    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.data1}).lean();

    if(!agent) return final_return;
    let agent_aux = {};
    // Definindo o tipo de ligação
    if ($event.id_ext_fila.includes("ativo")) aux_call_type = 'active';

    if (agent.login_state == true || agent.login_state == 'true')
        if (!agent.queues || agent.queues.includes("" + $event.id_ext_fila)) agent_aux = agent.queues + $event.id_ext_fila + ";";
    else aux_agent_loggedoff = true;

    agent_aux.call_id = $event.id_ligacao;
    agent_aux.state = 'ringing';
    agent_aux.in_call = true;
    agent_aux.call_queue = $event.id_ext_fila;
    agent_aux.phone_origin = $event.data;

    let call = {
        "call_id": $event.id_ligacao,
        "queue_name": queue.queue_name,
        "queue": $event.id_ext_fila,
        "user_name": agent.user_name,
        "origin": $event.originador,
        "number": $event.data1,
        "input": $event.hora,
        "branch_number": agent.branch_number,
        "branch_mask": agent.branch_mask,
        "channel": $event.data7 || $event.data9,
        "agent_name": agent.user_name,
        "waiting_time": $event.data4,
        "transfer": true,
        "transfer_id": $event.data2
    };

    if($event.id_ext_fila.indexOf("ativo") > -1) {
        aux_call_type = "active";
    } else {
        call.ura_time = $event.data3;
        call.call_quantity_attempts = 0;
        aux_call_type = "receptive";

        if($event.id_ext_fila.indexOf("ramal") > -1) aux_call_type = "internal";
    }

    //aqui está settando para chamando e não está voltando ao estado anterior, se for chamada ativa...
    let result = await realtimeAgentReportPbxModel.findOneAndUpdate({
        "client_id": $event.id_cliente_externo,
        "branch_number": agent.branch_number
    }, {
        "$set": agent_aux
    }, {"safe": true, "upsert": false}).lean();
    final_return.agents.push($event.data1);

    let transferedAgent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();

    if(transferedAgent) {
        let transferedAgent_aux = {};
        if (transferedAgent.login_state == true || transferedAgent.login_state == 'true') {
            if (!transferedAgent.queues
                || transferedAgent.queues.includes("" + $event.id_ext_fila)) {
                transferedAgent_aux.queues += $event.id_ext_fila + ";";
            }
        }
        transferedAgent_aux.call_id = $event.id_ligacao;
        transferedAgent_aux.state = 'occupied';
        transferedAgent_aux.in_call = true;
        transferedAgent_aux.call_queue = $event.id_ext_fila;

        agent.phone_origin = transferedAgent.branch_mask;
        transferedAgent_aux.phone_origin = agent.branch_mask;

        result = await realtimeAgentReportPbxModel.findOneAndUpdate({
            "client_id": $event.id_cliente_externo,
            "branch_number": transferedAgent.branch_number
        }, {
            "$set": transferedAgent_aux
        }, {"safe": true, "upsert": false}).lean();
        final_return.agents.push(transferedAgent.branch_number);
    }

    if (result && aux_agent_loggedoff) {
        await realtimeQueueReportPbxModel.updateOne({
            "client_id": $event.id_cliente_externo,
            "queue_id": $event.id_ext_fila
        }, {
            "$addToSet": {
                "total_available": agent.branch_number,
                "total_logged": agent.branch_number
            }
        });
    }

    switch(aux_call_type) {
        case "active": await realtimeQueueReportPbxModel.updateOne({ "client_id": $event.id_cliente_externo, "queue_id": $event.id_ext_fila }, {
            "$push": { "calls.waiting": call },
            "$inc": { "resume.active.quantity_dialing": 1, "resume.active.sum_quantity_call": 1, "total_transfer": 1 } });
            break;
        case "internal": await realtimeQueueReportPbxModel.updateOne({"client_id": $event.id_cliente_externo, "queue_id": $event.id_ext_fila }, {
            "$push": { "calls.waiting": call },
            "$inc": {
                "resume.active.quantity_dialing": 1,
                "resume.active.sum_quantity_call": 1,
                "resume.receptive.quantity_waiting": 1,
                "resume.receptive.sum_quantity_call": 1,
                "total_transfer": 1
            } });
            break;
        case "receptive": await realtimeQueueReportPbxModel.updateOne({ "client_id": $event.id_cliente_externo,  "queue_id": $event.id_ext_fila }, {
            "$push": {  "calls.waiting": call },
            "$inc": {
                "resume.receptive.quantity_waiting": 1,
                "resume.receptive.sum_quantity_call": 1,
                "total_transfer": 1
            } });
            break;
    }
    final_return.queues.push($event.id_ext_fila);
    return final_return;
}

