/**
 * Classe -> EventTransfered
 * @desc: processamento de eventos de TRANSFERENCIAFILA
 **/

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeIVRReportPbxModel = require(path + '/model/pbx/report/RealtimeIVRReportPbxModel');
const realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');

/**
 * Contrutora da classe de EventQueueTransfered
 * @constructor
 */
function EventQueueTransfered() {
    local = this;
}

EventQueueTransfered.prototype.EventQueueTransferedRealTime = EventQueueTransferedRealTime;
module.exports = EventQueueTransfered;

/**
 * Trata evento de transferencia entre filas para realtime.
 * @param $event
 * @returns {Promise|Promise.<TResult>}
 * @constructor
 */
async function EventQueueTransferedRealTime($event) {
    /* logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
         'INICIO', "Processando evento de TRANSFERENCIAFILA!");*/
    // A chamada já foi retirada da fila anterior com o FIMATENDIMENTO e será inserida na nova fila com o ENTRAFILA, logo este evento deve devolver a chamada para o estágio de ENTRAURA
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: true
    };

    let calls_ura = await realtimeIVRReportPbxModel.findOne({'client_id': $event.id_cliente_externo}).lean();
    let call_ura = _.find(calls_ura.calls.ura, {'call_id': $event.id_ligacao});
    if (call_ura) {
        await realtimeIVRReportPbxModel.updateOne(
            {
                'client_id': $event.id_cliente_externo,
                'calls.ura.call_id': $event.id_ligacao
            },
            {
                $set: {
                    'calls.ura.$.end_ura': false,
                    'calls.ura.$.transfer_ura': true
                },
                $inc: {
                    'quantity_ura': 1
                }
            });
    } else {
        await realtimeIVRReportPbxModel.updateOne(
            {'client_id': $event.id_cliente_externo},
            {
                $inc: {
                    'quantity_ura': 1
                },
                $push: {
                    'calls.ura': {
                        call_id: $event.id_ligacao,
                        end_ura: false,
                        transfer_ura: true
                    }
                }
            });
    }

    await realtimeQueueReportPbxModel.updateOne({ "client_id": $event.id_cliente_externo, "queue_id": $event.id_ext_fila }, {
        "$inc": { "total_transfer": 1 } });
    final_return.queues.push($event.id_ext_fila);

    return final_return;
}
