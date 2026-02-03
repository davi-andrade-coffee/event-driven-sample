/**
 * Classe -> EventStatus
 * @desc: processamento de evento de STATUS
 */

let local = null;
const path = require('app-root-path');
const realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
const realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const dateFormat = require("dateformat");
/**
 * Construtor da classe de EventStatus
 * @constructor
 */
function EventStatus() {
    local = this;
}

EventStatus.prototype.EventStatusRealtime = EventStatusRealtime;
module.exports = EventStatus;

/**
 * Obtém dados do pbx em tempo real
 * @param $event
 * @returns {Promise|*}
 * @constructor
 */
async function EventStatusRealtime($event) {
    global.$log.info(dateFormat(new Date(), "dd/mm/yyyy - HH:MM:ss:l ") + " | call_id: " + $event.id_ligacao + " | -> branch_number:  " + $event.originador + " | " + __filename.split(/[\\/]/).pop());
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };
    const FOUR_MINUTES = 240000;

    let agent = await realtimeAgentReportPbxModel.findOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': $event.originador
    }).lean();

    if (!agent || !agent.login_state) return final_return;

    const initialConnectionState = {
        sip_status_attempt: 1,
        sip_date_of_first_status: new Date().getTime()
    };

    if (!agent.sip_status_attempt || agent.sip_status_attempt < 1) {
        global.$log.info(dateFormat(new Date(), "dd/mm/yyyy - HH:MM:ss:l ") + " | call_id: " + $event.id_ligacao + "Irá inicializar a" +
            " contagem do evento status" + __filename.split(/[\\/]/).pop());
        await realtimeAgentReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'branch_number': $event.originador
        }, {
            "$set": initialConnectionState,
        });
        return final_return;
    }

    let agent_update = {}
    agent_update.sip_status_attempt = agent.sip_status_attempt += 1;

    const now = new Date().getTime();
    const diff = now - agent.sip_date_of_first_status;
    global.$log.info(dateFormat(new Date(), "dd/mm/yyyy - HH:MM:ss:l ") + " | call_id: " + $event.id_ligacao + " | tentativas" +
        agent.sip_status_attempt + " | diff tempo " + diff + __filename.split(/[\\/]/).pop());

    if (agent.sip_status_attempt >= 3 && diff <= FOUR_MINUTES) {
        await realtimeAgentReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo,
            'branch_number': $event.originador
        }, {
            "$set": {
                sip_connection_state_date: new Date().getTime(),
                sip_status_attempt: 0,
                sip_date_of_first_status: null
            },
        });

        final_return.agents.push($event.originador);
        return final_return;
    }
    if (diff > FOUR_MINUTES) {
        agent_update = initialConnectionState
    }

    await realtimeAgentReportPbxModel.updateOne({
        'client_id': $event.id_cliente_externo,
        'branch_number': $event.originador
    }, {
        "$set": agent_update,
    });
    return final_return;
}
