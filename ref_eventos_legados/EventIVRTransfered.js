/**
 * Classe -> EventTransfered
 * @desc: processamento de eventos de TRANSFERENCIAURA
 **/

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeIVRReportPbxModel = require(path + '/model/pbx/report/RealtimeIVRReportPbxModel');

/**
 * Contrutora da classe de EventIVRTransfered
 * @constructor
 */
function EventIVRTransfered() {
    local = this;
}

EventIVRTransfered.prototype.EventIVRTransferedRealTime = EventIVRTransferedRealTime;
module.exports = EventIVRTransfered;

/**
 * Trata evento de transferencia para URA para realtime.
 * @param $event
 * @returns {Promise|Promise.<TResult>}
 * @constructor
 */
async function EventIVRTransferedRealTime($event) {
    /* logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
         'INICIO', "Processando evento de TRANSFERENCIAURA!");*/
    // A chamada já foi retirada da fila anterior com o FIMATENDIMENTO e será inserida na nova URA com o ENTRAURA, logo este evento deve setar o transfer_ura que o ENTRAURA não irá atuar

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
                }
            });
    } else {
        await realtimeIVRReportPbxModel.updateOne(
            {'client_id': $event.id_cliente_externo},
            {
                $push: {
                    'calls.ura': {
                        call_id: $event.id_ligacao,
                        end_ura: false,
                        transfer_ura: true
                    }
                }
            });
    }
    return {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: true
    };
}
